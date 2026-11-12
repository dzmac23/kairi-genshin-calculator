import { useEffect, useState } from 'react';
import sampleConfig from '../../reference/sample_gcsim_config.txt?raw';
import { setIterations } from '../engine/config';
import { workerCount } from '../engine/pool';
import type { SimState } from '../useSimulation';

const ITERATION_CHOICES = [
  { value: 100, label: '100', hint: 'quick look' },
  { value: 500, label: '500', hint: 'good default' },
  { value: 1000, label: '1000', hint: 'for sharing' },
];

type Props = {
  state: SimState;
  onRun: (config: string) => void;
  onCancel: () => void;
};

const fmt = (n: number) => Math.round(n).toLocaleString();

export default function RunScreen({ state, onRun, onCancel }: Props) {
  const [iterations, setIterationChoice] = useState(500);
  const [config, setConfig] = useState(sampleConfig.trim());
  const [now, setNow] = useState(performance.now());
  const busy = state.phase === 'starting' || state.phase === 'running';

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
        {busy ? (
          <button className="danger wide" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button className="wide" onClick={() => onRun(setIterations(config, iterations))}>
            Run {iterations} iterations
          </button>
        )}
        <Status state={state} now={now} />
      </section>
      <section className="card">
        <h2>Team and rotation</h2>
        <p className="muted small">
          For now this is the sample team from your workbook, written in gcsim's own language. The Team and
          Rotation screens will fill this in for you later. You can also paste any gcsim config here.
        </p>
        <details>
          <summary>Show gcsim config</summary>
          <textarea
            className="config"
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            spellCheck={false}
            disabled={busy}
            aria-label="gcsim config"
          />
          <button className="secondary" onClick={() => setConfig(sampleConfig.trim())} disabled={busy}>
            Reset to sample team
          </button>
        </details>
      </section>

    </>
  );
}

function Status({ state, now }: { state: SimState; now: number }) {
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
          <p className="muted small">The full breakdown arrives with the Results screen in the next step.</p>
        </div>
      );
    }
  }
}
