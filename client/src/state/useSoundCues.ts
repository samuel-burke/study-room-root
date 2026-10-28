import type { MyStatusKind } from "@studyroom/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { cueFor, playCue, unlockAudio, type SoundCue } from "../lib/sounds";

const MUTED_KEY = "studysquad.soundsMuted";

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
  } catch {
    // Storage can be blocked. The choice then lasts until the app reloads.
  }
}

/**
 * Plays a chime when your own focus or break starts or ends. The mute choice
 * is per member and per device, kept in local storage.
 */
export function useSoundCues(
  status: MyStatusKind | null,
  play: (cue: SoundCue) => void = playCue,
): { muted: boolean; setMuted(muted: boolean): void } {
  const [muted, setMutedState] = useState(readMuted);
  const previous = useRef<MyStatusKind | null>(null);

  // Audio stays locked until the first interaction, so unlock it on any click.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const prev = previous.current;
    previous.current = status;
    // No chime for the status you already had when the app opened.
    if (prev === null || status === null || muted) return;
    const cue = cueFor(prev, status);
    if (!cue) return;
    try {
      play(cue);
    } catch {
      // A chime must never break the room screen.
    }
  }, [status, muted, play]);

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    writeMuted(next);
    if (!next) unlockAudio();
  }, []);

  return { muted, setMuted };
}
