import { useEffect, useRef, useState } from 'react';
import sampleConfig from '../reference/sample_gcsim_config.txt?raw';
import type { CheckMessage, CheckRequest } from './engine/engineCheck.worker';

type EngineVersion = { gcsimTag: string; gcsimCommit: string; goVersion: string; builtAt: string };

const engineUrl = `${import.meta.env.BASE_URL}gcsim/`;
const ITERATIONS = 20;

// TEMPORARY: proves the gcsim engine loads and runs on this device (including offline).
// Replaced by the real Run screen later in Phase 1.
export default function EngineCheck() {
  const [version, setVersion] = useState<EngineVersion | null | 'missing'>(null);
  const [status, setStatus] = useState('Not run yet');
  const [running, setRunning] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    fetch(`${engineUrl}version.json`)
      .then((r) => (r.ok ? r.json() : 'missing'))
      .then(setVersion)
      .catch(() => setVersion('missing'));
    return () => workerRef.current?.terminate();
  }, []);

  function run() {
    workerRef.current?.terminate();
    const worker = new Worker(new URL('./engine/engineCheck.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    setRunning(true);
    worker.onmessage = (e: MessageEvent<CheckMessage>) => {
      const m = e.data;
      if (m.type === 'status') setStatus(m.text);
      if (m.type === 'progress') setStatus(`Simulating… ${m.done} / ${m.total}`);
      if (m.type === 'done') {
        setStatus(
          `Works! Sample team: ${Math.round(m.mean).toLocaleString()} DPS mean ` +
            `(sd ${Math.round(m.sd).toLocaleString()}) over ${ITERATIONS} runs in ${m.seconds.toFixed(1)} s. ` +
            `Expected about 35,100.`,
        );
        setRunning(false);
        worker.terminate();
      }
      if (m.type === 'error') {
        setStatus(`Error: ${m.text}`);
        setRunning(false);
        worker.terminate();
      }
    };
    const request: CheckRequest = { engineUrl, config: sampleConfig, iterations: ITERATIONS };
    worker.postMessage(request);
  }

  return (
    <section className="card">
      <h2>Engine check</h2>
      {version === null && <p>Looking for the gcsim engine…</p>}
      {version === 'missing' && (
        <p className="warn">
          The gcsim engine is not in this build. Run <code>npm run engine</code> locally, or use the version
          deployed by GitHub Actions.
        </p>
      )}
      {version && version !== 'missing' && (
        <p className="muted">
          gcsim {version.gcsimTag} ({version.gcsimCommit.slice(0, 7)}), built with {version.goVersion}
        </p>
      )}
      <p>{status}</p>
      <button onClick={run} disabled={running || version === 'missing'}>
        {running ? 'Running…' : `Run ${ITERATIONS} test iterations`}
      </button>
    </section>
  );
}
