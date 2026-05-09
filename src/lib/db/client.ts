/**
 * SQLite client — thin wrapper around `@sqlite.org/sqlite-wasm`.
 *
 * Persistence strategy (in priority order):
 *   1. **OPFS SAH Pool VFS** — synchronous, durable, fast. Works on
 *      Chrome/Edge main thread.
 *   2. **In-memory + IndexedDB snapshot** — for browsers (Safari iOS)
 *      where SAH Pool can't initialize on the main thread. SQLite runs
 *      against `:memory:`; after every write we serialize the entire DB
 *      and persist the bytes to IndexedDB. On boot, if a snapshot exists
 *      we deserialize it back into the in-memory DB before migrations
 *      run. See ADR-013.
 *   3. **In-memory only** — last-resort fallback when even IndexedDB is
 *      unavailable (private browsing modes, broken environments). Data
 *      is lost on reload — the UI shows a warning pill.
 *
 * The full worker-based promiser is intentionally not used. For a
 * personal app with a small dataset, snapshot-to-IDB gives us durability
 * on Safari without async-ifying every call site. We can swap to a
 * worker behind this same interface later — see ADR-008.
 */

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  clearSnapshot as clearIdbSnapshot,
  isPersistenceAvailable,
  loadSnapshot,
  saveSnapshot,
} from "./persistence";

// We deliberately keep the sqlite3 module type loose. The @types coverage
// is partial and the surface we use is small.
type Sqlite3Static = Awaited<ReturnType<typeof sqlite3InitModule>>;

interface DbHandle {
  exec(opts: {
    sql: string;
    bind?: SqlValue[];
    rowMode?: "object" | "array";
    returnValue?: "resultRows";
    resultRows?: unknown[];
  }): unknown;
  /** Native sqlite3* pointer used for serialize/deserialize. */
  pointer?: number;
}

export type SqlValue = string | number | bigint | null | Uint8Array;
export type SqlParams = SqlValue[] | Record<string, SqlValue>;
export type Backend = "opfs-sahpool" | "memory-snapshot" | "memory";

let dbInstance: DbHandle | null = null;
let initPromise: Promise<DbHandle> | null = null;
let backend: Backend | null = null;
let sqlite3Module: Sqlite3Static | null = null;

const DB_FILENAME = "adulting.sqlite3";

/**
 * Tests run against happy-dom's IndexedDB but we don't want snapshot state
 * to leak across test files. Disable the snapshot path under Vitest.
 */
const SNAPSHOT_DISABLED =
  typeof import.meta.env !== "undefined" && import.meta.env.MODE === "test";

export interface DbInitResult {
  backend: Backend;
  warning: string | null;
}

export async function initDb(): Promise<DbInitResult> {
  if (dbInstance && backend) {
    return { backend, warning: null };
  }
  if (initPromise) {
    await initPromise;
    return { backend: backend!, warning: null };
  }

  let warning: string | null = null;
  initPromise = (async () => {
    const sqlite3: Sqlite3Static = await sqlite3InitModule();
    sqlite3Module = sqlite3;

    // Prefer durable OPFS SAH Pool. Falls back to :memory: if unavailable.
    try {
      const poolUtil = await (
        sqlite3 as unknown as {
          installOpfsSAHPoolVfs: (opts: object) => Promise<{
            OpfsSAHPoolDb: new (filename: string) => DbHandle;
          }>;
        }
      ).installOpfsSAHPoolVfs({
        name: "adulting-pool",
        clearOnInit: false,
        initialCapacity: 6,
      });
      dbInstance = new poolUtil.OpfsSAHPoolDb(DB_FILENAME);
      backend = "opfs-sahpool";
      return dbInstance;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.info(
        "[db] OPFS SAH Pool unavailable, falling back to in-memory + IndexedDB snapshot. Reason:",
        reason,
      );

      dbInstance = new (
        sqlite3 as unknown as { oo1: { DB: new (path: string) => DbHandle } }
      ).oo1.DB(":memory:");

      // Try to load a previous snapshot from IndexedDB. If anything goes
      // wrong, we silently start fresh — nothing here should ever break boot.
      const persistenceUsable =
        !SNAPSHOT_DISABLED && (await isPersistenceAvailable());
      if (persistenceUsable) {
        try {
          const bytes = await loadSnapshot();
          if (bytes && bytes.length > 0) {
            deserializeIntoCurrent(bytes);
            console.info(
              `[db] Restored ${bytes.length} bytes from IndexedDB snapshot.`,
            );
          }
        } catch (loadErr) {
          console.warn(
            "[db] Snapshot load failed; starting with an empty DB:",
            loadErr,
          );
        }
        backend = "memory-snapshot";
        installSnapshotHooks();
      } else {
        warning =
          "Persistent storage is unavailable. Data will be lost on reload.";
        console.warn("[db]", warning);
        backend = "memory";
      }

      return dbInstance;
    }
  })();

  await initPromise;
  return { backend: backend!, warning };
}

function getDb(): DbHandle {
  if (!dbInstance) {
    throw new Error("DB not initialized. Call initDb() before any query.");
  }
  return dbInstance;
}

/** Execute a single statement that does not return rows (DDL or write). */
export function exec(sql: string, params?: SqlValue[]): void {
  getDb().exec({ sql, bind: params ?? [] });
  markDirty();
}

/** Execute multiple statements separated by semicolons. */
export function execScript(sql: string): void {
  getDb().exec({ sql });
  markDirty();
}

/** Run a SELECT and return all rows as objects. */
export function selectAll<T = Record<string, SqlValue>>(
  sql: string,
  params?: SqlValue[],
): T[] {
  const rows: unknown[] = [];
  getDb().exec({
    sql,
    bind: params ?? [],
    rowMode: "object",
    returnValue: "resultRows",
    resultRows: rows,
  });
  return rows as T[];
}

/** Run a SELECT and return the first row, or null. */
export function selectOne<T = Record<string, SqlValue>>(
  sql: string,
  params?: SqlValue[],
): T | null {
  const rows = selectAll<T>(sql, params);
  return rows[0] ?? null;
}

/** Run a SELECT count(*) and return the integer. */
export function selectScalar(sql: string, params?: SqlValue[]): number {
  const row = selectOne<Record<string, number>>(sql, params);
  if (!row) return 0;
  const first = Object.values(row)[0];
  return typeof first === "number" ? first : Number(first ?? 0);
}

let txDepth = 0;

/**
 * Wrap a block of mutations in a transaction. Auto-rolls-back on throw.
 * Reentrant: if a transaction is already open, runs `fn` inline so
 * inner repository code can use `transaction()` freely without worrying
 * about whether a caller already started one.
 */
export function transaction<T>(fn: () => T): T {
  if (txDepth > 0) {
    return fn();
  }
  txDepth++;
  exec("BEGIN");
  try {
    const result = fn();
    exec("COMMIT");
    return result;
  } catch (err) {
    try {
      exec("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    txDepth--;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot machinery — only active when backend === "memory-snapshot".
// ─────────────────────────────────────────────────────────────────────────────

let pendingSnapshot = false;
let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotInFlight: Promise<void> | null = null;
let snapshotHooksInstalled = false;

const SNAPSHOT_DEBOUNCE_MS = 500;

function markDirty(): void {
  if (backend !== "memory-snapshot") return;
  pendingSnapshot = true;
  if (snapshotTimer != null) return;
  snapshotTimer = setTimeout(() => {
    snapshotTimer = null;
    void flushSnapshot();
  }, SNAPSHOT_DEBOUNCE_MS);
}

async function flushSnapshot(): Promise<void> {
  if (!pendingSnapshot) return;
  // Coalesce: if a save is already running, just leave `pendingSnapshot`
  // set and let the next tick pick it up.
  if (snapshotInFlight) {
    snapshotInFlight = snapshotInFlight.then(() => flushSnapshot());
    return;
  }
  pendingSnapshot = false;
  const bytes = serializeCurrent();
  if (!bytes) return;
  snapshotInFlight = saveSnapshot(bytes)
    .catch((err) => {
      console.warn("[db] snapshot save failed:", err);
      // Re-mark so we try again on the next write.
      pendingSnapshot = true;
    })
    .finally(() => {
      snapshotInFlight = null;
    });
  await snapshotInFlight;
}

/**
 * Synchronous-as-possible flush for `pagehide` / visibility events.
 * Serialization is sync; the IDB put is fire-and-forget — Safari will
 * normally let an in-progress IDB transaction commit even as the page
 * goes to bfcache.
 */
function flushSnapshotBlocking(): void {
  if (backend !== "memory-snapshot") return;
  if (!pendingSnapshot) return;
  const bytes = serializeCurrent();
  if (!bytes) return;
  pendingSnapshot = false;
  void saveSnapshot(bytes).catch((err) => {
    console.warn("[db] urgent snapshot save failed:", err);
  });
}

function serializeCurrent(): Uint8Array | null {
  if (!sqlite3Module || !dbInstance) return null;
  const ptr = dbInstance.pointer;
  if (typeof ptr !== "number") {
    console.warn("[db] cannot serialize: db has no pointer");
    return null;
  }
  const sqlite3 = sqlite3Module as unknown as {
    capi: { sqlite3_js_db_export: (db: number) => Uint8Array };
  };
  return sqlite3.capi.sqlite3_js_db_export(ptr);
}

function deserializeIntoCurrent(bytes: Uint8Array): void {
  if (!sqlite3Module || !dbInstance) {
    throw new Error("deserialize: db not initialized");
  }
  const ptr = dbInstance.pointer;
  if (typeof ptr !== "number") {
    throw new Error("deserialize: db has no pointer");
  }
  const sqlite3 = sqlite3Module as unknown as {
    capi: {
      sqlite3_deserialize: (
        db: number,
        schema: string,
        data: number,
        szDb: number,
        szBuf: number,
        flags: number,
      ) => number;
      SQLITE_DESERIALIZE_FREEONCLOSE: number;
      SQLITE_DESERIALIZE_RESIZEABLE: number;
    };
    wasm: { allocFromTypedArray: (data: Uint8Array) => number };
  };
  const dataPtr = sqlite3.wasm.allocFromTypedArray(bytes);
  const flags =
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
    sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE;
  const rc = sqlite3.capi.sqlite3_deserialize(
    ptr,
    "main",
    dataPtr,
    bytes.length,
    bytes.length,
    flags,
  );
  if (rc !== 0) {
    throw new Error(`sqlite3_deserialize failed (rc=${rc})`);
  }
}

function installSnapshotHooks(): void {
  if (snapshotHooksInstalled) return;
  snapshotHooksInstalled = true;
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushSnapshotBlocking();
    });
  }
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => flushSnapshotBlocking());
  }
}

/** Force-flush any pending snapshot. Useful before destructive operations. */
export async function flushPendingSnapshot(): Promise<void> {
  if (snapshotTimer != null) {
    clearTimeout(snapshotTimer);
    snapshotTimer = null;
  }
  await flushSnapshot();
}

/** Reset the in-memory module-level state (used by tests). */
export function _resetDbForTests(): void {
  dbInstance = null;
  initPromise = null;
  backend = null;
  sqlite3Module = null;
  txDepth = 0;
  pendingSnapshot = false;
  if (snapshotTimer != null) {
    clearTimeout(snapshotTimer);
    snapshotTimer = null;
  }
  snapshotInFlight = null;
  // Best-effort wipe of the IDB snapshot so tests don't bleed into each other
  // if anything ever turns SNAPSHOT_DISABLED off.
  void clearIdbSnapshot();
}

/**
 * Serialize the current DB to a Uint8Array. Works regardless of backend
 * (OPFS or in-memory). Used by the Settings → Backups download action.
 */
export function exportDb(): Uint8Array | null {
  return serializeCurrent();
}

/** Test-only: expose the serialize/deserialize primitives. */
export const _internal = {
  serializeCurrent,
  deserializeIntoCurrent,
};
