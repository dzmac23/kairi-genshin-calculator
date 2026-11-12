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
  | { id: number; type: 'flush' };

export type WorkerReply =
  | { id: number; ok: true; summary?: Uint8Array; result?: string }
  /** fatal means the engine in this worker has crashed and the worker must be replaced. */
  | { id: number; ok: false; error: string; fatal: boolean };
