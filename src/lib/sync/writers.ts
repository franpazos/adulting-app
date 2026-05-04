/**
 * Entity → SheetRow mapping for every raw_* tab. Used by the push worker
 * to upload a full snapshot of the local DB to the user's spreadsheet.
 *
 * Key rules:
 *   - Cell values are emitted as plain TS primitives (string|number|boolean
 *     |null) — `sheets-api.updateValues` serializes them with valueInputOption=RAW.
 *   - Booleans become 0/1 to match the SQLite storage model.
 *   - Dates and IDs stay as strings.
 *   - Order of cells **must** match `RAW_TABS[].headers` from `tabs.ts`.
 */

import type { SheetRow } from "@/lib/google/sheets-api";
import { selectAll } from "@/lib/db/client";
import type {
  Account,
  Category,
  Debt,
  DebtPayment,
  RecurringItem,
  SettlementLedgerEntry,
  Transaction,
  TransactionAllocation,
  User,
} from "@/lib/db/types";

const b = (v: boolean | 0 | 1 | null | undefined): 0 | 1 =>
  v === true || v === 1 ? 1 : 0;

const userToRow = (u: User): SheetRow => [
  u.id,
  u.name,
  b(u.is_active),
  u.created_at,
  u.updated_at,
];

const accountToRow = (a: Account): SheetRow => [
  a.id,
  a.name,
  a.type,
  a.owner_user_id,
  a.currency_code,
  a.initial_balance,
  b(a.is_archived),
  a.created_at,
  a.updated_at,
];

const categoryToRow = (c: Category): SheetRow => [
  c.id,
  c.name,
  c.kind,
  c.parent_id,
  b(c.is_default),
  c.sort_order,
  c.color,
  c.created_at,
  c.updated_at,
];

const transactionToRow = (t: Transaction): SheetRow => [
  t.id,
  t.type,
  t.date,
  t.month_key,
  t.amount,
  t.currency_code,
  t.description,
  t.notes,
  t.category_id,
  t.source_account_id,
  t.created_by_user_id,
  t.merchant,
  b(t.is_deleted),
  t.origin,
  t.exchange_rate,
  t.amount_in_account_currency,
  t.amount_in_debt_currency,
  t.created_at,
  t.updated_at,
];

const allocationToRow = (a: TransactionAllocation): SheetRow => [
  a.id,
  a.transaction_id,
  a.owner_type,
  a.share_percent,
  a.share_amount,
  a.settlement_effect_type,
  a.created_at,
  a.updated_at,
];

const recurringToRow = (r: RecurringItem): SheetRow => [
  r.id,
  r.type,
  r.name,
  r.amount,
  r.currency_code,
  r.frequency,
  r.start_date,
  r.end_date,
  r.category_id,
  r.source_account_id,
  r.owner_type,
  r.default_shared_split_percent,
  b(r.is_active),
  b(r.auto_include_in_projection),
  b(r.auto_generate_transaction),
  r.created_at,
  r.updated_at,
];

const debtToRow = (d: Debt): SheetRow => [
  d.id,
  d.name,
  d.owner_type,
  d.original_amount,
  d.current_balance,
  d.currency_code,
  d.interest_rate,
  d.minimum_payment,
  d.payment_day,
  d.strategy_priority,
  d.notes,
  b(d.is_active),
  d.created_at,
  d.updated_at,
];

const debtPaymentToRow = (p: DebtPayment): SheetRow => [
  p.id,
  p.debt_id,
  p.transaction_id,
  p.payment_date,
  p.amount,
  p.principal_amount,
  p.interest_amount,
  p.exchange_rate,
  p.amount_in_account_currency,
  p.amount_in_debt_currency,
  p.created_at,
  p.updated_at,
];

const settlementToRow = (e: SettlementLedgerEntry): SheetRow => [
  e.id,
  e.date,
  e.source_transaction_id,
  e.from_party,
  e.to_party,
  e.amount,
  e.reason,
  e.notes,
  e.created_at,
  e.updated_at,
];

export interface SnapshotData {
  users: SheetRow[];
  accounts: SheetRow[];
  categories: SheetRow[];
  transactions: SheetRow[];
  allocations: SheetRow[];
  recurring: SheetRow[];
  debts: SheetRow[];
  debt_payments: SheetRow[];
  settlements: SheetRow[];
}

/**
 * Build the full snapshot from the local SQLite. Booleans are coerced to
 * 0/1 here too because the rows we read from the DB have them as INTEGER.
 *
 * NOTE: we read transactions/allocations/etc. directly via `selectAll` so
 * we get *all* rows including soft-deleted ones — `is_deleted=1` rows are
 * still pushed so the other device can see the deletion.
 */
export function buildSnapshot(): SnapshotData {
  return {
    users: selectAll<User>("SELECT * FROM users").map(userToRow),
    accounts: selectAll<Account>("SELECT * FROM accounts").map(accountToRow),
    categories: selectAll<Category>("SELECT * FROM categories").map(
      categoryToRow,
    ),
    transactions: selectAll<Transaction>("SELECT * FROM transactions").map(
      transactionToRow,
    ),
    allocations: selectAll<TransactionAllocation>(
      "SELECT * FROM transaction_allocations",
    ).map(allocationToRow),
    recurring: selectAll<RecurringItem>("SELECT * FROM recurring_items").map(
      recurringToRow,
    ),
    debts: selectAll<Debt>("SELECT * FROM debts").map(debtToRow),
    debt_payments: selectAll<DebtPayment>("SELECT * FROM debt_payments").map(
      debtPaymentToRow,
    ),
    settlements: selectAll<SettlementLedgerEntry>(
      "SELECT * FROM settlement_ledger",
    ).map(settlementToRow),
  };
}

// Exported for unit tests — the per-entity mappers are pure.
export const _mappers = {
  userToRow,
  accountToRow,
  categoryToRow,
  transactionToRow,
  allocationToRow,
  recurringToRow,
  debtToRow,
  debtPaymentToRow,
  settlementToRow,
};
