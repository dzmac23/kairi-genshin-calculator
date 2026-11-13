import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './config/settings';
import type { RunRecord } from './history/model';
import { emptyTeam } from './team/model';
import { savedNames, sameRotation, sameTeam, type SavedTeam } from './teams/model';
import { fileName, makeFile, readTransferFile } from './transfer';

const result = JSON.parse(readFileSync('reference/sample_gcsim_result.json', 'utf8'));
const now = new Date('2026-11-14T10:00:00.000Z');
const run = (extra: Partial<RunRecord> = {}): RunRecord => ({
  id: 'a1',
  createdAt: '2026-11-13T05:00:00.000Z',
  origin: 'local',
  source: 'paste',
  config: 'x',
  notes: [],
  seconds: 2,
  result,
  ...extra,
});
const team = (extra: Partial<SavedTeam> = {}): SavedTeam => ({
  id: 't1',
  name: 'Skirk Freeze',
  team: emptyTeam().map((s, i) => ({ ...s, character: ['Skirk', 'Furina', 'Escoffier', 'Yelan'][i] })),
  rotations: [{ id: 'r1', label: 'Standard', rotation: { opener: 'Skirk hE', loop: 'Furina E Q > Skirk tE' } }],
  createdAt: '2026-11-13T05:00:00.000Z',
  updatedAt: '2026-11-13T05:00:00.000Z',
  ...extra,
});
const none = { runIds: new Set<string>(), teamIds: new Set<string>() };

describe('run files', () => {
  it('round-trips runs, marking them imported and spotting ones already here', () => {
    const file = JSON.stringify(makeFile('runs', { runs: [run(), run({ id: 'b2', label: 'Second' })] }, now));
    const p = readTransferFile(file, { runIds: new Set(['a1']), teamIds: new Set() }, now);
    expect(p.error).toBeUndefined();
    expect(p.kind).toBe('runs');
    expect(p.runs.map((r) => r.id)).toEqual(['a1', 'b2']);
    expect(p.runs.every((r) => r.origin === 'imported' && r.importedAt === now.toISOString())).toBe(true);
    expect([...p.runDuplicates]).toEqual(['a1']);
  });

  it('still reads files exported before teams existed (Step 6)', () => {
    const old = JSON.stringify({ app: 'kairi-genshin-calculator', kind: 'runs', version: 1, exportedAt: now.toISOString(), runs: [run()] });
    expect(readTransferFile(old, none, now).runs).toHaveLength(1);
  });

  it('keeps the first import date when an imported run is passed on again', () => {
    const file = JSON.stringify(makeFile('runs', { runs: [run({ origin: 'imported', importedAt: '2026-01-01T00:00:00.000Z' })] }, now));
    expect(readTransferFile(file, none, now).runs[0].importedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('team and backup files', () => {
  it('reads saved teams and spots ones already here', () => {
    const file = JSON.stringify(makeFile('teams', { teams: [team(), team({ id: 't2', name: 'Mono Hydro' })] }, now));
    const p = readTransferFile(file, { runIds: new Set(), teamIds: new Set(['t1']) }, now);
    expect(p.teams.map((t) => t.name)).toEqual(['Skirk Freeze', 'Mono Hydro']);
    expect([...p.teamDuplicates]).toEqual(['t1']);
    expect(p.teams[0].rotations[0].label).toBe('Standard');
  });

  it('reads a full backup: runs, teams and the current setup', () => {
    const current = { team: team().team, rotation: { opener: '', loop: 'Furina Q' }, settings: DEFAULT_SETTINGS, tokenTable: 'E = skill', iterations: 1000, active: { teamId: 't1' } };
    const p = readTransferFile(JSON.stringify(makeFile('backup', { runs: [run()], teams: [team()], current }, now)), none, now);
    expect(p.kind).toBe('backup');
    expect([p.runs.length, p.teams.length, p.current?.iterations]).toEqual([1, 1, 1000]);
  });

  it('skips broken entries and rejects files that are not exports', () => {
    const file = JSON.stringify({ ...makeFile('teams', { teams: [team()] }, now), teams: [team(), { id: 'bad' }], runs: [{ id: 'bad' }] });
    expect(readTransferFile(file, none, now).invalid).toBe(2);
    expect(readTransferFile('not json', none, now).error).toMatch(/valid JSON/);
    expect(readTransferFile('{"runs": []}', none, now).error).toMatch(/isn't a Kairi Calc export/);
  });

  it('names files by what they hold', () => {
    expect(fileName(makeFile('runs', { runs: [run({ label: 'Skirk Freeze!' })] }), now)).toBe('kairi-run-skirk-freeze-2026-11-14.json');
    expect(fileName(makeFile('runs', { runs: [run({ teamName: 'Mono Hydro' })] }), now)).toBe('kairi-run-mono-hydro-2026-11-14.json');
    expect(fileName(makeFile('runs', { runs: [run(), run({ id: 'b' })] }), now)).toBe('kairi-runs-2-2026-11-14.json');
    expect(fileName(makeFile('teams', { teams: [team()] }), now)).toBe('kairi-team-skirk-freeze-2026-11-14.json');
    expect(fileName(makeFile('teams', { teams: [team(), team()] }), now)).toBe('kairi-teams-2-2026-11-14.json');
    expect(fileName(makeFile('backup', {}), now)).toBe('kairi-backup-2026-11-14.json');
  });
});

describe('saved team names for runs', () => {
  const t = team();
  it('names a run after the saved team and rotation when both are unchanged', () => {
    expect(savedNames(t, { teamId: 't1', rotationId: 'r1' }, t.team, t.rotations[0].rotation)).toEqual({ teamName: 'Skirk Freeze', rotationLabel: 'Standard' });
  });
  it('drops the rotation label when the rotation was edited, and both when the team was', () => {
    expect(savedNames(t, { teamId: 't1', rotationId: 'r1' }, t.team, { opener: '', loop: 'Skirk Q' })).toEqual({ teamName: 'Skirk Freeze', rotationLabel: undefined });
    const edited = t.team.map((s, i) => (i === 0 ? { ...s, constellation: 2 } : s));
    expect(savedNames(t, { teamId: 't1', rotationId: 'r1' }, edited, t.rotations[0].rotation)).toEqual({});
  });
  it('compares teams and rotations ignoring missing fields and extra spaces', () => {
    expect(sameTeam(t.team, t.team.map((s) => ({ ...s })))).toBe(true);
    expect(sameRotation({ opener: ' Skirk hE ', loop: 'Furina E Q > Skirk tE\n' }, t.rotations[0].rotation)).toBe(true);
  });
});
