// Keeps every "character totals" slot worked out: gcsim's stats without artifacts for the build,
// and the artifact stats that give the typed totals (team/baseline.ts). Whenever the build or the
// totals change, gcsim works them out again in the background.

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { GameData } from '../data/gameData';
import { canSnapshot, getBaseline, solveArtifacts } from './baseline';
import { baselineKey, hasCurrentBaseline, hasSolvedTotals, totalsKey, type Team } from './model';

/** Returns an error message per build key, for builds gcsim couldn't work out. */
export function useBaselines(team: Team, setTeam: Dispatch<SetStateAction<Team>>, data: GameData | undefined): Record<string, string> {
  const inFlight = useRef(new Set<string>());
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    for (const slot of team) {
      if (slot.statMode !== 'totals' || !slot.character || hasSolvedTotals(slot) || !canSnapshot(slot, data)) continue;
      const build = baselineKey(slot);
      const job = `${build}|${totalsKey(slot)}`;
      if (inFlight.current.has(job) || errors[build]) continue;
      inFlight.current.add(job);
      (async () => {
        const baseline = hasCurrentBaseline(slot) ? slot.baseline! : await getBaseline(slot, data);
        return solveArtifacts(slot, data, baseline);
      })()
        .then((solved) =>
          // Only slots still on this exact build and these totals get it (they may have changed since).
          setTeam((t) =>
            t.map((s) =>
              s.statMode === 'totals' && baselineKey(s) === solved.key && totalsKey(s) === solved.solved!.totals ? { ...s, baseline: solved } : s,
            ),
          ),
        )
        .catch((error) => setErrors((e) => ({ ...e, [build]: error instanceof Error ? error.message : String(error) })))
        .finally(() => inFlight.current.delete(job));
    }
  }, [team, data, errors, setTeam]);

  return errors;
}
