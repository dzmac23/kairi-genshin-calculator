import { useEffect, useState } from 'react';
import { setIterations } from '../engine/config';
import { workerCount } from '../engine/pool';
import { isPlaceholderConfig, PLACEHOLDER_CONFIG, PLACEHOLDER_LABEL, PLACEHOLDER_NOTE } from '../placeholder';
import type { SimState } from '../useSimulation';

const ITERATION_CHOICES = [
  { value: 100, label: '100', hint: 'quick look' },
  { value: 500, label: '500', hint: 'good default' },
  { value: 1000, label: '1000', hint: 'for sharing' },
];

type Props = {
  state: SimState;
  /** The gcsim config to run. Kept in App so it survives switching tabs. Empty by default. */
  config: string;
  onConfigChange: (config: string) => void;
  onRun: (config: string) => void;
  onCancel: () => void;
  onShowResults: () => void;
};

const fmt = (n: number) => Math.round(n).toLocaleString();

export default function RunScreen({ state, config, onConfigChange, onRun, onCancel, onShowResults }: Props) {
  const [iterations, setIterationChoice] = useState(500);
  const [now, setNow] = useState(performance.now());
  const busy = state.phase === 'starting' || state.phase === 'running';
  const hasConfig = config.trim().length > 0;
  const placeholder = isPlaceholderConfig(config);

  // Refresh a few times a second while running, for the elapsed-time display.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, [busy]);

  return (
    <>
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
        <h2>Team and rotation</h2>
        {!hasConfig ? (
          <>
            <p className="muted small">
              No team yet. The Team and Rotation screens (coming in the next steps) will fill this in for you. Until
              then you can paste a gcsim config below, or load the placeholder test team to check the engine works.
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
      </section>

      <section className="card">
        {busy ? (
          <button className="danger wide" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button className="wide" onClick={() => onRun(setIterations(config, iterations))} disabled={!hasConfig}>
            {hasConfig ? `Run ${iterations} iterations` : 'Add a team to run'}
          </button>
        )}
        <Status state={state} now={now} onShowResults={onShowResults} />
      </section>
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
        </div>
      );
    case 'done': {
      const { dps, iterations } = state.result.statistics;
      return (
        <div className="status">
          <p className="big">{fmt(dps.mean)} DPS</p>
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
        </div>
      );
    }
  }
}
