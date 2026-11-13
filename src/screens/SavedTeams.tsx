// Saved teams (on the Team screen) and their labelled rotations (on the Rotation screen).

import { useState } from 'react';
import { canShareFiles } from '../history/files';
import { teamCharacterNames, type SavedTeam } from '../teams/model';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A text box with Save/Cancel, used for naming teams and rotations. */
function NameInput({ initial, placeholder, onSave, onCancel, saveLabel = 'Save' }: { initial: string; placeholder: string; onSave: (v: string) => void; onCancel: () => void; saveLabel?: string }) {
  const [value, setValue] = useState(initial);
  const save = () => value.trim() && onSave(value.trim());
  return (
    <div className="rename">
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
      <button className="small-button" onClick={save} disabled={!value.trim()}>
        {saveLabel}
      </button>
      <button className="link small" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

/** "Are you sure?" in place, for actions that delete or replace something. */
function Confirm({ text, yes, onYes, onNo }: { text: string; yes: string; onYes: () => void; onNo: () => void }) {
  return (
    <div className="callout warn-callout">
      <p className="small">{text}</p>
      <div className="button-row">
        <button className="small-button" onClick={onYes}>
          {yes}
        </button>
        <button className="link small" onClick={onNo}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function SavedTeamsPanel(p: {
  savedTeams: SavedTeam[];
  active?: SavedTeam;
  /** The current team differs from the saved one it was loaded from. */
  dirty: boolean;
  /** The current team has at least one character (so it can be saved). */
  canSave: boolean;
  onLoad: (id: string) => void;
  onSaveNew: (name: string) => void;
  onSaveChanges: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onExport: (teams: SavedTeam[], share: boolean) => void;
  onImportFile: (file: File) => void;
  message?: string;
}) {
  const [naming, setNaming] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'load' | 'delete'; id: string } | null>(null);
  const sharing = canShareFiles();
  const unsavedWork = p.active ? p.dirty : p.canSave;

  return (
    <section className="card saved-teams">
      <div className="card-head">
        <h2>Saved teams</h2>
        <label className="link small file-link">
          Import file…
          <input type="file" accept=".json,application/json" hidden onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) p.onImportFile(file);
              e.target.value = ''; // so choosing the same file again still works
            }} />
        </label>
      </div>
      <p className="small">
        {p.active ? (
          <>
            Working on <strong>{p.active.name}</strong>
            {p.dirty ? <span className="warn"> · changed since saved</span> : <span className="muted"> · saved</span>}
          </>
        ) : (
          <span className="muted">The team below isn't saved. Save it to reuse it later and keep labelled rotations with it.</span>
        )}
      </p>
      {naming ? (
        <NameInput
          initial=""
          placeholder="Team name, e.g. Skirk Freeze"
          saveLabel="Save team"
          onSave={(name) => {
            p.onSaveNew(name);
            setNaming(false);
          }}
          onCancel={() => setNaming(false)}
        />
      ) : (
        <div className="button-row">
          {p.active && p.dirty && (
            <button className="small-button" onClick={p.onSaveChanges}>
              Save changes to {p.active.name}
            </button>
          )}
          <button className="secondary small-button" onClick={() => setNaming(true)} disabled={!p.canSave}>
            Save as new team…
          </button>
        </div>
      )}
      {p.message && <p className="small muted">{p.message}</p>}

      {p.savedTeams.length > 0 && (
        <details className="saved-list" open={!p.active}>
          <summary>
            Your saved teams ({p.savedTeams.length})
          </summary>
          <ul className="run-list">
            {p.savedTeams.map((t) => (
              <li key={t.id} className={t.id === p.active?.id ? 'run-row open' : 'run-row'}>
                <div className="saved-row">
                  <div>
                    <div className="run-name">{t.name}</div>
                    <div className="muted small">
                      {teamCharacterNames(t.team).join(', ') || 'empty'} · {plural(t.rotations.length, 'rotation')}
                    </div>
                  </div>
                  {t.id !== p.active?.id && (
                    <button className="small-button" onClick={() => (unsavedWork ? setConfirm({ kind: 'load', id: t.id }) : p.onLoad(t.id))}>
                      Load
                    </button>
                  )}
                </div>
                {renaming === t.id ? (
                  <NameInput
                    initial={t.name}
                    placeholder="Team name"
                    onSave={(name) => {
                      p.onRename(t.id, name);
                      setRenaming(null);
                    }}
                    onCancel={() => setRenaming(null)}
                  />
                ) : (
                  <div className="button-row tight">
                    <button className="link small" onClick={() => setRenaming(t.id)}>
                      Rename
                    </button>
                    <button className="link small" onClick={() => p.onExport([t], false)}>
                      Export
                    </button>
                    {sharing && (
                      <button className="link small" onClick={() => p.onExport([t], true)}>
                        Share
                      </button>
                    )}
                    <button className="link small danger-text" onClick={() => setConfirm({ kind: 'delete', id: t.id })}>
                      Delete
                    </button>
                  </div>
                )}
                {confirm?.id === t.id && (
                  <Confirm
                    text={
                      confirm.kind === 'delete'
                        ? `Delete the saved team "${t.name}" and its rotations? Runs in your History are kept.`
                        : 'Load this team? It replaces the team and rotation you are working on, and your unsaved changes would be lost.'
                    }
                    yes={confirm.kind === 'delete' ? 'Delete' : 'Load'}
                    onYes={() => {
                      if (confirm.kind === 'delete') p.onDelete(t.id);
                      else p.onLoad(t.id);
                      setConfirm(null);
                    }}
                    onNo={() => setConfirm(null)}
                  />
                )}
              </li>
            ))}
          </ul>
          <div className="button-row">
            <button className="secondary small-button" onClick={() => p.onExport(p.savedTeams, false)}>
              Export all teams
            </button>
            {sharing && (
              <button className="secondary small-button" onClick={() => p.onExport(p.savedTeams, true)}>
                Share all teams
              </button>
            )}
          </div>
        </details>
      )}
    </section>
  );
}

export function SavedRotationsBar(p: {
  active?: SavedTeam;
  activeRotationId?: string;
  /** The current rotation differs from the saved one it was loaded from. */
  dirty: boolean;
  /** The current rotation has a Loop (so it can be saved). */
  canSave: boolean;
  onLoad: (rotationId: string) => void;
  onSaveNew: (label: string) => void;
  onSaveChanges: () => void;
  onRename: (rotationId: string, label: string) => void;
  onDelete: (rotationId: string) => void;
  onGoToTeam: () => void;
}) {
  const [naming, setNaming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'load' | 'delete'; id: string } | null>(null);
  if (!p.active) {
    return (
      <section className="card">
        <h2>Saved rotations</h2>
        <p className="small muted">
          Rotations are saved with a saved team.{' '}
          <button className="link small" onClick={p.onGoToTeam}>
            Save your team on the Team screen
          </button>{' '}
          to keep labelled rotations like "Standard" or "Double Q" with it.
        </p>
      </section>
    );
  }
  const current = p.active.rotations.find((r) => r.id === p.activeRotationId);
  const unsaved = current ? p.dirty : p.canSave;
  return (
    <section className="card">
      <h2>Saved rotations for {p.active.name}</h2>
      {p.active.rotations.length > 0 ? (
        <div className="name-chips" role="radiogroup" aria-label="Saved rotations">
          {p.active.rotations.map((r) => (
            <button
              key={r.id}
              role="radio"
              aria-checked={r.id === p.activeRotationId}
              className={r.id === p.activeRotationId ? 'chip selected' : 'chip'}
              onClick={() => r.id !== p.activeRotationId && (unsaved ? setConfirm({ kind: 'load', id: r.id }) : p.onLoad(r.id))}
            >
              {r.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="small muted">No saved rotations for this team yet.</p>
      )}
      <p className="small">
        {current ? (
          <>
            Working on <strong>{current.label}</strong>
            {p.dirty ? <span className="warn"> · changed since saved</span> : <span className="muted"> · saved</span>}
          </>
        ) : (
          <span className="muted">The rotation below isn't saved.</span>
        )}
      </p>
      {naming ? (
        <NameInput
          initial=""
          placeholder="Rotation label, e.g. Double Q"
          saveLabel="Save rotation"
          onSave={(label) => {
            p.onSaveNew(label);
            setNaming(false);
          }}
          onCancel={() => setNaming(false)}
        />
      ) : renaming && current ? (
        <NameInput
          initial={current.label}
          placeholder="Rotation label"
          onSave={(label) => {
            p.onRename(current.id, label);
            setRenaming(false);
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <div className="button-row">
          {current && p.dirty && (
            <button className="small-button" onClick={p.onSaveChanges}>
              Save changes to {current.label}
            </button>
          )}
          <button className="secondary small-button" onClick={() => setNaming(true)} disabled={!p.canSave}>
            Save as new rotation…
          </button>
          {current && (
            <>
              <button className="link small" onClick={() => setRenaming(true)}>
                Rename
              </button>
              <button className="link small danger-text" onClick={() => setConfirm({ kind: 'delete', id: current.id })}>
                Delete
              </button>
            </>
          )}
        </div>
      )}
      {confirm && (
        <Confirm
          text={
            confirm.kind === 'delete'
              ? `Delete the saved rotation "${current?.label}"? The rotation below stays as it is.`
              : 'Load this rotation? Your unsaved changes to the rotation below would be lost.'
          }
          yes={confirm.kind === 'delete' ? 'Delete' : 'Load'}
          onYes={() => {
            if (confirm.kind === 'delete') p.onDelete(confirm.id);
            else p.onLoad(confirm.id);
            setConfirm(null);
          }}
          onNo={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
