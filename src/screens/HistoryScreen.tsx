import { useMemo, useRef, useState } from 'react';
import { canShareFiles, deliverFile } from '../history/files';
import { runCharacters, runDps, runName, type RunRecord } from '../history/model';
import { isPlaceholderConfig } from '../placeholder';
import { makeFile } from '../transfer';

type Props = {
  runs: RunRecord[];
  loaded: boolean;
  onOpen: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (ids: string[]) => void;
  /** Compares two selected runs (older as Scenario A). */
  onCompare: (ids: string[]) => void;
  /** Opens the shared Import screen for a chosen file (runs, teams or a full backup). */
  onImportFile: (file: File) => void;
  /** Puts a run's team, rotation and fight settings back on the Team and Rotation screens. */
  onLoad: (run: RunRecord) => void;
};

const fmt = (n: number) => Math.round(n).toLocaleString();
const when = (iso: string) =>
  new Date(iso).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function HistoryScreen(props: Props) {
  const { runs, loaded } = props;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
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

  const chosenRuns = runs.filter((r) => selected.has(r.id));

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setMessage('');
    props.onImportFile(file);
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <>
      <section className="card">
        <h2>History</h2>
        <p className="muted small">
          Every successful run is saved here, on this device only. Export runs to back them up, move them to another
          device, or share them; import a file (runs, teams or a full backup) to add them here. The full backup is on
          the Home screen.
        </p>
        <div className="button-row">
          <button className="secondary" onClick={() => fileInput.current?.click()}>
            Import file…
          </button>
          <button className="secondary" onClick={() => exportRuns(runs, false)} disabled={runs.length === 0}>
            Export all ({runs.length})
          </button>
          {sharing && (
            <button className="secondary" onClick={() => exportRuns(runs, true)} disabled={runs.length === 0}>
              Share all
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
          aria-label="Import a history file"
        />
        {message && <p className="small muted">{message}</p>}
      </section>

      <section className="card">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or character"
          aria-label="Search runs"
        />
        {selected.size > 0 && (
          <div className="selection-bar">
            <span>{selected.size} selected</span>
            {selected.size === 2 && (
              <button className="small-button" onClick={() => props.onCompare([...selected])}>
                Compare
              </button>
            )}
            <button className="secondary small-button" onClick={() => exportRuns(chosenRuns, false)}>
              Export
            </button>
            {sharing && (
              <button className="secondary small-button" onClick={() => exportRuns(chosenRuns, true)}>
                Share
              </button>
            )}
            <DeleteButton
              label={`Delete ${selected.size}`}
              onConfirm={() => {
                props.onDelete([...selected]);
                setSelected(new Set());
              }}
            />
            <button className="link small" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        )}
        {!loaded ? (
          <p className="muted">Loading history…</p>
        ) : runs.length === 0 ? (
          <p className="muted">No runs yet. Every successful run will appear here.</p>
        ) : shown.length === 0 ? (
          <p className="muted">No runs match “{query}”.</p>
        ) : (
          <ul className="run-list">
            {shown.map((r) => (
              <RunRow
                key={r.id}
                run={r}
                selected={selected.has(r.id)}
                expanded={open === r.id}
                onToggleSelect={() => toggle(r.id)}
                onToggleOpen={() => setOpen(open === r.id ? null : r.id)}
                onOpen={() => props.onOpen(r.id)}
                onRename={(label) => props.onRename(r.id, label)}
                onDelete={() => props.onDelete([r.id])}
                onLoad={() => props.onLoad(r)}
                onExport={(share) => exportRuns([r], share)}
                sharing={sharing}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function RunRow(p: {
  run: RunRecord;
  selected: boolean;
  expanded: boolean;
  onToggleSelect: () => void;
  onToggleOpen: () => void;
  onOpen: () => void;
  onRename: (label: string) => void;
  onDelete: () => void;
  onLoad: () => void;
  onExport: (share: boolean) => void;
  sharing: boolean;
}) {
  const { run } = p;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(run.label ?? '');
  const [confirmLoad, setConfirmLoad] = useState(false);
  const stats = run.result.statistics as { iterations?: number; duration?: { mean: number } };
  return (
    <li className={p.expanded ? 'run-row open' : 'run-row'}>
      <div className="run-main">
        <input type="checkbox" checked={p.selected} onChange={p.onToggleSelect} aria-label={`Select ${runName(run)}`} />
        <button className="run-summary" onClick={p.onToggleOpen} aria-expanded={p.expanded}>
          <span className="run-name">{runName(run)}</span>
          <span className="run-meta muted small">
            {when(run.createdAt)} · {stats.iterations ?? '?'} fights · {stats.duration?.mean ?? '?'} s
            {run.gcsimVersion ? ` · gcsim ${run.gcsimVersion}` : ''}
          </span>
          <span className="run-badges">
            {run.origin === 'imported' && <span className="badge">Imported</span>}
            {isPlaceholderConfig(run.config) && <span className="badge gold">Placeholder test team</span>}
            {run.source === 'paste' && !isPlaceholderConfig(run.config) && <span className="badge">Pasted config</span>}
          </span>
        </button>
        <span className="run-dps">{fmt(runDps(run))}</span>
      </div>
      {p.expanded && (
        <div className="run-actions">
          {run.label?.trim() && <p className="small muted">Characters: {runCharacters(run).join(', ')}</p>}
          {renaming ? (
            <div className="rename">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Name this run (empty = character names)"
                aria-label="Run name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    p.onRename(draft);
                    setRenaming(false);
                  }
                }}
              />
              <button
                className="small-button"
                onClick={() => {
                  p.onRename(draft);
                  setRenaming(false);
                }}
              >
                Save
              </button>
              <button className="link small" onClick={() => setRenaming(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="button-row">
              <button className="small-button" onClick={p.onOpen}>
                Open in Results
              </button>
              <button className="secondary small-button" onClick={() => setRenaming(true)}>
                Rename
              </button>
              {run.team && (
                <button className="secondary small-button" onClick={() => setConfirmLoad(true)}>
                  Load team & rotation
                </button>
              )}
              <button className="secondary small-button" onClick={() => p.onExport(false)}>
                Export
              </button>
              {p.sharing && (
                <button className="secondary small-button" onClick={() => p.onExport(true)}>
                  Share
                </button>
              )}
              <DeleteButton label="Delete" onConfirm={p.onDelete} />
            </div>
          )}
          {confirmLoad && (
            <div className="callout warn-callout">
              <p className="small">This replaces your current team, rotation and fight settings with this run's.</p>
              <div className="button-row">
                <button
                  className="small-button"
                  onClick={() => {
                    setConfirmLoad(false);
                    p.onLoad();
                  }}
                >
                  Replace
                </button>
                <button className="link small" onClick={() => setConfirmLoad(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** A delete button that asks "are you sure?" in place before deleting. */
function DeleteButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
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
