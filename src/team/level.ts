// Character and weapon levels, with ascension.
//
// Levels are stored as text: the level, plus "+" when the character has ascended at a level where
// that's a choice. "80" is 80/80 (5 ascensions), "80+" is 80/90 (6), "81" is 81/90. Only levels
// 20, 40, 50, 60, 70 and 80 can be either; every other level implies its ascension. This is the
// same text earlier versions saved ("80+", "90"…), so saved teams and runs keep working.

/** The level cap after each number of ascensions (0 to 6). Past 90, characters go to 100. */
const CAPS = [20, 40, 50, 60, 70, 80, 90];
/** Levels where a character can be either before or after ascending. */
const BOUNDARIES = CAPS.slice(0, 6);

export const MAX_ASCENSION = 6;

export type Level = { level: number; ascension: number };

/** The ascension a level implies before choosing to ascend: the caps it's already above. */
function minAscension(level: number): number {
  return BOUNDARIES.filter((cap) => cap < level).length;
}

/** Levels 20, 40, 50, 60, 70 and 80 can be before or after ascending. */
export function canChooseAscension(level: number): boolean {
  return BOUNDARIES.includes(level);
}

/** Reads a stored level ("81", "80+"). Undefined for anything that isn't a level in range. */
export function parseLevel(key: string, maxLevel = 100): Level | undefined {
  const m = /^(\d{1,3})(\+?)$/.exec(String(key).trim());
  if (!m) return undefined;
  const level = Number(m[1]);
  if (level < 1 || level > maxLevel) return undefined;
  const plus = m[2] === '+';
  if (plus && !canChooseAscension(level)) return undefined;
  return { level, ascension: minAscension(level) + (plus ? 1 : 0) };
}

/** The stored text for a level, keeping "ascended" only where it's a choice. */
export function levelKey(level: number, ascended: boolean): string {
  return `${level}${ascended && canChooseAscension(level) ? '+' : ''}`;
}

/** The level cap: 80 for 80/80, 90 for 80/90 or 81, 100 past 90. */
export function levelCap({ level, ascension }: Level): number {
  if (level > 90) return 100;
  return CAPS[Math.min(ascension, MAX_ASCENSION)];
}

/** As gcsim (and the game) writes it: "81/90", "80/80", "95/100". */
export function levelToGcsim(key: string): string {
  const l = parseLevel(key) ?? { level: 90, ascension: 6 };
  return `${l.level}/${levelCap(l)}`;
}

/** For people: "81/90". */
export const formatLevel = levelToGcsim;

/**
 * Interpolates per-level values (base stats) from the breakpoints in the game data ("1", "20",
 * "20+", … "80+", "90", "95", "100"), between the two breakpoints of the same ascension that the
 * level falls between. Exact at breakpoints; in between, a close estimate (the game's growth
 * curves are nearly straight within an ascension), used only for the stat preview on the Team
 * screen: gcsim uses its own exact curves.
 */
export function interpolateStats<T extends { level: string }>(points: T[], key: string, fields: (keyof T)[]): Partial<T> | undefined {
  const target = parseLevel(key);
  if (!target) return undefined;
  const exact = points.find((p) => p.level === key);
  if (exact) return exact;
  const same = points
    .map((p) => ({ p, l: parseLevel(p.level) }))
    .filter((x): x is { p: T; l: Level } => !!x.l && x.l.ascension === target.ascension)
    .sort((a, b) => a.l.level - b.l.level);
  if (!same.length) return undefined;
  const below = [...same].reverse().find((x) => x.l.level <= target.level) ?? same[0];
  const above = same.find((x) => x.l.level >= target.level) ?? same[same.length - 1];
  const t = above.l.level === below.l.level ? 0 : (target.level - below.l.level) / (above.l.level - below.l.level);
  const out: Partial<T> = { ...below.p };
  for (const f of fields) {
    const a = below.p[f] as unknown;
    const b = above.p[f] as unknown;
    if (typeof a === 'number' && typeof b === 'number') (out as Record<keyof T, unknown>)[f] = a + (b - a) * t;
  }
  return out;
}
