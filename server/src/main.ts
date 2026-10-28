import { randomUUID } from "node:crypto";
import {
  ClientEvent,
  GlobalSettingsEvent,
  JobInterval,
  JobScheduleEvent,
  rootServer,
  type ChannelGuid,
  type GlobalSettings,
  type JobData,
  type RootAppStartState,
  type UserGuid,
} from "@rootsdk/server-app";
import { parseSettings, StudyRoomEngine, type AppConfig, type RawSettings } from "@studyroom/core";
import { ChannelAnnouncer } from "./adapters/channelAnnouncer";
import { createLogger } from "./adapters/logger";
import { PushNotifier } from "./adapters/pushNotifier";
import { TimeoutScheduler } from "./adapters/timeoutScheduler";
import { StudyRoomHandlers } from "./handlers";
import { RecapScheduler } from "./jobs/recapScheduler";
import { openDatabase } from "./persistence/database";
import { KnexStore } from "./persistence/knexStore";
import { migrateToLatest } from "./persistence/migrations";
import { studyRoomService } from "./studyRoomService";

const logger = createLogger();
let shutdown: (() => Promise<void>) | null = null;

/** Reads Root's settings and resolves the post channel's display name. */
async function loadConfig(settings: GlobalSettings | undefined): Promise<AppConfig> {
  const config = parseSettings(settings as unknown as RawSettings);
  if (!config.postChannelId) return config;
  try {
    const channel = await rootServer.community.channels.get({
      id: config.postChannelId as ChannelGuid,
    });
    return { ...config, postChannelName: channel.name };
  } catch (error) {
    logger.warn("could not read post channel", { error: String(error) });
    return config;
  }
}

async function onStarting(state: RootAppStartState): Promise<void> {
  const filename = rootServer.dataStore.config.sqlite3?.filename;
  if (!filename) throw new Error("Root did not provide a SQLite database for this app.");
  const db = openDatabase(filename);
  await migrateToLatest(db);

  const engine = new StudyRoomEngine({
    store: new KnexStore(db),
    clock: { now: Date.now },
    scheduler: new TimeoutScheduler(),
    notifier: new PushNotifier(studyRoomService, (userId) =>
      rootServer.clients.getClient(userId as UserGuid),
    ),
    announcer: new ChannelAnnouncer({
      postMessage: async (channelId, content) => {
        await rootServer.community.channelMessages.create({
          channelId: channelId as ChannelGuid,
          content,
        });
      },
      nickname: async (userId) =>
        (await rootServer.community.communityMembers.get({ userId: userId as UserGuid })).nickname,
    }),
    logger,
    config: await loadConfig(state.globalSettings ?? rootServer.globalSettings),
    newId: randomUUID,
  });
  studyRoomService.bind(new StudyRoomHandlers(engine, logger));
  rootServer.lifecycle.addService(studyRoomService);
  await engine.start();

  // Presence: who has Study Room open right now.
  await engine.setPresence(rootServer.clients.getClients().map((c) => c.userId));
  rootServer.clients.on(
    ClientEvent.UserAttached,
    (client) => void engine.userAttached(client.userId),
  );
  rootServer.clients.on(
    ClientEvent.UserDetached,
    (client) => void engine.userDetached(client.userId),
  );

  const recap = new RecapScheduler(
    {
      scheduleOnce: async (tag, at) => {
        await rootServer.jobScheduler.create({
          resourceId: tag,
          tag,
          start: at,
          jobInterval: JobInterval.OneTime,
        });
      },
      cancelByTag: (tag) => rootServer.jobScheduler.deleteByTag(tag),
      onJob: (handler) => {
        const relay = (missed: boolean) => (job: JobData) =>
          handler({ tag: job.tag, jobTime: job.jobTime, missed });
        rootServer.jobScheduler.on(JobScheduleEvent.Job, relay(false));
        rootServer.jobScheduler.on(JobScheduleEvent.JobMissed, relay(true));
      },
    },
    engine,
    logger,
  );
  await recap.start();

  // Admins edit settings in Root's App settings; apply them live.
  rootServer.globalSettings?.on(GlobalSettingsEvent.Update, (event) => {
    void (async () => {
      await engine.setConfig(await loadConfig(event.current));
      await recap.reschedule();
      logger.info("settings updated");
    })().catch((error: unknown) =>
      logger.error("settings update failed", { error: String(error) }),
    );
  });

  shutdown = async () => {
    engine.stop();
    await engine.idle();
    await db.destroy();
  };
  logger.info("study room started");
}

async function onStopping(): Promise<void> {
  await shutdown?.();
  logger.info("study room stopped");
}

(async () => {
  await rootServer.lifecycle.start(onStarting, onStopping);
})().catch((error: unknown) => {
  logger.error("failed to start", {
    error: error instanceof Error ? (error.stack ?? error.message) : String(error),
  });
  process.exitCode = 1;
});
