const DB_NAME = 'dockdo-offline';
const STORE = 'snapshot';
const KEY = 'state-v1';

export interface Snapshot {
  lists: unknown[];
  tasksByList: Record<string, unknown[]>;
  savedAt: string;
}

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  try {
    const db = await openDb();
    await db.put(STORE, snapshot, KEY);
  } catch {
    /* ignore */
  }
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  try {
    const db = await openDb();
    return (await db.get(STORE, KEY)) || null;
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function isOnline(): boolean {
  return navigator.onLine;
}

export function onNetworkChange(cb: (online: boolean) => void): () => void {
  const on = () => cb(true);
  const off = () => cb(false);
  window.addEventListener('online', on);
  window.addEventListener('offline', off);
  return () => {
    window.removeEventListener('online', on);
    window.removeEventListener('offline', off);
  };
}