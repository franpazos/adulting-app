/**
 * Integration tests for the DB-backed settlements engine: create, edit
 * (changes amount), delete — each must produce a coherent settlement
 * ledger after `recomputeForTransaction(txId)` runs.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initDb,
  runMigrations,
  seedIfEmpty,
  settlementsRepo,
  transactionsRepo,
} from "@/lib/db";
import { _resetDbForTests, exec } from "@/lib/db/client";
import { recomputeForTransaction } from "@/lib/calculations/settlements";
import { SEED_IDS } from "@/lib/db/seed";

beforeEach(async () => {
  _resetDbForTests();
  await initDb();
  runMigrations();
  seedIfEmpty();
});

afterEach(() => {
  _resetDbForTests();
});

describe("settlementsEngine.recomputeForTransaction", () => {
  it("re-derives Case A settlement when the seed entry is wiped and recomputed", () => {
    // Find the seed Case A transaction (Sam pays 100 from her account, shared)
    const txns = transactionsRepo.listByMonth(currentMonth());
    const caseA = txns.find(
      (t) =>
        t.amount === 100 &&
        t.source_account_id === SEED_IDS.accounts.samPersonal,
    );
    expect(caseA, "Case A seed tx must exist").toBeDefined();

    // Wipe its settlements manually
    exec("DELETE FROM settlement_ledger WHERE source_transaction_id = ?", [
      caseA!.id,
    ]);
    expect(settlementsRepo.forSourceTransaction(caseA!.id)).toEqual([]);

    // Recompute and assert the right entry comes back
    recomputeForTransaction(caseA!.id);
    const ledger = settlementsRepo.forSourceTransaction(caseA!.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      from_party: "FRAN",
      to_party: "SAM",
      amount: 50,
    });
  });

  it("editing the amount adjusts the settlement on recompute", () => {
    const tx = transactionsRepo.listByMonth(currentMonth()).find(
      (t) =>
        t.amount === 100 &&
        t.source_account_id === SEED_IDS.accounts.samPersonal,
    )!;

    // Simulate an edit: change the tx amount and the per-allocation amounts
    exec(
      "UPDATE transactions SET amount = ? WHERE id = ?",
      [200, tx.id],
    );
    exec(
      "UPDATE transaction_allocations SET share_amount = ? WHERE transaction_id = ?",
      [100, tx.id],
    );

    recomputeForTransaction(tx.id);

    const ledger = settlementsRepo.forSourceTransaction(tx.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.amount).toBe(100); // half of 200
  });

  it("deleting a transaction (soft-delete) clears its settlements", () => {
    const tx = transactionsRepo.listByMonth(currentMonth()).find(
      (t) =>
        t.amount === 100 &&
        t.source_account_id === SEED_IDS.accounts.samPersonal,
    )!;

    exec("UPDATE transactions SET is_deleted = 1 WHERE id = ?", [tx.id]);
    recomputeForTransaction(tx.id);

    expect(settlementsRepo.forSourceTransaction(tx.id)).toEqual([]);
  });

  it("net Fran↔Sam balance still equals 20 after a full recompute of all seed txns", () => {
    const before = settlementsRepo.netBalance("FRAN", "SAM");
    expect(before).toBeCloseTo(20, 5);

    // Wipe and recompute every seed tx
    exec("DELETE FROM settlement_ledger");
    const all = transactionsRepo.listByMonth(currentMonth());
    for (const tx of all) recomputeForTransaction(tx.id);

    const after = settlementsRepo.netBalance("FRAN", "SAM");
    expect(after).toBeCloseTo(20, 5);
  });

  it("recompute is idempotent when called twice in a row", () => {
    const tx = transactionsRepo.listByMonth(currentMonth()).find(
      (t) =>
        t.amount === 100 &&
        t.source_account_id === SEED_IDS.accounts.samPersonal,
    )!;

    recomputeForTransaction(tx.id);
    const first = settlementsRepo.forSourceTransaction(tx.id);
    recomputeForTransaction(tx.id);
    const second = settlementsRepo.forSourceTransaction(tx.id);

    expect(second).toHaveLength(first.length);
    expect(second[0]?.amount).toBe(first[0]?.amount);
    expect(second[0]?.from_party).toBe(first[0]?.from_party);
  });
});

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
