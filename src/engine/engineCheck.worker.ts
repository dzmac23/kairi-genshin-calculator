/// <reference lib="webworker" />
// TEMPORARY diagnostic worker for the Phase 1 setup step.
// It loads the gcsim engine, validates a config and runs a few iterations, so we can
// confirm on a real phone that the engine downloads, runs, and works offline.
// The real simulation workers (several in parallel, cancellable) replace this later.

export type CheckRequest = { engineUrl: string; config: string; iterations: number };
export type CheckMessage =
  | { type: 'status'; text: string }
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; mean: number; sd: number; seconds: number }
  | { type: 'error'; text: string };

const post = (m: CheckMessage) => self.postMessage(m);

// gcsim reports errors as a JSON string like {"error":"..."}.
function check<T>(value: T, step: string): T {
  if (typeof value === 'string' && value.startsWith('{"error"')) {
    throw new Error(`${step}: ${JSON.parse(value).error}`);
  }
  return value;
}

async function loadEngine(engineUrl: string) {
  // wasm_exec.js is Go's helper script; it defines the global Go class.
  await import(/* @vite-ignore */ `${engineUrl}wasm_exec.js`);
  const go = new Go();
  const response = fetch(`${engineUrl}main.wasm`);
  let result: WebAssembly.WebAssemblyInstantiatedSource;
  try {
    result = await WebAssembly.instantiateStreaming(response, go.importObject);
  } catch {
    // Some servers send the wrong file type for .wasm; fall back to a plain download.
    const bytes = await (await fetch(`${engineUrl}main.wasm`)).arrayBuffer();
    result = await WebAssembly.instantiate(bytes, go.importObject);
  }
  void go.run(result.instance); // keeps running so the gcsim functions stay available
}

self.onmessage = async (event: MessageEvent<CheckRequest>) => {
  const { engineUrl, config, iterations } = event.data;
  try {
    post({ type: 'status', text: 'Loading engine…' });
    await loadEngine(engineUrl);

    post({ type: 'status', text: 'Validating config…' });
    check(validateConfig(config), 'validateConfig');
    check(initializeAggregator(config), 'initializeAggregator');
    check(initializeWorker(config), 'initializeWorker');

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      const summary = check(simulate(), 'simulate') as Uint8Array;
      check(aggregate(summary), 'aggregate');
      post({ type: 'progress', done: i + 1, total: iterations });
    }
    const flushed = check(flush(), 'flush') as { result: string };
    const dps = JSON.parse(flushed.result).statistics.dps;
    post({ type: 'done', mean: dps.mean, sd: dps.sd, seconds: (performance.now() - start) / 1000 });
  } catch (err) {
    post({ type: 'error', text: err instanceof Error ? err.message : String(err) });
  }
};
