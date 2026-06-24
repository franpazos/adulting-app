/**
 * Repo-level tests for recurring lifecycle: deactivate/reactivate
 * round-trip. The richer paid/pending state is Level 2 territory; this
 * file covers only the surface added in Level 1 (the new reactivate()
 * method) so the next agent has a place to grow these tests.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initDb,
  runMigrations,
  seedIfEmpty,
  recurringRepo,
  SEED_IDS,
} from "@/lib/db";
import { _resetDbForTests } from "@/lib/db/client";

beforeEach(async () => {
  _resetDbForTests();
  await initDb();
  runMigrations();
  seedIfEmpty();
});

afterEach(() => {
  _resetDbForTests();
});

describe("recurringRepo.deactivate / reactivate", () => {
  function makeRecurring() {
    return recurringRepo.create({
      type: "EXPENSE",
      name: "Test rent",
      amount: 800,
      currency_code: "EUR",
      frequency: "MONTHLY",
      start_date: "2026-01-01",
      end_date: null,
      category_id: null,
      source_account_id: SEED_IDS.accounts.joint,
      owner_type: "HOUSEHOLD",
      default_shared_split_percent: 50,
      is_active: true,
      auto_include_in_projection: true,
      auto_generate_transaction: false,
    });
  }

  it("deactivate hides from the default list", () => {
    const r = makeRecurring();
    expect(recurringRepo.list().some((x) => x.id === r.id)).toBe(true);
    recurringRepo.deactivate(r.id);
    expect(recurringRepo.list().some((x) => x.id === r.id)).toBe(false);
    expect(recurringRepo.list(false).some((x) => x.id === r.id)).toBe(true);
  });

  it("reactivate restores it to the default list", () => {
    const r = makeRecurring();
    recurringRepo.deactivate(r.id);
    recurringRepo.reactivate(r.id);
    expect(recurringRepo.list().some((x) => x.id === r.id)).toBe(true);
    expect(recurringRepo.getById(r.id)?.is_active).toBe(true);
  });

  it("reactivate is idempotent on an already-active recurring", () => {
    const r = makeRecurring();
    recurringRepo.reactivate(r.id);
    expect(recurringRepo.getById(r.id)?.is_active).toBe(true);
  });
});
