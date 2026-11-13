import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportFileName, makeExportFile, readImportFile, runName, type RunRecord } from './model';

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

describe('export and import', () => {
  const now = new Date('2026-11-14T10:00:00.000Z');

  it('round-trips runs, marking them imported and spotting ones already here', () => {
    const file = JSON.stringify(makeExportFile([run(), run({ id: 'b2', label: 'Second' })], now));
    const preview = readImportFile(file, new Set(['a1']), now);
    expect(preview.error).toBeUndefined();
    expect(preview.runs.map((r) => r.id)).toEqual(['a1', 'b2']);
    expect(preview.runs.every((r) => r.origin === 'imported' && r.importedAt === now.toISOString())).toBe(true);
    expect([...preview.duplicates]).toEqual(['a1']);
    expect(runName(preview.runs[1])).toBe('Imported Run – Second');
  });

  it('keeps the first import date when an imported run is passed on again', () => {
    const file = JSON.stringify(makeExportFile([run({ origin: 'imported', importedAt: '2026-01-01T00:00:00.000Z' })], now));
    expect(readImportFile(file, new Set(), now).runs[0].importedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('skips broken entries and rejects files that are not exports', () => {
    const file = JSON.stringify({ ...makeExportFile([run()], now), runs: [run(), { id: 'bad' }] });
    expect(readImportFile(file, new Set(), now).invalid).toBe(1);
    expect(readImportFile('not json', new Set(), now).error).toMatch(/valid JSON/);
    expect(readImportFile('{"runs": []}', new Set(), now).error).toMatch(/isn't a Kairi Calc export/);
  });

  it('names files after the run or the number of runs', () => {
    expect(exportFileName([run({ label: 'Skirk Freeze!' })], now)).toBe('kairi-run-skirk-freeze-2026-11-14.json');
    expect(exportFileName([run()], now)).toBe('kairi-run-neuvillette-kaedehara-kazuha-furina-xilonen-2026-11-14.json');
    expect(exportFileName([run(), run({ id: 'b' })], now)).toBe('kairi-runs-2-2026-11-14.json');
  });
});
