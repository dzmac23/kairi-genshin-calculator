// Character totals → artifact stats.
//
// A character's total on the character screen (or Hoyolab) is: base stats for the level +
// ascension stat + weapon base ATK and substat + 2-piece set bonuses + permanent passives +
// artifacts. gcsim adds everything except the artifacts itself. So the app asks gcsim for the
// character's stats with no artifacts (alone, so no Elemental Resonance or teammates' buffs), and
// the artifact part is simply total − that ("the baseline").

import type { GameData } from '../data/gameData';
import { characterSnapshot } from '../engine/pool';
import { slotLines } from './gcsim';
import { baselineKey, TOTAL_STATS, type Baseline, type Slot, type TotalKey } from './model';

// Positions in gcsim's stat list (pkg/core/attributes/stats.go).
const SNAPSHOT_INDEX: Record<Exclude<TotalKey, 'elem%'>, number> = { def: 2, hp: 3, atk: 5, er: 7, em: 8, cr: 9, cd: 10, 'phys%': 19 };
const ELEMENT_INDEX: Record<string, number> = { Pyro: 12, Hydro: 13, Cryo: 14, Electro: 15, Anemo: 16, Geo: 17, Dendro: 18 };

/** A one-character config whose snapshot is that character's stats at the start of a fight. */
export function snapshotConfig(slot: Slot, data: GameData, withStats: boolean): string {
  const key = data.character.get(slot.character!)!.gcsim_key!;
  return [
    ...slotLines(slot, data, withStats),
    'options iteration=1 duration=1 swap_delay=12;',
    'target lvl=100 resist=0.1 radius=2 pos=2.4,0;',
    `active ${key};`,
    `${key} attack;`,
  ].join('\n');
}

/** gcsim's snapshot as character-screen numbers (percentages as percentages, e.g. 51.0). */
export function statsFromSnapshot(snapshot: number[], element: string): Record<TotalKey, number> {
  const stats = {} as Record<TotalKey, number>;
  for (const { key, percent } of TOTAL_STATS) {
    const index = key === 'elem%' ? ELEMENT_INDEX[element] : SNAPSHOT_INDEX[key];
    const value = index === undefined ? 0 : (snapshot[index] ?? 0);
    // Rounded like the game shows them, so a typed total equal to it gives exactly 0.
    stats[key] = percent ? Math.round(value * 1000) / 10 : Math.round(value);
  }
  return stats;
}

const cache = new Map<string, Promise<Record<TotalKey, number>>>();

function stats(slot: Slot, data: GameData, withStats: boolean): Promise<Record<TotalKey, number>> {
  const config = snapshotConfig(slot, data, withStats);
  let p = cache.get(config);
  if (!p) {
    const element = data.character.get(slot.character!)!.element;
    p = characterSnapshot(config).then((s) => statsFromSnapshot(s, element));
    p.catch(() => cache.delete(config)); // try again next time
    cache.set(config, p);
  }
  return p;
}

/** The character's stats without artifacts, for this build. */
export async function getBaseline(slot: Slot, data: GameData): Promise<Baseline> {
  return { key: baselineKey(slot), stats: await stats(slot, data, false) };
}

/** The totals gcsim works out from the slot's artifact stats (to fill in the totals boxes). */
export function totalsFromArtifacts(slot: Slot, data: GameData): Promise<Record<TotalKey, number>> {
  return stats({ ...slot, statMode: 'artifacts' }, data, true);
}

/** The slot can be sent to gcsim on its own: a supported character with a supported weapon. */
export function canSnapshot(slot: Slot, data: GameData): boolean {
  const character = slot.character ? data.character.get(slot.character) : undefined;
  const weapon = slot.weapon ? data.weapon.get(slot.weapon) : undefined;
  return !!character?.gcsim_key && !!weapon?.gcsim_key && weapon.type === character.weapon_type;
}
