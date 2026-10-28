import { formatHours, type ProgressDto } from "@studyroom/core";
import { useEffect, useState } from "react";
import { toGatewayError, type StudyRoomGateway } from "../api/gateway";
import { heatLevel } from "../lib/view";
import { BadgeShelf, CardStylePicker } from "./BadgeShelf";
import { BackIcon, FlameIcon } from "./Icons";
import { XpBar } from "./SessionPanel";

/** Level, streak with freeze status, a five-week heatmap, badges and card style. */
export function ProgressScreen({
  gateway,
  xpEnabled,
  freezesEnabled,
  onBack,
  onDeleteData,
}: {
  gateway: StudyRoomGateway;
  xpEnabled: boolean;
  freezesEnabled: boolean;
  onBack(): void;
  /** Resolves true once the server has erased the member's data. */
  onDeleteData(): Promise<boolean>;
}) {
  const [progress, setProgress] = useState<ProgressDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(work: () => Promise<ProgressDto>) {
    setSaving(true);
    setError(null);
    try {
      setProgress(await work());
    } catch (e) {
      setError(toGatewayError(e).message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    gateway
      .getProgress()
      .then((p) => !cancelled && setProgress(p))
      .catch((e: unknown) => !cancelled && setError(toGatewayError(e).message));
    return () => {
      cancelled = true;
    };
  }, [gateway]);

  return (
    <main className="progress-page">
      <header className="progress-header">
        <button
          type="button"
          className="icon-btn ghost"
          aria-label="Back to the room"
          onClick={onBack}
          style={{ marginLeft: -8 }}
        >
          <BackIcon size={20} />
        </button>
        <h1 style={{ fontSize: 20 }}>Your progress</h1>
      </header>

      {error && (
        <div className="toast" role="alert" style={{ position: "static", transform: "none" }}>
          {error}
        </div>
      )}
      {!progress && !error && <div className="muted">Loading…</div>}

      {progress && (
        <>
          {xpEnabled && (
            <section
              className="card"
              style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
            >
              <div className="level-badge" aria-hidden="true">
                <small>LEVEL</small>
                <strong>{progress.me.level}</strong>
              </div>
              <div style={{ flex: 1 }}>
                <XpBar me={progress.me} />
              </div>
            </section>
          )}

          <section className="card" aria-label="Streak">
            <div className="row-between">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <FlameIcon size={20} stroke="var(--flame)" />
                <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700 }}>
                  {progress.me.streak} day streak
                </span>
              </div>
              {freezesEnabled && (
                <span className="freeze-chip">
                  {progress.me.freezeAvailable ? "1 freeze left" : "Freeze used this week"}
                </span>
              )}
            </div>
            <ol className="heatmap" aria-label="Focus time, last 5 weeks">
              {progress.days.map((d) => (
                <li
                  key={d.day}
                  className="heat"
                  data-level={heatLevel(d.focusMinutes)}
                  title={`${d.day}: ${formatHours(d.focusMinutes)}`}
                  aria-label={`${d.day}: ${formatHours(d.focusMinutes)}`}
                />
              ))}
            </ol>
            <div className="row-between tiny dim">
              <span>Last 5 weeks</span>
              <span>{formatHours(progress.totalFocusMinutes)} total</span>
            </div>
          </section>

          <BadgeShelf
            earned={progress.badges}
            card={progress.card}
            busy={saving}
            onShowcase={(ids) => void save(() => gateway.setBadgeShowcase(ids))}
          />
          <CardStylePicker
            level={progress.me.level}
            earned={progress.badges}
            card={progress.card}
            busy={saving}
            onPick={(style) => void save(() => gateway.setCardStyle(style))}
          />
        </>
      )}

      <DeleteMyData onDelete={onDeleteData} onDone={onBack} />
    </main>
  );
}

/** Two-step erase, because it can't be undone. */
function DeleteMyData({ onDelete, onDone }: { onDelete(): Promise<boolean>; onDone(): void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function erase() {
    setBusy(true);
    const ok = await onDelete();
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <section className="card" aria-label="Your data">
      <h2 style={{ fontSize: 16 }}>Your data</h2>
      <div className="small muted">
        Study Squad keeps your goals, sessions, XP and streak so your progress is here next time.
        You can erase all of it at any time.
      </div>
      {confirming ? (
        <div
          role="alertdialog"
          aria-label="Confirm delete"
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          <div className="small">
            This erases your goals, session history, XP, level, streak and badges for this
            community. It can&apos;t be undone.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-danger"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => void erase()}
            >
              Delete everything
            </button>
            <button
              type="button"
              className="btn"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-quiet" onClick={() => setConfirming(true)}>
          Delete my data
        </button>
      )}
    </section>
  );
}
