import { useCallback, useRef, useState } from 'react';
import { CancelledError, ConfigError, SimPool, type Progress, type SimResult } from './engine/pool';

export type SimState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'running'; progress: Progress; startedAt: number }
  | { phase: 'done'; result: SimResult; seconds: number }
  | { phase: 'cancelled'; progress?: Progress }
  | { phase: 'error'; message: string; isConfigError: boolean };

const pool = new SimPool();

/** Runs simulations and keeps track of where the current one is up to. */
export function useSimulation() {
  const [state, setState] = useState<SimState>({ phase: 'idle' });
  const lastProgress = useRef<Progress | undefined>(undefined);

  const run = useCallback(async (config: string) => {
    setState({ phase: 'starting' });
    lastProgress.current = undefined;
    let startedAt = 0;
    try {
      const result = await pool.run(config, (progress) => {
        if (!startedAt) startedAt = performance.now();
        lastProgress.current = progress;
        setState({ phase: 'running', progress, startedAt });
      });
      setState({ phase: 'done', result, seconds: (performance.now() - startedAt) / 1000 });
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

  return { state, run, cancel };
}
