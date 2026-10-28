import { formatHours, type ProgressDto } from "@studyroom/core";
import { useEffect, useState } from "react";
import { toGatewayError, type StudyRoomGateway } from "../api/gateway";
import { heatLevel } from "../lib/view";
import { BackIcon, FlameIcon } from "./Icons";
import { XpBar } from "./SessionPanel";

/** Level, streak with freeze status, and a five-week heatmap. */
export function ProgressScreen({
  gateway,
  xpEnabled,
  freezesEnabled,
  onBack,
}: {
  gateway: StudyRoomGateway;
  xpEnabled: boolean;
  freezesEnabled: boolean;
  onBack(): void;
}) {
  const [progress, setProgress] = useState<ProgressDto | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        </>
      )}
    </main>
  );
}
