/**
 * Monthly aggregations and available-money projection.
 *
 * Scope semantics (ADR-010):
 *   - **fran / sam** — filtered by `transaction_allocations.owner_type` for
 *     income/expenses and by `recurring_items.owner_type` for recurring.
 *     Includes the person's *share* of shared expenses.
 *   - **household** — the joint/household-cashflow view: income is the total
 *     of all incomes (no individual filter; the household sees everything
 *     coming in) and expenses are restricted to *shared* transactions
 *     (multi-row allocations OR a single HOUSEHOLD row). Recurring same.
 *   - **all** — sum of everything (no filter).
 *
 * Available money formula (spec §13.4):
 *   available = income − expenses − recurring_expenses − debt_payments
 *
 * Double-counting rule (Level 3, 0.4.9): recurring items with
 * `auto_generate_transaction = 1` get materialized as actual transactions
 * each month by `autoGenerate.ts`. Once that transaction exists for the
 * current month, the recurring's amount is *already* captured in the
 * `expenses` term — counting it again under `recurring_expenses` would
 * double-count it. `recurringForScope` therefore excludes those items
 * when a non-deleted transaction with their `recurring_id` exists for
 * the requested month. Items with auto_generate=0 keep behaving as a
 * pure forecast (counted in `recurring_expenses`, never materialized).
 */

import { selectAll, selectScalar } from "@/lib/db/client";
import type { OwnerType } from "@/lib/db/types";
import type { MonthKey } from "@/lib/date/month";
import type { Scope } from "@/store/uiStore";

export interface MonthlySummary {
  income: number;
  expenses: number;
  recurring: number;
  debtPayments: number;
  available: number;
}

export interface CategorySliceRow {
  category_id: string | null;
  name: string;
  color: string | null;
  amount: number;
  percent: number;
}

const SHARED_TX_PREDICATE = `(
  SELECT COUNT(*) FROM transaction_allocations a2 WHERE a2.transaction_id = t.id
) > 1 OR EXISTS (
  SELECT 1 FROM transaction_allocations a3
  WHERE a3.transaction_id = t.id AND a3.owner_type = 'HOUSEHOLD'
)`;

function ownerForPersonal(scope: Scope): OwnerType | null {
  if (scope === "fran") return "FRAN";
  if (scope === "sam") return "SAM";
  return null;
}

// ── Income ───────────────────────────────────────────────────────────────

function incomeForScope(monthKey: MonthKey, scope: Scope): number {
  const owner = ownerForPersonal(scope);
  if (owner) {
    return selectScalar(
      `SELECT COALESCE(SUM(a.share_amount), 0)
       FROM transaction_allocations a
       JOIN transactions t ON t.id = a.transaction_id
       WHERE t.month_key = ? AND t.is_deleted = 0 AND t.type = 'INCOME'
         AND a.owner_type = ?`,
      [monthKey, owner],
    );
  }
  // household + all both see total income
  return selectScalar(
    `SELECT COALESCE(SUM(amount), 0)
     FROM transactions
     WHERE month_key = ? AND is_deleted = 0 AND type = 'INCOME'`,
    [monthKey],
  );
}

// ── Expenses (one-time) ──────────────────────────────────────────────────

function expensesForScope(monthKey: MonthKey, scope: Scope): number {
  const owner = ownerForPersonal(scope);
  if (owner) {
    return selectScalar(
      `SELECT COALESCE(SUM(a.share_amount), 0)
       FROM transaction_allocations a
       JOIN transactions t ON t.id = a.transaction_id
       WHERE t.month_key = ? AND t.is_deleted = 0 AND t.type = 'EXPENSE'
         AND a.owner_type = ?`,
      [monthKey, owner],
    );
  }
  if (scope === "household") {
    return selectScalar(
      `SELECT COALESCE(SUM(t.amount), 0)
       FROM transactions t
       WHERE t.month_key = ? AND t.is_deleted = 0 AND t.type = 'EXPENSE'
         AND (${SHARED_TX_PREDICATE})`,
      [monthKey],
    );
  }
  // all
  return selectScalar(
    `SELECT COALESCE(SUM(amount), 0)
     FROM transactions
     WHERE month_key = ? AND is_deleted = 0 AND type = 'EXPENSE'`,
    [monthKey],
  );
}

// ── Recurring expenses ───────────────────────────────────────────────────

/**
 * Sum of recurring expense items that contribute to the month's forecast.
 * Items materialized via auto_generate are excluded once their tx exists,
 * to avoid double-counting against `expensesForScope`. See top docstring.
 */
const AUTO_GEN_MATERIALIZED_PREDICATE = `(
  r.auto_generate_transaction = 1
  AND EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.recurring_id = r.id
      AND t.month_key = ?
      AND t.is_deleted = 0
  )
)`;

function recurringForScope(monthKey: MonthKey, scope: Scope): number {
  const owner = ownerForPersonal(scope);
  if (owner) {
    return selectScalar(
      `SELECT COALESCE(SUM(r.amount), 0) FROM recurring_items r
       WHERE r.is_active = 1 AND r.auto_include_in_projection = 1
         AND r.type = 'EXPENSE' AND r.owner_type = ?
         AND NOT ${AUTO_GEN_MATERIALIZED_PREDICATE}`,
      [owner, monthKey],
    );
  }
  if (scope === "household") {
    return selectScalar(
      `SELECT COALESCE(SUM(r.amount), 0) FROM recurring_items r
       WHERE r.is_active = 1 AND r.auto_include_in_projection = 1
         AND r.type = 'EXPENSE' AND r.owner_type = 'HOUSEHOLD'
         AND NOT ${AUTO_GEN_MATERIALIZED_PREDICATE}`,
      [monthKey],
    );
  }
  return selectScalar(
    `SELECT COALESCE(SUM(r.amount), 0) FROM recurring_items r
     WHERE r.is_active = 1 AND r.auto_include_in_projection = 1
       AND r.type = 'EXPENSE'
       AND NOT ${AUTO_GEN_MATERIALIZED_PREDICATE}`,
    [monthKey],
  );
}

// ── Debt payments ────────────────────────────────────────────────────────

function debtPaymentsForScope(monthKey: MonthKey, scope: Scope): number {
  const owner = ownerForPersonal(scope);
  if (owner) {
    return selectScalar(
      `SELECT COALESCE(SUM(t.amount), 0)
       FROM transactions t
       JOIN debts d ON d.id = (
         SELECT debt_id FROM debt_payments dp WHERE dp.transaction_id = t.id LIMIT 1
       )
       WHERE t.month_key = ? AND t.is_deleted = 0 AND t.type = 'DEBT_PAYMENT'
         AND d.owner_type = ?`,
      [monthKey, owner],
    );
  }
  if (scope === "household") {
    return selectScalar(
      `SELECT COALESCE(SUM(t.amount), 0)
       FROM transactions t
       JOIN debts d ON d.id = (
         SELECT debt_id FROM debt_payments dp WHERE dp.transaction_id = t.id LIMIT 1
       )
       WHERE t.month_key = ? AND t.is_deleted = 0 AND t.type = 'DEBT_PAYMENT'
         AND d.owner_type = 'HOUSEHOLD'`,
      [monthKey],
    );
  }
  return selectScalar(
    `SELECT COALESCE(SUM(amount), 0)
     FROM transactions
     WHERE month_key = ? AND is_deleted = 0 AND type = 'DEBT_PAYMENT'`,
    [monthKey],
  );
}

// ── Public API ───────────────────────────────────────────────────────────

export function monthlySummary(
  monthKey: MonthKey,
  scope: Scope,
): MonthlySummary {
  const income = incomeForScope(monthKey, scope);
  const expenses = expensesForScope(monthKey, scope);
  const recurring = recurringForScope(monthKey, scope);
  const debtPayments = debtPaymentsForScope(monthKey, scope);
  const available = round2(income - expenses - recurring - debtPayments);
  return {
    income: round2(income),
    expenses: round2(expenses),
    recurring: round2(recurring),
    debtPayments: round2(debtPayments),
    available,
  };
}

export function availableMoney(monthKey: MonthKey, scope: Scope): number {
  return monthlySummary(monthKey, scope).available;
}

export function categoryBreakdown(
  monthKey: MonthKey,
  scope: Scope,
): CategorySliceRow[] {
  const owner = ownerForPersonal(scope);
  let sql: string;
  let bind: string[];

  if (owner) {
    sql = `SELECT t.category_id AS category_id,
                  COALESCE(c.name, 'Otros') AS name,
                  c.color AS color,
                  SUM(a.share_amount) AS amount
           FROM transaction_allocations a
           JOIN transactions t ON t.id = a.transaction_id
           LEFT JOIN categories c ON c.id = t.category_id
           WHERE t.month_key = ? AND t.is_deleted = 0 AND t.type = 'EXPENSE'
             AND a.owner_type = ?
           GROUP BY t.category_id
           ORDER BY amount DESC`;
    bind = [monthKey, owner];
  } else if (scope === "household") {
    sql = `SELECT t.category_id AS category_id,
                  COALESCE(c.name, 'Otros') AS name,
                  c.color AS color,
                  SUM(t.amount) AS amount
           FROM transactions t
           LEFT JOIN categories c ON c.id = t.category_id
           WHERE t.month_key = ? AND t.is_deleted = 0 AND t.type = 'EXPENSE'
             AND (${SHARED_TX_PREDICATE})
           GROUP BY t.category_id
           ORDER BY amount DESC`;
    bind = [monthKey];
  } else {
    sql = `SELECT t.category_id AS category_id,
                  COALESCE(c.name, 'Otros') AS name,
                  c.color AS color,
                  SUM(t.amount) AS amount
           FROM transactions t
           LEFT JOIN categories c ON c.id = t.category_id
           WHERE t.month_key = ? AND t.is_deleted = 0 AND t.type = 'EXPENSE'
           GROUP BY t.category_id
           ORDER BY amount DESC`;
    bind = [monthKey];
  }

  const rows = selectAll<{
    category_id: string | null;
    name: string | null;
    color: string | null;
    amount: number;
  }>(sql, bind);

  const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  return rows.map((r) => ({
    category_id: r.category_id,
    name: r.name ?? "Otros",
    color: r.color ?? null,
    amount: round2(r.amount ?? 0),
    percent: total > 0 ? Math.round(((r.amount ?? 0) / total) * 100) : 0,
  }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Estimated balance for an account = initial_balance
 *   + Σ INCOME amounts hitting the account
 *   + Σ TRANSFER amounts landing in the account (destination_account_id)
 *   − Σ (EXPENSE | DEBT_PAYMENT | SETTLEMENT_PAYMENT | TRANSFER) leaving it
 *     (source_account_id)
 *   + Σ delta of live account_adjustments rows (0.7.0).
 *
 * TRANSFER is the only tx type that's symmetrically counted on both
 * sides of an account move (added in 0.6.0). It appears as outflow on
 * the source and inflow on the destination — net zero across all
 * accounts, but each account's balance reflects the movement correctly.
 *
 * Adjustments live in their own table (0.7.0). Each row carries a
 * signed `delta` (target_balance − computed balance at the moment of
 * save) so the calibration sticks across reloads without needing to
 * mutate `initial_balance` or fake a transaction. Soft-deleted rows
 * are excluded — restoring a deleted adjustment would un-apply its
 * calibration anyway.
 *
 * Mirrors the AccountsPage formula. Currency-agnostic — the caller knows
 * which currency the account is denominated in.
 */
export function accountBalance(
  accountId: string,
  initialBalance: number,
): number {
  const inflow = selectScalar(
    `SELECT COALESCE(SUM(amount), 0) FROM transactions
     WHERE is_deleted = 0
       AND (
         (source_account_id = ? AND type = 'INCOME')
         OR (destination_account_id = ? AND type = 'TRANSFER')
       )`,
    [accountId, accountId],
  );
  const outflow = selectScalar(
    `SELECT COALESCE(SUM(amount), 0) FROM transactions
     WHERE source_account_id = ?
       AND type IN ('EXPENSE', 'DEBT_PAYMENT', 'SETTLEMENT_PAYMENT', 'TRANSFER')
       AND is_deleted = 0`,
    [accountId],
  );
  const adjustments = selectScalar(
    `SELECT COALESCE(SUM(delta), 0) FROM account_adjustments
     WHERE account_id = ? AND is_deleted = 0`,
    [accountId],
  );
  return round2(initialBalance + inflow - outflow + adjustments);
}

/**
 * Net flow for an account during a month: incomes hitting it minus
 * outflows charged against it. Used by the Joint snapshot card to show
 * "+€X / −€Y this month".
 *
 * Inflow counts INCOME txs landing in this account AND TRANSFER txs
 * with this account as their destination. Outflow counts EXPENSE,
 * DEBT_PAYMENT, SETTLEMENT_PAYMENT, and TRANSFER (where this account
 * is the source).
 */
export function accountMonthlyFlow(
  accountId: string,
  monthKey: MonthKey,
): { inflow: number; outflow: number } {
  const inflow = selectScalar(
    `SELECT COALESCE(SUM(amount), 0) FROM transactions
     WHERE month_key = ? AND is_deleted = 0
       AND (
         (source_account_id = ? AND type = 'INCOME')
         OR (destination_account_id = ? AND type = 'TRANSFER')
       )`,
    [monthKey, accountId, accountId],
  );
  const outflow = selectScalar(
    `SELECT COALESCE(SUM(amount), 0) FROM transactions
     WHERE source_account_id = ? AND month_key = ?
       AND type IN ('EXPENSE', 'DEBT_PAYMENT', 'SETTLEMENT_PAYMENT', 'TRANSFER')
       AND is_deleted = 0`,
    [accountId, monthKey],
  );
  return { inflow: round2(inflow), outflow: round2(outflow) };
}
