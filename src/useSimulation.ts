import { useCallback, useRef, useState } from 'react';
import { CancelledError, ConfigError, SimPool, type Progress, type SimResult } from './engine/pool';

export type SimState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'running'; progress: Progress; startedAt: number }
  | { phase: 'done'; result: SimResult; seconds: number }
  | { phase: 'cancelled'; progress?: Progress }
  | { phase: 'error'; message: string; isConfigError: boolean };

/** The most recent successful run, kept for the Results screen while the next one runs. */
export type FinishedRun = {
  result: SimResult;
  seconds: number;
  finishedAt: Date;
  config: string;
  /** Things to show with the results, e.g. a character that was skipped. */
  notes: string[];
};

const pool = new SimPool();

/** Runs simulations and keeps track of where the current one is up to. */
export function useSimulation() {
  const [state, setState] = useState<SimState>({ phase: 'idle' });
  const [lastRun, setLastRun] = useState<FinishedRun | undefined>(undefined);
  const lastProgress = useRef<Progress | undefined>(undefined);

  const run = useCallback(async (config: string, notes: string[] = []) => {
    setState({ phase: 'starting' });
    lastProgress.current = undefined;
    let startedAt = 0;
    try {
      const result = await pool.run(config, (progress) => {
        if (!startedAt) startedAt = performance.now();
        lastProgress.current = progress;
        setState({ phase: 'running', progress, startedAt });
      });
      const seconds = (performance.now() - startedAt) / 1000;
      setState({ phase: 'done', result, seconds });
      setLastRun({ result, seconds, finishedAt: new Date(), config, notes });
    } catch (error) {
      if (error instanceof CancelledError) {
        setState({ phase: 'cancelled', progress: lastProgress.current });
      } else {
        setState({
          phase: 'error',
          message: error instanceof Error ? error.message : String(error),
          isConfigError: error instanceof ConfigError,
        });
      }
    }
  }, []);

  const cancel = useCallback(() => pool.cancel(), []);

  return { state, lastRun, run, cancel };
}
