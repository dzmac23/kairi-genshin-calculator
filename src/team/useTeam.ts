import { usePersistentState } from '../usePersistentState';
import { cleanTeam, emptyTeam, type Team } from './model';

/** The current team, loaded from and saved to this device automatically. */
export function useTeam() {
  // Saved data is repaired field by field (and fields added in later versions are filled in).
  const [team, setTeam, loaded] = usePersistentState<Team>('team', emptyTeam(), cleanTeam);
  return { team, setTeam, loaded };
}
