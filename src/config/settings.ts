// Fight settings for the simulation, as shown on the Run screen.

export type SimSettings = {
  duration: number; // seconds
  enemyLevel: number;
  enemyResist: number; // percent, 10 = 10% (training dummy only)
  /** An enemy from data/enemies.json (gcsim's key), or null for a training dummy. */
  enemy: string | null;
  enemies: number; // 1 to 5
  /**
   * Each enemy's HP, or null for a fixed-length fight. With HP, fights last until every enemy is
   * dead and `duration` is the time limit.
   */
  enemyHp: number | null;
  randomEnergy: boolean; // random elemental particles, as in the plan's sample
};

export const DEFAULT_SETTINGS: SimSettings = { duration: 90, enemyLevel: 100, enemyResist: 10, enemy: null, enemies: 1, enemyHp: null, randomEnergy: true };

export const MAX_ENEMIES = 5;

/**
 * Enemy positions. The first stands 2.4 m in front (as in the plan's sample config). Extra enemies
 * stand in a line beside it, 4.1 m apart, because enemies with a 2 m radius overlap (which gcsim
 * warns about) when their centres are closer than 4 m.
 */
export function enemyPositions(count: number): [number, number][] {
  const offsets = [0, 4.1, -4.1, 8.2, -8.2];
  return offsets.slice(0, Math.max(1, Math.min(MAX_ENEMIES, count))).map((y) => [2.4, y]);
}

/** Keeps saved or typed settings within sensible limits. */
export function cleanSettings(s: Partial<SimSettings>): SimSettings {
  const n = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    duration: n(s.duration, DEFAULT_SETTINGS.duration, 1, 3600),
    enemyLevel: Math.round(n(s.enemyLevel, DEFAULT_SETTINGS.enemyLevel, 1, 200)),
    enemyResist: n(s.enemyResist, DEFAULT_SETTINGS.enemyResist, -100, 100),
    // Settings saved before the enemy library have no enemy: a training dummy, as before.
    enemy: typeof s.enemy === 'string' && s.enemy ? s.enemy : null,
    enemies: Math.round(n(s.enemies, DEFAULT_SETTINGS.enemies, 1, MAX_ENEMIES)),
    enemyHp: typeof s.enemyHp === 'number' && Number.isFinite(s.enemyHp) && s.enemyHp >= 1 ? Math.round(Math.min(s.enemyHp, 1e13)) : null,
    randomEnergy: typeof s.randomEnergy === 'boolean' ? s.randomEnergy : DEFAULT_SETTINGS.randomEnergy,
  };
}

/**
 * Reads an HP typed by a person: "3500000", "3,500,000", "3 500 000", "3.5m" or "800k". Returns
 * undefined for an empty box and NaN for something that isn't a number.
 */
export function parseHp(text: string): number | undefined {
  const t = text.trim().toLowerCase().replace(/[\s,_']/g, '');
  if (!t) return undefined;
  const m = /^(\d+(?:\.\d+)?)([km]?)$/.exec(t);
  if (!m) return NaN;
  const scale = m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1;
  return Math.round(Number(m[1]) * scale);
}
