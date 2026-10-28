import type { MyStatusDto, SnapshotDto } from "@studyroom/core";
import { useCallback, useEffect, useMemo, useReducer } from "react";
import { toGatewayError, type StartRequest, type StudyRoomGateway } from "../api/gateway";
import { initialRoomViewState, roomReducer } from "./roomState";

const CELEBRATION_MS = 4_000;

export interface StudyRoomActions {
  joinRoomTimer(request: StartRequest): Promise<boolean>;
  leaveRoomTimer(): Promise<boolean>;
  startSolo(minutes: number, request: StartRequest): Promise<boolean>;
  endSolo(): Promise<boolean>;
  addGoal(text: string): Promise<boolean>;
  setGoalDone(goalId: string, done: boolean): Promise<boolean>;
  deleteGoal(goalId: string): Promise<boolean>;
  setGoalsPrivate(goalsPrivate: boolean): Promise<boolean>;
  deleteMyData(): Promise<boolean>;
  confirmPresence(): Promise<boolean>;
  reload(): Promise<void>;
  dismissBreak(): void;
  dismissError(): void;
}

/** Owns the room state: initial load, live pushes, and every user action. */
export function useStudyRoom(gateway: StudyRoomGateway) {
  const [state, dispatch] = useReducer(roomReducer, initialRoomViewState);

  const reload = useCallback(async () => {
    try {
      dispatch({ type: "snapshot", snapshot: await gateway.getSnapshot() });
    } catch (error) {
      dispatch({ type: "loadFailed", message: toGatewayError(error).message });
    }
  }, [gateway]);

  useEffect(() => {
    const unsubscribe = gateway.subscribe({
      roomUpdated: (room) => dispatch({ type: "roomUpdated", room }),
      phaseCompleted: (event) => dispatch({ type: "phaseCompleted", event, at: Date.now() }),
      personalResult: (event) => dispatch({ type: "personalResult", event }),
      myStatus: (me) => dispatch({ type: "myStatus", me }),
    });
    void reload();
    return unsubscribe;
  }, [gateway, reload]);

  useEffect(() => {
    if (!state.celebration) return;
    const timer = setTimeout(() => dispatch({ type: "dismissCelebration" }), CELEBRATION_MS);
    return () => clearTimeout(timer);
  }, [state.celebration]);

  const actions = useMemo<StudyRoomActions>(() => {
    async function run<T extends SnapshotDto | MyStatusDto>(
      work: () => Promise<T>,
    ): Promise<boolean> {
      dispatch({ type: "requestStarted" });
      try {
        const result = await work();
        if ("room" in result) dispatch({ type: "snapshot", snapshot: result });
        else dispatch({ type: "myStatus", me: result });
        dispatch({ type: "requestFinished" });
        return true;
      } catch (error) {
        dispatch({ type: "requestFailed", message: toGatewayError(error).message });
        return false;
      }
    }
    return {
      joinRoomTimer: (request) => run(() => gateway.joinRoomTimer(request)),
      leaveRoomTimer: () => run(() => gateway.leaveRoomTimer()),
      startSolo: (minutes, request) => run(() => gateway.startSolo(minutes, request)),
      endSolo: () => run(() => gateway.endSolo()),
      addGoal: (text) => run(() => gateway.addGoal(text)),
      setGoalDone: (goalId, done) => run(() => gateway.setGoalDone(goalId, done)),
      deleteGoal: (goalId) => run(() => gateway.deleteGoal(goalId)),
      setGoalsPrivate: (goalsPrivate) => run(() => gateway.setGoalsPrivate(goalsPrivate)),
      deleteMyData: async () => {
        const ok = await run(() => gateway.deleteMyData());
        if (ok) await reload();
        return ok;
      },
      confirmPresence: () => run(() => gateway.confirmPresence()),
      reload,
      dismissBreak: () => dispatch({ type: "dismissBreak" }),
      dismissError: () => dispatch({ type: "dismissError" }),
    };
  }, [gateway, reload]);

  return { state, actions };
}
