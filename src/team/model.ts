// What a team is made of. Artifact stats are typed as totals across all five artifacts
// (main stats and substats together), in the units shown in game: percentages as percentages
// (31.1 means 31.1%), flat ATK/HP/DEF/EM as numbers.

import type { LevelKey } from '../data/gameData';

export const CHARACTER_LEVELS: LevelKey[] = ['1', '20', '20+', '40', '40+', '50', '50+', '60', '60+', '70', '70+', '80', '80+', '90', '95', '100'];
export const WEAPON_LEVELS: LevelKey[] = ['1', '20', '20+', '40', '40+', '50', '50+', '60', '60+', '70', '70+', '80', '80+', '90'];

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

export type SetChoice =
  | { mode: 'none' }
  | { mode: '4pc'; set: string | null }
  | { mode: '2+2'; first: string | null; second: string | null };

export type Slot = {
  character: string | null; // display name from data/characters.json
  level: LevelKey;
  constellation: number; // 0 to 6
  talents: [number, number, number]; // base levels 1 to 10: Normal Attack, Skill, Burst
  weapon: string | null;
  weaponLevel: LevelKey;
  refinement: number; // 1 to 5
  sets: SetChoice;
  artifacts: Partial<Record<ArtifactStatKey, number>>;
};

export type Team = Slot[];

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

/**
 * Level key to gcsim's level/max level: "80+" (ascended at 80) -> "80/90", "80" -> "80/80",
 * "95" -> "95/100", "1" -> "1/20", "90" -> "90/90", "100" -> "100/100".
 */
export function levelToGcsim(level: LevelKey): string {
  const caps = [20, 40, 50, 60, 70, 80, 90, 100];
  const n = parseInt(level, 10);
  if (level.endsWith('+')) return `${n}/${caps[caps.indexOf(n) + 1]}`;
  if (n === 1) return '1/20';
  if (n === 95) return '95/100';
  return `${n}/${n}`;
}
