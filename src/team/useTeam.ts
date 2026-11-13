import { usePersistentState } from '../usePersistentState';
import { emptySlot, emptyTeam, type Team } from './model';

/** The current team, loaded from and saved to this device automatically. */
export function useTeam() {
  const [team, setTeam, loaded] = usePersistentState<Team>('team', emptyTeam(), (saved) =>
    // Fill in any fields added in later versions of the app.
    Array.isArray(saved) && saved.length === 4 ? saved.map((s) => ({ ...emptySlot(), ...s })) : undefined,
  );
  return { team, setTeam, loaded };
}
