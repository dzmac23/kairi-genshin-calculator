// Saving on the Setup screen: the loaded saved team, its rotations (one marked as main), and the
// list of all saved teams for renaming, exporting and deleting. Switching is done in the
// "Now simulating" bar (Switcher.tsx).

import { useState } from 'react';
import { canShareFiles } from '../history/files';
import { mainRotation, rotationsMainFirst, teamCharacterNames, type SavedTeam } from '../teams/model';
import type { LoadedState } from './Switcher';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A text box with Save/Cancel, used for naming teams and rotations. */
export function NameInput({ initial, placeholder, onSave, onCancel, saveLabel = 'Save' }: { initial: string; placeholder: string; onSave: (v: string) => void; onCancel: () => void; saveLabel?: string }) {
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
export function Confirm({ text, yes, onYes, onNo }: { text: string; yes: string; onYes: () => void; onNo: () => void }) {
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

/** Naming a new team and its first (main) rotation. */
function NewTeamInput({ onSave, onCancel }: { onSave: (name: string, rotationLabel: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const save = () => name.trim() && onSave(name.trim(), label.trim() || 'Main');
  return (
    <div className="new-team">
      <label className="field">
        <span className="field-label">Team name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Skirk Freeze" autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
      </label>
      <label className="field">
        <span className="field-label">Name for this rotation (it becomes the main one)</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Main" onKeyDown={(e) => e.key === 'Enter' && save()} />
      </label>
      <div className="button-row">
        <button className="small-button" onClick={save} disabled={!name.trim()}>
          Save team
        </button>
        <button className="link small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

type Props = LoadedState & {
  savedTeams: SavedTeam[];
  onSaveNewTeam: (name: string, rotationLabel: string) => void;
  /** Saves the edits to the loaded team and to the loaded rotation. */
  onSaveChanges: () => void;
  onSaveNewRotation: (label: string) => void;
  onRenameTeam: (id: string, name: string) => void;
  onDeleteTeam: (id: string) => void;
  onRenameRotation: (rotationId: string, label: string) => void;
  onDeleteRotation: (rotationId: string) => void;
  onMakeMain: (rotationId: string) => void;
  onExport: (teams: SavedTeam[], share: boolean) => void;
  onImportFile: (file: File) => void;
  message?: string;
};

export function SavedPanel(p: Props) {
  const [naming, setNaming] = useState<'team' | 'rotation' | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'team' | 'rotation'; id: string } | null>(null);
  const sharing = canShareFiles();
  const t = p.activeTeam;
  const main = t && mainRotation(t);
  // "Save changes" saves what can be saved: a team needs characters and a rotation needs a Loop.
  const canSaveChanges = (p.teamDirty && p.hasTeam) || (p.rotationDirty && p.hasRotation);
  const whyNotNewTeam = !p.hasTeam ? 'Add a character first.' : !p.hasRotation ? 'Write a Loop below first: a team is saved with its main rotation.' : '';

  return (
    <section className="card saved-teams">
      <div className="card-head">
        <h2>{t ? t.name : 'Save this team'}</h2>
        <label className="link small file-link">
          Import file…
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) p.onImportFile(file);
              e.target.value = ''; // so choosing the same file again still works
            }}
          />
        </label>
      </div>
      <p className="small">
        {t ? (
          <>
            {p.teamDirty ? <span className="warn">Team changed since saved</span> : <span className="muted">Team saved</span>}
            {' · '}
            {p.activeRotation ? (
              p.rotationDirty ? (
                <span className="warn">rotation "{p.activeRotation.label}" changed</span>
              ) : (
                <span className="muted">rotation "{p.activeRotation.label}" saved</span>
              )
            ) : p.hasRotation ? (
              <span className="warn">this rotation isn't saved</span>
            ) : (
              <span className="muted">no rotation</span>
            )}
          </>
        ) : (
          <span className="muted">This team isn't saved. A team is saved together with its rotation, which becomes the team's main rotation.</span>
        )}
      </p>

      {naming === 'team' ? (
        <NewTeamInput
          onSave={(name, label) => {
            p.onSaveNewTeam(name, label);
            setNaming(null);
          }}
          onCancel={() => setNaming(null)}
        />
      ) : naming === 'rotation' ? (
        <NameInput
          initial=""
          placeholder="Rotation name, e.g. Double Q"
          saveLabel="Save rotation"
          onSave={(label) => {
            p.onSaveNewRotation(label);
            setNaming(null);
          }}
          onCancel={() => setNaming(null)}
        />
      ) : (
        <>
          <div className="button-row">
            {t && canSaveChanges && (
              <button className="small-button" onClick={p.onSaveChanges}>
                Save changes
              </button>
            )}
            {t && (
              <button className="secondary small-button" onClick={() => setNaming('rotation')} disabled={!p.hasRotation}>
                Save rotation as new…
              </button>
            )}
            <button className="secondary small-button" onClick={() => setNaming('team')} disabled={!!whyNotNewTeam}>
              Save as new team…
            </button>
          </div>
          {whyNotNewTeam && !t && <p className="small muted">{whyNotNewTeam}</p>}
        </>
      )}
      {p.message && <p className="small muted">{p.message}</p>}

      {t && t.rotations.length > 0 && (
        <>
          <h3>Rotations</h3>
          <ul className="run-list">
            {rotationsMainFirst(t).map((r) => {
              const isMain = r.id === main?.id;
              return (
                <li key={r.id} className={r.id === p.activeRotation?.id ? 'run-row open' : 'run-row'}>
                  <div className="saved-row">
                    <div>
                      <div className="run-name">
                        {r.label}
                        {isMain && <span className="main-star"> ★ main</span>}
                        {r.id === p.activeRotation?.id && <span className="muted small"> · loaded</span>}
                      </div>
                      <div className="muted small rotation-peek">{r.rotation.loop.split('\n')[0]}</div>
                    </div>
                    {!isMain && (
                      <button className="secondary small-button" onClick={() => p.onMakeMain(r.id)}>
                        Make main
                      </button>
                    )}
                  </div>
                  {renaming === r.id ? (
                    <NameInput
                      initial={r.label}
                      placeholder="Rotation name"
                      onSave={(label) => {
                        p.onRenameRotation(r.id, label);
                        setRenaming(null);
                      }}
                      onCancel={() => setRenaming(null)}
                    />
                  ) : (
                    <div className="button-row tight">
                      <button className="link small" onClick={() => setRenaming(r.id)}>
                        Rename
                      </button>
                      {isMain ? (
                        <span className="muted small">The main rotation can't be deleted. Make another one main first.</span>
                      ) : (
                        <button className="link small danger-text" onClick={() => setConfirm({ kind: 'rotation', id: r.id })}>
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                  {confirm?.kind === 'rotation' && confirm.id === r.id && (
                    <Confirm
                      text={`Delete the saved rotation "${r.label}"? ${r.id === p.activeRotation?.id ? 'The rotation below stays as it is, but unsaved.' : ''}`}
                      yes="Delete"
                      onYes={() => {
                        p.onDeleteRotation(r.id);
                        setConfirm(null);
                      }}
                      onNo={() => setConfirm(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {t && t.rotations.length === 0 && (
        <p className="small warn">This team has no saved rotation yet. Write one below and use "Save rotation as new": it becomes the main rotation.</p>
      )}

      {p.savedTeams.length > 0 && (
        <details className="saved-list">
          <summary>All saved teams ({p.savedTeams.length}): rename, export, delete</summary>
          <p className="small muted">To load a team, use the "Now simulating" bar above.</p>
          <ul className="run-list">
            {p.savedTeams.map((s) => (
              <li key={s.id} className={s.id === t?.id ? 'run-row open' : 'run-row'}>
                <div className="run-name">
                  {s.name}
                  {s.id === t?.id && <span className="muted small"> · loaded</span>}
                </div>
                <div className="muted small">
                  {teamCharacterNames(s.team).join(', ') || 'empty'} · {plural(s.rotations.length, 'rotation')}
                </div>
                {renaming === s.id ? (
                  <NameInput
                    initial={s.name}
                    placeholder="Team name"
                    onSave={(name) => {
                      p.onRenameTeam(s.id, name);
                      setRenaming(null);
                    }}
                    onCancel={() => setRenaming(null)}
                  />
                ) : (
                  <div className="button-row tight">
                    <button className="link small" onClick={() => setRenaming(s.id)}>
                      Rename
                    </button>
                    <button className="link small" onClick={() => p.onExport([s], false)}>
                      Export
                    </button>
                    {sharing && (
                      <button className="link small" onClick={() => p.onExport([s], true)}>
                        Share
                      </button>
                    )}
                    <button className="link small danger-text" onClick={() => setConfirm({ kind: 'team', id: s.id })}>
                      Delete
                    </button>
                  </div>
                )}
                {confirm?.kind === 'team' && confirm.id === s.id && (
                  <Confirm
                    text={`Delete the saved team "${s.name}" and its rotations? Runs in your History are kept${s.id === t?.id ? ', and the team below stays as it is, but unsaved' : ''}.`}
                    yes="Delete"
                    onYes={() => {
                      p.onDeleteTeam(s.id);
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
