// Fight settings for the simulation, as shown on the Rotation screen.

export type SimSettings = {
  duration: number; // seconds
  enemyLevel: number;
  enemyResist: number; // percent, 10 = 10%
  enemies: number; // 1 to 5
  randomEnergy: boolean; // random elemental particles, as in the plan's sample
};

export const DEFAULT_SETTINGS: SimSettings = { duration: 90, enemyLevel: 100, enemyResist: 10, enemies: 1, randomEnergy: true };

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
    enemies: Math.round(n(s.enemies, DEFAULT_SETTINGS.enemies, 1, MAX_ENEMIES)),
    randomEnergy: typeof s.randomEnergy === 'boolean' ? s.randomEnergy : DEFAULT_SETTINGS.randomEnergy,
  };
}
