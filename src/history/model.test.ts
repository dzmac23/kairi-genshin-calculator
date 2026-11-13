import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runName, type RunRecord } from './model';

const result = JSON.parse(readFileSync('reference/sample_gcsim_result.json', 'utf8'));
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

describe('runName', () => {
  it('uses the character names when there is no label', () => {
    expect(runName(run())).toBe('Successful Run – Neuvillette, Kaedehara Kazuha, Furina, Xilonen');
  });
  it('uses the label when there is one', () => {
    expect(runName(run({ label: 'Skirk Freeze test' }))).toBe('Successful Run – Skirk Freeze test');
    expect(runName(run({ label: '   ' }))).toBe('Successful Run – Neuvillette, Kaedehara Kazuha, Furina, Xilonen');
  });
  it('keeps "Imported Run" for imported runs, even after renaming', () => {
    expect(runName(run({ origin: 'imported' }))).toBe('Imported Run – Neuvillette, Kaedehara Kazuha, Furina, Xilonen');
    expect(runName(run({ origin: 'imported', label: 'From a friend' }))).toBe('Imported Run – From a friend');
  });
});

describe('runName with saved teams', () => {
  it('uses the saved team and rotation, unless there is a label', () => {
    expect(runName(run({ teamName: 'Skirk Freeze', rotationLabel: 'Double Q' }))).toBe('Successful Run – Skirk Freeze · Double Q');
    expect(runName(run({ teamName: 'Skirk Freeze' }))).toBe('Successful Run – Skirk Freeze');
    expect(runName(run({ teamName: 'Skirk Freeze', label: 'C2 test' }))).toBe('Successful Run – C2 test');
    expect(runName(run({ teamName: 'Skirk Freeze', origin: 'imported' }))).toBe('Imported Run – Skirk Freeze');
  });
});
