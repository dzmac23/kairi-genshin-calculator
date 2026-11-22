import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NumberField, Segmented } from '../components/Fields';
import Picker, { type PickerOption } from '../components/Picker';
import { ENEMY_ELEMENTS, elementName, enemySummary, resistPercent, type Enemy } from '../data/gameData';
import type { BuildResult } from '../config/build';
import type { Check } from '../rotation/checks';
import { turnLabel } from '../rotation/notation';
import { MAX_ENEMIES, parseHp, type SimSettings } from '../config/settings';
import { setIterations } from '../engine/config';
import { workerCount } from '../engine/pool';
import { isPlaceholderConfig, PLACEHOLDER_CONFIG, PLACEHOLDER_LABEL, PLACEHOLDER_NOTE } from '../placeholder';
import { explainGcsimError } from '../engine/explain';
import { killView, type GcsimResult } from '../results/summarize';
import type { SimState } from '../useSimulation';

const ITERATION_CHOICES = [
  { value: 100, label: '100', hint: 'quick look' },
  { value: 500, label: '500', hint: 'good default' },
  { value: 1000, label: '1000', hint: 'for sharing' },
];

export type RunSource = 'team' | 'paste';

type Props = {
  state: SimState;
  /** Where the config comes from: the Setup screen, or a pasted gcsim config. */
  source: RunSource;
  onSourceChange: (source: RunSource) => void;
  /** The config built from the Setup screen and fight settings (undefined while game data loads). */
  built?: BuildResult;
  /** Fight settings (used for the Setup team; a pasted config has its own). */
  settings: SimSettings;
  onSettingsChange: (s: SimSettings) => void;
  /** The enemy library (undefined while game data loads). */
  enemies?: Enemy[];
  /** The "Now simulating" bar. */
  switcher?: ReactNode;
  /** A pasted gcsim config. Kept in App so it survives switching tabs. Empty by default. */
  config: string;
  onConfigChange: (config: string) => void;
  /** 100, 500 or 1000. Kept in App and saved, so the choice survives switching tabs. */
  iterations: number;
  onIterationsChange: (n: number) => void;
  /** Optional name for the next run (shown in the History). */
  label: string;
  onLabelChange: (label: string) => void;
  onRun: (config: string, notes: string[]) => void;
  onCancel: () => void;
  onShowResults: () => void;
  onGoToSetup: () => void;
};

const fmt = (n: number) => Math.round(n).toLocaleString();

export default function RunScreen(props: Props) {
  const { state, source, built, config, onConfigChange, onRun, onCancel, onShowResults } = props;
  const { iterations, onIterationsChange: setIterationChoice, settings } = props;
  const set = (patch: Partial<SimSettings>) => props.onSettingsChange({ ...settings, ...patch });
  const [now, setNow] = useState(performance.now());
  const busy = state.phase === 'starting' || state.phase === 'running';
  const placeholder = isPlaceholderConfig(config);
  const runConfig = source === 'team' ? built?.config : config.trim() ? config : undefined;
  const notes = source === 'team' ? (built?.notes ?? []) : [];

  // Refresh a few times a second while running, for the elapsed-time display.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, [busy]);

  return (
    <>
      {source === 'team' && props.switcher}
      <section className="card">
        <h2>What to run</h2>
        <Segmented
          label="Source"
          value={source}
          values={['team', 'paste'] as const}
          names={{ team: 'Team from Setup', paste: 'Paste a gcsim config' }}
          onChange={props.onSourceChange}
        />
        {source === 'team' ? (
          <TeamSource built={built} onGoToSetup={props.onGoToSetup} />
        ) : (
          <>
            {!config.trim() ? (
              <>
                <p className="muted small">
                  Paste any gcsim config below, or load the placeholder test team to check the engine works.
                </p>
                <button className="secondary" onClick={() => onConfigChange(PLACEHOLDER_CONFIG)} disabled={busy}>
                  Load {PLACEHOLDER_LABEL.toLowerCase()}
                </button>
                <textarea
                  className="config short"
                  value={config}
                  onChange={(e) => onConfigChange(e.target.value)}
                  spellCheck={false}
                  disabled={busy}
                  placeholder="Paste a gcsim config here"
                  aria-label="gcsim config"
                />
              </>
            ) : (
              <>
                {placeholder ? (
                  <div className="placeholder-note">
                    <strong>{PLACEHOLDER_LABEL}</strong>
                    <p className="small">{PLACEHOLDER_NOTE}</p>
                  </div>
                ) : (
                  <p className="muted small">Your own gcsim config ({config.trim().split('\n').length} lines).</p>
                )}
                <details>
                  <summary>Show or edit gcsim config</summary>
                  <textarea
                    className="config"
                    value={config}
                    onChange={(e) => onConfigChange(e.target.value)}
                    spellCheck={false}
                    disabled={busy}
                    aria-label="gcsim config"
                  />
                </details>
                <button className="secondary" onClick={() => onConfigChange('')} disabled={busy}>
                  Clear
                </button>
              </>
            )}
          </>
        )}
      </section>

      {source === 'team' && (
        <section className="card">
          <h2>Fight settings</h2>
          <EnemyChoice settings={settings} enemies={props.enemies} onChange={(enemy) => set({ enemy })} />
          <HpField value={settings.enemyHp} enemies={settings.enemies} onChange={(enemyHp) => set({ enemyHp })} />
          <div className="stat-grid">
            <NumberField
              label={settings.enemyHp ? 'Time limit' : 'Fight length'}
              suffix="s"
              value={settings.duration}
              onChange={(v) => set({ duration: v ?? 90 })}
            />
            <NumberField label="Enemy level" suffix="" value={settings.enemyLevel} onChange={(v) => set({ enemyLevel: v ?? 100 })} />
            {!settings.enemy && (
              <NumberField label="Enemy resistance" suffix="%" value={settings.enemyResist} onChange={(v) => set({ enemyResist: v ?? 10 })} />
            )}
          </div>
          <Segmented
            label="Number of enemies"
            value={settings.enemies}
            values={Array.from({ length: MAX_ENEMIES }, (_, i) => i + 1)}
            onChange={(enemies) => set({ enemies })}
          />
          {settings.enemies > 1 && (
            <p className="muted small">
              Extra enemies stand in a line beside the first, 4.1 m apart, so they don't overlap. Small area attacks may not
              reach all of them.{settings.enemy ? ' All of them are the enemy chosen above.' : ''}
            </p>
          )}
        <label className="toggle">
          <input type="checkbox" checked={settings.randomEnergy} onChange={(e) => set({ randomEnergy: e.target.checked })} />
          <span>
            Random energy particles
            <span className="muted small"> (1 particle every 8 to 12 s, like enemies dropping energy)</span>
          </span>
        </label>
      </section>
      )}

      <section className="card">
        <h2>Simulation settings</h2>
        <p className="label">Iterations</p>
        <div className="choices" role="radiogroup" aria-label="Iterations">
          {ITERATION_CHOICES.map((c) => (
            <button
              key={c.value}
              role="radio"
              aria-checked={iterations === c.value}
              className={iterations === c.value ? 'choice selected' : 'choice'}
              onClick={() => setIterationChoice(c.value)}
              disabled={busy}
            >
              <strong>{c.label}</strong>
              <span>{c.hint}</span>
            </button>
          ))}
        </div>
        <p className="muted small">Runs on {workerCount} workers in parallel on this device.</p>
      </section>

      <section className="card">
        <label className="field">
          <span className="field-label">Name this run (optional)</span>
          <input
            value={props.label}
            onChange={(e) => props.onLabelChange(e.target.value)}
            placeholder="Leave empty to use the character names"
            disabled={busy}
            aria-label="Run name"
          />
        </label>
        {busy ? (
          <button className="danger wide" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button className="wide" onClick={() => runConfig && onRun(setIterations(runConfig, iterations), notes)} disabled={!runConfig}>
            {runConfig ? `Run ${iterations} iterations` : source === 'team' ? 'Fix the items above to run' : 'Add a config to run'}
          </button>
        )}
        <Status state={state} now={now} onShowResults={onShowResults} />
      </section>
    </>
  );
}

/** Optional enemy HP. Empty: a fixed-length fight. Filled in: fights last until the enemies die. */
function HpField({ value, enemies, onChange }: { value: number | null; enemies: number; onChange: (hp: number | null) => void }) {
  const [text, setText] = useState(value ? value.toLocaleString() : '');
  useEffect(() => {
    // Follow outside changes (loading a run's settings), but not while the box reads the same.
    if ((parseHp(text) ?? null) !== value) setText(value ? value.toLocaleString() : '');
  }, [value]);
  const parsed = parseHp(text);
  const bad = parsed !== undefined && !(parsed >= 1);
  return (
    <div className="field hp-field">
      <label className="field-label" htmlFor="enemy-hp">
        Enemy HP (optional{enemies > 1 ? ', each enemy' : ''})
      </label>
      <input
        id="enemy-hp"
        inputMode="decimal"
        value={text}
        placeholder="Empty = fixed fight length"
        onChange={(e) => {
          setText(e.target.value);
          const n = parseHp(e.target.value);
          if (n === undefined) onChange(null);
          else if (n >= 1) onChange(n);
        }}
      />
      {bad ? (
        <p className="warn small">Type a whole number of HP, like 3,500,000 or 3.5m.</p>
      ) : value ? (
        <p className="muted small">
          {value.toLocaleString()} HP{enemies > 1 ? ` × ${enemies} enemies` : ''}. Each fight lasts until {enemies > 1 ? 'every enemy is' : 'the enemy is'} dead,
          and Results show the time to kill. The time limit below stops fights that take too long.
        </p>
      ) : (
        <p className="muted small">The enemy's actual HP (with any Abyss or Stygian multiplier). Leave empty for a fixed-length fight.</p>
      )}
    </div>
  );
}

const DUMMY = 'dummy';

/** The enemy picker: a training dummy (one resistance for every element) or an enemy from gcsim's data. */
function EnemyChoice({ settings, enemies, onChange }: { settings: SimSettings; enemies?: Enemy[]; onChange: (key: string | null) => void }) {
  const options: PickerOption[] = useMemo(
    () => [
      { value: DUMMY, label: 'Training dummy', hint: 'the same resistance to every element, set below' },
      ...(enemies ?? []).map((e) => ({ value: e.key, label: e.name, hint: enemySummary(e) })),
    ],
    [enemies],
  );
  const enemy = settings.enemy ? enemies?.find((e) => e.key === settings.enemy) : undefined;
  return (
    <>
      <Picker label="Enemy" value={settings.enemy ?? DUMMY} options={options} onChange={(v) => onChange(v && v !== DUMMY ? v : null)} />
      {enemy && (
        <div className="enemy-card">
          <ul className="resist-list" aria-label={`${enemy.name} resistances`}>
            {ENEMY_ELEMENTS.map((el) => (
              <li key={el} className={enemy.resist[el] >= 0.5 ? 'high' : enemy.resist[el] < 0.1 ? 'low' : ''}>
                <span className="muted small">{elementName(el)}</span>
                <strong>{resistPercent(enemy.resist[el])}</strong>
              </li>
            ))}
          </ul>
          <p className="small">{enemy.freezeResist >= 1 ? <span className="warn">Can't be frozen.</span> : <span className="muted">Can be frozen.</span>}</p>
          <p className="muted small">
            Uses the enemy's real resistances from gcsim's game data. Boss mechanics such as shields, phases where it can't
            be hit, moving around or changing resistances aren't simulated.
          </p>
        </div>
      )}
      {settings.enemy && enemies && !enemy && <p className="warn small">"{settings.enemy}" isn't in this version's enemy list. Choose another enemy.</p>}
    </>
  );
}

function TeamSource({ built, onGoToSetup }: { built?: BuildResult; onGoToSetup: () => void }) {
  const checkLabel = (c: Check) => {
    const turn = built?.translation.turns.find((t) => t.section === c.section && t.index === c.index);
    return turn ? turnLabel(turn, built!.translation.rotations) : `Turn ${c.index}`;
  };
  if (!built) return <p className="muted">Loading game data…</p>;
  const turns = built.translation.turns.length;
  return (
    <>
      {built.problems.length > 0 ? (
        <>
          <ul className="problems">
            {built.problems.map((p) => (
              <li key={p} className="warn">
                {p}
              </li>
            ))}
          </ul>
          <button className="secondary" onClick={onGoToSetup}>
            Go to Setup
          </button>
        </>
      ) : (
        <p className="small">
          Your team and a {turns}-turn rotation are ready.{' '}
          <button className="link" onClick={onGoToSetup}>
            Change the team or rotation
          </button>
        </p>
      )}
      {built.notes.map((n) => (
        <p key={n} className="warn small">
          {n}
        </p>
      ))}
      {built.checks.length > 0 && (
        <div className="callout warn-callout run-checks">
          <p className="small">
            <strong>Rotation checks</strong>
            {built.checks.some((c) => c.level === 'stop') ? ': gcsim will probably stop on this rotation.' : '.'}
          </p>
          <ul className="small">
            {built.checks.map((c) => (
              <li key={`${c.section}${c.index}${c.message}`} className={`check-${c.level}`}>
                {checkLabel(c)}: {c.message}
              </li>
            ))}
          </ul>
          <button className="link small" onClick={onGoToSetup}>
            Fix it on the Setup screen
          </button>
        </div>
      )}
      {built.config && (
        <details>
          <summary>Show gcsim config</summary>
          <pre className="config-preview">{built.config}</pre>
        </details>
      )}
    </>
  );
}

function Status({ state, now, onShowResults }: { state: SimState; now: number; onShowResults: () => void }) {
  switch (state.phase) {
    case 'idle':
      return null;
    case 'starting':
      return <p className="status">Starting the engine and checking the config…</p>;
    case 'running': {
      const { done, total, partial } = state.progress;
      const seconds = (now - state.startedAt) / 1000;
      return (
        <div className="status">
          <progress value={done} max={total} />
          <p>
            {done} / {total} iterations · {Math.max(0, seconds).toFixed(0)} s
          </p>
          {partial && <p className="muted">So far: {fmt(partial.statistics.dps.mean)} DPS mean</p>}
        </div>
      );
    }
    case 'cancelled':
      return (
        <p className="status muted">
          Cancelled{state.progress ? ` after ${state.progress.done} of ${state.progress.total} iterations` : ''}.
        </p>
      );
    case 'error':
      return (
        <div className="status error">
          <strong>{state.isConfigError ? 'gcsim found a problem with the config:' : 'Something went wrong:'}</strong>
          <p>{state.message}</p>
          {explainGcsimError(state.message) && (
            <p className="small explain">
              <strong>What this means:</strong> {explainGcsimError(state.message)}
            </p>
          )}
        </div>
      );
    case 'done': {
      const { dps, iterations } = state.result.statistics;
      const kill = killView(state.result as GcsimResult);
      return (
        <div className="status">
          {kill?.noneKilled ? (
            <>
              <p className="big warn">Not killed</p>
              <p className="small">
                No fight killed the enemy within the time limit ({fmt(dps.mean)} DPS). Raise the time limit or check the HP.
              </p>
            </>
          ) : kill ? (
            <>
              <p className="big">{kill.time.mean.toFixed(1)} s to kill</p>
              <p className="small">
                {fmt(dps.mean)} DPS · fastest {kill.time.min.toFixed(1)} s, slowest {kill.time.max.toFixed(1)} s
              </p>
              {kill.someSurvived && <p className="warn small">Some fights hit the time limit before the enemy died.</p>}
            </>
          ) : (
            <p className="big">{fmt(dps.mean)} DPS</p>
          )}
          <dl className="stats">
            <dt>Standard deviation</dt>
            <dd>{fmt(dps.sd)}</dd>
            <dt>Lowest</dt>
            <dd>{fmt(dps.min)}</dd>
            <dt>Highest</dt>
            <dd>{fmt(dps.max)}</dd>
            <dt>Iterations</dt>
            <dd>{iterations}</dd>
            <dt>Time taken</dt>
            <dd>{state.seconds.toFixed(1)} s</dd>
          </dl>
          <button className="secondary wide" onClick={onShowResults}>
            See full results
          </button>
          <p className="muted small">Saved to History.</p>
        </div>
      );
    }
  }
}
