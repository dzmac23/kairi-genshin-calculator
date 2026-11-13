// The one import screen: reads any export file (runs, teams or a full backup), shows what's in it
// and lets you choose what to add. Nothing changes until you press Import.

import { useState } from 'react';
import { runDps, runName, type RunRecord } from '../history/model';
import { teamCharacterNames, type SavedTeam } from '../teams/model';
import type { CurrentSetup, TransferPreview } from '../transfer';

export type ImportChoice = { runs: RunRecord[]; teams: SavedTeam[]; current?: CurrentSetup };

const fmt = (n: number) => Math.round(n).toLocaleString();
const when = (iso: string) => new Date(iso).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function ImportCard({
  preview,
  onCancel,
  onConfirm,
}: {
  preview: TransferPreview;
  onCancel: () => void;
  onConfirm: (choice: ImportChoice) => void;
}) {
  const [runs, setRuns] = useState(() => new Set(preview.runs.filter((r) => !preview.runDuplicates.has(r.id)).map((r) => r.id)));
  const [teams, setTeams] = useState(() => new Set(preview.teams.filter((t) => !preview.teamDuplicates.has(t.id)).map((t) => t.id)));
  const [replaceCurrent, setReplaceCurrent] = useState(false);
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  if (preview.error) {
    return (
      <section className="card import-card">
        <h2>Import</h2>
        <p className="warn">{preview.error}</p>
        <button className="secondary" onClick={onCancel}>
          Close
        </button>
      </section>
    );
  }

  const found = [
    preview.runs.length && plural(preview.runs.length, 'run'),
    preview.teams.length && plural(preview.teams.length, 'saved team'),
    preview.current && 'a current setup',
  ].filter(Boolean);
  const count = runs.size + teams.size + (replaceCurrent ? 1 : 0);

  return (
    <section className="card import-card">
      <h2>Import</h2>
      <p className="small">
        {preview.kind === 'backup' ? 'This is a full backup with ' : 'This file has '}
        {found.join(', ')}
        {preview.invalid > 0 && `, and ${plural(preview.invalid, 'damaged entry', 'damaged entries')} that will be skipped`}.
      </p>

      {preview.runs.length > 0 && (
        <>
          <p className="bar-title">Runs</p>
          <ul className="import-list">
            {preview.runs.map((r) => {
              const dup = preview.runDuplicates.has(r.id);
              return (
                <li key={r.id}>
                  <label>
                    <input type="checkbox" disabled={dup} checked={runs.has(r.id)} onChange={() => setRuns((s) => toggle(s, r.id))} />
                    <span>
                      {runName(r)}
                      <span className="muted small">
                        {' '}
                        · {when(r.createdAt)} · {fmt(runDps(r))} DPS{dup ? ' · already in your history' : ''}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {preview.teams.length > 0 && (
        <>
          <p className="bar-title">Saved teams</p>
          <ul className="import-list">
            {preview.teams.map((t) => {
              const dup = preview.teamDuplicates.has(t.id);
              return (
                <li key={t.id}>
                  <label>
                    <input type="checkbox" checked={teams.has(t.id)} onChange={() => setTeams((s) => toggle(s, t.id))} />
                    <span>
                      {t.name}
                      <span className="muted small">
                        {' '}
                        · {teamCharacterNames(t.team).join(', ')} · {plural(t.rotations.length, 'rotation')}
                        {dup ? ' · you already have this team: tick to add it as a copy' : ''}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {preview.current && (
        <>
          <p className="bar-title">Current setup</p>
          <label className="toggle">
            <input type="checkbox" checked={replaceCurrent} onChange={(e) => setReplaceCurrent(e.target.checked)} />
            <span className="small">
              Also replace my current team, rotation, fight settings, shorthand table and iteration choice with the
              backup's ({teamCharacterNames(preview.current.team).join(', ') || 'empty team'}).
            </span>
          </label>
        </>
      )}

      <div className="button-row">
        <button
          disabled={count === 0}
          onClick={() =>
            onConfirm({
              runs: preview.runs.filter((r) => runs.has(r.id)),
              teams: preview.teams
                .filter((t) => teams.has(t.id))
                // A team you already have comes in as a separate copy, never overwriting yours.
                .map((t) => (preview.teamDuplicates.has(t.id) ? { ...t, id: crypto.randomUUID(), name: `${t.name} (imported)` } : t)),
              current: replaceCurrent ? preview.current : undefined,
            })
          }
        >
          Import
        </button>
        <button className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
