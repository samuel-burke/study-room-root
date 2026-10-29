/** "14:32" for a countdown. Never negative. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** "41.5 hrs", "1 hr", "45 min". */
export function formatHours(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)} ${hours === 1 ? "hr" : "hrs"}`;
}

/** "12,400" for XP amounts. Rounds to a whole number. */
export function formatXp(xp: number): string {
  return Math.round(xp).toLocaleString("en-US");
}

export function pluralize(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
