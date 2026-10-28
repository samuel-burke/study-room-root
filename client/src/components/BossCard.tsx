import { formatCombo, type BossDto } from "@studyroom/core";
import { percent } from "../lib/view";
import { SwordIcon } from "./Icons";

const DAY_MS = 86_400_000;

function daysLeft(boss: BossDto, now: number): string {
  const days = Math.max(0, Math.ceil((boss.endsAt - now) / DAY_MS));
  return days === 1 ? "1 day left" : `${days} days left`;
}

function hpLeft(boss: BossDto) {
  return Math.max(0, boss.maxHpMinutes - boss.damageMinutes);
}

/** "61 of 100 hrs" — HP left rounds up so a boss never reads 0 before it's defeated. */
export function hpText(boss: BossDto): string {
  const left = boss.defeated ? 0 : Math.ceil(hpLeft(boss) / 60);
  const max = Math.round(boss.maxHpMinutes / 60);
  return `${left} of ${max} ${max === 1 ? "hr" : "hrs"}`;
}

export function BossCard({ boss, combo, now }: { boss: BossDto; combo: number; now: number }) {
  const left = hpLeft(boss);
  const defeatedPct = percent(boss.damageMinutes, boss.maxHpMinutes);
  return (
    <section aria-label="Weekly boss" className="card boss" data-defeated={boss.defeated}>
      <div className="row-between">
        <div className="eyebrow">
          <SwordIcon />
          Weekly boss
        </div>
        <div className="tiny muted">{daysLeft(boss, now)}</div>
      </div>
      <div className="boss-name">{boss.name}</div>
      <div>
        <div
          className="bar"
          role="meter"
          aria-label={`${boss.name} health`}
          aria-valuemin={0}
          aria-valuemax={boss.maxHpMinutes}
          aria-valuenow={left}
        >
          <span style={{ width: `${100 - defeatedPct}%` }} />
        </div>
        <div
          className="row-between tabular"
          style={{ marginTop: 6, fontSize: 13, color: "var(--boss-muted)" }}
        >
          <span>{hpText(boss)} HP left</span>
          <span>{defeatedPct}% defeated</span>
        </div>
      </div>
      <div className="boss-text">
        {boss.defeated ? (
          "Defeated! Everyone who pitched in earned loot. A new boss spawns Monday."
        ) : (
          <>
            Every focus minute is damage. Right now the room hits at{" "}
            <strong>{formatCombo(combo)}</strong>.
          </>
        )}
      </div>
    </section>
  );
}

export function MobileBoss({ boss }: { boss: BossDto }) {
  return (
    <div className="mobile-boss">
      <div className="row-between">
        <span style={{ fontWeight: 700, color: "var(--coral-text)" }}>Boss: {boss.name}</span>
        <span style={{ color: "var(--boss-muted)" }}>
          {boss.defeated ? "Defeated" : `${hpText(boss).replace(" of ", " / ")} HP`}
        </span>
      </div>
      <div className="bar" aria-hidden="true">
        <span style={{ width: `${100 - percent(boss.damageMinutes, boss.maxHpMinutes)}%` }} />
      </div>
    </div>
  );
}
