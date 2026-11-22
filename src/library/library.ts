// The Library's text (data/library.json, made by scripts/export_library_text.mjs): talents,
// passives, constellations and weapon descriptions, plus each talent's scaling as the game stores it.
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
/**
 * A talent's scaling as the game stores it: lines such as "1-Hit DMG|{param1:F1P}" and the values
 * each param takes at talent levels 1–15 (a single value when it never changes).
 */
export type TalentScaling = { lines: string[]; params: Record<string, number[]> };

export type Library = {
  characters: Record<string, CharacterText>;
  weapons: Record<string, { description: string }>;
  /** Character name -> talent ("Normal Attack", "Skill", "Burst", "Special") -> scaling. */
  scaling: Record<string, Record<string, TalentScaling>>;
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

/** One value in a scaling line, in the game's format: F1P = percent with 1 decimal, I = whole number… */
export function formatParam(value: number, format: string): string {
  if (format === 'I') return String(Math.round(value));
  const percent = format.includes('P');
  const v = percent ? value * 100 : value;
  const decimals = format.match(/F(\d)/)?.[1];
  // A plain "P" has no fixed decimals: up to two, without the computer's rounding noise.
  const text = decimals !== undefined ? v.toFixed(Number(decimals)) : String(Number(v.toFixed(2)));
  return percent ? `${text}%` : text;
}

/**
 * A talent's scaling lines at a talent level (1–15), written as the game writes them:
 * { label: "1-Hit DMG", value: "72.2%" }.
 */
export function scalingLines(scaling: TalentScaling, level: number): { label: string; value: string }[] {
  const i = Math.min(15, Math.max(1, level)) - 1;
  return scaling.lines.map((line) => {
    const [label, template = ''] = line.split('|');
    const value = template.replace(/\{(param\d+):([A-Z0-9]+)\}/g, (all, param: string, format: string) => {
      const values = scaling.params[param];
      if (!values?.length) return all;
      return formatParam(values[Math.min(i, values.length - 1)], format);
    });
    return { label, value };
  });
}

/** A weapon's passive with a refinement's values filled in ("CRIT DMG increased by 20%…"). */
export function refinedPassive(weapon: Weapon & { passive_template?: string }, refinement: number): string | undefined {
  if (!weapon.passive_template) return undefined;
  const values = weapon.refinement_values?.[Math.min(5, Math.max(1, refinement)) - 1] ?? [];
  return weapon.passive_template.replace(/\{(\d+)\}/g, (all, n: string) => (values[Number(n)] !== undefined ? `**${values[Number(n)]}**` : all));
}

/** An entry of the Library: a kind and a name. */
export type LibraryItem = { kind: 'characters' | 'weapons' | 'sets'; name: string };
