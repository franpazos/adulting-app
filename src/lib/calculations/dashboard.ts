/**
 * Dashboard aggregations — pure read functions over the DB. They take
 * a (monthKey, scope) pair and return the four numbers shown in the
 * "Cuenta conjunta / Resumen del mes" card and the category breakdown.
 *
 * Phase 4 will move the heavy lifting (settlements engine, available
 * money projections) to dedicated modules. For now this is the simple
 * read path needed by the Home dashboard.
 */

import { selectAll, selectScalar } from "@/lib/db/client";
import type { OwnerType } from "@/lib/db/types";
import type { Scope } from "@/store/uiStore";

export interface DashboardSummary {
  income: number;
  expenses: number;
  recurring: number;
  available: number;
}

export interface CategorySliceRow {
  category_id: string | null;
  name: string;
  color: string | null;
  amount: number;
  percent: number;
}

function ownersForScope(scope: Scope): OwnerType[] | null {
  switch (scope) {
    case "household":
      return ["HOUSEHOLD"];
    case "fran":
      return ["FRAN"];
    case "sam":
      return ["SAM"];
    case "all":
      return null; // no filter
  }
}

function ownerInClause(owners: OwnerType[]): {
  clause: string;
  bind: string[];
} {
  const placeholders = owners.map(() => "?").join(", ");
  return { clause: `a.owner_type IN (${placeholders})`, bind: owners };
}

export function dashboardSummary(
  monthKey: string,
  scope: Scope,
): DashboardSummary {
  const owners = ownersForScope(scope);

  const incomeSql = owners
    ? `SELECT COALESCE(SUM(a.share_amount), 0)
       FROM transaction_allocations a
       JOIN transactions t ON t.id = a.transaction_id
       WHERE t.month_key = ? AND t.is_deleted = 0 AND t.type = 'INCOME'
         AND ${ownerInClause(owners).clause}`
    : `SELECT COALESCE(SUM(a.share_amount), 0)
       FROM transaction_allocations a
       JOIN transactions t ON t.id = a.transaction_id
       WHERE t.month_key = ? AND t.is_deleted = 0 AND t.type = 'INCOME'`;

  const expenseSql = owners
    ? `SELECT COALESCE(SUM(a.share_amount), 0)
       FROM transaction_allocations a
       JOIN transactions t ON t.id = a.transaction_id
       WHERE t.month_key = ? AND t.is_deleted = 0 AND t.type = 'EXPENSE'
         AND ${ownerInClause(owners).clause}`
    : `SELECT COALESCE(SUM(a.share_amount), 0)
       FROM transaction_allocations a
       JOIN transactions t ON t.id = a.transaction_id
       WHERE t.month_key = ? AND t.is_deleted = 0 AND t.type = 'EXPENSE'`;

  const recurringSql = owners
    ? `SELECT COALESCE(SUM(amount), 0) FROM recurring_items
       WHERE is_active = 1 AND auto_include_in_projection = 1
         AND type = 'EXPENSE'
         AND owner_type IN (${owners.map(() => "?").join(", ")})`
    : `SELECT COALESCE(SUM(amount), 0) FROM recurring_items
       WHERE is_active = 1 AND auto_include_in_projection = 1
         AND type = 'EXPENSE'`;

  const incomeBind: string[] = owners
    ? [monthKey, ...ownerInClause(owners).bind]
    : [monthKey];
  const expenseBind = incomeBind;
  const recurringBind: string[] = owners ? owners : [];

  const income = selectScalar(incomeSql, incomeBind);
  const expenses = selectScalar(expenseSql, expenseBind);
  const recurring = selectScalar(recurringSql, recurringBind);
  const available = income - expenses - recurring;

  return { income, expenses, recurring, available };
}

export function categoryBreakdown(
  monthKey: string,
  scope: Scope,
): CategorySliceRow[] {
  const owners = ownersForScope(scope);
  const ownerClause = owners
    ? `AND a.owner_type IN (${owners.map(() => "?").join(", ")})`
    : "";
  const bind: string[] = owners ? [monthKey, ...owners] : [monthKey];

  const rows = selectAll<{
    category_id: string | null;
    name: string | null;
    color: string | null;
    amount: number;
  }>(
    `SELECT t.category_id AS category_id,
            COALESCE(c.name, 'Otros') AS name,
            c.color AS color,
            SUM(a.share_amount) AS amount
     FROM transaction_allocations a
     JOIN transactions t ON t.id = a.transaction_id
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.month_key = ? AND t.is_deleted = 0 AND t.type = 'EXPENSE'
       ${ownerClause}
     GROUP BY t.category_id
     ORDER BY amount DESC`,
    bind,
  );

  const total = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  return rows.map((r) => ({
    category_id: r.category_id,
    name: r.name ?? "Otros",
    color: r.color ?? null,
    amount: r.amount ?? 0,
    percent: total > 0 ? Math.round(((r.amount ?? 0) / total) * 100) : 0,
  }));
}
