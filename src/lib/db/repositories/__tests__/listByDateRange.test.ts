/**
 * Tests for transactionsRepo.listByDateRange — the cross-month date-range
 * query behind the Transactions page date-range filter. Unlike listByMonth
 * it ignores month_key and spans whatever months the [from, to] window
 * covers, with either bound optional (open-ended).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initDb,
  runMigrations,
  seedIfEmpty,
  transactionsRepo,
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

/** Create a minimal household expense on a given date; returns its id. */
function makeTx(date: string, description: string): string {
  const tx = transactionsRepo.create({
    type: "EXPENSE",
    date,
    amount: 10,
    currency_code: "EUR",
    source_account_id: SEED_IDS.accounts.samPersonal,
    description,
    allocations: [
      { owner_type: "HOUSEHOLD", share_percent: 100, share_amount: 10 },
    ],
  });
  return tx.id;
}

describe("transactionsRepo.listByDateRange", () => {
  const TAG = "range-test";

  beforeEach(() => {
    // Three transactions across three different months.
    makeTx("2026-01-10", `${TAG} jan`);
    makeTx("2026-02-20", `${TAG} feb`);
    makeTx("2026-03-05", `${TAG} mar`);
  });

  function tagged(from: string | null, to: string | null): string[] {
    return transactionsRepo
      .listByDateRange(from, to)
      .filter((t) => t.description?.startsWith(TAG))
      .map((t) => t.description!.replace(`${TAG} `, ""));
  }

  it("includes rows across months within the inclusive window", () => {
    // Jan 10 → Feb 20 spans two months; both endpoints inclusive.
    expect(tagged("2026-01-10", "2026-02-20")).toEqual(["feb", "jan"]);
  });

  it("respects an open-ended lower bound (to only)", () => {
    expect(tagged(null, "2026-02-01")).toEqual(["jan"]);
  });

  it("respects an open-ended upper bound (from only)", () => {
    expect(tagged("2026-02-25", null)).toEqual(["mar"]);
  });

  it("returns rows newest-first (date DESC)", () => {
    expect(tagged("2026-01-01", "2026-12-31")).toEqual(["mar", "feb", "jan"]);
  });

  it("excludes soft-deleted rows", () => {
    const janId = transactionsRepo
      .listByDateRange("2026-01-01", "2026-01-31")
      .find((t) => t.description === `${TAG} jan`)!.id;
    transactionsRepo.softDelete(janId);
    expect(tagged("2026-01-01", "2026-01-31")).toEqual([]);
  });
});
