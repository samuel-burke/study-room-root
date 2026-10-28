import { badgeById } from "@studyroom/core";

/** A small banner for a badge you just earned. Secret badges get their own fanfare. */
export function BadgeUnlocked({ badgeId, onDismiss }: { badgeId: string; onDismiss(): void }) {
  const badge = badgeById(badgeId);
  if (!badge) return null;
  return (
    <div className="badge-unlocked" data-secret={badge.secret === true} role="status">
      <span className="badge-icon" aria-hidden="true">
        {badge.icon}
      </span>
      <span className="badge-unlocked-text">
        <span className="eyebrow">{badge.secret ? "Secret badge found!" : "Badge unlocked"}</span>
        <span className="badge-unlocked-name">{badge.name}</span>
        <span className="small muted">{badge.description}</span>
      </span>
      <button type="button" className="icon-btn ghost" aria-label="Dismiss" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
