// Loads the game data in data/ (characters, weapons, artifact sets).
// The files are large, so they are loaded only when a screen needs them, not with the first page.
//
// Units in the data: percentage stats are fractions (0.192 = 19.2%); Elemental Mastery is flat.
// Character ascension values exclude the 5% CRIT Rate and 50% CRIT DMG every character has.

import { useEffect, useState } from 'react';

/** A breakpoint level in the game data ("80+" = 80 after ascending). Any level is allowed on a team: see team/level.ts. */
export type LevelKey = '1' | '20' | '20+' | '40' | '40+' | '50' | '50+' | '60' | '60+' | '70' | '70+' | '80' | '80+' | '90' | '95' | '100';

export type Character = {
  name: string;
  element: string; // "Hydro"
  weapon_type: string; // "Catalyst"
  rarity: number;
  ascension_stat: string; // "CRIT DMG"
  gcsim_key: string | null; // null when gcsim does not support the character yet
  c3_boosts: string;
  c5_boosts: string;
  stats: { level: LevelKey; base_hp: number; base_atk: number; base_def: number; ascension_value_excl_base_crit: number }[];
};

export type Weapon = {
  name: string;
  type: string;
  rarity: number;
  substat: string | null; // "CRIT Rate"
  passive_name?: string;
  gcsim_key: string | null;
  stats: { level: LevelKey; base_atk: number; substat_value: number | null }[];
};

export type ArtifactSet = { name: string; two_piece: string; four_piece: string; gcsim_key: string | null };

export const ENEMY_ELEMENTS = ['pyro', 'hydro', 'electro', 'cryo', 'anemo', 'geo', 'dendro', 'physical'] as const;
export type EnemyElement = (typeof ENEMY_ELEMENTS)[number];

/** An enemy from gcsim's data (data/enemies.json, made by scripts/export_enemies.mjs). */
export type Enemy = {
  /** gcsim's name for it, saved in the fight settings. */
  key: string;
  name: string;
  /** Resistance to each element, 0.1 = 10%. */
  resist: Record<EnemyElement, number>;
  /** 1 = can't be frozen. */
  freezeResist: number;
};

export type GameData = {
  characters: Character[];
  weapons: Weapon[];
  sets: ArtifactSet[];
  enemies: Enemy[];
  character: Map<string, Character>;
  weapon: Map<string, Weapon>;
  set: Map<string, ArtifactSet>;
  enemy: Map<string, Enemy>;
};

let loading: Promise<GameData> | undefined;

export function loadGameData(): Promise<GameData> {
  loading ??= Promise.all([
    import('../../data/characters.json'),
    import('../../data/weapons.json'),
    import('../../data/artifact_sets.json'),
    import('../../data/enemies.json'),
  ]).then(([c, w, s, e]) => {
    const characters = (c.default as Character[]).slice().sort((a, b) => a.name.localeCompare(b.name));
    const weapons = (w.default as Weapon[]).slice().sort((a, b) => a.name.localeCompare(b.name));
    // Low-rarity sets have no gcsim key and cannot be simulated, so they are left out.
    const sets = (s.default as ArtifactSet[]).filter((x) => x.gcsim_key).sort((a, b) => a.name.localeCompare(b.name));
    const enemies = e.default.enemies as Enemy[];
    return {
      characters,
      weapons,
      sets,
      enemies,
      character: new Map(characters.map((x) => [x.name, x])),
      weapon: new Map(weapons.map((x) => [x.name, x])),
      set: new Map(sets.map((x) => [x.name, x])),
      enemy: new Map(enemies.map((x) => [x.key, x])),
    };
  });
  loading.catch(() => (loading = undefined));
  return loading;
}

/** Game data for a screen: undefined while loading. */
export function useGameData(): GameData | undefined {
  const [data, setData] = useState<GameData>();
  useEffect(() => {
    let alive = true;
    loadGameData().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

const ELEMENT_NAMES: Record<EnemyElement, string> = {
  pyro: 'Pyro',
  hydro: 'Hydro',
  electro: 'Electro',
  cryo: 'Cryo',
  anemo: 'Anemo',
  geo: 'Geo',
  dendro: 'Dendro',
  physical: 'Physical',
};

export const elementName = (e: EnemyElement) => ELEMENT_NAMES[e];
export const resistPercent = (r: number) => `${Math.round(r * 100)}%`;

/**
 * A short description of an enemy's resistances: the ones that aren't the usual 10%, then whether it
 * can be frozen. For example "Hydro 70% · Electro 70% · can't be frozen" or "10% to everything".
 */
export function enemySummary(e: Enemy): string {
  const values = ENEMY_ELEMENTS.map((el) => e.resist[el]);
  const same = values.every((v) => v === values[0]);
  const parts = same
    ? [`${resistPercent(values[0])} to everything`]
    : ENEMY_ELEMENTS.filter((el) => e.resist[el] !== 0.1).map((el) => `${ELEMENT_NAMES[el]} ${resistPercent(e.resist[el])}`);
  if (e.freezeResist >= 1) parts.push("can't be frozen");
  return parts.join(' · ');
}
