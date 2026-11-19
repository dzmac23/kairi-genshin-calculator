import { beforeAll, describe, expect, it } from 'vitest';
import { loadGameData, type GameData } from '../data/gameData';
import { sameTeam } from '../teams/model';
import { statsFromSnapshot } from './baseline';
import { checkTeam, teamToGcsim } from './gcsim';
import { artifactsFromTotals, baselineKey, cleanSlot, hasCurrentBaseline, hasSolvedTotals, totalsKey, type Slot, type TotalKey } from './model';
import { placeholderTeam } from './placeholderTeam.testutil';

let data: GameData;
let slot: Slot;
// Furina's real numbers from the owner's run: stats without artifacts, as gcsim works them out.
const without: Record<TotalKey, number> = { hp: 15307, atk: 786, def: 696, em: 0, cr: 24.2, cd: 138.2, er: 100, 'elem%': 0, 'phys%': 0 };

beforeAll(async () => {
  data = await loadGameData();
  const base = placeholderTeam(data)[2]; // the placeholder Furina slot
  slot = {
    ...base,
    statMode: 'totals',
    totals: { hp: 32046, atk: 1158, def: 853, cr: 51.0, cd: 251.7, er: 138.9 },
  };
  // What the solver finds for Furina (no stat-converting passives, so total − without).
  const artifacts: Record<TotalKey, number> = { hp: 16739, atk: 372, def: 157, em: 0, cr: 26.8, cd: 113.5, er: 38.9, 'elem%': 0, 'phys%': 0 };
  slot = { ...slot, baseline: { key: baselineKey(slot), stats: without, solved: { totals: totalsKey(slot), artifacts } } };
});

describe('character totals → artifact stats', () => {
  it('uses the artifact stats worked out for exactly these totals', () => {
    expect(hasSolvedTotals(slot)).toBe(true);
    const a = artifactsFromTotals(slot)!;
    expect(a.hp).toBe(16739);
    expect(a.atk).toBe(372);
    expect(a.def).toBe(157);
    expect(a.cr).toBeCloseTo(26.8, 6);
    expect(a.cd).toBeCloseTo(113.5, 6);
    expect(a.er).toBeCloseTo(38.9, 6);
    expect(a.em).toBe(0);
    expect(a['elem%']).toBe(0);
  });

  it('writes them as flat HP/ATK/DEF in the gcsim stats line', () => {
    const line = teamToGcsim([slot], data).split('\n').find((l) => l.includes(' add stats '))!;
    expect(line).toBe('furina add stats atk%=0 atk=372 hp%=0 hp=16739 def%=0 def=157 em=0 cr=0.268 cd=1.135 er=0.389 hydro%=0 phys%=0;');
  });

  it('waits for gcsim when the build or the totals change, and blocks totals below the no-artifact stats', () => {
    const changed = { ...slot, refinement: 3 }; // a different build: everything must be worked out again
    expect(hasCurrentBaseline(changed)).toBe(false);
    expect(artifactsFromTotals(changed)).toBeUndefined();
    expect(checkTeam([changed], data)[0].message).toMatch(/Working out Furina's artifact stats/);
    const retyped = { ...slot, totals: { ...slot.totals, atk: 1200 } }; // same build, new totals
    expect(hasCurrentBaseline(retyped)).toBe(true);
    expect(artifactsFromTotals(retyped)).toBeUndefined();
    const low = { ...retyped, baseline: { ...retyped.baseline!, solved: { totals: totalsKey(retyped), artifacts: { ...retyped.baseline!.solved!.artifacts, atk: -86 } } } };
    const lowAtk = { ...low, totals: { ...low.totals, atk: 700 } };
    lowAtk.baseline.solved.totals = totalsKey(lowAtk);
    expect(checkTeam([lowAtk], data).find((p) => p.blocking)?.message).toMatch(/total ATK \(700\) is lower than without any artifacts \(786\)/);
  });

  it('keeps totals and the saved baseline through storage, and the baseline is not counted as a change', () => {
    const cleaned = cleanSlot(JSON.parse(JSON.stringify(slot)));
    expect(cleaned.statMode).toBe('totals');
    expect(cleaned.totals).toEqual(slot.totals);
    expect(hasCurrentBaseline(cleaned)).toBe(true);
    const noBaseline = { ...slot, baseline: undefined };
    expect(sameTeam([slot], [noBaseline])).toBe(true);
    // An artifact-stats slot stays exactly as before (no new fields).
    expect(Object.keys(cleanSlot(placeholderTeam(data)[0]))).not.toContain('statMode');
  });

  it("reads gcsim's snapshot in character-screen units", () => {
    const snapshot = Array(30).fill(0);
    Object.assign(snapshot, { 2: 853.4, 3: 32046.2, 5: 1158.3, 7: 1.389, 8: 0, 9: 0.51, 10: 2.517, 13: 0.15, 19: 0 });
    expect(statsFromSnapshot(snapshot, 'Hydro')).toEqual({ hp: 32046, atk: 1158, def: 853, em: 0, cr: 51, cd: 251.7, er: 138.9, 'elem%': 15, 'phys%': 0 });
  });
});
