// Export and import files. One format with a "kind" saying what's inside:
//   runs   – run history (from the History screen)
//   teams  – saved teams with their labelled rotations
//   backup – everything: runs, saved teams and the current setup
// Any of them can be imported from any Import button; the app shows what it found first.

import type { SimSettings } from './config/settings';
import { runCharacters, type RunRecord } from './history/model';
import type { RotationText } from './rotation/notation';
import type { Team } from './team/model';
import { cleanSavedTeam, isSavedTeam, type ActiveSaved, type SavedTeam } from './teams/model';

export type TransferKind = 'runs' | 'teams' | 'backup';

/** The current Team/Rotation screens and settings, as kept in a full backup. */
export type CurrentSetup = {
  team: Team;
  rotation: RotationText;
  settings: SimSettings;
  tokenTable: string;
  iterations: number;
  active: ActiveSaved;
};

export type TransferFile = {
  app: 'kairi-genshin-calculator';
  kind: TransferKind;
  version: 1;
  exportedAt: string;
  runs?: RunRecord[];
  teams?: SavedTeam[];
  current?: CurrentSetup;
};

export function makeFile(kind: TransferKind, parts: Pick<TransferFile, 'runs' | 'teams' | 'current'>, now = new Date()): TransferFile {
  return { app: 'kairi-genshin-calculator', kind, version: 1, exportedAt: now.toISOString(), ...parts };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');

/** "kairi-run-skirk-freeze-2026-11-13.json", "kairi-teams-3-…", "kairi-backup-…". */
export function fileName(file: TransferFile, now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  if (file.kind === 'backup') return `kairi-backup-${date}.json`;
  if (file.kind === 'teams') {
    const teams = file.teams ?? [];
    return teams.length === 1 ? `kairi-team-${slug(teams[0].name) || 'team'}-${date}.json` : `kairi-teams-${teams.length}-${date}.json`;
  }
  const runs = file.runs ?? [];
  if (runs.length === 1) {
    const r = runs[0];
    return `kairi-run-${slug(r.label?.trim() || r.teamName || runCharacters(r).join(' ')) || 'run'}-${date}.json`;
  }
  return `kairi-runs-${runs.length}-${date}.json`;
}

export type TransferPreview = {
  kind?: TransferKind;
  /** Runs found, marked as imported. */
  runs: RunRecord[];
  /** Ids already in this device's history: these can't be imported again. */
  runDuplicates: Set<string>;
  teams: SavedTeam[];
  /** Ids of saved teams that already exist here: imported only as a copy, if chosen. */
  teamDuplicates: Set<string>;
  current?: CurrentSetup;
  /** Entries that weren't valid and will be skipped. */
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

function isCurrent(x: unknown): x is CurrentSetup {
  const c = x as CurrentSetup;
  return !!c && Array.isArray(c.team) && c.team.length === 4 && typeof c.rotation?.loop === 'string' && typeof c.settings === 'object';
}

const empty = (error: string): TransferPreview => ({ runs: [], runDuplicates: new Set(), teams: [], teamDuplicates: new Set(), invalid: 0, error });

/** Reads any export file and works out what's new compared with this device. */
export function readTransferFile(
  text: string,
  existing: { runIds: Set<string>; teamIds: Set<string> },
  now = new Date(),
): TransferPreview {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return empty("This file isn't a Kairi Calc export (it isn't valid JSON).");
  }
  const file = data as Partial<TransferFile>;
  if (file?.app !== 'kairi-genshin-calculator' || (!Array.isArray(file.runs) && !Array.isArray(file.teams) && !file.current)) {
    return empty("This file isn't a Kairi Calc export.");
  }
  const rawRuns = Array.isArray(file.runs) ? file.runs : [];
  const rawTeams = Array.isArray(file.teams) ? file.teams : [];
  const runs = rawRuns.filter(isRun).map((r) => ({
    ...r,
    notes: Array.isArray(r.notes) ? r.notes : [],
    origin: 'imported' as const,
    importedAt: r.origin === 'imported' && r.importedAt ? r.importedAt : now.toISOString(),
  }));
  const teams = rawTeams.filter(isSavedTeam).map(cleanSavedTeam);
  const current = isCurrent(file.current) ? file.current : undefined;
  return {
    kind: file.kind,
    runs,
    runDuplicates: new Set(runs.filter((r) => existing.runIds.has(r.id)).map((r) => r.id)),
    teams,
    teamDuplicates: new Set(teams.filter((t) => existing.teamIds.has(t.id)).map((t) => t.id)),
    current,
    invalid: rawRuns.length - runs.length + (rawTeams.length - teams.length) + (file.current && !current ? 1 : 0),
  };
}
