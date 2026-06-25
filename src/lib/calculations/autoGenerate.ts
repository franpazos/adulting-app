/**
 * Recurring auto-generation for the current month.
 *
 * For each active recurring with `auto_generate_transaction = 1` of type
 * EXPENSE, materializes a CONFIRMED transaction tied via `recurring_id`
 * if one doesn't already exist for the current month. Idempotent — runs
 * safely on every boot, only producing work when a recurring is genuinely
 * unmaterialized this month.
 *
 * Scope rules (Level 3 v1):
 *  - Type EXPENSE only. INCOME and DEBT_PAYMENT have no auto-gen flow
 *    yet (no UX for "mark received" / no recurring↔debt link).
 *  - Current month only. No catch-up across missed months. If a user
 *    skips months entirely, those months stay empty; the quick-fill CTA
 *    (Level 1) is the manual escape hatch for backfill.
 *  - Skips when *any* tx already exists for (recurring_id, month_key),
 *    including soft-deleted ones. Lets the user "opt out" of a single
 *    month by deleting the auto-generated draft without it regenerating
 *    on the next boot.
 *  - Date defaults to the first of the month — the recurring item has no
 *    explicit `payment_day` column today, so a stable per-month anchor
 *    is the simplest choice. If `payment_day` ever materializes, swap
 *    this for the appropriate day-of-month.
 *
 * Math integrity: see `aggregations.ts` top docstring. The companion
 * NOT-EXISTS clause in `recurringForScope` keeps these materialized
 * items from being double-counted against the forecast.
 */

import { selectAll, selectOne } from "@/lib/db/client";
import { transactionsRepo } from "@/lib/db";
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
 * Returns the IDs of recurrings that produced a transaction in this run.
 * Empty array means "nothing to do" — either every active+auto_gen item
 * already has a tx for the month, or there were none to begin with.
 */
export function autoGenerateForCurrentMonth(): string[] {
  const monthKey = currentMonthKey();
  const candidates = selectAll<Record<string, unknown>>(
    `SELECT * FROM recurring_items
     WHERE is_active = 1
       AND auto_generate_transaction = 1
       AND type = 'EXPENSE'`,
  ).map(mapRecurring);

  const generated: string[] = [];

  for (const r of candidates) {
    if (!r.source_account_id) {
      // Without a source account we can't materialize a transaction.
      // Skip silently — the recurring is a forecast-only forecast item.
      continue;
    }

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
  }

  return generated;
}
