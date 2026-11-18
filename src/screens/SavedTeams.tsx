// Saving and switching inside the Setup screen's sections:
//  - TeamSaveBar (top of the Team section): choose a saved team, save the team, manage saved teams.
//  - RotationSaveBar (top of the Rotation section): choose one of the loaded team's rotations,
//    save the rotation, make a rotation main.
// The "Now simulating" bar (Switcher.tsx) does quick swaps with the same switching and warnings.

import { useState } from 'react';
import { canShareFiles } from '../history/files';
import { mainRotation, rotationsMainFirst, teamCharacterNames, unsavedWork, type LoadedState, type SavedTeam } from '../teams/model';
import { SwitchConfirm } from './Switcher';

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
        <span className="field-label">Name for the rotation below (it becomes the main one)</span>
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

type TeamProps = LoadedState & {
  savedTeams: SavedTeam[];
  /** Loads a saved team with its main rotation. `save` saves the loaded team and rotation first. */
  onSwitchTeam: (teamId: string, save: boolean) => void;
  onSaveChanges: () => void;
  onSaveNew: (name: string, rotationLabel: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onExport: (teams: SavedTeam[], share: boolean) => void;
  onImportFile: (file: File) => void;
  message?: string;
};

export function TeamSaveBar(p: TeamProps) {
  const [naming, setNaming] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const sharing = canShareFiles();
  const t = p.activeTeam;
  const whyNotNew = !p.hasTeam ? 'Add a character first.' : !p.hasRotation ? 'Write a Loop in the Rotation section first: a team is saved with its main rotation.' : '';
  const pick = (id: string) => {
    if (!id || id === t?.id) return;
    if (unsavedWork(p, false)) setPending(id);
    else p.onSwitchTeam(id, false);
  };

  return (
    <div className="save-bar">
      {p.savedTeams.length > 0 && (
        <label className="field">
          <span className="field-label">Saved team</span>
          <select value={t?.id ?? ''} onChange={(e) => pick(e.target.value)} aria-label="Saved team">
            {!t && <option value="">{p.hasTeam ? 'This team (not saved)' : 'Choose a saved team…'}</option>}
            {p.savedTeams.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {pending && (
        <SwitchConfirm
          lose={unsavedWork(p, false)}
          sameTeam={false}
          onSwitch={(save) => {
            p.onSwitchTeam(pending, save);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
      <p className="small">
        {t ? (
          p.teamDirty ? <span className="warn">Changed since saved</span> : <span className="muted">Saved</span>
        ) : (
          <span className="muted">This team isn't saved. It's saved together with the rotation below, which becomes its main rotation.</span>
        )}
      </p>
      {naming ? (
        <NewTeamInput
          onSave={(name, label) => {
            p.onSaveNew(name, label);
            setNaming(false);
          }}
          onCancel={() => setNaming(false)}
        />
      ) : (
        <div className="button-row">
          {t && p.teamDirty && p.hasTeam && (
            <button className="small-button" onClick={p.onSaveChanges}>
              Save changes to team
            </button>
          )}
          <button className="secondary small-button" onClick={() => setNaming(true)} disabled={!!whyNotNew}>
            Save as new team…
          </button>
        </div>
      )}
      {whyNotNew && !t && !naming && <p className="small muted">{whyNotNew}</p>}
      {p.message && <p className="small muted">{p.message}</p>}

      <details className="saved-list">
        <summary>All saved teams ({p.savedTeams.length}): rename, export, delete, import</summary>
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
                    p.onRename(s.id, name);
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
                  <button className="link small danger-text" onClick={() => setConfirmDelete(s.id)}>
                    Delete
                  </button>
                </div>
              )}
              {confirmDelete === s.id && (
                <Confirm
                  text={`Delete the saved team "${s.name}" and its rotations? Runs in your History are kept${s.id === t?.id ? ', and the team on screen stays, but unsaved' : ''}.`}
                  yes="Delete"
                  onYes={() => {
                    p.onDelete(s.id);
                    setConfirmDelete(null);
                  }}
                  onNo={() => setConfirmDelete(null)}
                />
              )}
            </li>
          ))}
        </ul>
        <div className="button-row">
          {p.savedTeams.length > 0 && (
            <>
              <button className="secondary small-button" onClick={() => p.onExport(p.savedTeams, false)}>
                Export all teams
              </button>
              {sharing && (
                <button className="secondary small-button" onClick={() => p.onExport(p.savedTeams, true)}>
                  Share all teams
                </button>
              )}
            </>
          )}
          <label className="secondary small-button file-button">
            Import team file…
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
      </details>
    </div>
  );
}

type RotationProps = LoadedState & {
  /** Loads one of the loaded team's rotations. `save` saves the loaded rotation first. */
  onSwitchRotation: (rotationId: string, save: boolean) => void;
  onSaveChanges: () => void;
  onSaveNew: (label: string) => void;
  onRename: (rotationId: string, label: string) => void;
  onDelete: (rotationId: string) => void;
  onMakeMain: (rotationId: string) => void;
  message?: string;
};

export function RotationSaveBar(p: RotationProps) {
  const [naming, setNaming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const t = p.activeTeam;
  if (!t) {
    return (
      <p className="small muted save-bar">
        Rotations are saved with a team. Save the team above, and the rotation below is saved with it as its main rotation.
      </p>
    );
  }
  const main = mainRotation(t);
  const current = p.activeRotation;
  const pick = (id: string) => {
    if (id === current?.id) return;
    if (unsavedWork(p, true)) setPending(id);
    else p.onSwitchRotation(id, false);
  };

  return (
    <div className="save-bar">
      {t.rotations.length > 0 ? (
        <>
          <span className="field-label">Saved rotations for {t.name}</span>
          <div className="name-chips" role="radiogroup" aria-label="Saved rotations">
            {rotationsMainFirst(t).map((r) => (
              <button key={r.id} role="radio" aria-checked={r.id === current?.id} className={r.id === current?.id ? 'chip selected' : 'chip'} onClick={() => pick(r.id)}>
                {r.label}
                {r.id === main?.id && <span className="main-star"> ★</span>}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="small warn">{t.name} has no saved rotation yet. Write one below and use "Save rotation as new": it becomes the main rotation.</p>
      )}
      {pending && (
        <SwitchConfirm
          lose={unsavedWork(p, true)}
          sameTeam
          onSwitch={(save) => {
            p.onSwitchRotation(pending, save);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
      <p className="small">
        {current ? (
          <>
            <strong>{current.label}</strong>
            {current.id === main?.id && <span className="main-star"> ★ main</span>}
            {p.rotationDirty ? <span className="warn"> · changed since saved</span> : <span className="muted"> · saved</span>}
          </>
        ) : (
          <span className="muted">The rotation below isn't saved.</span>
        )}
      </p>
      {naming ? (
        <NameInput
          initial=""
          placeholder="Rotation name, e.g. Double Q"
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
          placeholder="Rotation name"
          onSave={(label) => {
            p.onRename(current.id, label);
            setRenaming(false);
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <div className="button-row">
          {current && p.rotationDirty && p.hasRotation && (
            <button className="small-button" onClick={p.onSaveChanges}>
              Save changes to rotation
            </button>
          )}
          <button className="secondary small-button" onClick={() => setNaming(true)} disabled={!p.hasRotation}>
            Save rotation as new…
          </button>
          {current && current.id !== main?.id && (
            <button className="secondary small-button" onClick={() => p.onMakeMain(current.id)}>
              Make main ★
            </button>
          )}
          {current && (
            <button className="link small" onClick={() => setRenaming(true)}>
              Rename
            </button>
          )}
          {current && current.id !== main?.id && (
            <button className="link small danger-text" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
        </div>
      )}
      {current && current.id === main?.id && t.rotations.length > 1 && !naming && !renaming && (
        <p className="small muted">The main rotation can't be deleted. Make another one main first.</p>
      )}
      {confirmDelete && current && (
        <Confirm
          text={`Delete the saved rotation "${current.label}"? The rotation below stays, but unsaved.`}
          yes="Delete"
          onYes={() => {
            p.onDelete(current.id);
            setConfirmDelete(false);
          }}
          onNo={() => setConfirmDelete(false)}
        />
      )}
      {p.message && <p className="small muted">{p.message}</p>}
    </div>
  );
}
