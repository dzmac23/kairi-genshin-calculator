// Run history: what a saved run holds, how it is named, and the export/import file format.
//
// Every successful run is saved on this device (IndexedDB, see storage.ts). A file exported from
// the History screen can be imported on another device; imported runs keep their original id, so
// importing the same run twice is detected.

import type { SimSettings } from '../config/settings';
import type { SimResult } from '../engine/pool';
import { characterName } from '../results/summarize';
import type { RotationText } from '../rotation/notation';
import type { RotationTiming } from '../rotation/timing';
import type { Team } from '../team/model';

export type RunRecord = {
  id: string;
  /** When the run finished (ISO date). */
  createdAt: string;
  /** Your name for the run; empty means "use the character names". */
  label?: string;
  origin: 'local' | 'imported';
  importedAt?: string;
  /** gcsim version that produced the result, e.g. "v2.50.0". */
  gcsimVersion?: string;
  /** Built from the Team and Rotation screens, or a pasted gcsim config. */
  source: 'team' | 'paste';
  team?: Team;
  rotation?: RotationText;
  settings?: SimSettings;
  config: string;
  notes: string[];
  /** How long the run took on the device that ran it. */
  seconds: number;
  result: SimResult;
  timing?: RotationTiming;
};

/** The file written by Export. Version 1 holds runs; later versions may add teams and settings. */
export type ExportFile = {
  app: 'kairi-genshin-calculator';
  kind: 'runs';
  version: 1;
  exportedAt: string;
  runs: RunRecord[];
};

/** Display names of the characters in a run, from gcsim's result (works for pasted configs too). */
export function runCharacters(run: Pick<RunRecord, 'result'>): string[] {
  const details = (run.result as { character_details?: { name: string }[] }).character_details ?? [];
  return details.map((c) => characterName(c.name));
}

/** "Successful Run – Furina, Escoffier, Yelan, Skirk", "Successful Run – My label", "Imported Run – …". */
export function runName(run: Pick<RunRecord, 'label' | 'origin' | 'result'>): string {
  const prefix = run.origin === 'imported' ? 'Imported Run' : 'Successful Run';
  const label = run.label?.trim();
  return `${prefix} – ${label || runCharacters(run).join(', ') || 'unnamed'}`;
}

export function runDps(run: Pick<RunRecord, 'result'>): number {
  return run.result.statistics.dps.mean;
}

export function makeExportFile(runs: RunRecord[], now = new Date()): ExportFile {
  return { app: 'kairi-genshin-calculator', kind: 'runs', version: 1, exportedAt: now.toISOString(), runs };
}

/** A file name like "kairi-run-skirk-freeze-2026-11-13.json" or "kairi-runs-12-2026-11-13.json". */
export function exportFileName(runs: RunRecord[], now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  if (runs.length === 1) {
    const slug = (runs[0].label?.trim() || runCharacters(runs[0]).join(' ') || 'run')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 60)
      .replace(/^-+|-+$/g, '');
    return `kairi-run-${slug || 'run'}-${date}.json`;
  }
  return `kairi-runs-${runs.length}-${date}.json`;
}

export type ImportPreview = {
  /** Runs found in the file, marked as imported. */
  runs: RunRecord[];
  /** Ids already in this device's history (skipped by default). */
  duplicates: Set<string>;
  /** Entries in the file that weren't valid runs. */
  invalid: number;
  error?: string;
};

function isRun(x: unknown): x is RunRecord {
  const r = x as RunRecord;
  return (
    !!r &&
    typeof r.id === 'string' &&
    typeof r.config === 'string' &&
    typeof r.createdAt === 'string' &&
    typeof r.result?.statistics?.dps?.mean === 'number'
  );
}

/** Reads an export file. Runs are marked as imported; runs already in `existing` are flagged. */
export function readImportFile(text: string, existing: Set<string>, now = new Date()): ImportPreview {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { runs: [], duplicates: new Set(), invalid: 0, error: "This file isn't a Kairi Calc export (it isn't valid JSON)." };
  }
  const file = data as Partial<ExportFile>;
  if (file?.app !== 'kairi-genshin-calculator' || !Array.isArray(file.runs)) {
    return { runs: [], duplicates: new Set(), invalid: 0, error: "This file isn't a Kairi Calc export." };
  }
  const valid = file.runs.filter(isRun);
  const runs = valid.map((r) => ({
    ...r,
    notes: Array.isArray(r.notes) ? r.notes : [],
    origin: 'imported' as const,
    importedAt: r.origin === 'imported' && r.importedAt ? r.importedAt : now.toISOString(),
  }));
  return {
    runs,
    duplicates: new Set(runs.filter((r) => existing.has(r.id)).map((r) => r.id)),
    invalid: file.runs.length - valid.length,
  };
}
