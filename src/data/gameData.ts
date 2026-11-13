// Loads the game data in data/ (characters, weapons, artifact sets).
// The files are large, so they are loaded only when a screen needs them, not with the first page.
//
// Units in the data: percentage stats are fractions (0.192 = 19.2%); Elemental Mastery is flat.
// Character ascension values exclude the 5% CRIT Rate and 50% CRIT DMG every character has.

import { useEffect, useState } from 'react';

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

export type GameData = {
  characters: Character[];
  weapons: Weapon[];
  sets: ArtifactSet[];
  character: Map<string, Character>;
  weapon: Map<string, Weapon>;
  set: Map<string, ArtifactSet>;
};

let loading: Promise<GameData> | undefined;

export function loadGameData(): Promise<GameData> {
  loading ??= Promise.all([
    import('../../data/characters.json'),
    import('../../data/weapons.json'),
    import('../../data/artifact_sets.json'),
  ]).then(([c, w, s]) => {
    const characters = (c.default as Character[]).slice().sort((a, b) => a.name.localeCompare(b.name));
    const weapons = (w.default as Weapon[]).slice().sort((a, b) => a.name.localeCompare(b.name));
    // Low-rarity sets have no gcsim key and cannot be simulated, so they are left out.
    const sets = (s.default as ArtifactSet[]).filter((x) => x.gcsim_key).sort((a, b) => a.name.localeCompare(b.name));
    return {
      characters,
      weapons,
      sets,
      character: new Map(characters.map((x) => [x.name, x])),
      weapon: new Map(weapons.map((x) => [x.name, x])),
      set: new Map(sets.map((x) => [x.name, x])),
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
