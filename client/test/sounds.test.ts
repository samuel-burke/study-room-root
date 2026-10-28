import { act, renderHook } from "@testing-library/react";
import type { MyStatusKind } from "@studyroom/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cueFor } from "../src/lib/sounds";
import { useSoundCues } from "../src/state/useSoundCues";

describe("cueFor", () => {
  it.each<[MyStatusKind, MyStatusKind, string | null]>([
    ["idle", "roomFocus", "focusStart"],
    ["idle", "soloFocus", "focusStart"],
    ["roomFocus", "roomBreak", "breakStart"],
    ["soloFocus", "soloBreak", "breakStart"],
    ["roomBreak", "roomFocus", "focusStart"],
    ["roomBreak", "idle", "breakEnd"],
    ["soloBreak", "idle", "breakEnd"],
    ["roomFocus", "idle", "focusEnd"],
    ["soloFocus", "roomFocus", null],
    ["idle", "idle", null],
  ])("%s -> %s plays %s", (prev, next, cue) => {
    expect(cueFor(prev, next)).toBe(cue);
  });
});

describe("useSoundCues", () => {
  afterEach(() => window.localStorage.clear());

  function setup(initial: MyStatusKind | null) {
    const play = vi.fn();
    const hook = renderHook(({ status }) => useSoundCues(status, play), {
      initialProps: { status: initial },
    });
    return { play, ...hook };
  }

  it("stays quiet on load and chimes on later changes", () => {
    const { play, rerender } = setup(null);
    rerender({ status: "roomFocus" });
    expect(play).not.toHaveBeenCalled();
    rerender({ status: "roomBreak" });
    expect(play).toHaveBeenCalledWith("breakStart");
  });

  it("stays quiet while muted and remembers the choice", () => {
    const { play, rerender, result } = setup("idle");
    act(() => result.current.setMuted(true));
    rerender({ status: "soloFocus" });
    expect(play).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("studysquad.soundsMuted")).toBe("1");
    expect(setup("idle").result.current.muted).toBe(true);
  });
});
