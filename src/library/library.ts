// The Library's text (data/library.json, made by scripts/export_library_text.mjs): talents,
// passives, constellations and weapon descriptions, plus a compact copy of the talent scaling.
// It's about a megabyte, so it loads only when the Library or an ⓘ panel opens.

import { useEffect, useState } from 'react';
import type { ArtifactSet, Weapon } from '../data/gameData';

export type TalentText = { kind: string; name: string; text: string };
export type PassiveText = { name: string; unlock: string; text: string };
export type ConstellationText = { level: number; name: string; text: string };
export type CharacterText = {
  title: string;
  region: string;
  description: string;
  talents: TalentText[];
  passives: PassiveText[];
  constellations: ConstellationText[];
};
/** One line of a talent's scaling: its label, the game's text at level 10, and values for levels 1–15. */
export type ScalingRow = { label: string; at10: string; values: (number | null)[][] };

export type Library = {
  characters: Record<string, CharacterText>;
  weapons: Record<string, { description: string }>;
  /** Character name -> talent ("Normal Attack", "Skill", "Burst", "Special") -> rows. */
  scaling: Record<string, Record<string, ScalingRow[]>>;
  /** Every artifact set, including the low-rarity ones gcsim can't simulate. */
  sets: ArtifactSet[];
};

let loading: Promise<Library> | undefined;

export function loadLibrary(): Promise<Library> {
  loading ??= Promise.all([import('../../data/library.json'), import('../../data/artifact_sets.json')]).then(([l, s]) => ({
    ...(l.default as unknown as Omit<Library, 'sets'>),
    sets: (s.default as ArtifactSet[]).slice().sort((a, b) => a.name.localeCompare(b.name)),
  }));
  loading.catch(() => (loading = undefined));
  return loading;
}

/** The Library for a screen: undefined while loading. */
export function useLibrary(): Library | undefined {
  const [lib, setLib] = useState<Library>();
  useEffect(() => {
    let alive = true;
    loadLibrary().then((l) => alive && setLib(l));
    return () => {
      alive = false;
    };
  }, []);
  return lib;
}

/** Which scaling group each talent's text belongs to. */
export const SCALING_GROUP: Record<string, string> = {
  'Normal Attack': 'Normal Attack',
  'Elemental Skill': 'Skill',
  'Alternate Sprint': 'Special',
  'Elemental Burst': 'Burst',
};

/**
 * A scaling row at a talent level (1–15), written like the game writes it at level 10: each number
 * in the level-10 text becomes the same value at the chosen level. A number that is one of the
 * row's values is replaced by it; other percentages (parts of a multi-hit "67.6%+67.6%", or the
 * low and high plunge) grow by the same curve as the row, so they are scaled by its ratio. Small
 * whole numbers such as "×2" stay as they are. `exact` is false when a number that may change with
 * the level couldn't be worked out (then it shows its level-10 value).
 */
export function scalingAt(row: ScalingRow, level: number): { text: string; exact: boolean } {
  const i = Math.min(15, Math.max(1, level)) - 1;
  if (i === 9) return { text: row.at10, exact: true };
  const candidates = row.values.map((a) => ({ at10: a[9], now: a[i] })).filter((c) => c.at10 !== null && c.now !== null) as { at10: number; now: number }[];
  const main = candidates.find((c) => c.at10 !== 0);
  const ratio = main ? main.now / main.at10 : 1;
  const changes = candidates.some((c) => c.at10 !== c.now);
  let exact = true;
  const text = row.at10.replace(/([×*]?)(\d+(?:\.\d+)?)(%?)/g, (token, times: string, digits: string, percent: string) => {
    const n = parseFloat(digits);
    const decimals = digits.split('.')[1]?.length ?? 0;
    const tolerance = 0.6 * 10 ** -decimals;
    for (const c of candidates) {
      if (percent && Math.abs(c.at10 * 100 - n) <= tolerance) return `${times}${(c.now * 100).toFixed(decimals)}%`;
      if (!percent && Math.abs(c.at10 - n) <= tolerance) return `${times}${c.now.toFixed(decimals)}`;
    }
    if (!changes || times) return token; // "×2": a hit count
    if (percent) return `${(n * ratio).toFixed(decimals)}%`;
    exact = false;
    return token;
  });
  return { text, exact };
}

/** A weapon's passive with a refinement's values filled in ("CRIT DMG increased by 20%…"). */
export function refinedPassive(weapon: Weapon & { passive_template?: string }, refinement: number): string | undefined {
  if (!weapon.passive_template) return undefined;
  const values = weapon.refinement_values?.[Math.min(5, Math.max(1, refinement)) - 1] ?? [];
  return weapon.passive_template.replace(/\{(\d+)\}/g, (all, n: string) => (values[Number(n)] !== undefined ? `**${values[Number(n)]}**` : all));
}
