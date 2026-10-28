import type { MyStatusKind } from "@studyroom/core";

/**
 * Short chimes for the moments a member's own session changes. They are
 * synthesised with the Web Audio API, so the app ships no audio files and
 * there is nothing to license.
 */
export type SoundCue = "focusStart" | "focusEnd" | "breakStart" | "breakEnd";

type Phase = "idle" | "focus" | "break";

function phaseOf(status: MyStatusKind): Phase {
  switch (status) {
    case "idle":
      return "idle";
    case "roomFocus":
    case "soloFocus":
      return "focus";
    case "roomBreak":
    case "soloBreak":
      return "break";
  }
}

/**
 * Which chime to play when your status moves from `prev` to `next`.
 * Focus ending straight into a break plays the break chime only, and a break
 * rolling into the next round plays the focus chime only.
 */
export function cueFor(prev: MyStatusKind, next: MyStatusKind): SoundCue | null {
  const from = phaseOf(prev);
  const to = phaseOf(next);
  if (from === to) return null;
  if (to === "focus") return "focusStart";
  if (to === "break") return "breakStart";
  return from === "focus" ? "focusEnd" : "breakEnd";
}

interface Note {
  /** Frequency in Hz. */
  freq: number;
  /** Start offset in seconds. */
  at: number;
  /** Length in seconds. */
  length: number;
}

// Rising notes say "go", falling notes say "ease off".
const MELODIES: Record<SoundCue, { notes: Note[]; wave: OscillatorType }> = {
  // C5 E5 G5: a bright upward arpeggio.
  focusStart: {
    wave: "triangle",
    notes: [
      { freq: 523.25, at: 0, length: 0.18 },
      { freq: 659.25, at: 0.12, length: 0.18 },
      { freq: 783.99, at: 0.24, length: 0.4 },
    ],
  },
  // G5 C5: a short "done" drop.
  focusEnd: {
    wave: "triangle",
    notes: [
      { freq: 783.99, at: 0, length: 0.2 },
      { freq: 523.25, at: 0.16, length: 0.45 },
    ],
  },
  // E5 C5 A4: a soft, slow descent into the break.
  breakStart: {
    wave: "sine",
    notes: [
      { freq: 659.25, at: 0, length: 0.35 },
      { freq: 523.25, at: 0.22, length: 0.35 },
      { freq: 440, at: 0.44, length: 0.7 },
    ],
  },
  // A4 E5: a gentle nudge that the break is over.
  breakEnd: {
    wave: "sine",
    notes: [
      { freq: 440, at: 0, length: 0.25 },
      { freq: 659.25, at: 0.18, length: 0.5 },
    ],
  },
};

const VOLUME = 0.18;

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (context) return context;
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

/**
 * Browsers keep audio suspended until the person interacts with the page.
 * Call this from any click so later chimes, which arrive from the server,
 * are allowed to play.
 */
export function unlockAudio(): void {
  const ctx = getContext();
  if (ctx) resume(ctx);
}

/** Ask a suspended context to start. A refusal just means no sound yet. */
function resume(ctx: AudioContext): void {
  if (ctx.state !== "suspended") return;
  try {
    void ctx.resume().catch(() => {});
  } catch {
    // Some engines throw instead of rejecting. Either way, stay quiet.
  }
}

/**
 * Runs `schedule` against the shared audio context, if there is one. Used by
 * other sound sets (badge fanfares) so they share the context and its unlock.
 * Any audio failure is swallowed.
 */
export function withAudio(schedule: (ctx: AudioContext) => void): void {
  const ctx = getContext();
  if (!ctx) return;
  resume(ctx);
  try {
    schedule(ctx);
  } catch {
    // Nothing to recover: this sound is skipped.
  }
}

/**
 * Plays a chime. Sound is a nice-to-have, so any audio failure (no Web Audio,
 * a closed context, a blocked device) is swallowed and the app carries on.
 */
export function playCue(cue: SoundCue): void {
  const ctx = getContext();
  if (!ctx) return;
  resume(ctx);
  try {
    scheduleNotes(ctx, MELODIES[cue]);
  } catch {
    // Nothing to recover: this chime is skipped.
  }
}

function scheduleNotes(ctx: AudioContext, { notes, wave }: (typeof MELODIES)[SoundCue]): void {
  const start = ctx.currentTime + 0.02;
  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = note.freq;
    const t0 = start + note.at;
    const t1 = t0 + note.length;
    // Quick attack, smooth exponential release, so there are no clicks.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(VOLUME, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t1 + 0.05);
  }
}
