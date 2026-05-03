/**
 * SQLite client — thin wrapper around `@sqlite.org/sqlite-wasm`.
 *
 * Persistence strategy:
 *   1. Try OPFS SAH Pool VFS (synchronous, durable, fast — Chrome/Edge first).
 *   2. Fallback to in-memory if OPFS is unavailable (Safari without
 *      worker, dev environments without COOP/COEP, etc.).
 *
 * The full worker-based promiser is intentionally not used here. For a
 * personal app on a known browser (Chrome on macOS), main-thread OPFS
 * is fine and keeps the call sites simple. We can swap to a worker
 * later behind this same interface — see ADR-008.
 */

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

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
  // sqlite-wasm's oo1 DB also exposes prepare/finalize, but exec covers all needs.
}

export type SqlValue = string | number | bigint | null | Uint8Array;
export type SqlParams = SqlValue[] | Record<string, SqlValue>;

let dbInstance: DbHandle | null = null;
let initPromise: Promise<DbHandle> | null = null;
let backend: "opfs-sahpool" | "memory" | null = null;

const DB_FILENAME = "adulting.sqlite3";

export interface DbInitResult {
  backend: "opfs-sahpool" | "memory";
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
    } catch (err) {
      warning = `OPFS SAH Pool unavailable, using in-memory DB. Data will not persist across reloads. Reason: ${
        err instanceof Error ? err.message : String(err)
      }`;
      console.warn("[db]", warning);
      dbInstance = new (
        sqlite3 as unknown as { oo1: { DB: new (path: string) => DbHandle } }
      ).oo1.DB(":memory:");
      backend = "memory";
    }

    return dbInstance;
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
}

/** Execute multiple statements separated by semicolons. */
export function execScript(sql: string): void {
  getDb().exec({ sql });
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

/** Reset the in-memory module-level state (used by tests). */
export function _resetDbForTests(): void {
  dbInstance = null;
  initPromise = null;
  backend = null;
  txDepth = 0;
}
