import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RunRecord } from '../history/model';
import { emptyTeam } from '../team/model';
import { compareDps, compareRuns, verdictText } from './compare';

const base = JSON.parse(readFileSync('reference/sample_gcsim_result.json', 'utf8'));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
/** A copy of the sample result with a different team DPS (and optionally other changes). */
const withDps = (mean: number, edit: (r: typeof base) => void = () => {}) => {
  const r = clone(base);
  r.statistics.dps.mean = mean;
  edit(r);
  return r;
};
const run = (result: unknown, extra: Partial<RunRecord> = {}): RunRecord => ({
  id: Math.random().toString(36),
  createdAt: '2026-11-13T05:00:00.000Z',
  origin: 'local',
  source: 'paste',
  config: 'x',
  notes: [],
  seconds: 2,
  result: result as RunRecord['result'],
  ...extra,
});

describe('verdict', () => {
  // Sample: sd 2,068 over 500 fights, so each average is precise to about ±181 and the
  // difference between two such runs to about ±256.
  it('calls a large difference clearly better', () => {
    const c = compareRuns(run(base), run(withDps(36500)));
    expect(c.dps.verdict).toBe('b-better');
    expect(c.dps.margin).toBeCloseTo(1.96 * Math.sqrt(2) * (2067.915 / Math.sqrt(500)), 0);
    expect(verdictText(c.dps)).toMatch(/^B is clearly better: \+3\.9% \(\+1,374 DPS\)/);
  });

  it('calls a small difference too close', () => {
    const c = compareRuns(run(base), run(withDps(35226)));
    expect(c.dps.verdict).toBe('too-close');
    expect(verdictText(c.dps)).toMatch(/^Too close to call/);
  });

  it('notices when A is better', () => {
    expect(compareRuns(run(base), run(withDps(30000))).dps.verdict).toBe('a-better');
  });

  it('gets more precise with more fights', () => {
    const a = { ...compareRuns(run(base), run(base)).viewA };
    const more = { ...a, iterations: 5000 };
    expect(compareDps(more, more).margin).toBeLessThan(compareDps(a, a).margin);
  });
});

describe('fairness check', () => {
  it('finds no problems between runs with the same fight settings', () => {
    expect(compareRuns(run(base), run(base)).fairness).toEqual([]);
  });

  it('flags different fight length, enemies, energy and gcsim version', () => {
    const b = withDps(35000, (r) => {
      r.simulator_settings.duration = 120;
      r.target_details.push(clone(r.target_details[0]));
      r.energy_settings.active = false;
    });
    const f = compareRuns(run(base, { gcsimVersion: 'v2.49.6' }), run(b, { gcsimVersion: 'v2.50.0' })).fairness;
    expect(f.join(' ')).toMatch(/Fight length differs: A is 90 s, B is 120 s/);
    expect(f.join(' ')).toMatch(/Number of enemies differs: A has 1, B has 2/);
    expect(f.join(' ')).toMatch(/Random energy is on in A but off in B/);
    expect(f.join(' ')).toMatch(/different gcsim versions/);
  });

  it('flags a different enemy level', () => {
    const b = withDps(35000, (r) => (r.target_details[0].level = 90));
    expect(compareRuns(run(base), run(b)).fairness).toEqual(['Enemy level differs: A is 100, B is 90.']);
  });
});

describe('same team, tweaked', () => {
  it('lines up characters and lists what changed in the builds and rotation', () => {
    const teamA = emptyTeam().map((s, i) => ({ ...s, character: ['Neuvillette', 'Kaedehara Kazuha', 'Furina', 'Xilonen'][i], weapon: 'W' }));
    const teamB = teamA.map((s, i) => (i === 2 ? { ...s, refinement: 5, artifacts: { cr: 70 } } : s));
    const c = compareRuns(
      run(base, { source: 'team', team: teamA, rotation: { opener: '', loop: 'Furina E Q' } }),
      run(withDps(36000), { source: 'team', team: teamB, rotation: { opener: '', loop: 'Furina E Q?' } }),
    );
    expect(c.sameTeam).toBe(true);
    expect(c.characters.map((x) => x.name)).toEqual(['Neuvillette', 'Kaedehara Kazuha', 'Furina', 'Xilonen']);
    expect(c.changes).toEqual(['Furina: W R1 lv 90 → R5 lv 90', 'Furina: CRIT Rate 0% → 70%', 'Loop: "Furina E Q" → "Furina E Q?"']);
  });

  it('compares pasted configs line by line, ignoring the iteration count', () => {
    const c = compareRuns(
      run(base, { config: 'a;\noptions iteration=500;\nfurina skill;' }),
      run(base, { config: 'a;\noptions iteration=100;\nfurina burst;' }),
    );
    expect(c.changes).toEqual(['A only: furina skill;', 'B only: furina burst;']);
  });
});

describe('different teams', () => {
  it('detects a different team and does not line up characters', () => {
    const b = withDps(30000, (r) => (r.character_details[1].name = 'bennett'));
    const c = compareRuns(run(base), run(b));
    expect(c.sameTeam).toBe(false);
    expect(c.characters).toEqual([]);
  });
});
