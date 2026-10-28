import type { DayKey } from "../time/calendar";

export interface BossState {
  weekKey: DayKey;
  name: string;
  maxHpMinutes: number;
  damageMinutes: number;
  defeatedAt: number | null;
  contributorIds: string[];
}

export function newBoss(week: DayKey, name: string, hpHours: number): BossState {
  return {
    weekKey: week,
    name,
    maxHpMinutes: Math.max(1, Math.round(hpHours * 60)),
    damageMinutes: 0,
    defeatedAt: null,
    contributorIds: [],
  };
}

export interface DamageResult {
  boss: BossState;
  defeatedNow: boolean;
}

export function applyDamage(
  boss: BossState,
  minutes: number,
  contributorIds: readonly string[],
  now: number,
): DamageResult {
  if (minutes <= 0 || boss.defeatedAt !== null) return { boss, defeatedNow: false };
  const damageMinutes = Math.min(boss.maxHpMinutes, boss.damageMinutes + minutes);
  const contributors = new Set([...boss.contributorIds, ...contributorIds]);
  const defeatedNow = damageMinutes >= boss.maxHpMinutes;
  return {
    boss: {
      ...boss,
      damageMinutes,
      contributorIds: [...contributors],
      defeatedAt: defeatedNow ? now : null,
    },
    defeatedNow,
  };
}

export function bossHpLeftMinutes(boss: BossState): number {
  return Math.max(0, boss.maxHpMinutes - boss.damageMinutes);
}

/**
 * Apply a settings change to this week's boss. Damage is never healed and a
 * defeated boss stays defeated. Lowering HP below the damage dealt defeats it.
 */
export function reconfigureBoss(
  boss: BossState,
  name: string,
  hpHours: number,
  now: number,
): DamageResult {
  if (boss.defeatedAt !== null) return { boss: { ...boss, name }, defeatedNow: false };
  const maxHpMinutes = Math.max(1, Math.round(hpHours * 60));
  const defeatedNow = boss.damageMinutes >= maxHpMinutes;
  return {
    boss: {
      ...boss,
      name,
      maxHpMinutes,
      damageMinutes: Math.min(boss.damageMinutes, maxHpMinutes),
      defeatedAt: defeatedNow ? now : null,
    },
    defeatedNow,
  };
}
