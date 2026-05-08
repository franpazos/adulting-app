/**
 * IndexedDB-backed snapshot persistence for the in-memory SQLite fallback.
 *
 * On Safari iOS the synchronous OPFS access handles required by SAH Pool VFS
 * aren't available on the main thread, so `client.ts` falls back to an
 * in-memory database. This module gives that in-memory DB durability:
 *
 *   - On boot: `loadSnapshot()` returns the last serialized DB, if any.
 *   - After every write: `client.ts` schedules `saveSnapshot(bytes)` (debounced).
 *   - On `pagehide` / `visibilitychange → hidden`: a synchronous flush.
 *
 * The snapshot is stored as a single key in a single-object-store IndexedDB.
 * Datasets are tiny (low KBs to maybe a few hundred KB) so we don't bother
 * with chunking — one put, one get.
 */

const DB_NAME = "adulting-snapshot";
const STORE = "snapshots";
const KEY = "current";

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("indexedDB open blocked"));
  });
}

export async function isPersistenceAvailable(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    const db = await openIdb();
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function loadSnapshot(): Promise<Uint8Array | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openIdb();
    const result = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (result == null) return null;
    if (result instanceof Uint8Array) return result;
    if (result instanceof ArrayBuffer) return new Uint8Array(result);
    return null;
  } catch (err) {
    console.warn("[snapshot] load failed:", err);
    return null;
  }
}

export async function saveSnapshot(bytes: Uint8Array): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(bytes, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

export async function clearSnapshot(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // best-effort; nothing to do if it fails
  }
}
