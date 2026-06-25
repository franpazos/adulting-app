/**
 * Recurring auto-generation for the current month.
 *
 * For each active recurring with `auto_generate_transaction = 1`,
 * materializes a transaction for the current month if one doesn't
 * already exist (linked via `transactions.recurring_id`). Per-type
 * behavior:
 *
 *  - **EXPENSE**: standard expense flow. Uses `expenseAllocator` so the
 *    allocations match what `/add` would produce; calls
 *    `recomputeForTransaction` so settlement_ledger stays consistent if
 *    the recurring happens to cross cash sources (rare in practice).
 *
 *  - **INCOME**: single allocation row {owner=recurring.owner_type,
 *    share=100%}. No settlement effects (income to a personal account
 *    by definition doesn't owe anyone).
 *
 *  - **DEBT_PAYMENT** (Level 4): requires `debt_id` non-null, the debt
 *    to be active, balance > 0, AND `debt.currency_code` equal to the
 *    source account's currency (we restrict auto-gen to same-currency
 *    only; cross-currency must go through `/debts/:id/pay` so the user
 *    captures the FX rate). On success: tx + debt_payments row +
 *    `debtsRepo.adjustBalance(-amount)` atomically through the
 *    transactionsRepo.create transaction.
 *
 * Scope rules (Levels 3 + 4):
 *  - Current month only. No catch-up across missed months. The
 *    quick-fill CTA (Level 1) is the manual escape hatch for backfill.
 *  - Skips when *any* tx already exists for (recurring_id, month_key),
 *    including soft-deleted ones — lets the user opt out of a single
 *    month by deleting the materialized tx.
 *  - Date defaults to the first of the month — `recurring_items` has
 *    no explicit `payment_day` column today.
 *
 * Math integrity: see `aggregations.ts` top docstring. The companion
 * NOT-EXISTS clause in `recurringForScope` keeps materialized items
 * from being double-counted against the forecast (EXPENSE only — INCOME
 * and DEBT_PAYMENT are summed from transactions natively, not
 * `recurring_items`, so there's no double-count risk for those types).
 */

import { selectAll, selectOne } from "@/lib/db/client";
import { debtPaymentsRepo, debtsRepo, transactionsRepo } from "@/lib/db";
import type { RecurringItem } from "@/lib/db/types";
import { coerceBooleans } from "@/lib/db/repositories/_helpers";
import { currentMonthKey, type MonthKey } from "@/lib/date/month";
import { accountIdToCashSource } from "@/features/add-expense/sources";
import { expenseAllocator } from "./allocator";
import { recomputeForTransaction } from "./settlements";

const RECURRING_BOOL_KEYS = [
  "is_active",
  "auto_include_in_projection",
  "auto_generate_transaction",
] as const satisfies ReadonlyArray<keyof RecurringItem>;

function mapRecurring(row: Record<string, unknown>): RecurringItem {
  return coerceBooleans<RecurringItem>(row, RECURRING_BOOL_KEYS);
}

function firstOfMonth(monthKey: MonthKey): string {
  return `${monthKey}-01`;
}

/**
 * Returns the IDs of recurrings that produced a transaction in this
 * run. Empty array means "nothing to do" — either every active+auto_gen
 * item already has a tx for the month, or they were filtered out by the
 * per-type guards (no debt_id, archived debt, currency mismatch, etc.).
 */
export function autoGenerateForCurrentMonth(): string[] {
  const monthKey = currentMonthKey();
  const candidates = selectAll<Record<string, unknown>>(
    `SELECT * FROM recurring_items
     WHERE is_active = 1
       AND auto_generate_transaction = 1`,
  ).map(mapRecurring);

  const generated: string[] = [];

  for (const r of candidates) {
    if (!r.source_account_id) continue;

    const existing = selectOne<{ id: string }>(
      `SELECT id FROM transactions
       WHERE recurring_id = ? AND month_key = ?
       LIMIT 1`,
      [r.id, monthKey],
    );
    if (existing) continue;

    let source;
    try {
      source = accountIdToCashSource(r.source_account_id);
    } catch {
      // Unknown source account — skip rather than throw the whole boot.
      continue;
    }

    if (r.type === "EXPENSE") {
      const allocation = expenseAllocator({
        amount: r.amount,
        source,
        owner: r.owner_type,
        splitFranPercent: r.default_shared_split_percent ?? 50,
      });
      const tx = transactionsRepo.create({
        type: "EXPENSE",
        date: firstOfMonth(monthKey),
        amount: r.amount,
        currency_code: r.currency_code,
        source_account_id: r.source_account_id,
        description: r.name,
        category_id: r.category_id,
        origin: "RECURRING_GENERATED",
        sheet_sync_status: "PENDING",
        recurring_id: r.id,
        allocations: allocation.allocations,
      });
      recomputeForTransaction(tx.id);
      generated.push(r.id);
      continue;
    }

    if (r.type === "INCOME") {
      transactionsRepo.create({
        type: "INCOME",
        date: firstOfMonth(monthKey),
        amount: r.amount,
        currency_code: r.currency_code,
        source_account_id: r.source_account_id,
        description: r.name,
        category_id: r.category_id,
        origin: "RECURRING_GENERATED",
        sheet_sync_status: "PENDING",
        recurring_id: r.id,
        allocations: [
          {
            owner_type: r.owner_type,
            share_percent: 100,
            share_amount: r.amount,
          },
        ],
      });
      // Income has no settlement implication — no recompute needed.
      generated.push(r.id);
      continue;
    }

    if (r.type === "DEBT_PAYMENT") {
      if (!r.debt_id) continue;
      const debt = debtsRepo.getById(r.debt_id);
      if (!debt) continue;
      if (!debt.is_active) continue;
      if (debt.current_balance <= 0) continue;
      // Restrict auto-gen to same-currency only. Cross-currency
      // requires capturing an FX rate, which we can't honestly do at
      // boot — the user goes through /debts/:id/pay for those.
      if (debt.currency_code !== r.currency_code) continue;

      const allocation = expenseAllocator({
        amount: r.amount,
        source,
        owner: debt.owner_type,
        splitFranPercent: r.default_shared_split_percent ?? 50,
      });
      const tx = transactionsRepo.create({
        type: "DEBT_PAYMENT",
        date: firstOfMonth(monthKey),
        amount: r.amount,
        currency_code: r.currency_code,
        source_account_id: r.source_account_id,
        description: r.name,
        category_id: r.category_id,
        origin: "RECURRING_GENERATED",
        sheet_sync_status: "PENDING",
        recurring_id: r.id,
        exchange_rate: null,
        amount_in_account_currency: r.amount,
        amount_in_debt_currency: r.amount,
        allocations: allocation.allocations,
      });
      debtPaymentsRepo.create({
        debt_id: debt.id,
        transaction_id: tx.id,
        payment_date: firstOfMonth(monthKey),
        amount: r.amount,
        principal_amount: null,
        interest_amount: null,
        exchange_rate: null,
        amount_in_account_currency: r.amount,
        amount_in_debt_currency: r.amount,
      });
      debtsRepo.adjustBalance(debt.id, -r.amount);
      recomputeForTransaction(tx.id);
      generated.push(r.id);
      continue;
    }
  }

  return generated;
}
