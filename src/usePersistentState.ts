import { useEffect, useState } from 'react';
import { getItem, setItem } from './storage';

/**
 * Like useState, but loaded from and saved to this device (IndexedDB) under `key`.
 * `clean` repairs whatever was saved (e.g. fills in fields added in later versions).
 * Saved straight away on every change, so closing the app right after an edit loses nothing.
 */
export function usePersistentState<T>(key: string, initial: T, clean: (saved: unknown) => T | undefined = (v) => v as T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getItem<unknown>(key).then((saved) => {
      if (saved !== undefined) {
        const cleaned = clean(saved);
        if (cleaned !== undefined) setValue(cleaned);
      }
      setLoaded(true);
    });
  }, [key]);

  useEffect(() => {
    if (loaded) void setItem(key, value); // never overwrite saved data with the initial value while loading
  }, [key, value, loaded]);

  return [value, setValue, loaded] as const;
}
