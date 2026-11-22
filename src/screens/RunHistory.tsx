// Run History: the list of saved runs beside (laptop, tablet) or above (phone) the Results.
// Tap a run to read it; tick two to compare them. Actions on one run (load, rename, export,
// delete) are on the run itself in the reading area.

import { useMemo, useRef, useState } from 'react';
import { canShareFiles, deliverFile } from '../history/files';
import { runCharacters, runDps, runName, runShortName, type RunRecord } from '../history/model';
import { isPlaceholderConfig } from '../placeholder';
import { killView, type GcsimResult } from '../results/summarize';
import { makeFile } from '../transfer';

type Props = {
  runs: RunRecord[];
  loaded: boolean;
  /** The run shown in the reading area (highlighted). */
  viewingId?: string;
  /** The runs being compared (highlighted as A and B). */
  comparing?: { a?: string; b?: string };
  onOpen: (id: string) => void;
  /** Compares two ticked runs (the older one as Scenario A). */
  onCompare: (ids: string[]) => void;
  onDelete: (ids: string[]) => void;
  /** Opens the shared Import card for a chosen file (runs, teams or a full backup). */
  onImportFile: (file: File) => void;
};

const fmt = (n: number) => Math.round(n).toLocaleString();
const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function RunHistory(props: Props) {
  const { runs, loaded } = props;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Phones: the list folds away so the result has the screen; it opens with a tap.
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const sharing = useMemo(() => canShareFiles(), []);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return runs.filter((r) => {
      const text = `${runName(r)} ${runCharacters(r).join(' ')}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [runs, query]);

  const exportRuns = async (list: RunRecord[], share: boolean) => setMessage(await deliverFile(makeFile('runs', { runs: list }), share));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const chosen = runs.filter((r) => selected.has(r.id));
  const onFile = (file: File | undefined) => {
    if (!file) return;
    setMessage('');
    props.onImportFile(file);
    if (fileInput.current) fileInput.current.value = '';
  };
  const viewing = runs.find((r) => r.id === props.viewingId);

  return (
    <section className={`card run-history${open ? ' open' : ''}`} aria-label="Run History">
      <button className="run-history-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>
          <strong>Run History</strong> <span className="muted">({runs.length})</span>
        </span>
        <span className="muted small">{open ? 'Hide ▴' : viewing ? `Showing: ${runShortName(viewing)} ▾` : 'Show ▾'}</span>
      </button>
      <h2 className="run-history-title">
        Run History <span className="muted small">({runs.length})</span>
      </h2>

      <div className="run-history-body">
        {runs.length > 0 && (
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or character" aria-label="Search runs" />
        )}
        {selected.size > 0 ? (
          <div className="selection-bar">
            {selected.size === 2 ? (
              <button
                className="small-button"
                onClick={() => {
                  props.onCompare([...selected]);
                  setSelected(new Set());
                  setOpen(false);
                }}
              >
                Compare these 2 →
              </button>
            ) : (
              <span className="small">{selected.size === 1 ? 'Tick one more to compare' : `${selected.size} ticked`}</span>
            )}
            <button className="secondary small-button" onClick={() => exportRuns(chosen, false)}>
              Export
            </button>
            {sharing && (
              <button className="secondary small-button" onClick={() => exportRuns(chosen, true)}>
                Share
              </button>
            )}
            <DeleteButton
              label="Delete"
              onConfirm={() => {
                props.onDelete([...selected]);
                setSelected(new Set());
              }}
            />
            <button className="link small" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        ) : (
          runs.length > 1 && <p className="muted small hint">Tap a run to read it. Tick two to compare them.</p>
        )}

        {!loaded ? (
          <p className="muted">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="muted small">No runs yet. Every successful run is saved here, on this device.</p>
        ) : shown.length === 0 ? (
          <p className="muted small">No runs match “{query}”.</p>
        ) : (
          <ul className="run-list">
            {shown.map((r) => (
              <RunRow
                key={r.id}
                run={r}
                ticked={selected.has(r.id)}
                tag={props.comparing?.a === r.id ? 'A' : props.comparing?.b === r.id ? 'B' : undefined}
                viewing={props.viewingId === r.id}
                onTick={() => toggle(r.id)}
                onOpen={() => {
                  props.onOpen(r.id);
                  setOpen(false);
                }}
              />
            ))}
          </ul>
        )}

        <details className="run-history-files">
          <summary className="small">Import or export runs</summary>
          <p className="muted small">
            Export runs to back them up, move them to another device or share them; import a file (runs, teams or a full
            backup) to add them. The full backup is on the Home screen.
          </p>
          <div className="button-row">
            <button className="secondary small-button" onClick={() => fileInput.current?.click()}>
              Import file…
            </button>
            <button className="secondary small-button" onClick={() => exportRuns(runs, false)} disabled={runs.length === 0}>
              Export all
            </button>
            {sharing && (
              <button className="secondary small-button" onClick={() => exportRuns(runs, true)} disabled={runs.length === 0}>
                Share all
              </button>
            )}
          </div>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} aria-label="Import a runs file" />
        </details>
        {message && <p className="small muted">{message}</p>}
      </div>
    </section>
  );
}

function RunRow(p: { run: RunRecord; ticked: boolean; viewing: boolean; tag?: 'A' | 'B'; onTick: () => void; onOpen: () => void }) {
  const { run } = p;
  const kill = killView(run.result as GcsimResult);
  const label = run.label?.trim();
  return (
    <li className={`run-row${p.viewing ? ' viewing' : ''}`}>
      <div className="run-main">
        <input type="checkbox" checked={p.ticked} onChange={p.onTick} aria-label={`Tick ${runName(run)} to compare`} />
        <button className="run-summary" onClick={p.onOpen} aria-current={p.viewing ? 'true' : undefined}>
          <span className="run-name">
            {p.tag && <span className={`badge scenario-tag scenario-tag-${p.tag.toLowerCase()}`}>{p.tag}</span>} {runShortName(run)}
          </span>
          <span className="run-meta muted small">
            {when(run.createdAt)}
            {label ? ` · ${runCharacters(run).join(', ')}` : ''}
          </span>
          {(run.origin === 'imported' || isPlaceholderConfig(run.config) || run.source === 'paste' || kill) && (
            <span className="run-badges">
              {run.origin === 'imported' && <span className="badge">Imported</span>}
              {isPlaceholderConfig(run.config) && <span className="badge gold">Placeholder test team</span>}
              {run.source === 'paste' && !isPlaceholderConfig(run.config) && <span className="badge">Pasted config</span>}
              {kill && <span className="badge">Time to kill</span>}
            </span>
          )}
        </button>
        <span className="run-dps">
          {kill ? (kill.noneKilled ? 'No kill' : `${kill.time.mean.toFixed(1)} s`) : fmt(runDps(run))}
          <span className="muted small run-dps-sub">{kill ? `${fmt(runDps(run))} DPS` : 'DPS'}</span>
        </span>
      </div>
    </li>
  );
}

/** A delete button that asks "are you sure?" in place before deleting. */
export function DeleteButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button className="secondary small-button danger-text" onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="confirm">
      <span className="small">Delete for good?</span>
      <button
        className="danger small-button"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        Yes, delete
      </button>
      <button className="link small" onClick={() => setAsking(false)}>
        No
      </button>
    </span>
  );
}
