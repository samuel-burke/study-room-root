import type { WakeScheduler } from "@studyroom/core";

// setTimeout overflows above 2^31 - 1 ms (~24.8 days).
const MAX_DELAY_MS = 2_147_483_647;

/**
 * WakeScheduler on top of setTimeout. Waking early is harmless because the
 * engine settles whatever is due and schedules the next wake-up itself.
 */
export class TimeoutScheduler implements WakeScheduler {
  private handle: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  wakeAt(at: number, callback: () => void): void {
    this.cancel();
    const delay = Math.min(MAX_DELAY_MS, Math.max(0, at - this.now()));
    this.handle = setTimeout(() => {
      this.handle = null;
      callback();
    }, delay);
    this.handle.unref?.();
  }

  cancel(): void {
    if (this.handle !== null) clearTimeout(this.handle);
    this.handle = null;
  }
}
