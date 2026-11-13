// A character's stats from character + weapon + artifacts, using the formulas in PROJECT_PLAN.md
// and the original workbook:
//   Total ATK = (character base ATK + weapon base ATK) x (1 + ATK%) + flat ATK; HP and DEF the same.
// These are the stats BEFORE weapon passives, artifact set effects, elemental resonance and other
// team buffs: gcsim applies all of those itself during the simulation.

import type { Character, Weapon } from '../data/gameData';
import type { ArtifactStatKey, Slot } from './model';

export type StatTotals = {
  hp: number;
  atk: number;
  def: number;
  em: number;
  cr: number; // fractions: 0.75 = 75%
  cd: number;
  er: number;
  elem: number; // the character's own element DMG bonus
  phys: number;
  baseHp: number;
  baseAtk: number; // character + weapon
  baseDef: number;
};

/** In-game stat names used in the data, mapped to what they add to. */
const STAT_NAMES: Record<string, 'hp%' | 'atk%' | 'def%' | 'em' | 'cr' | 'cd' | 'er' | 'phys' | 'heal' | 'elem'> = {
  HP: 'hp%',
  ATK: 'atk%',
  DEF: 'def%',
  'Elemental Mastery': 'em',
  'CRIT Rate': 'cr',
  'CRIT DMG': 'cd',
  'Energy Recharge': 'er',
  'Physical DMG Bonus': 'phys',
  'Healing Bonus': 'heal',
};

function statKind(name: string | null | undefined, element: string) {
  if (!name) return undefined;
  if (name === `${element} DMG Bonus`) return 'elem';
  return STAT_NAMES[name];
}

/** Artifact value in data units (percentages become fractions). */
export function artifactValue(slot: Slot, key: ArtifactStatKey): number {
  const v = slot.artifacts[key] ?? 0;
  const percent = !['atk', 'hp', 'def', 'em'].includes(key);
  return percent ? v / 100 : v;
}

export function computeStats(slot: Slot, character: Character, weapon: Weapon | undefined): StatTotals {
  const c = character.stats.find((s) => s.level === slot.level) ?? character.stats[character.stats.length - 1];
  const w = weapon?.stats.find((s) => s.level === slot.weaponLevel);

  const bonus = { 'hp%': 0, 'atk%': 0, 'def%': 0, em: 0, cr: 0.05, cd: 0.5, er: 1, phys: 0, heal: 0, elem: 0 };
  const ascKind = statKind(character.ascension_stat, character.element);
  if (ascKind) bonus[ascKind] += c.ascension_value_excl_base_crit;
  const subKind = statKind(weapon?.substat, character.element);
  if (subKind && w?.substat_value) bonus[subKind] += w.substat_value;

  const a = (k: ArtifactStatKey) => artifactValue(slot, k);
  const baseHp = c.base_hp;
  const baseAtk = c.base_atk + (w?.base_atk ?? 0);
  const baseDef = c.base_def;

  return {
    hp: baseHp * (1 + bonus['hp%'] + a('hp%')) + a('hp'),
    atk: baseAtk * (1 + bonus['atk%'] + a('atk%')) + a('atk'),
    def: baseDef * (1 + bonus['def%'] + a('def%')) + a('def'),
    em: bonus.em + a('em'),
    cr: bonus.cr + a('cr'),
    cd: bonus.cd + a('cd'),
    er: bonus.er + a('er'),
    elem: bonus.elem + a('elem%'),
    phys: bonus.phys + a('phys%'),
    baseHp,
    baseAtk,
    baseDef,
  };
}
