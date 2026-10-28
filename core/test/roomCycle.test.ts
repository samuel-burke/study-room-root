import { describe, expect, it } from "vitest";
import {
  buildCycle,
  customPreset,
  cycleEndsAt,
  overlapMs,
  phaseAt,
  PRESETS,
  presetLabel,
} from "../src";

const MIN = 60_000;

describe("buildCycle", () => {
  const phases = buildCycle(0, PRESETS["25-5"]);

  it("alternates focus and break, ending with a long break", () => {
    expect(phases.map((p) => p.kind)).toEqual([
      "focus",
      "break",
      "focus",
      "break",
      "focus",
      "break",
      "focus",
      "longBreak",
    ]);
    expect(phases.map((p) => p.round)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("lays phases end to end with no gaps", () => {
    for (let i = 1; i < phases.length; i++) expect(phases[i]!.startsAt).toBe(phases[i - 1]!.endsAt);
    expect(cycleEndsAt(phases)).toBe((25 * 4 + 5 * 3 + 15) * MIN);
  });
});

describe("phaseAt", () => {
  const phases = buildCycle(1_000, PRESETS["25-5"]);

  it("finds the running phase with start inclusive and end exclusive", () => {
    expect(phaseAt(phases, 1_000)?.kind).toBe("focus");
    expect(phaseAt(phases, 1_000 + 25 * MIN)?.kind).toBe("break");
    expect(phaseAt(phases, 1_000 + 25 * MIN - 1)?.kind).toBe("focus");
  });

  it("returns undefined before the start and after the cycle", () => {
    expect(phaseAt(phases, 999)).toBeUndefined();
    expect(phaseAt(phases, cycleEndsAt(phases))).toBeUndefined();
  });

  it("gives every observer the same answer for the same instant", () => {
    const a = phaseAt(buildCycle(1_000, PRESETS["25-5"]), 1_000 + 40 * MIN);
    const b = phaseAt(buildCycle(1_000, PRESETS["25-5"]), 1_000 + 40 * MIN);
    expect(a).toEqual(b);
    expect(a?.round).toBe(2);
  });
});

describe("presets", () => {
  it("derives a long break from custom breaks, capped at 30 minutes", () => {
    expect(customPreset(40, 8).longBreakMinutes).toBe(24);
    expect(customPreset(40, 15).longBreakMinutes).toBe(30);
  });

  it("labels presets like the design", () => {
    expect(presetLabel(PRESETS["50-10"])).toBe("50 / 10");
  });
});

describe("overlapMs", () => {
  it("measures overlap and never goes negative", () => {
    expect(overlapMs(0, 10, 5, 20)).toBe(5);
    expect(overlapMs(0, 10, 10, 20)).toBe(0);
    expect(overlapMs(0, 100, 10, 20)).toBe(10);
  });
});
