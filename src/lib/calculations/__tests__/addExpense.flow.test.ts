/**
 * End-to-end save path: simulate what AddExpense does on Save.
 *  1. expenseAllocator computes allocations + settlements
 *  2. transactionsRepo.create writes the transaction + allocation rows
 *  3. recomputeForTransaction writes the settlement_ledger entries
 * The settlement we write must match the allocator's prediction, and
 * net balances must shift accordingly.
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

const today = () => new Date().toISOString().slice(0, 10);

describe("AddExpense save path", () => {
  it("creating Sam→shared 80€ shifts Fran↔Sam net balance by +40", () => {
    // Net Fran owes Sam before:
    //   seed Case A → Fran owes Sam 50; Case E → Sam owes Fran 30 → net 20.
    const before = settlementsRepo.netBalance("FRAN", "SAM");
    expect(before).toBeCloseTo(20, 2);

    const result = expenseAllocator({
      amount: 80,
      source: "SAM_PERSONAL",
      owner: "HOUSEHOLD",
      splitFranPercent: 50,
    });

    const tx = transactionsRepo.create({
      type: "EXPENSE",
      date: today(),
      amount: 80,
      currency_code: "EUR",
      source_account_id: SEED_IDS.accounts.samPersonal,
      origin: "MANUAL",
      sheet_sync_status: "PENDING",
      allocations: result.allocations,
    });
    recomputeForTransaction(tx.id);

    // Sam covered 40 of Fran's share → Fran owes Sam 40 more → net 60.
    const after = settlementsRepo.netBalance("FRAN", "SAM");
    expect(after).toBeCloseTo(60, 2);
  });

  it("creating Sam→personal expense from JOINT for 25€ updates Sam↔Household by +25", () => {
    // Seed has Case D: Sam owes Household 40
    const before = settlementsRepo.netBalance("SAM", "HOUSEHOLD");
    expect(before).toBeCloseTo(40, 2);

    const result = expenseAllocator({
      amount: 25,
      source: "JOINT",
      owner: "SAM",
    });
    const tx = transactionsRepo.create({
      type: "EXPENSE",
      date: today(),
      amount: 25,
      currency_code: "EUR",
      source_account_id: SEED_IDS.accounts.joint,
      origin: "MANUAL",
      sheet_sync_status: "PENDING",
      allocations: result.allocations,
    });
    recomputeForTransaction(tx.id);

    expect(settlementsRepo.netBalance("SAM", "HOUSEHOLD")).toBeCloseTo(65, 2);
  });

  it("personal-source-personal-owner (Case B) does not change any balance", () => {
    const beforeFs = settlementsRepo.netBalance("FRAN", "SAM");
    const beforeSh = settlementsRepo.netBalance("SAM", "HOUSEHOLD");

    const result = expenseAllocator({
      amount: 12,
      source: "FRAN_PERSONAL",
      owner: "FRAN",
    });
    const tx = transactionsRepo.create({
      type: "EXPENSE",
      date: today(),
      amount: 12,
      currency_code: "EUR",
      source_account_id: SEED_IDS.accounts.franPersonal,
      origin: "MANUAL",
      sheet_sync_status: "PENDING",
      allocations: result.allocations,
    });
    recomputeForTransaction(tx.id);

    expect(settlementsRepo.netBalance("FRAN", "SAM")).toBeCloseTo(beforeFs, 2);
    expect(settlementsRepo.netBalance("SAM", "HOUSEHOLD")).toBeCloseTo(
      beforeSh,
      2,
    );
    // The allocation row must still exist
    expect(transactionsRepo.allocationsFor(tx.id)).toHaveLength(1);
  });
});
