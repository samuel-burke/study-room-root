import {
  myStatusToProto,
  personalResultToProto,
  phaseCompletedToProto,
  roomToProto,
} from "@studyroom/contract";
import type {
  MyStatusDto,
  Notifier,
  PersonalResultDto,
  PhaseCompletedDto,
  RoomStateDto,
} from "@studyroom/core";
import type {
  BadgesEarnedEvent,
  MyStatusEvent,
  PersonalResultEvent,
  PhaseCompletedEvent,
  RoomUpdatedEvent,
} from "@studyroom/gen-shared";

export type BroadcastTarget<C> = "all" | C[];

/** The broadcast half of the generated StudyRoomServiceBase. */
export interface Broadcaster<C> {
  broadcastRoomUpdated(message: RoomUpdatedEvent, clients: BroadcastTarget<C>): void;
  broadcastPhaseCompleted(message: PhaseCompletedEvent, clients: BroadcastTarget<C>): void;
  broadcastPersonalResult(message: PersonalResultEvent, clients: BroadcastTarget<C>): void;
  broadcastMyStatus(message: MyStatusEvent, clients: BroadcastTarget<C>): void;
  broadcastBadgesEarned(message: BadgesEarnedEvent, clients: BroadcastTarget<C>): void;
}

/**
 * Sends engine events to Root clients. Room-wide events go to everyone;
 * personal ones only to the devices of the member they are about, so nobody
 * receives another member's XP, goals or privacy choice.
 */
export class PushNotifier<C> implements Notifier {
  constructor(
    private readonly broadcaster: Broadcaster<C>,
    private readonly findClient: (userId: string) => C | undefined,
  ) {}

  roomUpdated(room: RoomStateDto): void {
    this.broadcaster.broadcastRoomUpdated({ room: roomToProto(room) }, "all");
  }

  phaseCompleted(event: PhaseCompletedDto): void {
    this.broadcaster.broadcastPhaseCompleted(phaseCompletedToProto(event), "all");
  }

  personalResult(userId: string, event: PersonalResultDto): void {
    const client = this.findClient(userId);
    if (client) this.broadcaster.broadcastPersonalResult(personalResultToProto(event), [client]);
  }

  myStatusUpdated(userId: string, me: MyStatusDto): void {
    const client = this.findClient(userId);
    if (client) this.broadcaster.broadcastMyStatus({ me: myStatusToProto(me) }, [client]);
  }

  badgesEarned(userId: string, badgeIds: string[]): void {
    const client = this.findClient(userId);
    if (client) this.broadcaster.broadcastBadgesEarned({ badgeIds }, [client]);
  }
}
