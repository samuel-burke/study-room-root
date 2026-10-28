import { formatCountdown } from "@studyroom/core";

interface AfkCheckProps {
  endsAt: number;
  now: number;
  busy: boolean;
  onConfirm(): void;
}

/**
 * The "still there?" tap. It appears once at a random moment in a long focus
 * block. Missing it still counts the minutes, just not the finish.
 */
export function AfkCheck({ endsAt, now, busy, onConfirm }: AfkCheckProps) {
  return (
    <div className="afk-check" role="alertdialog" aria-labelledby="afk-title">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div id="afk-title" className="afk-title">
          Still there?
        </div>
        <div className="tiny tabular" style={{ color: "var(--amber-soft)" }}>
          Tap within {formatCountdown(endsAt - now).replace(/^0(\d)/, "$1")} so this round counts
          toward your streak
        </div>
      </div>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={onConfirm}>
        I'm here
      </button>
    </div>
  );
}
