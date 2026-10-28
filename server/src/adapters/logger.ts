import type { Logger } from "@studyroom/core";

type Level = "info" | "warn" | "error";
type Sink = (line: string) => void;

/**
 * One JSON line per event, so logs stay searchable in Root's log viewer.
 * Callers pass ids and counts, never goal text or other user content.
 */
export function createLogger(sinks: Partial<Record<Level, Sink>> = {}): Logger {
  const write = (level: Level, message: string, meta?: Record<string, unknown>) => {
    const sink =
      sinks[level] ??
      (level === "error" ? console.error : level === "warn" ? console.warn : console.log);
    sink(JSON.stringify({ level, message, ...meta, at: new Date().toISOString() }));
  };
  return {
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
  };
}
