// Character totals → artifact stats.
//
// A character's total on the character screen (or Hoyolab) is: base stats for the level +
// ascension stat + weapon base ATK and substat + 2-piece set bonuses + permanent passives +
// artifacts. gcsim adds everything except the artifacts itself.
//
// So the app finds the artifact stats that make gcsim show the typed totals for the character
// alone (no Elemental Resonance or teammates' buffs). The first guess is total − the stats without
// artifacts ("the baseline"). That is exact unless a passive turns one stat into another (Xiphos'
// Moonlight: Energy Recharge from Elemental Mastery; Staff of Homa: ATK from HP…): then part of the
// total comes from the artifacts through the passive. So gcsim is asked what the guess gives, the
// guess is corrected by the difference, and this repeats until gcsim's totals match (usually 2–3
// rounds).

import type { GameData } from '../data/gameData';
import { characterSnapshot } from '../engine/pool';
import { slotLines } from './gcsim';
import { baselineKey, TOTAL_STATS, totalsKey, type Baseline, type Slot, type TotalKey } from './model';

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

/**
 * gcsim's snapshot as character-screen numbers (percentages as percentages, e.g. 51.0), rounded
 * like the game shows them unless `exact`.
 */
export function statsFromSnapshot(snapshot: number[], element: string, exact = false): Record<TotalKey, number> {
  const stats = {} as Record<TotalKey, number>;
  for (const { key, percent } of TOTAL_STATS) {
    const index = key === 'elem%' ? ELEMENT_INDEX[element] : SNAPSHOT_INDEX[key];
    const value = index === undefined ? 0 : (snapshot[index] ?? 0);
    // Rounded like the game shows them, so a typed total equal to it gives exactly 0.
    stats[key] = exact ? (percent ? value * 100 : value) : percent ? Math.round(value * 1000) / 10 : Math.round(value);
  }
  return stats;
}

const cache = new Map<string, Promise<number[]>>();

/** gcsim's snapshot for a one-character config (remembered, so the same build is asked once). */
function snapshotOf(config: string): Promise<number[]> {
  let p = cache.get(config);
  if (!p) {
    p = characterSnapshot(config);
    p.catch(() => cache.delete(config)); // try again next time
    cache.set(config, p);
    // Typing makes many slightly different configs; keep only the most recent few hundred.
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
  }
  return p;
}

const elementOf = (slot: Slot, data: GameData) => data.character.get(slot.character!)!.element;

/** Asks gcsim for a one-character config's snapshot. Tests pass the engine directly. */
export type Snapshotter = (config: string) => Promise<number[]>;

/** The character's stats with the given artifact stats (in game units: percentages as percentages). */
async function statsWith(slot: Slot, data: GameData, artifacts: Record<TotalKey, number>, snap: Snapshotter): Promise<Record<TotalKey, number>> {
  const s: Slot = { ...slot, statMode: 'artifacts', artifacts: { ...artifacts, 'atk%': 0, 'hp%': 0, 'def%': 0 } };
  return statsFromSnapshot(await snap(snapshotConfig(s, data, true)), elementOf(slot, data), true);
}

/** The character's stats without artifacts, for this build. */
export async function getBaseline(slot: Slot, data: GameData, snap: Snapshotter = snapshotOf): Promise<Baseline> {
  return { key: baselineKey(slot), stats: statsFromSnapshot(await snap(snapshotConfig(slot, data, false)), elementOf(slot, data)) };
}

const MAX_ROUNDS = 8;
const PERCENT = new Set(TOTAL_STATS.filter((s) => s.percent).map((s) => s.key));
/** As the game shows it: whole numbers, percentages to one decimal. */
const shown = (key: TotalKey, v: number) => (PERCENT.has(key) ? Math.round(v * 10) / 10 : Math.round(v));

/**
 * The artifact stats that give the typed totals in gcsim (see the top of this file). Empty totals
 * mean "nothing from artifacts" for that stat.
 */
export async function solveArtifacts(slot: Slot, data: GameData, baseline: Baseline, snap: Snapshotter = snapshotOf): Promise<Baseline> {
  const typed = TOTAL_STATS.filter(({ key }) => slot.totals?.[key] !== undefined).map(({ key }) => key);
  const artifacts = {} as Record<TotalKey, number>;
  for (const { key } of TOTAL_STATS) artifacts[key] = typed.includes(key) ? slot.totals![key]! - baseline.stats[key] : 0;
  for (let round = 0; round < MAX_ROUNDS && typed.length; round++) {
    const got = await statsWith(slot, data, artifacts, snap);
    // Done when gcsim's totals look the same as the typed ones (the game rounds what it shows, so
    // the simple subtraction is kept whenever it already gives them).
    const off = typed.filter((key) => Math.abs(shown(key, got[key]) - shown(key, slot.totals![key]!)) > 1e-9);
    if (!off.length) break;
    for (const key of off) artifacts[key] -= got[key] - slot.totals![key]!;
  }
  // Tidy rounding: 0.01% and 0.1 for flat stats are far finer than the game shows.
  for (const { key, percent } of TOTAL_STATS) artifacts[key] = percent ? Math.round(artifacts[key] * 100) / 100 : Math.round(artifacts[key] * 10) / 10;
  return { ...baseline, solved: { totals: totalsKey(slot), artifacts } };
}

/** The totals gcsim works out from the slot's artifact stats (to fill in the totals boxes). */
export async function totalsFromArtifacts(slot: Slot, data: GameData): Promise<Record<TotalKey, number>> {
  const s: Slot = { ...slot, statMode: 'artifacts' };
  return statsFromSnapshot(await snapshotOf(snapshotConfig(s, data, true)), elementOf(slot, data));
}

/** The slot can be sent to gcsim on its own: a supported character with a supported weapon. */
export function canSnapshot(slot: Slot, data: GameData): boolean {
  const character = slot.character ? data.character.get(slot.character) : undefined;
  const weapon = slot.weapon ? data.weapon.get(slot.weapon) : undefined;
  return !!character?.gcsim_key && !!weapon?.gcsim_key && weapon.type === character.weapon_type;
}
