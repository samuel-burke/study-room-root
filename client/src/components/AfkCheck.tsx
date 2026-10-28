import { formatCountdown } from "@studyroom/core";

interface AfkCheckProps {
  endsAt: number;
  now: number;
  busy: boolean;
  onConfirm(): void;
}

/**
 * The "still there?" tap. It appears once per room cycle (about every two
 * hours on 25/5) or once in a long solo. Missing it still counts the minutes,
 * just not the finish.
 */
export function AfkCheck({ endsAt, now, busy, onConfirm }: AfkCheckProps) {
  return (
    <div className="afk-check" role="alertdialog" aria-labelledby="afk-title">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div id="afk-title" className="afk-title">
          Still there?
        </div>
        <div className="tiny tabular" style={{ color: "var(--amber-soft)" }}>
          Tap within {formatCountdown(endsAt - now).replace(/^0(\d)/, "$1")} to keep earning combo
          and streak credit
        </div>
      </div>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={onConfirm}>
        I'm here
      </button>
    </div>
  );
}
