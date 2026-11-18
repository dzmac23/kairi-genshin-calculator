// The "Now simulating" bar on the Setup and Run screens: shows the loaded saved team and rotation,
// and switches to another in two steps (choose a team, then one of its saved rotations).

import { useState } from 'react';
import { mainRotation, rotationsMainFirst, teamCharacterNames, unsavedWork, type LoadedState, type SavedTeam } from '../teams/model';

export type { LoadedState };

type Props = LoadedState & {
  savedTeams: SavedTeam[];
  /** Loads a saved team and rotation. `saveFirst` saves the changes to the loaded ones first. */
  onSwitch: (teamId: string, rotationId: string | undefined, saveFirst: boolean) => void;
  /** Shown when there are no saved teams yet (on the Run screen). */
  onGoToSetup?: () => void;
};

type Step = { kind: 'team' } | { kind: 'rotation'; teamId: string } | { kind: 'confirm'; teamId: string; rotationId?: string };

export default function Switcher(p: Props) {
  const [step, setStep] = useState<Step | null>(null);
  const close = () => setStep(null);
  const loaded = p.activeTeam;
  const changed = p.teamDirty || p.rotationDirty;

  const choose = (teamId: string, rotationId?: string) => {
    const lose = unsavedWork(p, teamId === loaded?.id);
    if (lose) setStep({ kind: 'confirm', teamId, rotationId });
    else {
      p.onSwitch(teamId, rotationId, false);
      close();
    }
  };
  const pickTeam = (t: SavedTeam) => {
    // A team without rotations (saved before main rotations) loads as it is.
    if (t.rotations.length === 0) choose(t.id);
    else setStep({ kind: 'rotation', teamId: t.id });
  };

  return (
    <section className="card switcher">
      <button className="switcher-bar" aria-expanded={!!step} onClick={() => setStep(step ? null : { kind: 'team' })}>
        <span className="switcher-text">
          <span className="muted small">Now simulating</span>
          {loaded ? (
            <span className="switcher-name">
              {loaded.name} · {p.activeRotation ? p.activeRotation.label : <em>rotation not saved</em>}
              {p.activeRotation && p.activeRotation.id === mainRotation(loaded)?.id && <span className="main-star" title="Main rotation"> ★</span>}
              {changed && <span className="warn small"> · changed</span>}
            </span>
          ) : (
            <span className="switcher-name">
              {p.hasTeam ? 'A team that isn’t saved' : 'No team yet'}
            </span>
          )}
        </span>
        <span className="switcher-action">{step ? 'Close' : 'Switch'}</span>
      </button>

      {step?.kind === 'team' && (
        <div className="switcher-panel">
          <p className="small">
            <strong>1. Choose a team</strong>
          </p>
          {p.savedTeams.length === 0 ? (
            <p className="small muted">
              No saved teams yet.{' '}
              {p.onGoToSetup ? (
                <button className="link small" onClick={p.onGoToSetup}>
                  Save one on the Setup screen
                </button>
              ) : (
                'Save the team below with its rotation, and it will appear here.'
              )}
            </p>
          ) : (
            <ul className="pick-list">
              {p.savedTeams.map((t) => (
                <li key={t.id}>
                  <button className={t.id === loaded?.id ? 'pick current' : 'pick'} onClick={() => pickTeam(t)}>
                    <span className="run-name">{t.name}</span>
                    <span className="muted small">
                      {teamCharacterNames(t.team).join(', ') || 'empty'} · {t.rotations.length} rotation{t.rotations.length === 1 ? '' : 's'}
                      {t.id === loaded?.id ? ' · loaded now' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {step?.kind === 'rotation' && <RotationStep team={p.savedTeams.find((t) => t.id === step.teamId)} activeRotationId={step.teamId === loaded?.id ? p.activeRotation?.id : undefined} onBack={() => setStep({ kind: 'team' })} onPick={(rid) => choose(step.teamId, rid)} />}

      {step?.kind === 'confirm' && (
        <div className="switcher-panel">
          <SwitchConfirm
            lose={unsavedWork(p, step.teamId === loaded?.id)}
            sameTeam={step.teamId === loaded?.id}
            onSwitch={(save) => {
              p.onSwitch(step.teamId, step.rotationId, save);
              close();
            }}
            onCancel={close}
          />
        </div>
      )}
    </section>
  );
}

function RotationStep({ team, activeRotationId, onBack, onPick }: { team?: SavedTeam; activeRotationId?: string; onBack: () => void; onPick: (rotationId: string) => void }) {
  if (!team) return null;
  const main = mainRotation(team);
  return (
    <div className="switcher-panel">
      <p className="small">
        <strong>2. Choose a rotation</strong> for {team.name}
      </p>
      <ul className="pick-list">
        {rotationsMainFirst(team).map((r) => (
          <li key={r.id}>
            <button className={r.id === activeRotationId ? 'pick current' : 'pick'} onClick={() => onPick(r.id)}>
              <span className="run-name">
                {r.label}
                {r.id === main?.id && <span className="main-star"> ★ main</span>}
              </span>
              <span className="muted small rotation-peek">{r.rotation.loop.split('\n')[0]}</span>
            </button>
          </li>
        ))}
      </ul>
      <button className="link small" onClick={onBack}>
        ← Back to teams
      </button>
    </div>
  );
}

/**
 * The warning shown before a switch would replace unsaved work: "Save changes and switch" (only
 * for edits to a saved team or rotation), "Switch without saving" and "Cancel".
 */
export function SwitchConfirm({ lose, sameTeam, onSwitch, onCancel }: { lose?: { savable: boolean; text: string }; sameTeam: boolean; onSwitch: (save: boolean) => void; onCancel: () => void }) {
  return (
    <div className="callout warn-callout switch-confirm">
      <p className="small">
        {lose?.text} Switching replaces {sameTeam ? 'the rotation' : 'the team and rotation'} on the Setup screen.
      </p>
      <div className="button-row">
        {lose?.savable && (
          <button className="small-button" onClick={() => onSwitch(true)}>
            Save changes and switch
          </button>
        )}
        <button className="secondary small-button" onClick={() => onSwitch(false)}>
          Switch without saving
        </button>
        <button className="link small" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {lose && !lose.savable && <p className="small muted">To keep it, cancel and save it first.</p>}
    </div>
  );
}
