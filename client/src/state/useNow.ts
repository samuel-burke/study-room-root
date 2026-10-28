import { useEffect, useState } from "react";

/**
 * Current server time, refreshed a few times a second. Countdowns are always
 * computed from server timestamps, so a late tick never makes them drift.
 */
export function useNow(now: () => number, intervalMs = 250): number {
  const [value, setValue] = useState(now);
  useEffect(() => {
    const id = setInterval(() => setValue(now()), intervalMs);
    return () => clearInterval(id);
  }, [now, intervalMs]);
  return value;
}
