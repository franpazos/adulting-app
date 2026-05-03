/**
 * Smoke test for the DB layer end-to-end:
 *   - sqlite-wasm initializes (in-memory under jsdom)
 *   - migrations run idempotently
 *   - seed populates Cases A-E and the income/recurring fixtures
 *   - calculations module returns sensible numbers
 *
 * These tests deliberately exercise the real seed and the real schema
 * so a regression in either is caught immediately.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initDb, runMigrations, seedIfEmpty, settlementsRepo, debtsRepo } from "@/lib/db";
import { _resetDbForTests, selectScalar } from "@/lib/db/client";

// Note: scope-aware aggregations and category breakdown are tested in
// `src/lib/calculations/__tests__/aggregations.test.ts`. This file only
// covers DB bootstrap and seed correctness.

beforeEach(async () => {
  _resetDbForTests();
  // Under jsdom there is no OPFS, so this falls through to :memory:.
  await initDb();
  runMigrations();
});

afterEach(() => {
  _resetDbForTests();
});

describe("DB bootstrap", () => {
  it("creates all tables via migrations", () => {
    const tables = [
      "users",
      "accounts",
      "categories",
      "transactions",
      "transaction_allocations",
      "recurring_items",
      "debts",
      "debt_payments",
      "settlement_ledger",
      "monthly_snapshots",
      "sync_queue",
      "schema_migrations",
    ];
    for (const table of tables) {
      const count = selectScalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name = ?",
        [table],
      );
      expect(count, `table ${table}`).toBe(1);
    }
  });

  it("runMigrations is idempotent", () => {
    const first = runMigrations();
    const second = runMigrations();
    expect(first.current).toBeGreaterThanOrEqual(1);
    expect(second.applied).toBe(0);
    expect(second.current).toBe(first.current);
  });

  it("isSeeded is false on a fresh DB and true after seeding", () => {
    expect(selectScalar("SELECT COUNT(*) FROM users")).toBe(0);
    const wasSeeded = seedIfEmpty();
    expect(wasSeeded).toBe(true);
    expect(selectScalar("SELECT COUNT(*) FROM users")).toBe(2);
    // Calling again must be a no-op
    expect(seedIfEmpty()).toBe(false);
  });
});

describe("seed data", () => {
  beforeEach(() => {
    seedIfEmpty();
  });

  it("creates the three core accounts", () => {
    const accounts = selectScalar("SELECT COUNT(*) FROM accounts");
    expect(accounts).toBe(3);
  });

  it("creates two users (Fran and Sam)", () => {
    expect(selectScalar("SELECT COUNT(*) FROM users")).toBe(2);
  });

  it("creates default categories including a USD-using debt scenario", () => {
    expect(
      selectScalar("SELECT COUNT(*) FROM categories WHERE kind = 'EXPENSE'"),
    ).toBeGreaterThanOrEqual(5);
    const debts = debtsRepo.list();
    expect(debts.some((d) => d.currency_code === "USD")).toBe(true);
  });

  it("ledger reflects Cases A, D, and E settlement effects", () => {
    // Case A: Sam paid 100 shared from her account → Fran owes Sam 50
    // Case E: Fran paid 100 shared from his account, 70/30 → Sam owes Fran 30
    // Net Fran owes Sam = 50 - 30 = 20
    const franSamNet = settlementsRepo.netBalance("FRAN", "SAM");
    expect(franSamNet).toBeCloseTo(20, 5);

    // Case D: Sam personal expense from joint → Sam owes Household 40
    const samHouseholdNet = settlementsRepo.netBalance("SAM", "HOUSEHOLD");
    expect(samHouseholdNet).toBeCloseTo(40, 5);
  });

});
