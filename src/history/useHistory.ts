import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteKeys, getAll, putAll, requestPersistentStorage, RUNS } from '../storage';
import type { RunRecord } from './model';

const newestFirst = (a: RunRecord, b: RunRecord) => b.createdAt.localeCompare(a.createdAt);

/** The run history on this device: loaded once, then kept in step with IndexedDB. */
export function useHistory() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const deleted = useRef(new Set<string>());
  const askedPersist = useRef(false);

  useEffect(() => {
    getAll<RunRecord>(RUNS).then((all) => {
      // Merge rather than replace: a run may have been saved while the history was loading.
      setRuns((current) => {
        const ids = new Set(current.map((r) => r.id));
        return [...current, ...all.filter((r) => !ids.has(r.id) && !deleted.current.has(r.id))].sort(newestFirst);
      });
      setLoaded(true);
    });
  }, []);

  /**
   * Saves a run (or updates it, e.g. when its rotation timing arrives). A label given in the
   * History screen meanwhile is kept, and a run deleted meanwhile stays deleted.
   */
  const save = useCallback((record: RunRecord) => {
    if (deleted.current.has(record.id)) return;
    if (!askedPersist.current) {
      askedPersist.current = true;
      requestPersistentStorage();
    }
    setRuns((current) => {
      const existing = current.find((r) => r.id === record.id);
      const merged = existing ? { ...record, label: existing.label } : record;
      void putAll(RUNS, [merged]);
      return [merged, ...current.filter((r) => r.id !== record.id)].sort(newestFirst);
    });
  }, []);

  const rename = useCallback((id: string, label: string) => {
    setRuns((current) =>
      current.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, label: label.trim() || undefined };
        void putAll(RUNS, [updated]);
        return updated;
      }),
    );
  }, []);

  const remove = useCallback((ids: string[]) => {
    for (const id of ids) deleted.current.add(id);
    void deleteKeys(RUNS, ids);
    setRuns((current) => current.filter((r) => !ids.includes(r.id)));
  }, []);

  const importRuns = useCallback((records: RunRecord[]) => {
    for (const r of records) deleted.current.delete(r.id);
    void putAll(RUNS, records);
    setRuns((current) => {
      const ids = new Set(records.map((r) => r.id));
      return [...records, ...current.filter((r) => !ids.has(r.id))].sort(newestFirst);
    });
  }, []);

  return { runs, loaded, save, rename, remove, importRuns };
}
