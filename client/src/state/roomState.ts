import type {
  MyStatusDto,
  PersonalResultDto,
  PhaseCompletedDto,
  RoomStateDto,
  SnapshotDto,
} from "@studyroom/core";

export interface Celebration {
  round: number;
  finisherIds: string[];
  combo: number;
  /** Local time it started, so it can fade out on its own. */
  startedAt: number;
}

export interface RoomViewState {
  status: "loading" | "ready" | "error";
  room: RoomStateDto | null;
  me: MyStatusDto | null;
  /** The personal break screen, shown after a focus block you took part in. */
  breakMoment: PersonalResultDto | null;
  /** The room-wide burst everyone sees when a round ends. */
  celebration: Celebration | null;
  /** Badges you just earned, shown one at a time, oldest first. */
  newBadges: string[];
  /**
   * Every badge already queued this session. A new badge can arrive several
   * ways (its own push, your status push, the reply to your action), and
   * its unlock moment should play once.
   */
  shownBadges: string[];
  error: string | null;
  /** Number of requests in flight. Buttons disable while > 0. */
  pending: number;
}

export const initialRoomViewState: RoomViewState = {
  status: "loading",
  room: null,
  me: null,
  breakMoment: null,
  celebration: null,
  newBadges: [],
  shownBadges: [],
  error: null,
  pending: 0,
};

/** Queues badges for their unlock moment, skipping any already queued or shown. */
function queueBadges(state: RoomViewState, badgeIds: readonly string[] | undefined): RoomViewState {
  const fresh = [...new Set(badgeIds ?? [])].filter((id) => !state.shownBadges.includes(id));
  if (fresh.length === 0) return state;
  return {
    ...state,
    newBadges: [...state.newBadges, ...fresh],
    shownBadges: [...state.shownBadges, ...fresh],
  };
}

export type RoomAction =
  | { type: "snapshot"; snapshot: SnapshotDto }
  | { type: "loadFailed"; message: string }
  | { type: "roomUpdated"; room: RoomStateDto }
  | { type: "myStatus"; me: MyStatusDto }
  | { type: "phaseCompleted"; event: PhaseCompletedDto; at: number }
  | { type: "personalResult"; event: PersonalResultDto }
  | { type: "badgesEarned"; badgeIds: string[] }
  | { type: "dismissBadge" }
  /** After "Delete my data", every badge can be earned (and shown) again. */
  | { type: "badgesReset" }
  | { type: "requestStarted" }
  | { type: "requestFinished" }
  | { type: "requestFailed"; message: string }
  | { type: "dismissBreak" }
  | { type: "dismissCelebration" }
  | { type: "dismissError" };

/** Pushes can arrive out of order. Never let an older room state replace a newer one. */
function newerRoom(current: RoomStateDto | null, next: RoomStateDto): RoomStateDto {
  return current && current.serverNow > next.serverNow ? current : next;
}

export function roomReducer(state: RoomViewState, action: RoomAction): RoomViewState {
  switch (action.type) {
    case "snapshot":
      return queueBadges(
        {
          ...state,
          status: "ready",
          room: newerRoom(state.room, action.snapshot.room),
          me: action.snapshot.me,
          error: null,
        },
        action.snapshot.me.newBadges,
      );
    case "loadFailed":
      return state.status === "ready"
        ? { ...state, error: action.message }
        : { ...state, status: "error", error: action.message };
    case "roomUpdated":
      return state.room ? { ...state, room: newerRoom(state.room, action.room) } : state;
    case "myStatus":
      return state.me ? queueBadges({ ...state, me: action.me }, action.me.newBadges) : state;
    case "phaseCompleted":
      if (action.event.kind !== "focus")
        return {
          ...state,
          room: state.room ? newerRoom(state.room, action.event.room) : state.room,
        };
      return {
        ...state,
        room: state.room ? newerRoom(state.room, action.event.room) : state.room,
        celebration: {
          round: action.event.round,
          finisherIds: action.event.finisherIds,
          combo: action.event.combo,
          startedAt: action.at,
        },
      };
    case "personalResult":
      return queueBadges(
        { ...state, breakMoment: action.event, me: action.event.me },
        action.event.me.newBadges,
      );
    case "badgesEarned":
      return queueBadges(state, action.badgeIds);
    case "badgesReset":
      return { ...state, newBadges: [], shownBadges: [] };
    case "dismissBadge":
      return { ...state, newBadges: state.newBadges.slice(1) };
    case "requestStarted":
      return { ...state, pending: state.pending + 1, error: null };
    case "requestFinished":
      return { ...state, pending: Math.max(0, state.pending - 1) };
    case "requestFailed":
      return { ...state, pending: Math.max(0, state.pending - 1), error: action.message };
    case "dismissBreak":
      return { ...state, breakMoment: null };
    case "dismissCelebration":
      return { ...state, celebration: null };
    case "dismissError":
      return { ...state, error: null };
  }
}
