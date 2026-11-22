// Messages between the page and the engine workers.
//
// Every request carries an id and every reply echoes it, so the page can match replies to
// requests (see EngineWorker in pool.ts). A worker handles one message at a time, in order.

export type WorkerRequest =
  /** Start the Go engine from the already-compiled module. */
  | { id: number; type: 'load'; module: WebAssembly.Module }
  /** Check a config for mistakes (stateless). */
  | { id: number; type: 'validate'; config: string }
  /** Sim worker: get ready to run iterations of this config. */
  | { id: number; type: 'initSim'; config: string }
  /** Sim worker: run one iteration and send back its summary. */
  | { id: number; type: 'simulate' }
  /** Aggregator: start collecting iterations for this config. */
  | { id: number; type: 'initAggregator'; config: string }
  /** Aggregator: add one iteration's summary. */
  | { id: number; type: 'add'; summary: Uint8Array }
  /** Aggregator: produce the result for everything added so far. */
  | { id: number; type: 'flush' }
  /** Replay one fight with sample() and send back only the rotation timing markers (rotation/timing.ts). */
  | { id: number; type: 'markers'; config: string; seed: string }
  /** Replay one short fight and send back the first character's stats at the start (gcsim's snapshot). */
  | { id: number; type: 'snapshot'; config: string }
  /** Run one fight per seed with bursts that ignore energy, and send back the energy each burst had (src/energy). */
  | { id: number; type: 'energy'; config: string; seeds: string[] };

export type WorkerReply =
  | { id: number; ok: true; summary?: Uint8Array; result?: string; markers?: { frame: number; msg: string }[]; endFrame?: number; snapshot?: number[]; energy?: string[] }
  /** fatal means the engine in this worker has crashed and the worker must be replaced. */
  | { id: number; ok: false; error: string; fatal: boolean };
