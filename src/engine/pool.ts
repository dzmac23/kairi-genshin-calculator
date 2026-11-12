// Runs gcsim simulations on several engine workers at once.
//
// How a run works:
//   1. The engine (main.wasm) is compiled once and the compiled copy is shared with every worker.
//   2. One worker is the aggregator; the others are sim workers.
//   3. The config is validated, then every worker is initialised with it.
//   4. Each sim worker runs one iteration at a time (with one more queued so it is never idle)
//      and the page passes each result to the aggregator.
//   5. A few times a second the aggregator is asked for the statistics so far (live progress),
//      and once more at the end for the final result.
// Cancel stops all workers immediately; new ones are started for the next run.

import type { WorkerReply, WorkerRequest } from './protocol';
import { defaultWorkerCount } from './config';

export const engineUrl = `${import.meta.env.BASE_URL}gcsim/`;

/** The parts of gcsim's result JSON the app uses so far. The full result has much more. */
export type SimResult = {
  statistics: {
    iterations: number;
    dps: { mean: number; min: number; max: number; sd: number };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type Progress = { done: number; total: number; partial?: SimResult };

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
  }
}

/** A gcsim error about the config (shown to the user as is). */
export class ConfigError extends Error {}

type RequestBody = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, 'id'> : never) : never;
type Success = Extract<WorkerReply, { ok: true }>;

/** One engine worker, with a promise-based way to send it requests. */
class EngineWorker {
  private worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
  private nextId = 0;
  private pending = new Map<number, { resolve: (r: Success) => void; reject: (e: Error) => void }>();
  onFatal: (error: Error) => void = () => {};

  constructor() {
    this.worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      const waiter = this.pending.get(reply.id);
      if (!waiter) return;
      this.pending.delete(reply.id);
      if (reply.ok) {
        waiter.resolve(reply);
      } else if (reply.fatal) {
        const error = new Error(`The gcsim engine crashed: ${reply.error}`);
        waiter.reject(error);
        this.onFatal(error);
      } else {
        waiter.reject(new ConfigError(reply.error));
      }
    };
    this.worker.onerror = (event) => {
      event.preventDefault();
      this.onFatal(new Error(`An engine worker failed to start: ${event.message || 'unknown error'}`));
    };
  }

  call(body: RequestBody, transfer: Transferable[] = []): Promise<Success> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...body, id }, transfer);
    });
  }

  terminate(reason: Error) {
    this.worker.terminate();
    for (const waiter of this.pending.values()) waiter.reject(reason);
    this.pending.clear();
  }
}

let compiled: Promise<WebAssembly.Module> | undefined;

/** Downloads (or reads from the offline cache) and compiles the engine, once per page load. */
function compileEngine(): Promise<WebAssembly.Module> {
  compiled ??= (async () => {
    const url = `${engineUrl}main.wasm`;
    try {
      return await WebAssembly.compileStreaming(fetch(url));
    } catch {
      // Older browsers, or a server that sends the wrong file type for .wasm.
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not download the gcsim engine (${response.status})`);
      return WebAssembly.compile(await response.arrayBuffer());
    }
  })();
  compiled.catch(() => (compiled = undefined)); // allow a retry after a failed download
  return compiled;
}

const nav = typeof navigator !== 'undefined' ? navigator : undefined;
export const workerCount = defaultWorkerCount(
  nav?.hardwareConcurrency,
  (nav as { deviceMemory?: number } | undefined)?.deviceMemory,
);

/** How often to ask the aggregator for live statistics while a run is going. */
const LIVE_UPDATE_MS = 500;
/** Iterations queued per sim worker, so it starts the next one without waiting for the page. */
const QUEUE_PER_WORKER = 2;

export class SimPool {
  private aggregator: EngineWorker | undefined;
  private sims: EngineWorker[] = [];
  private loading: Promise<void> | undefined;
  private abort: ((error: Error) => void) | undefined;

  /** Starts the workers if they aren't running yet. */
  private start(): Promise<void> {
    this.loading ??= (async () => {
      const module = await compileEngine();
      const workers = Array.from({ length: workerCount + 1 }, () => new EngineWorker());
      // A crashed engine ends the current run, or if none is running, the workers are replaced.
      for (const w of workers) w.onFatal = (error) => (this.abort ? this.abort(error) : this.stop(error));
      [this.aggregator, ...this.sims] = workers;
      await Promise.all(workers.map((w) => w.call({ type: 'load', module })));
    })();
    this.loading.catch(() => this.stop(new Error('stopped')));
    return this.loading;
  }

  /** Stops every worker. The next run starts fresh ones. */
  private stop(reason: Error) {
    this.aggregator?.terminate(reason);
    for (const w of this.sims) w.terminate(reason);
    this.aggregator = undefined;
    this.sims = [];
    this.loading = undefined;
  }

  /** Checks a config with gcsim. Throws a ConfigError with gcsim's message if it is wrong. */
  async validate(config: string): Promise<void> {
    await this.start();
    await this.aggregator!.call({ type: 'validate', config });
  }

  /** Stops the current run. Its run() promise rejects with CancelledError. */
  cancel() {
    this.abort?.(new CancelledError());
  }

  /**
   * Runs the config (its own `iteration=` setting decides how many iterations) and returns
   * gcsim's final result. Calls onProgress as iterations finish.
   */
  async run(config: string, onProgress: (p: Progress) => void): Promise<SimResult> {
    if (this.abort) throw new Error('A simulation is already running');

    // Cancel, or an engine crash, stops the workers and ends the run straight away.
    const aborted = new Promise<never>((_, reject) => {
      this.abort = (error) => {
        this.stop(error);
        reject(error);
      };
    });
    let failed = false;

    const work = async (): Promise<SimResult> => {
      await this.start();
      const aggregator = this.aggregator!;
      const sims = this.sims;

      await aggregator.call({ type: 'validate', config });
      const init = await aggregator.call({ type: 'initAggregator', config });
      const total: number = JSON.parse(init.result!).simulator_settings.iterations;
      await Promise.all(sims.map((w) => w.call({ type: 'initSim', config })));

      let requested = 0;
      let done = 0;
      let lastUpdate = performance.now();
      let updating = false;
      onProgress({ done, total });

      // Asks the aggregator for the statistics so far, at most every LIVE_UPDATE_MS.
      const liveUpdate = async () => {
        if (updating) return;
        updating = true;
        lastUpdate = performance.now();
        try {
          const reply = await aggregator.call({ type: 'flush' });
          if (done < total && !failed) onProgress({ done, total, partial: JSON.parse(reply.result!) });
        } finally {
          updating = false;
        }
      };

      // Each loop keeps one sim worker busy: run an iteration, pass it to the aggregator, repeat.
      const loop = async (sim: EngineWorker) => {
        while (requested < total && !failed) {
          requested++;
          const { summary } = await sim.call({ type: 'simulate' });
          await aggregator.call({ type: 'add', summary: summary! }, [summary!.buffer as ArrayBuffer]);
          done++;
          if (performance.now() - lastUpdate >= LIVE_UPDATE_MS) void liveUpdate().catch(() => {});
          else onProgress({ done, total });
        }
      };
      try {
        await Promise.all(sims.flatMap((sim) => Array.from({ length: QUEUE_PER_WORKER }, () => loop(sim))));
      } catch (error) {
        failed = true; // the other loops stop picking up new iterations
        throw error;
      }

      const final = await aggregator.call({ type: 'flush' });
      return JSON.parse(final.result!);
    };

    const running = work();
    running.catch(() => {}); // after a cancel, its leftover errors are expected and ignored
    try {
      return await Promise.race([running, aborted]);
    } finally {
      failed = true;
      this.abort = undefined;
      aborted.catch(() => {});
    }
  }
}
