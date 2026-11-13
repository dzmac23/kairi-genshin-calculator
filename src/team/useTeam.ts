import { useEffect, useState } from 'react';
import { getItem, setItem } from '../storage';
import { emptySlot, emptyTeam, type Team } from './model';

const KEY = 'team';

/** The current team, loaded from and saved to this device automatically. */
export function useTeam() {
  const [team, setTeam] = useState<Team>(emptyTeam);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getItem<Team>(KEY).then((saved) => {
      // Fill in any fields added in later versions of the app.
      if (Array.isArray(saved) && saved.length === 4) setTeam(saved.map((s) => ({ ...emptySlot(), ...s })));
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return; // don't overwrite the saved team with the empty one while loading
    // Saved straight away (it is tiny), so closing the app right after an edit loses nothing.
    void setItem(KEY, team);
  }, [team, loaded]);

  return { team, setTeam, loaded };
}
