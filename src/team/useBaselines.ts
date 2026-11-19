// Keeps every "character totals" slot's baseline (gcsim's stats without artifacts) up to date:
// whenever the build changes (level, weapon, sets…), gcsim works it out again in the background.

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { GameData } from '../data/gameData';
import { canSnapshot, getBaseline } from './baseline';
import { baselineKey, hasCurrentBaseline, type Team } from './model';

/** Returns an error message per build key, for builds gcsim couldn't work out. */
export function useBaselines(team: Team, setTeam: Dispatch<SetStateAction<Team>>, data: GameData | undefined): Record<string, string> {
  const inFlight = useRef(new Set<string>());
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    for (const slot of team) {
      if (slot.statMode !== 'totals' || !slot.character || hasCurrentBaseline(slot) || !canSnapshot(slot, data)) continue;
      const key = baselineKey(slot);
      if (inFlight.current.has(key) || errors[key]) continue;
      inFlight.current.add(key);
      getBaseline(slot, data)
        .then((baseline) =>
          // Only slots still on this exact build get it (the person may have changed something since).
          setTeam((t) => t.map((s) => (s.statMode === 'totals' && baselineKey(s) === baseline.key ? { ...s, baseline } : s))),
        )
        .catch((error) => setErrors((e) => ({ ...e, [key]: error instanceof Error ? error.message : String(error) })))
        .finally(() => inFlight.current.delete(key));
    }
  }, [team, data, errors, setTeam]);

  return errors;
}
