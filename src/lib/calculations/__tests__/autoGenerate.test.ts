/**
 * Auto-generation tests for Level 3 of the recurring rollout.
 *
 * Covers the generator's contract (idempotent, current month only,
 * type=EXPENSE only, skips when tx already exists, respects is_active)
 * plus the aggregations companion: the NOT-EXISTS clause in
 * `recurringForScope` must prevent double-counting once a recurring is
 * materialized.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initDb,
  runMigrations,
  seedIfEmpty,
  debtsRepo,
  recurringRepo,
  transactionsRepo,
  SEED_IDS,
} from "@/lib/db";
import { _resetDbForTests } from "@/lib/db/client";
import { autoGenerateForCurrentMonth } from "../autoGenerate";
import { monthlySummary } from "../aggregations";
import { currentMonthKey } from "@/lib/date/month";

beforeEach(async () => {
  _resetDbForTests();
  await initDb();
  runMigrations();
  seedIfEmpty();
});

afterEach(() => {
  _resetDbForTests();
});

function makeAutoGenRecurring(overrides: Partial<{
  type: "EXPENSE" | "INCOME" | "DEBT_PAYMENT";
  amount: number;
  is_active: boolean;
  auto_generate_transaction: boolean;
  source_account_id: string | null;
  owner_type: "FRAN" | "SAM" | "HOUSEHOLD";
  debt_id: string | null;
  currency_code: string;
}> = {}) {
  return recurringRepo.create({
    type: overrides.type ?? "EXPENSE",
    name: "Test rent",
    amount: overrides.amount ?? 1200,
    currency_code: overrides.currency_code ?? "EUR",
    frequency: "MONTHLY",
    start_date: "2026-01-01",
    end_date: null,
    category_id: null,
    source_account_id:
      overrides.source_account_id === undefined
        ? SEED_IDS.accounts.joint
        : overrides.source_account_id,
    owner_type: overrides.owner_type ?? "HOUSEHOLD",
    default_shared_split_percent: 50,
    is_active: overrides.is_active ?? true,
    auto_include_in_projection: true,
    auto_generate_transaction: overrides.auto_generate_transaction ?? true,
    debt_id: overrides.debt_id ?? null,
  });
}

describe("autoGenerateForCurrentMonth", () => {
  it("materializes a tx for each active EXPENSE recurring with auto_generate=1", () => {
    const r = makeAutoGenRecurring();
    const generated = autoGenerateForCurrentMonth();
    expect(generated).toEqual([r.id]);
    // The recurring should now show as paid this month.
    expect(
      recurringRepo.isPaidForMonth(r.id, currentMonthKey()),
    ).toBe(true);
  });

  it("is idempotent — running twice produces nothing the second time", () => {
    makeAutoGenRecurring();
    const first = autoGenerateForCurrentMonth();
    const second = autoGenerateForCurrentMonth();
    expect(first.length).toBe(1);
    expect(second.length).toBe(0);
  });

  it("skips when a tx for the month already exists, even if soft-deleted", () => {
    const r = makeAutoGenRecurring();
    // Manually create a tx (e.g. user did quick-fill this month), then
    // soft-delete it. Generator must still respect the user's intent —
    // they explicitly removed it.
    const tx = transactionsRepo.create({
      type: "EXPENSE",
      date: `${currentMonthKey()}-15`,
      amount: 1200,
      currency_code: "EUR",
      source_account_id: SEED_IDS.accounts.joint,
      origin: "MANUAL",
      sheet_sync_status: "PENDING",
      recurring_id: r.id,
      allocations: [
        { owner_type: "HOUSEHOLD", share_percent: 100, share_amount: 1200 },
      ],
    });
    transactionsRepo.softDelete(tx.id);

    const generated = autoGenerateForCurrentMonth();
    expect(generated).toEqual([]);
  });

  it("skips archived recurrings", () => {
    makeAutoGenRecurring({ is_active: false });
    const generated = autoGenerateForCurrentMonth();
    expect(generated).toEqual([]);
  });

  it("skips items with auto_generate_transaction=0", () => {
    makeAutoGenRecurring({ auto_generate_transaction: false });
    const generated = autoGenerateForCurrentMonth();
    expect(generated).toEqual([]);
  });

  it("generates for INCOME type (Level 4)", () => {
    const income = makeAutoGenRecurring({
      type: "INCOME",
      owner_type: "FRAN",
      source_account_id: SEED_IDS.accounts.franPersonal,
    });
    const generated = autoGenerateForCurrentMonth();
    expect(generated).toEqual([income.id]);
    expect(recurringRepo.isPaidForMonth(income.id, currentMonthKey())).toBe(true);
  });

  it("skips DEBT_PAYMENT without a debt_id (legacy/unlinked)", () => {
    const debt = makeAutoGenRecurring({ type: "DEBT_PAYMENT" });
    const generated = autoGenerateForCurrentMonth();
    expect(generated).toEqual([]);
    expect(recurringRepo.isPaidForMonth(debt.id, currentMonthKey())).toBe(false);
  });

  it("skips a recurring with no source_account_id (incomplete config)", () => {
    makeAutoGenRecurring({ source_account_id: null });
    const generated = autoGenerateForCurrentMonth();
    expect(generated).toEqual([]);
  });

  it("date defaults to day 1 of current month", () => {
    const r = makeAutoGenRecurring();
    autoGenerateForCurrentMonth();
    const txs = transactionsRepo.listByMonth(currentMonthKey(), "EXPENSE");
    const generated = txs.find((t) => t.recurring_id === r.id);
    expect(generated).toBeDefined();
    expect(generated?.date).toBe(`${currentMonthKey()}-01`);
    expect(generated?.origin).toBe("RECURRING_GENERATED");
  });
});

describe("aggregations.recurringForScope NOT-EXISTS guard", () => {
  // Seed data already contains some shared transactions and recurring
  // items for the current month, so absolute amounts vary. Compare the
  // delta caused by adding/materializing one extra item.
  function baseline() {
    return monthlySummary(currentMonthKey(), "household");
  }

  it("counts a non-auto-gen recurring once (today's behavior — forecast)", () => {
    const before = baseline();
    makeAutoGenRecurring({ auto_generate_transaction: false, amount: 1000 });
    const after = baseline();
    // No tx exists; the recurring's amount goes into the recurring bucket only.
    expect(after.recurring - before.recurring).toBe(1000);
    expect(after.expenses - before.expenses).toBe(0);
  });

  it("excludes a materialized auto-gen recurring from the recurring sum (no double-count)", () => {
    const before = baseline();
    makeAutoGenRecurring({ auto_generate_transaction: true, amount: 1000 });
    autoGenerateForCurrentMonth();
    const after = baseline();
    // The 1000 € is now an actual expense via the materialized tx; the
    // recurring bucket must drop it to avoid double-counting against
    // available money.
    expect(after.expenses - before.expenses).toBe(1000);
    expect(after.recurring - before.recurring).toBe(0);
  });

  it("falls back to the recurring's amount if its materialized tx is soft-deleted (still no double-count)", () => {
    const before = baseline();
    const r = makeAutoGenRecurring({ auto_generate_transaction: true, amount: 1000 });
    autoGenerateForCurrentMonth();
    const tx = transactionsRepo
      .listByMonth(currentMonthKey(), "EXPENSE")
      .find((t) => t.recurring_id === r.id)!;
    transactionsRepo.softDelete(tx.id);
    const after = baseline();
    // Tx no longer counts (is_deleted=1) and the recurring is no longer
    // "materialized" per the NOT-EXISTS clause → falls back to forecast.
    expect(after.expenses - before.expenses).toBe(0);
    expect(after.recurring - before.recurring).toBe(1000);
  });
});

describe("autoGenerateForCurrentMonth — DEBT_PAYMENT (Level 4)", () => {
  function makeEurDebt(balance = 100_000) {
    return debtsRepo.create({
      name: "Test mortgage",
      owner_type: "HOUSEHOLD",
      original_amount: 200_000,
      current_balance: balance,
      currency_code: "EUR",
      interest_rate: null,
      minimum_payment: null,
      payment_day: 1,
      strategy_priority: null,
      notes: null,
      is_active: true,
    });
  }

  it("materializes a DEBT_PAYMENT tx and decrements the linked debt's balance", () => {
    const debt = makeEurDebt(100_000);
    const r = makeAutoGenRecurring({
      type: "DEBT_PAYMENT",
      amount: 1200,
      debt_id: debt.id,
    });
    const generated = autoGenerateForCurrentMonth();
    expect(generated).toEqual([r.id]);
    // Balance dropped by the recurring amount.
    expect(debtsRepo.getById(debt.id)?.current_balance).toBe(98_800);
    // Recurring marked paid this month.
    expect(recurringRepo.isPaidForMonth(r.id, currentMonthKey())).toBe(true);
  });

  it("skips when the linked debt's currency differs from the recurring's", () => {
    // Build a USD debt directly (the form would block this, but the
    // generator's defensive check is what we're testing).
    const usdDebt = debtsRepo.create({
      name: "USD loan",
      owner_type: "FRAN",
      original_amount: 10_000,
      current_balance: 10_000,
      currency_code: "USD",
      interest_rate: null,
      minimum_payment: null,
      payment_day: null,
      strategy_priority: null,
      notes: null,
      is_active: true,
    });
    makeAutoGenRecurring({
      type: "DEBT_PAYMENT",
      currency_code: "EUR",
      debt_id: usdDebt.id,
    });
    const generated = autoGenerateForCurrentMonth();
    expect(generated).toEqual([]);
    // Balance untouched.
    expect(debtsRepo.getById(usdDebt.id)?.current_balance).toBe(10_000);
  });

  it("skips when the debt has zero balance (already paid off)", () => {
    const debt = makeEurDebt(0);
    const r = makeAutoGenRecurring({
      type: "DEBT_PAYMENT",
      amount: 1200,
      debt_id: debt.id,
    });
    const generated = autoGenerateForCurrentMonth();
    expect(generated).toEqual([]);
    expect(recurringRepo.isPaidForMonth(r.id, currentMonthKey())).toBe(false);
  });

  it("skips when the linked debt is archived", () => {
    const debt = makeEurDebt(100_000);
    debtsRepo.deactivate(debt.id);
    makeAutoGenRecurring({
      type: "DEBT_PAYMENT",
      debt_id: debt.id,
    });
    const generated = autoGenerateForCurrentMonth();
    expect(generated).toEqual([]);
  });

  it("auto-deactivates the debt when the last payment zeroes the balance", () => {
    const debt = makeEurDebt(1200);
    const rec = makeAutoGenRecurring({
      type: "DEBT_PAYMENT",
      amount: 1200,
      debt_id: debt.id,
    });
    autoGenerateForCurrentMonth();
    const after = debtsRepo.getById(debt.id);
    expect(after?.current_balance).toBe(0);
    expect(after?.is_active).toBe(false); // existing auto-deactivate from 0.4.4
    // The materialized tx is still there for history.
    expect(recurringRepo.isPaidForMonth(rec.id, currentMonthKey())).toBe(true);
  });
});
