/**
 * Phase 9a tests:
 *   - per-entity row mappers preserve column order from RAW_TABS
 *   - boolean fields land as 0/1 (not "true"/"false")
 *   - sync_queue helpers (enqueue, listPending, markAllSynced)
 *   - column letter math
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initDb,
  runMigrations,
  seedIfEmpty,
  transactionsRepo,
  SEED_IDS,
} from "@/lib/db";
import { _resetDbForTests, selectScalar } from "@/lib/db/client";
import { _mappers, buildSnapshot } from "@/lib/sync/writers";
import {
  enqueueChange,
  listPending,
  markAllSynced,
  markFailed,
} from "@/lib/sync/queue";
import { columnLetter, RAW_TABS } from "@/lib/sync/tabs";
import type {
  Account,
  Category,
  Debt,
  RecurringItem,
  SettlementLedgerEntry,
  Transaction,
  TransactionAllocation,
  User,
} from "@/lib/db/types";

beforeEach(async () => {
  _resetDbForTests();
  await initDb();
  runMigrations();
  seedIfEmpty();
});

afterEach(() => {
  _resetDbForTests();
});

describe("RAW_TABS", () => {
  it("declares 10 tabs with non-empty headers and a raw_ prefix", () => {
    expect(RAW_TABS).toHaveLength(10);
    for (const t of RAW_TABS) {
      expect(t.title.startsWith("raw_")).toBe(true);
      expect(t.headers.length).toBeGreaterThan(0);
    }
  });

  it("has unique titles", () => {
    const titles = RAW_TABS.map((t) => t.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("column letter math", () => {
  it("maps 1→A, 26→Z, 27→AA, 52→AZ, 53→BA", () => {
    expect(columnLetter(1)).toBe("A");
    expect(columnLetter(26)).toBe("Z");
    expect(columnLetter(27)).toBe("AA");
    expect(columnLetter(52)).toBe("AZ");
    expect(columnLetter(53)).toBe("BA");
  });
});

describe("entity → row mappers", () => {
  it("user mapper coerces is_active to 0/1", () => {
    const u: User = {
      id: "u1",
      name: "Fran",
      is_active: true,
      created_at: "2026-05-04T00:00:00Z",
      updated_at: "2026-05-04T00:00:00Z",
    };
    const row = _mappers.userToRow(u);
    expect(row).toEqual([
      "u1",
      "Fran",
      1,
      "2026-05-04T00:00:00Z",
      "2026-05-04T00:00:00Z",
    ]);
  });

  it("transaction mapper preserves null FX columns when not set", () => {
    const t: Transaction = {
      id: "t1",
      type: "EXPENSE",
      date: "2026-05-04",
      month_key: "2026-05",
      amount: 100,
      currency_code: "EUR",
      description: null,
      notes: null,
      category_id: null,
      source_account_id: "acct-fran",
      created_by_user_id: null,
      merchant: null,
      is_deleted: false,
      origin: "MANUAL",
      sheet_sync_status: "PENDING",
      sheet_row_ref: null,
      exchange_rate: null,
      amount_in_account_currency: null,
      amount_in_debt_currency: null,
      created_at: "2026-05-04T00:00:00Z",
      updated_at: "2026-05-04T00:00:00Z",
      recurring_id: null,
    };
    const row = _mappers.transactionToRow(t);
    expect(row[12]).toBe(0); // is_deleted
    expect(row[14]).toBe(null); // exchange_rate
  });

  it("each mapper produces exactly N cells matching its tab header count", () => {
    const headerCountByTitle: Record<string, number> = {};
    for (const t of RAW_TABS) headerCountByTitle[t.title] = t.headers.length;

    const acc: Account = {
      id: "a1",
      name: "Joint",
      type: "JOINT",
      owner_user_id: null,
      currency_code: "EUR",
      initial_balance: 0,
      is_archived: false,
      created_at: "x",
      updated_at: "x",
    };
    expect(_mappers.accountToRow(acc).length).toBe(
      headerCountByTitle.raw_accounts,
    );

    const cat: Category = {
      id: "c1",
      name: "X",
      kind: "EXPENSE",
      parent_id: null,
      is_default: false,
      sort_order: 0,
      color: null,
      is_active: true,
      created_at: "x",
      updated_at: "x",
    };
    expect(_mappers.categoryToRow(cat).length).toBe(
      headerCountByTitle.raw_categories,
    );

    const alloc: TransactionAllocation = {
      id: "al1",
      transaction_id: "t1",
      owner_type: "FRAN",
      share_percent: 100,
      share_amount: 50,
      settlement_effect_type: null,
      created_at: "x",
      updated_at: "x",
    };
    expect(_mappers.allocationToRow(alloc).length).toBe(
      headerCountByTitle.raw_transaction_allocations,
    );

    const rec: RecurringItem = {
      id: "r1",
      type: "EXPENSE",
      name: "Rent",
      amount: 950,
      currency_code: "EUR",
      frequency: "MONTHLY",
      start_date: "2025-01-01",
      end_date: null,
      category_id: null,
      source_account_id: null,
      owner_type: "HOUSEHOLD",
      default_shared_split_percent: 50,
      is_active: true,
      auto_include_in_projection: true,
      auto_generate_transaction: false,
      debt_id: null,
      created_at: "x",
      updated_at: "x",
    };
    expect(_mappers.recurringToRow(rec).length).toBe(
      headerCountByTitle.raw_recurring_items,
    );

    const debt: Debt = {
      id: "d1",
      name: "Card",
      owner_type: "HOUSEHOLD",
      original_amount: 600,
      current_balance: 350,
      currency_code: "EUR",
      interest_rate: null,
      minimum_payment: 50,
      payment_day: 5,
      strategy_priority: 1,
      notes: null,
      is_active: true,
      created_at: "x",
      updated_at: "x",
    };
    expect(_mappers.debtToRow(debt).length).toBe(headerCountByTitle.raw_debts);

    const settle: SettlementLedgerEntry = {
      id: "s1",
      date: "2026-05-04",
      source_transaction_id: "t1",
      from_party: "FRAN",
      to_party: "SAM",
      amount: 50,
      reason: "shared_expense_personal_source",
      notes: null,
      created_at: "x",
      updated_at: "x",
    };
    expect(_mappers.settlementToRow(settle).length).toBe(
      headerCountByTitle.raw_settlement_ledger,
    );
  });
});

describe("buildSnapshot from seed", () => {
  it("produces non-empty rows for users, accounts, categories, transactions, debts", () => {
    const snap = buildSnapshot();
    expect(snap.users.length).toBe(2); // Fran + Sam
    expect(snap.accounts.length).toBe(3);
    expect(snap.categories.length).toBeGreaterThanOrEqual(5);
    expect(snap.transactions.length).toBeGreaterThan(0);
    expect(snap.allocations.length).toBeGreaterThan(0);
    expect(snap.debts.length).toBe(3);
  });

  it("includes soft-deleted transactions so deletes propagate", () => {
    const tx = transactionsRepo.listByMonth(monthKey()).find(
      (t) =>
        t.amount === 100 &&
        t.source_account_id === SEED_IDS.accounts.samPersonal,
    )!;
    transactionsRepo.softDelete(tx.id);
    const snap = buildSnapshot();
    const ids = snap.transactions.map((row) => row[0] as string);
    expect(ids).toContain(tx.id);
  });
});

describe("sync_queue helpers", () => {
  it("seeds + every create enqueue PENDING items, listPending returns them", () => {
    // Seed runs in beforeEach. Every seed insert enqueues.
    const pending = listPending();
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((p) => p.status === "PENDING")).toBe(true);
  });

  it("markAllSynced flips status to SYNCED", () => {
    const ids = listPending().map((p) => p.id);
    markAllSynced(ids);
    expect(listPending()).toEqual([]);
    const synced = selectScalar(
      "SELECT COUNT(*) FROM sync_queue WHERE status = 'SYNCED'",
    );
    expect(synced).toBe(ids.length);
  });

  it("markFailed records the error and bumps attempt_count", () => {
    enqueueChange("transaction", "t-fake", "CREATE");
    const item = listPending().find((p) => p.entity_id === "t-fake")!;
    markFailed(item.id, "boom");
    const after = selectScalar(
      "SELECT attempt_count FROM sync_queue WHERE id = ?",
      [item.id],
    );
    expect(after).toBe(1);
  });
});

function monthKey() {
  return new Date().toISOString().slice(0, 7);
}
