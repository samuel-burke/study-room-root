export interface TimerPreset {
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  /** Focus rounds per cycle. The last round is followed by the long break. */
  rounds: number;
}

export type PresetKey = "25-5" | "50-10" | "custom";

export const PRESETS: Record<Exclude<PresetKey, "custom">, TimerPreset> = {
  "25-5": { focusMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, rounds: 4 },
  "50-10": { focusMinutes: 50, breakMinutes: 10, longBreakMinutes: 20, rounds: 4 },
};

export const DEFAULT_PRESET: TimerPreset = PRESETS["25-5"];

export function customPreset(focusMinutes: number, breakMinutes: number): TimerPreset {
  return {
    focusMinutes,
    breakMinutes,
    longBreakMinutes: Math.min(30, breakMinutes * 3),
    rounds: 4,
  };
}

export function presetLabel(preset: TimerPreset): string {
  return `${formatMinutes(preset.focusMinutes)} / ${formatMinutes(preset.breakMinutes)}`;
}

function formatMinutes(minutes: number): string {
  return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
}
