/**
 * Phase 9b tests:
 *   - readers parse a Sheets row back into the same entity that writers emitted
 *     (round-trip writer → reader).
 *   - applyTab reconciles correctly: INSERT new ids, UPDATE when remote is
 *     newer, SKIP when local is same age or newer.
 *   - Soft-deleted remote rows propagate as soft-deletes locally.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initDb,
  runMigrations,
  seedIfEmpty,
  SEED_IDS,
  transactionsRepo,
} from "@/lib/db";
import { _resetDbForTests, selectAll, selectOne } from "@/lib/db/client";
import { _mappers, buildSnapshot } from "@/lib/sync/writers";
import {
  parseAccount,
  parseAllocation,
  parseCategory,
  parseDebt,
  parseDebtPayment,
  parseRecurring,
  parseSettlement,
  parseTransaction,
  parseUser,
} from "@/lib/sync/readers";
import { _internal as _pull } from "@/lib/sync/pull";
import type { SheetRow } from "@/lib/google/sheets-api";
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

describe("readers round-trip with writers", () => {
  it("preserves every entity through writer → reader", () => {
    const snap = buildSnapshot();

    // Pick the first row of each tab and round-trip it.
    const users = snap.users.map((r) => parseUser(r as SheetRow));
    expect(users.length).toBe(2);
    expect(users[0].id).toBeTruthy();
    expect(typeof users[0].is_active).toBe("boolean");

    const accs = snap.accounts.map((r) => parseAccount(r as SheetRow));
    expect(accs.find((a) => a.id === SEED_IDS.accounts.joint)).toBeTruthy();

    const cats = snap.categories.map((r) => parseCategory(r as SheetRow));
    expect(cats.length).toBeGreaterThan(0);

    const txs = snap.transactions.map((r) => parseTransaction(r as SheetRow));
    expect(txs.length).toBeGreaterThan(0);
    // FX columns survive null round-trip.
    const eurTx = txs.find((t) => t.exchange_rate === null);
    expect(eurTx).toBeTruthy();

    const allocs = snap.allocations.map((r) => parseAllocation(r as SheetRow));
    expect(allocs.length).toBeGreaterThan(0);

    const recs = snap.recurring.map((r) => parseRecurring(r as SheetRow));
    expect(recs.length).toBeGreaterThan(0);

    const debts = snap.debts.map((r) => parseDebt(r as SheetRow));
    expect(debts.length).toBe(3);

    const pays = snap.debt_payments.map((r) => parseDebtPayment(r as SheetRow));
    expect(Array.isArray(pays)).toBe(true);

    const settles = snap.settlements.map((r) =>
      parseSettlement(r as SheetRow),
    );
    expect(settles.length).toBeGreaterThan(0);
  });

  it("user mapper round-trip preserves boolean", () => {
    const row = _mappers.userToRow({
      id: "u1",
      name: "Test",
      is_active: true,
      created_at: "2026-05-04T00:00:00Z",
      updated_at: "2026-05-04T00:00:00Z",
    });
    const parsed = parseUser(row as SheetRow);
    expect(parsed.is_active).toBe(true);
    expect(parsed.name).toBe("Test");
  });

  it("transaction mapper round-trip preserves FX columns when present", () => {
    const row = _mappers.transactionToRow({
      id: "t1",
      type: "DEBT_PAYMENT",
      date: "2026-05-04",
      month_key: "2026-05",
      amount: 100,
      currency_code: "EUR",
      description: "FX payment",
      notes: null,
      category_id: null,
      source_account_id: SEED_IDS.accounts.franPersonal,
      created_by_user_id: SEED_IDS.users.fran,
      merchant: null,
      is_deleted: false,
      origin: "MANUAL",
      sheet_sync_status: "PENDING",
      sheet_row_ref: null,
      exchange_rate: 1.08,
      amount_in_account_currency: 100,
      amount_in_debt_currency: 108,
      created_at: "2026-05-04T00:00:00Z",
      updated_at: "2026-05-04T00:00:00Z",
    });
    const parsed = parseTransaction(row as SheetRow);
    expect(parsed.exchange_rate).toBe(1.08);
    expect(parsed.amount_in_debt_currency).toBe(108);
    expect(parsed.is_deleted).toBe(false);
  });

  it("readers reject rows missing the primary key", () => {
    expect(() => parseUser(["", "Name", 1, "x", "x"] as SheetRow)).toThrow(
      /user.id/,
    );
  });
});

describe("applyTab reconciler", () => {
  function localTx(id: string): Transaction | null {
    return selectOne<Transaction>(
      "SELECT * FROM transactions WHERE id = ?",
      [id],
    );
  }

  it("INSERTs a brand-new remote tx", () => {
    const remoteTx: Transaction = {
      id: "tx-from-other-device",
      type: "EXPENSE",
      date: "2026-06-01",
      month_key: "2026-06",
      amount: 42,
      currency_code: "EUR",
      description: "Coffee",
      notes: null,
      category_id: null,
      source_account_id: SEED_IDS.accounts.franPersonal,
      created_by_user_id: SEED_IDS.users.fran,
      merchant: null,
      is_deleted: false,
      origin: "MANUAL",
      sheet_sync_status: "SYNCED",
      sheet_row_ref: null,
      exchange_rate: null,
      amount_in_account_currency: null,
      amount_in_debt_currency: null,
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
    };
    const row = _mappers.transactionToRow(remoteTx) as SheetRow;
    const stats = _pull.applyTab("raw_transactions", [row]);
    expect(stats.inserted).toBe(1);
    expect(stats.updated).toBe(0);
    expect(localTx("tx-from-other-device")?.amount).toBe(42);
  });

  it("UPDATEs when remote.updated_at is newer than local", () => {
    // Pick an existing tx, push a "newer" version with a tweaked amount.
    const local = selectAll<Transaction>(
      "SELECT * FROM transactions ORDER BY created_at LIMIT 1",
    )[0];
    const remote: Transaction = {
      ...local,
      amount: local.amount + 999,
      description: "edited remotely",
      updated_at: "2099-01-01T00:00:00Z",
    };
    const row = _mappers.transactionToRow(remote) as SheetRow;
    const stats = _pull.applyTab("raw_transactions", [row]);
    expect(stats.inserted).toBe(0);
    expect(stats.updated).toBe(1);
    const after = localTx(local.id)!;
    expect(after.amount).toBe(local.amount + 999);
    expect(after.description).toBe("edited remotely");
  });

  it("SKIPs when local is newer than remote (last-writer-wins)", () => {
    const local = selectAll<Transaction>(
      "SELECT * FROM transactions ORDER BY created_at LIMIT 1",
    )[0];
    const remote: Transaction = {
      ...local,
      amount: 0.01,
      updated_at: "2000-01-01T00:00:00Z",
    };
    const row = _mappers.transactionToRow(remote) as SheetRow;
    const stats = _pull.applyTab("raw_transactions", [row]);
    expect(stats.inserted).toBe(0);
    expect(stats.updated).toBe(0);
    expect(stats.skipped).toBe(1);
    expect(localTx(local.id)?.amount).toBe(local.amount);
  });

  it("propagates remote soft-deletes (is_deleted = 1) on next pull", () => {
    const monthKey = new Date().toISOString().slice(0, 7);
    const local = transactionsRepo.listByMonth(monthKey)[0];
    expect(local).toBeTruthy();
    const remote: Transaction = {
      ...selectOne<Transaction>("SELECT * FROM transactions WHERE id = ?", [
        local.id,
      ])!,
      is_deleted: true,
      updated_at: "2099-01-01T00:00:00Z",
    };
    const row = _mappers.transactionToRow(remote) as SheetRow;
    const stats = _pull.applyTab("raw_transactions", [row]);
    expect(stats.updated).toBe(1);
    const after = localTx(local.id)!;
    expect(after.is_deleted).toBeTruthy();
  });

  it("malformed rows are skipped without aborting the run", () => {
    // First row is invalid (missing id), second is a valid new tx.
    const valid: Transaction = {
      id: "tx-valid",
      type: "EXPENSE",
      date: "2026-06-02",
      month_key: "2026-06",
      amount: 10,
      currency_code: "EUR",
      description: null,
      notes: null,
      category_id: null,
      source_account_id: SEED_IDS.accounts.franPersonal,
      created_by_user_id: null,
      merchant: null,
      is_deleted: false,
      origin: "MANUAL",
      sheet_sync_status: "SYNCED",
      sheet_row_ref: null,
      exchange_rate: null,
      amount_in_account_currency: null,
      amount_in_debt_currency: null,
      created_at: "2026-06-02T00:00:00Z",
      updated_at: "2026-06-02T00:00:00Z",
    };
    const bad: SheetRow = ["", "EXPENSE", "2026-06-02"];
    const good = _mappers.transactionToRow(valid) as SheetRow;
    const stats = _pull.applyTab("raw_transactions", [bad, good]);
    expect(stats.inserted).toBe(1);
    expect(localTx("tx-valid")?.amount).toBe(10);
  });

  it("loadLocalAges returns one entry per local row", () => {
    const ages = _pull.loadLocalAges("transactions");
    const dbCount = selectAll<{ c: number }>(
      "SELECT COUNT(*) AS c FROM transactions",
    )[0].c;
    expect(ages.size).toBe(dbCount);
  });
});
