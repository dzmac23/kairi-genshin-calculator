import { useCallback, useRef, useState } from 'react';
import { CancelledError, ConfigError, SimPool, type Progress, type SimResult } from './engine/pool';
import type { SimSettings } from './config/settings';
import type { RotationText, Turn } from './rotation/notation';
import type { Team } from './team/model';
import { FPS, measureTiming, type RotationTiming } from './rotation/timing';

export type SimState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'running'; progress: Progress; startedAt: number }
  | { phase: 'done'; result: SimResult; seconds: number }
  | { phase: 'cancelled'; progress?: Progress }
  | { phase: 'error'; message: string; isConfigError: boolean };

/** What a run was made from, saved with it in the History (see history/model.ts). */
export type RunMeta = {
  source: 'team' | 'paste';
  label?: string;
  team?: Team;
  rotation?: RotationText;
  settings?: SimSettings;
};

/** The most recent successful run, kept for the Results screen while the next one runs. */
export type FinishedRun = {
  /** Identifies the run in the History. */
  id: string;
  meta: RunMeta;
  result: SimResult;
  seconds: number;
  finishedAt: Date;
  config: string;
  /** Things to show with the results, e.g. a character that was skipped. */
  notes: string[];
  /** Rotation timing, measured just after the run (only for Team + Rotation runs). */
  timing?: RotationTiming | 'measuring' | 'failed';
};

/** What's needed to measure rotation timing after a run (see rotation/timing.ts). */
export type TimingRequest = { config: string; turns: Turn[]; durationSeconds: number };

/** Number of replayed fights averaged for rotation timing. Fixed seeds, so results repeat. */
const TIMING_REPLAYS = 10;

const pool = new SimPool();

/** Runs simulations and keeps track of where the current one is up to. */
export function useSimulation() {
  const [state, setState] = useState<SimState>({ phase: 'idle' });
  const [lastRun, setLastRun] = useState<FinishedRun | undefined>(undefined);
  const lastProgress = useRef<Progress | undefined>(undefined);

  const run = useCallback(async (config: string, notes: string[] = [], timing?: TimingRequest, meta: RunMeta = { source: 'paste' }) => {
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
      const finishedAt = new Date();
      setLastRun({ id: crypto.randomUUID(), meta, result, seconds, finishedAt, config, notes, timing: timing ? 'measuring' : undefined });
      if (timing) {
        const seeds = Array.from({ length: TIMING_REPLAYS }, (_, i) => String(i + 1));
        const update = (value: FinishedRun['timing']) =>
          // Only the run that was measured is updated, even if another has finished since.
          setLastRun((r) => (r && r.finishedAt === finishedAt ? { ...r, timing: value } : r));
        pool
          .markers(timing.config, seeds)
          .then((markers) =>
            update(measureTiming(markers.map((m) => ({ markers: m, endFrame: timing.durationSeconds * FPS })), timing.turns)),
          )
          .catch(() => update('failed'));
      }
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
