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
 * Recurring expenses are NOT auto-instantiated as transactions (spec §6.5),
 * so we count them once via `recurring_items`. If you flip
 * `auto_generate_transaction` to true in the future, drop them from this
 * sum to avoid double-counting.
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

function recurringForScope(scope: Scope): number {
  const owner = ownerForPersonal(scope);
  if (owner) {
    return selectScalar(
      `SELECT COALESCE(SUM(amount), 0) FROM recurring_items
       WHERE is_active = 1 AND auto_include_in_projection = 1
         AND type = 'EXPENSE' AND owner_type = ?`,
      [owner],
    );
  }
  if (scope === "household") {
    return selectScalar(
      `SELECT COALESCE(SUM(amount), 0) FROM recurring_items
       WHERE is_active = 1 AND auto_include_in_projection = 1
         AND type = 'EXPENSE' AND owner_type = 'HOUSEHOLD'`,
    );
  }
  return selectScalar(
    `SELECT COALESCE(SUM(amount), 0) FROM recurring_items
     WHERE is_active = 1 AND auto_include_in_projection = 1
       AND type = 'EXPENSE'`,
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
  const recurring = recurringForScope(scope);
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
