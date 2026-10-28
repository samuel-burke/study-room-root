import { formatCountdown } from "@studyroom/core";

interface KeepGoingProps {
  endsAt: number;
  now: number;
  busy: boolean;
  onKeepGoing(): void;
}

/**
 * Shown during the cycle's long break. Tapping rolls you into the next cycle;
 * otherwise the cycle ends your session as usual, and you keep everything you earned.
 */
export function KeepGoing({ endsAt, now, busy, onKeepGoing }: KeepGoingProps) {
  return (
    <div className="keep-going" role="alertdialog" aria-labelledby="keep-going-title">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div id="keep-going-title" className="keep-going-title">
          Keep going?
        </div>
        <div className="tiny tabular" style={{ color: "var(--amber-soft)" }}>
          Tap within {formatCountdown(endsAt - now).replace(/^0(\d)/, "$1")} to stay on the room
          timer for the next cycle
        </div>
      </div>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={onKeepGoing}>
        Keep going
      </button>
    </div>
  );
}
