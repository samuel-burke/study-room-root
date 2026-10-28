import { useEffect, useMemo, useRef, useState } from "react";
import type { StudyRoomGateway } from "./api/gateway";
import { BreakMoment } from "./components/BreakMoment";
import { Celebration } from "./components/Celebration";
import { GoalsSheet } from "./components/GoalsSheet";
import { ProgressScreen } from "./components/ProgressScreen";
import { RoomScreen } from "./components/RoomScreen";
import { SettingsSheet } from "./components/SettingsSheet";
import { StartSessionSheet } from "./components/StartSessionSheet";
import { Toast } from "./components/Toast";
import { useMediaQuery } from "./state/useMediaQuery";
import { useNow } from "./state/useNow";
import { useProfiles } from "./state/useProfiles";
import { useSoundCues } from "./state/useSoundCues";
import { useStudyRoom } from "./state/useStudyRoom";

type Overlay =
  { kind: "start"; mode: "room" | "solo" } | { kind: "goals" } | { kind: "settings" } | null;

export function App({ gateway }: { gateway: StudyRoomGateway }) {
  const { state, actions } = useStudyRoom(gateway);
  const now = useNow(gateway.now.bind(gateway));
  const compact = useMediaQuery("(max-width: 760px)");
  const [screen, setScreen] = useState<"room" | "progress">("room");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const sounds = useSoundCues(state.me?.status ?? null);

  const userIds = useMemo(
    () => [
      ...(state.room?.members.map((m) => m.userId) ?? []),
      ...(state.breakMoment?.finisherIds ?? []),
    ],
    [state.room, state.breakMoment],
  );
  const profiles = useProfiles(gateway, userIds);

  // While a sheet is open, the page behind it can't be focused or clicked.
  const background = useRef<HTMLDivElement>(null);
  const modalOpen = overlay !== null || state.breakMoment !== null;
  useEffect(() => {
    const node = background.current;
    if (!node) return;
    node.toggleAttribute("inert", modalOpen);
    if (modalOpen) node.setAttribute("aria-hidden", "true");
    else node.removeAttribute("aria-hidden");
  }, [modalOpen, state.status]);

  if (state.status === "loading") {
    return (
      <div className="status-screen" role="status">
        Opening the room…
      </div>
    );
  }

  if (state.status === "error" || !state.room || !state.me) {
    return (
      <div className="status-screen" role="alert">
        <div>{state.error ?? "Couldn't open Study Squad."}</div>
        <button type="button" className="btn btn-primary" onClick={() => void actions.reload()}>
          Try again
        </button>
      </div>
    );
  }

  const { room, me } = state;
  const busy = state.pending > 0;

  return (
    <>
      <div ref={background}>
        {screen === "progress" ? (
          <ProgressScreen
            gateway={gateway}
            xpEnabled={room.features.xpEnabled}
            freezesEnabled={room.features.streakFreezesEnabled}
            onBack={() => setScreen("room")}
            onDeleteData={actions.deleteMyData}
          />
        ) : (
          <RoomScreen
            room={room}
            me={me}
            profiles={profiles}
            now={now}
            busy={busy}
            compact={compact}
            soundsMuted={sounds.muted}
            onToggleSounds={() => sounds.setMuted(!sounds.muted)}
            onStart={(mode) => setOverlay({ kind: "start", mode })}
            onLeave={() => void actions.leaveRoomTimer()}
            onEndSolo={() => void actions.endSolo()}
            onToggleGoal={(id, done) => void actions.setGoalDone(id, done)}
            onDeleteGoal={(id) => void actions.deleteGoal(id)}
            onAddGoal={actions.addGoal}
            onOpenGoals={() => setOverlay({ kind: "goals" })}
            onOpenProgress={() => setScreen("progress")}
            onOpenSettings={() => setOverlay({ kind: "settings" })}
          />
        )}
      </div>

      {overlay?.kind === "start" && (
        <StartSessionSheet
          room={room}
          me={me}
          now={now}
          busy={busy}
          initialMode={overlay.mode}
          onClose={() => setOverlay(null)}
          onStartRoom={actions.joinRoomTimer}
          onStartSolo={actions.startSolo}
        />
      )}
      {overlay?.kind === "goals" && (
        <GoalsSheet
          me={me}
          xpEnabled={room.features.xpEnabled}
          busy={busy}
          onToggle={(id, done) => void actions.setGoalDone(id, done)}
          onDelete={(id) => void actions.deleteGoal(id)}
          onAdd={actions.addGoal}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === "settings" && (
        <SettingsSheet room={room} onClose={() => setOverlay(null)} />
      )}

      {state.celebration && (
        <Celebration celebration={state.celebration} quiet={state.breakMoment !== null} />
      )}
      {state.breakMoment && (
        <BreakMoment
          result={state.breakMoment}
          boss={room.boss}
          profiles={profiles}
          youId={me.userId}
          xpEnabled={room.features.xpEnabled}
          chatChannel={room.features.postChannelName}
          now={now}
          busy={busy}
          onGoalDone={(id) => {
            void actions.setGoalDone(id, true).then((ok) => ok && actions.dismissBreak());
          }}
          onClose={actions.dismissBreak}
        />
      )}
      {state.error && <Toast message={state.error} onDismiss={actions.dismissError} />}
    </>
  );
}
