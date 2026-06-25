/**
 * Repo-level tests for recurring lifecycle and the paid/pending queries
 * added in Level 2. isPaidForMonth + paidStateForMonth read across both
 * the recurring and the transactions tables; the soft-delete case is the
 * most interesting because the transaction row still exists with
 * recurring_id set, but the recurring must flip back to unpaid.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initDb,
  runMigrations,
  seedIfEmpty,
  recurringRepo,
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

describe("recurringRepo.isPaidForMonth / paidStateForMonth", () => {
  function makeRecurring(name = "Test rent") {
    return recurringRepo.create({
      type: "EXPENSE",
      name,
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

  function makeTx(recurringId: string, date: string, amount = 800) {
    return transactionsRepo.create({
      type: "EXPENSE",
      date,
      amount,
      currency_code: "EUR",
      source_account_id: SEED_IDS.accounts.joint,
      origin: "MANUAL",
      sheet_sync_status: "PENDING",
      recurring_id: recurringId,
      allocations: [
        { owner_type: "HOUSEHOLD", share_percent: 100, share_amount: amount },
      ],
    });
  }

  it("returns false when no transaction has linked to the recurring in that month", () => {
    const r = makeRecurring();
    expect(recurringRepo.isPaidForMonth(r.id, "2026-06")).toBe(false);
  });

  it("returns true once a transaction with that month_key links to it", () => {
    const r = makeRecurring();
    makeTx(r.id, "2026-06-15");
    expect(recurringRepo.isPaidForMonth(r.id, "2026-06")).toBe(true);
    // Other months stay unpaid.
    expect(recurringRepo.isPaidForMonth(r.id, "2026-05")).toBe(false);
    expect(recurringRepo.isPaidForMonth(r.id, "2026-07")).toBe(false);
  });

  it("flips back to unpaid when the only transaction is soft-deleted", () => {
    const r = makeRecurring();
    const tx = makeTx(r.id, "2026-06-15");
    expect(recurringRepo.isPaidForMonth(r.id, "2026-06")).toBe(true);
    transactionsRepo.softDelete(tx.id);
    expect(recurringRepo.isPaidForMonth(r.id, "2026-06")).toBe(false);
  });

  it("paidStateForMonth aggregates count / total / lastDate per recurring", () => {
    const rent = makeRecurring("Rent");
    const gym = makeRecurring("Gym");
    makeTx(rent.id, "2026-06-03", 800);
    makeTx(rent.id, "2026-06-20", 50); // a second payment same month
    makeTx(gym.id, "2026-06-01", 40);
    // Unrelated month — shouldn't show up.
    makeTx(rent.id, "2026-05-01", 800);

    const state = recurringRepo.paidStateForMonth("2026-06");
    const rentState = state.get(rent.id);
    expect(rentState).toBeDefined();
    expect(rentState?.count).toBe(2);
    expect(rentState?.totalAmount).toBe(850);
    expect(rentState?.lastDate).toBe("2026-06-20");

    const gymState = state.get(gym.id);
    expect(gymState?.count).toBe(1);
    expect(gymState?.totalAmount).toBe(40);

    // No silent inclusion of unpaid recurrings.
    expect(state.has("non-existent-id")).toBe(false);
  });

  it("paidStateForMonth ignores transactions without recurring_id", () => {
    const r = makeRecurring();
    // Manual expense, no link to the recurring.
    transactionsRepo.create({
      type: "EXPENSE",
      date: "2026-06-10",
      amount: 800,
      currency_code: "EUR",
      source_account_id: SEED_IDS.accounts.joint,
      origin: "MANUAL",
      sheet_sync_status: "PENDING",
      allocations: [
        { owner_type: "HOUSEHOLD", share_percent: 100, share_amount: 800 },
      ],
    });
    expect(recurringRepo.isPaidForMonth(r.id, "2026-06")).toBe(false);
    expect(recurringRepo.paidStateForMonth("2026-06").has(r.id)).toBe(false);
  });
});
