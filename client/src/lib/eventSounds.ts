import { scheduleFanfare, type Fanfare } from "./badgeSounds";
import { withAudio } from "./sounds";

/**
 * Sounds for room moments: a round's celebration, the weekly boss going
 * down, and your own level-up. Synthesised with Web Audio like the session
 * chimes and badge fanfares, so there are no audio files.
 */
export type EventSound = "celebration" | "bossDefeat" | "levelUp";

const C4 = 261.63;
const E4 = 329.63;
const G4 = 392;
const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880;
const C6 = 1046.5;
const E6 = 1318.51;
const G6 = 1567.98;
const C7 = 2093;

const run = (notes: number[], start: number, gap: number, length: number, volume: number) =>
  notes.map((freq, i) => ({
    freq,
    at: start + i * gap,
    length,
    wave: "triangle" as const,
    volume,
  }));

export const EVENT_SOUNDS: Record<EventSound, Fanfare> = {
  // A cheerful "ta-da": two quick pickups, a bright major chord and confetti sparkle.
  celebration: {
    volume: 0.15,
    reverb: 1,
    noises: [{ at: 0.22, length: 0.5, volume: 0.15, from: 5000, to: 9000 }],
    tones: [
      { freq: G5, at: 0, length: 0.1, wave: "triangle", volume: 0.7 },
      { freq: G5, at: 0.1, length: 0.1, wave: "triangle", volume: 0.7 },
      ...[C5, E5, G5, C6].map((freq) => ({
        freq,
        at: 0.22,
        length: 0.7,
        wave: "triangle" as const,
        volume: 0.5,
      })),
      ...run([E6, G6, C7], 0.3, 0.07, 0.5, 0.3),
    ],
  },
  // The boss falls (a sliding growl and a heavy boom), then a victory
  // brass call and a held chord with bells.
  bossDefeat: {
    volume: 0.17,
    reverb: 2,
    noises: [{ at: 0.35, length: 0.6, volume: 0.35, from: 3000, to: 300 }],
    tones: [
      { freq: 220, glideTo: 55, at: 0, length: 0.6, wave: "sawtooth", cutoff: 900, volume: 0.5 },
      { freq: 120, glideTo: 35, at: 0.35, length: 0.8, wave: "sine", volume: 1 },
      { freq: G4, at: 0.95, length: 0.16, wave: "sawtooth", cutoff: 2200, volume: 0.45 },
      { freq: C5, at: 1.12, length: 0.16, wave: "sawtooth", cutoff: 2200, volume: 0.45 },
      { freq: E5, at: 1.29, length: 0.16, wave: "sawtooth", cutoff: 2200, volume: 0.45 },
      ...[C4, E4, G4, C5, G5].map((freq) => ({
        freq,
        at: 1.46,
        length: 1.5,
        wave: "sawtooth" as const,
        cutoff: 1900,
        volume: 0.35,
      })),
      ...run([G6, C7, E6, G6, C7], 1.55, 0.09, 0.8, 0.35),
    ],
  },
  // A fast climbing scale that lands on a sparkling held note.
  levelUp: {
    volume: 0.15,
    reverb: 1.2,
    tones: [
      ...run([C5, D5, E5, G5, A5, C6], 0, 0.06, 0.16, 0.6),
      { freq: E6, at: 0.38, length: 0.9, wave: "triangle", volume: 0.55 },
      { freq: C6, at: 0.38, length: 0.9, wave: "sine", volume: 0.45 },
      ...run([G6, C7], 0.48, 0.08, 0.5, 0.3),
    ],
  },
};

/** Plays a room-moment sound. Any audio failure is swallowed. */
export function playEventSound(sound: EventSound): void {
  withAudio((ctx) => scheduleFanfare(ctx, EVENT_SOUNDS[sound]));
}
