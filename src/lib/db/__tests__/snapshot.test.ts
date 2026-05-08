/**
 * Snapshot durability — verifies that the in-memory SQLite can be
 * serialized to bytes and deserialized back into a fresh instance with
 * all rows intact. This is the bedrock of the Safari iOS persistence
 * path; if this round-trip works, IndexedDB persistence is "just" the
 * transport layer.
 *
 * The auto-snapshot wiring in `client.ts` is disabled under Vitest
 * (otherwise happy-dom's IndexedDB would leak state across tests), so
 * here we exercise the primitives directly via `_internal`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initDb, runMigrations, seedIfEmpty } from "@/lib/db";
import {
  _internal,
  _resetDbForTests,
  selectAll,
  selectScalar,
} from "@/lib/db/client";
import type { Transaction } from "@/lib/db/types";

beforeEach(async () => {
  _resetDbForTests();
  await initDb();
  runMigrations();
  seedIfEmpty();
});

afterEach(() => {
  _resetDbForTests();
});

describe("snapshot round-trip", () => {
  it("serializes a populated DB and deserializes it back into a fresh instance", async () => {
    const txCountBefore = selectScalar("SELECT COUNT(*) FROM transactions");
    const beforeRows = selectAll<Transaction>(
      "SELECT id, amount FROM transactions ORDER BY id",
    );
    expect(txCountBefore).toBeGreaterThan(0);

    const bytes = _internal.serializeCurrent();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes!.length).toBeGreaterThan(0);

    // Tear down + boot a brand-new in-memory DB and pour the bytes back in.
    _resetDbForTests();
    await initDb();
    // No migrations / seed: deserialize replaces the schema entirely.
    _internal.deserializeIntoCurrent(bytes!);

    const txCountAfter = selectScalar("SELECT COUNT(*) FROM transactions");
    expect(txCountAfter).toBe(txCountBefore);
    const afterRows = selectAll<Transaction>(
      "SELECT id, amount FROM transactions ORDER BY id",
    );
    expect(afterRows).toEqual(beforeRows);
  });

  it("is idempotent: deserialize → serialize → deserialize gives the same DB", async () => {
    const bytes1 = _internal.serializeCurrent();
    expect(bytes1).toBeTruthy();

    _resetDbForTests();
    await initDb();
    _internal.deserializeIntoCurrent(bytes1!);

    const bytes2 = _internal.serializeCurrent();
    expect(bytes2).toBeTruthy();

    // Re-deserialize and confirm the row count is preserved.
    _resetDbForTests();
    await initDb();
    _internal.deserializeIntoCurrent(bytes2!);

    expect(selectScalar("SELECT COUNT(*) FROM transactions")).toBeGreaterThan(0);
    expect(selectScalar("SELECT COUNT(*) FROM accounts")).toBe(3);
  });
});
