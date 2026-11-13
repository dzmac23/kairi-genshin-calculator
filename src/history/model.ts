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
  /** The saved team and rotation the run was made from, if unchanged (used in its name). */
  teamName?: string;
  rotationLabel?: string;
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

/** Display names of the characters in a run, from gcsim's result (works for pasted configs too). */
export function runCharacters(run: Pick<RunRecord, 'result'>): string[] {
  const details = (run.result as { character_details?: { name: string }[] }).character_details ?? [];
  return details.map((c) => characterName(c.name));
}

/**
 * "Successful Run – My label", else "Successful Run – Skirk Freeze · Double Q" for a saved team and
 * rotation, else "Successful Run – Furina, Escoffier, Yelan, Skirk". Imported runs say "Imported Run".
 */
export function runName(run: Pick<RunRecord, 'label' | 'origin' | 'result' | 'teamName' | 'rotationLabel'>): string {
  const prefix = run.origin === 'imported' ? 'Imported Run' : 'Successful Run';
  const label = run.label?.trim();
  const saved = run.teamName ? `${run.teamName}${run.rotationLabel ? ` · ${run.rotationLabel}` : ''}` : '';
  return `${prefix} – ${label || saved || runCharacters(run).join(', ') || 'unnamed'}`;
}

export function runDps(run: Pick<RunRecord, 'result'>): number {
  return run.result.statistics.dps.mean;
}
