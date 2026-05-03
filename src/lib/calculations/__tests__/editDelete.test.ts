/**
 * End-to-end tests for the Edit and Delete paths used by the
 * EditExpensePage. Both call into transactionsRepo.update / softDelete
 * followed by recomputeForTransaction — the settlement_ledger must end
 * up consistent with the new state.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initDb,
  runMigrations,
  seedIfEmpty,
  settlementsRepo,
  transactionsRepo,
  SEED_IDS,
} from "@/lib/db";
import { _resetDbForTests } from "@/lib/db/client";
import {
  expenseAllocator,
  recomputeForTransaction,
} from "@/lib/calculations";

beforeEach(async () => {
  _resetDbForTests();
  await initDb();
  runMigrations();
  seedIfEmpty();
});

afterEach(() => {
  _resetDbForTests();
});

function findCaseATx() {
  return transactionsRepo
    .listByMonth(new Date().toISOString().slice(0, 7))
    .find(
      (t) =>
        t.amount === 100 &&
        t.source_account_id === SEED_IDS.accounts.samPersonal,
    )!;
}

describe("edit transaction (transactionsRepo.update)", () => {
  it("changing amount and rerunning recompute updates settlement entry", () => {
    const tx = findCaseATx();
    expect(settlementsRepo.netBalance("FRAN", "SAM")).toBeCloseTo(20, 2);

    const newAmount = 60;
    const allocation = expenseAllocator({
      amount: newAmount,
      source: "SAM_PERSONAL",
      owner: "HOUSEHOLD",
      splitFranPercent: 50,
    });

    transactionsRepo.update(tx.id, {
      type: "EXPENSE",
      date: tx.date,
      amount: newAmount,
      currency_code: "EUR",
      source_account_id: SEED_IDS.accounts.samPersonal,
      allocations: allocation.allocations,
    });
    recomputeForTransaction(tx.id);

    // Case A previously contributed +50 to net Fran→Sam. New share: 30.
    // Net = 30 (Case A) - 30 (Case E) = 0
    expect(settlementsRepo.netBalance("FRAN", "SAM")).toBeCloseTo(0, 2);
  });

  it("changing the split changes the settlement direction & amount", () => {
    const tx = findCaseATx();

    const newAllocation = expenseAllocator({
      amount: 100,
      source: "SAM_PERSONAL",
      owner: "HOUSEHOLD",
      splitFranPercent: 80, // Fran's share is now 80, Sam covered 20 of his
    });

    transactionsRepo.update(tx.id, {
      type: "EXPENSE",
      date: tx.date,
      amount: 100,
      currency_code: "EUR",
      source_account_id: SEED_IDS.accounts.samPersonal,
      allocations: newAllocation.allocations,
    });
    recomputeForTransaction(tx.id);

    // 80/20 split → Fran's share is 80; Sam covered it from her account.
    // So Fran owes Sam 80 (was 50). Combined with Case E (Sam owes Fran 30),
    // net Fran→Sam = 80 − 30 = 50.
    expect(settlementsRepo.netBalance("FRAN", "SAM")).toBeCloseTo(50, 2);
  });

  it("changing the source account triggers a new settlement direction", () => {
    const tx = findCaseATx();

    // Same shared 100 at 50/50, but now paid from FRAN's account.
    const newAllocation = expenseAllocator({
      amount: 100,
      source: "FRAN_PERSONAL",
      owner: "HOUSEHOLD",
      splitFranPercent: 50,
    });

    transactionsRepo.update(tx.id, {
      type: "EXPENSE",
      date: tx.date,
      amount: 100,
      currency_code: "EUR",
      source_account_id: SEED_IDS.accounts.franPersonal,
      allocations: newAllocation.allocations,
    });
    recomputeForTransaction(tx.id);

    // Now Sam owes Fran 50 (instead of Fran owes Sam 50). Plus Case E
    // (Sam owes Fran 30). Net Fran→Sam = -80.
    expect(settlementsRepo.netBalance("FRAN", "SAM")).toBeCloseTo(-80, 2);
  });
});

describe("soft-delete transaction", () => {
  it("removes the settlement contribution after recompute", () => {
    const tx = findCaseATx();
    expect(settlementsRepo.netBalance("FRAN", "SAM")).toBeCloseTo(20, 2);

    transactionsRepo.softDelete(tx.id);
    recomputeForTransaction(tx.id);

    // Without Case A's 50, net Fran→Sam becomes -30 (only Case E remains).
    expect(settlementsRepo.netBalance("FRAN", "SAM")).toBeCloseTo(-30, 2);
  });

  it("getById still returns the row but `is_deleted` is true", () => {
    const tx = findCaseATx();
    transactionsRepo.softDelete(tx.id);
    const after = transactionsRepo.getById(tx.id);
    expect(after).not.toBeNull();
    expect(after!.is_deleted).toBe(true);
  });

  it("is excluded from listByMonth", () => {
    const tx = findCaseATx();
    const monthKey = new Date().toISOString().slice(0, 7);
    expect(transactionsRepo.listByMonth(monthKey).map((t) => t.id)).toContain(
      tx.id,
    );
    transactionsRepo.softDelete(tx.id);
    expect(transactionsRepo.listByMonth(monthKey).map((t) => t.id)).not.toContain(
      tx.id,
    );
  });
});

describe("recurring update + deactivate", () => {
  it("listing skips deactivated items by default", async () => {
    const { recurringRepo } = await import("@/lib/db");
    const before = recurringRepo.list(true).length;
    expect(before).toBeGreaterThan(0);
    const target = recurringRepo.list(true)[0]!;
    recurringRepo.deactivate(target.id);
    const after = recurringRepo.list(true);
    expect(after.find((r) => r.id === target.id)).toBeUndefined();
    // including inactive shows it again
    expect(recurringRepo.list(false).find((r) => r.id === target.id)).toBeDefined();
  });
});
