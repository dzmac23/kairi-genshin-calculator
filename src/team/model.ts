// What a team is made of. Artifact stats are typed as totals across all five artifacts
// (main stats and substats together), in the units shown in game: percentages as percentages
// (31.1 means 31.1%), flat ATK/HP/DEF/EM as numbers.

import { parseLevel } from './level';

/** Highest levels: characters go to 100, weapons to 90. */
export const MAX_CHARACTER_LEVEL = 100;
export const MAX_WEAPON_LEVEL = 90;

export type ArtifactStatKey = 'atk%' | 'atk' | 'hp%' | 'hp' | 'def%' | 'def' | 'em' | 'cr' | 'cd' | 'er' | 'elem%' | 'phys%';

/** The artifact stat boxes, in the order shown. `percent` stats are typed as percentages. */
export const ARTIFACT_STATS: { key: ArtifactStatKey; label: string; percent: boolean }[] = [
  { key: 'cr', label: 'CRIT Rate', percent: true },
  { key: 'cd', label: 'CRIT DMG', percent: true },
  { key: 'atk%', label: 'ATK %', percent: true },
  { key: 'atk', label: 'ATK (flat)', percent: false },
  { key: 'hp%', label: 'HP %', percent: true },
  { key: 'hp', label: 'HP (flat)', percent: false },
  { key: 'def%', label: 'DEF %', percent: true },
  { key: 'def', label: 'DEF (flat)', percent: false },
  { key: 'em', label: 'Elemental Mastery', percent: false },
  { key: 'er', label: 'Energy Recharge', percent: true },
  { key: 'elem%', label: 'Elemental DMG Bonus', percent: true },
  { key: 'phys%', label: 'Physical DMG Bonus', percent: true },
];

/**
 * Character totals, as shown on the character screen or Hoyolab (percentages as percentages).
 * With totals, the artifact stats are worked out as total − the character's stats without
 * artifacts, which gcsim calculates (see team/baseline.ts).
 */
export type TotalKey = 'hp' | 'atk' | 'def' | 'em' | 'cr' | 'cd' | 'er' | 'elem%' | 'phys%';

export const TOTAL_STATS: { key: TotalKey; label: string; percent: boolean }[] = [
  { key: 'hp', label: 'Max HP', percent: false },
  { key: 'atk', label: 'ATK', percent: false },
  { key: 'def', label: 'DEF', percent: false },
  { key: 'em', label: 'Elemental Mastery', percent: false },
  { key: 'cr', label: 'CRIT Rate', percent: true },
  { key: 'cd', label: 'CRIT DMG', percent: true },
  { key: 'er', label: 'Energy Recharge', percent: true },
  { key: 'elem%', label: 'Elemental DMG Bonus', percent: true },
  { key: 'phys%', label: 'Physical DMG Bonus', percent: true },
];

/**
 * Saved working for character totals: gcsim's stats for the build without artifacts (`stats`),
 * and the artifact stats that give the typed totals in gcsim (`solved`, for the totals in
 * `solved.totals`). `key` is the build they were worked out for.
 */
export type Baseline = {
  key: string;
  stats: Record<TotalKey, number>;
  solved?: { totals: string; artifacts: Record<TotalKey, number> };
};

/** The typed totals as a string, to tell whether the solved artifact stats are for them. */
export function totalsKey(slot: Slot): string {
  return JSON.stringify(TOTAL_STATS.map(({ key }) => slot.totals?.[key] ?? null));
}

export type SetChoice =
  | { mode: 'none' }
  | { mode: '4pc'; set: string | null }
  | { mode: '2+2'; first: string | null; second: string | null };

export type Slot = {
  character: string | null; // display name from data/characters.json
  /** "81", "80" (80/80) or "80+" (80/90): see team/level.ts. */
  level: string;
  constellation: number; // 0 to 6
  talents: [number, number, number]; // base levels 1 to 10: Normal Attack, Skill, Burst
  weapon: string | null;
  weaponLevel: string;
  refinement: number; // 1 to 5
  sets: SetChoice;
  artifacts: Partial<Record<ArtifactStatKey, number>>;
  /** How stats are entered: artifact stats (the default) or character totals. */
  statMode?: 'artifacts' | 'totals';
  totals?: Partial<Record<TotalKey, number>>;
  /** Saved working for totals: gcsim's stats without artifacts for this build. */
  baseline?: Baseline;
};

export type Team = Slot[];

/**
 * Everything that changes a character's stats without artifacts. When it changes, the baseline
 * has to be worked out again.
 */
export function baselineKey(slot: Slot): string {
  const { character, level, constellation, talents, weapon, weaponLevel, refinement, sets } = slot;
  // `v` changes when the app changes how the baseline is worked out, so baselines saved on a device
  // are worked out again (2: Linnea's party buff left out, see NOT_ON_CHARACTER_SCREEN in baseline.ts).
  return JSON.stringify({ v: 2, character, level, constellation, talents, weapon, weaponLevel, refinement, sets });
}

/** Totals mode with gcsim's stats without artifacts for this build. */
export function hasCurrentBaseline(slot: Slot): boolean {
  return slot.statMode === 'totals' && slot.baseline?.key === baselineKey(slot);
}

/** Totals mode with artifact stats worked out for this build and these totals. */
export function hasSolvedTotals(slot: Slot): boolean {
  return hasCurrentBaseline(slot) && slot.baseline!.solved?.totals === totalsKey(slot);
}

/**
 * The artifact stats that give the typed totals in gcsim, in the units shown in game. An empty
 * total counts as "nothing from artifacts". Undefined until gcsim has worked them out.
 */
export function artifactsFromTotals(slot: Slot): Partial<Record<TotalKey, number>> | undefined {
  return hasSolvedTotals(slot) ? slot.baseline!.solved!.artifacts : undefined;
}

export function emptySlot(): Slot {
  return {
    character: null,
    level: '90',
    constellation: 0,
    talents: [9, 9, 9],
    weapon: null,
    weaponLevel: '90',
    refinement: 1,
    sets: { mode: '4pc', set: null },
    artifacts: {},
  };
}

export function emptyTeam(): Team {
  return [emptySlot(), emptySlot(), emptySlot(), emptySlot()];
}

export { levelToGcsim } from './level';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

/**
 * Repairs a slot read from storage or an imported file: every field gets the right type and a
 * sensible range, falling back to the default for anything missing or malformed.
 */
export function cleanSlot(raw: unknown): Slot {
  const d = emptySlot();
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Slot, unknown>>;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const level = (v: unknown, max: number, fallback: string) => (typeof v === 'string' && parseLevel(v, max) ? v.trim() : fallback);
  const talents = Array.isArray(s.talents) && s.talents.length === 3 && s.talents.every(isNum) ? (s.talents.map((t) => clamp(t, 1, 15)) as Slot['talents']) : d.talents;
  const sets = s.sets as SetChoice | undefined;
  const cleanSets: SetChoice =
    sets?.mode === 'none'
      ? { mode: 'none' }
      : sets?.mode === '2+2'
        ? { mode: '2+2', first: str(sets.first), second: str(sets.second) }
        : sets?.mode === '4pc'
          ? { mode: '4pc', set: str(sets.set) }
          : d.sets;
  const artifacts: Slot['artifacts'] = {};
  if (s.artifacts && typeof s.artifacts === 'object') {
    for (const { key } of ARTIFACT_STATS) {
      const v = (s.artifacts as Record<string, unknown>)[key];
      if (isNum(v)) artifacts[key] = v;
    }
  }
  const totals: Slot['totals'] = {};
  if (s.totals && typeof s.totals === 'object') {
    for (const { key } of TOTAL_STATS) {
      const v = (s.totals as Record<string, unknown>)[key];
      if (isNum(v)) totals[key] = v;
    }
  }
  const b = s.baseline as Baseline | undefined;
  const statsOk = (x: unknown): x is Record<TotalKey, number> =>
    !!x && typeof x === 'object' && TOTAL_STATS.every(({ key }) => isNum((x as Record<string, unknown>)[key]));
  const solved = b?.solved && typeof b.solved.totals === 'string' && statsOk(b.solved.artifacts) ? { totals: b.solved.totals, artifacts: { ...b.solved.artifacts } } : undefined;
  const baseline =
    b && typeof b === 'object' && typeof b.key === 'string' && statsOk(b.stats)
      ? { key: b.key, stats: { ...b.stats }, ...(solved ? { solved } : {}) }
      : undefined;
  return {
    ...(s.statMode === 'totals' ? { statMode: 'totals' as const, totals, ...(baseline ? { baseline } : {}) } : {}),
    character: str(s.character),
    level: level(s.level, MAX_CHARACTER_LEVEL, d.level),
    constellation: isNum(s.constellation) ? clamp(s.constellation, 0, 6) : d.constellation,
    talents,
    weapon: str(s.weapon),
    weaponLevel: level(s.weaponLevel, MAX_WEAPON_LEVEL, d.weaponLevel),
    refinement: isNum(s.refinement) ? clamp(s.refinement, 1, 5) : d.refinement,
    sets: cleanSets,
    artifacts,
  };
}

/** A team of exactly four repaired slots, or undefined if it isn't a team at all. */
export function cleanTeam(raw: unknown): Team | undefined {
  return Array.isArray(raw) && raw.length === 4 ? raw.map(cleanSlot) : undefined;
}
