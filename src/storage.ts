// A tiny key-value store on top of IndexedDB, the browser's built-in database. Data stays on
// this device (it is not uploaded anywhere) and survives closing the app.
// If storage is unavailable (for example some private browsing modes), reads return undefined
// and writes do nothing, so the app still works, it just doesn't remember.

const DB_NAME = 'kairi-calc';
const STORE = 'kv';

/** Version 2 added the "runs" store (run history, one record per run, keyed by id). */
const DB_VERSION = 2;
export const RUNS = 'runs';

let opening: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(RUNS)) db.createObjectStore(RUNS, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  opening.catch(() => (opening = undefined));
  return opening;
}

/** Every record in a store (e.g. all saved runs). */
export async function getAll<T>(store: string): Promise<T[]> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

/** Adds or replaces records (keyed by their id). Returns false if storage failed. */
export async function putAll<T>(store: string, records: T[]): Promise<boolean> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      for (const r of records) tx.objectStore(store).put(r);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteKeys(store: string, keys: string[]): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      for (const k of keys) tx.objectStore(store).delete(k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Nothing deleted; the history keeps showing what is stored.
  }
}

/**
 * Asks the browser to keep this app's data even when the device is low on space (installed apps
 * usually get this automatically). Exporting is still the real backup.
 */
export function requestPersistentStorage(): void {
  void navigator.storage?.persist?.().catch(() => {});
}

export async function getItem<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return undefined;
  }
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Not saved; the app keeps working with what is in memory.
  }
}
