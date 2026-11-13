/// <reference lib="webworker" />
// One copy of the gcsim engine, running off the main thread so the screen stays responsive.
// The pool (pool.ts) uses several of these as "sim workers", which run iterations, and one as
// the "aggregator", which adds the iterations up into the final statistics. This follows how
// gcsim's own web UI is built (ui/packages/executors in genshinsim/gcsim).

import type { WorkerReply, WorkerRequest } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let go: Go | undefined;

class EngineError extends Error {}

// gcsim reports errors as a JSON string like {"error":"..."}.
function gcsimError(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('{"error"')) return undefined;
  try {
    return JSON.parse(value).error;
  } catch {
    return value;
  }
}

function throwIfError(value: unknown) {
  const error = gcsimError(value);
  if (error !== undefined) throw new EngineError(error);
}

async function load(module: WebAssembly.Module) {
  // wasm_exec.js is Go's helper script; it defines the global Go class. It is served next to
  // main.wasm, so its address is worked out relative to this app's base URL.
  await import(/* @vite-ignore */ `${import.meta.env.BASE_URL}gcsim/wasm_exec.js`);
  go = new Go();
  const instance = await WebAssembly.instantiate(module, go.importObject);
  void go.run(instance); // keeps running so the gcsim functions stay available
}

async function handle(req: WorkerRequest): Promise<Omit<Extract<WorkerReply, { ok: true }>, 'id' | 'ok'>> {
  switch (req.type) {
    case 'load':
      await load(req.module);
      return {};
    case 'validate':
      throwIfError(validateConfig(req.config));
      return {};
    case 'initSim':
      throwIfError(initializeWorker(req.config));
      return {};
    case 'simulate': {
      const summary = simulate();
      throwIfError(summary);
      return { summary: summary as Uint8Array };
    }
    case 'initAggregator': {
      const result = initializeAggregator(req.config);
      throwIfError(result);
      return { result }; // gcsim's reading of the config, including the iteration count
    }
    case 'add':
      throwIfError(aggregate(req.summary));
      return {};
    case 'markers': {
      const out = sample(req.config, req.seed);
      throwIfError(out);
      const logs: { frame: number; msg: string }[] = JSON.parse(out).logs ?? [];
      return { markers: logs.filter((l) => /^kc [ol]\d+$/.test(l.msg)).map((l) => ({ frame: l.frame, msg: l.msg })) };
    }
    case 'flush': {
      const flushed = flush();
      throwIfError(flushed);
      return { result: (flushed as { result: string }).result };
    }
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  let reply: WorkerReply;
  try {
    const data = await handle(req);
    if (go?.exited) throw new Error('the engine stopped unexpectedly (possibly out of memory)');
    reply = { id: req.id, ok: true, ...data };
  } catch (err) {
    // An EngineError is gcsim saying something about the config: the worker is still fine.
    // Anything else means this copy of the engine is broken and must be replaced.
    const fatal = !(err instanceof EngineError) || !!go?.exited;
    reply = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err), fatal };
  }
  // Hand the summary's memory over instead of copying it.
  const transfer = reply.ok && reply.summary ? [reply.summary.buffer as ArrayBuffer] : [];
  self.postMessage(reply, transfer);
};
