/**
 * Row → entity mappers (inverse of `writers.ts`). Used by the pull
 * worker to reconcile remote Sheet rows with the local SQLite.
 *
 * Cells in a SheetRow can be:
 *   - string (always — Sheets API returns strings unless we set
 *     valueRenderOption=UNFORMATTED_VALUE, which we don't)
 *   - number when valueInputOption=RAW pushed numeric values, but on
 *     subsequent reads they may come back as either depending on cell
 *     formatting. We coerce defensively.
 *   - empty string for nulls (Sheets has no real null concept).
 *
 * `parseRow*` functions are tolerant: they accept short rows (newer
 * columns missing) by returning null/undefined for those slots, but
 * reject rows missing the canonical primary key.
 */

import type { CellValue, SheetRow } from "@/lib/google/sheets-api";
import type {
  Account,
  AccountType,
  CategoryKind,
  Category,
  Debt,
  DebtPayment,
  Feedback,
  FeedbackSeverity,
  FeedbackTag,
  Frequency,
  OwnerType,
  RecurringItem,
  RecurringType,
  SettlementLedgerEntry,
  Transaction,
  TransactionAllocation,
  TransactionOrigin,
  TransactionType,
  SyncStatus,
  User,
} from "@/lib/db/types";

const str = (v: CellValue | undefined): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s === "" ? null : s;
};

const reqStr = (v: CellValue | undefined, field: string): string => {
  const s = str(v);
  if (!s) throw new Error(`reader: missing required string field "${field}"`);
  return s;
};

const num = (v: CellValue | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const reqNum = (v: CellValue | undefined, field: string): number => {
  const n = num(v);
  if (n === null)
    throw new Error(`reader: missing required numeric field "${field}"`);
  return n;
};

/** Sheets emit our 0/1 booleans as numbers or strings. Coerce both. */
const bool = (v: CellValue | undefined): boolean => {
  if (v === true || v === 1 || v === "1" || v === "TRUE") return true;
  return false;
};

export function parseUser(row: SheetRow): User {
  return {
    id: reqStr(row[0], "user.id"),
    name: reqStr(row[1], "user.name"),
    is_active: bool(row[2]),
    created_at: reqStr(row[3], "user.created_at"),
    updated_at: reqStr(row[4], "user.updated_at"),
  };
}

export function parseAccount(row: SheetRow): Account {
  return {
    id: reqStr(row[0], "account.id"),
    name: reqStr(row[1], "account.name"),
    type: reqStr(row[2], "account.type") as AccountType,
    owner_user_id: str(row[3]),
    currency_code: reqStr(row[4], "account.currency_code"),
    initial_balance: reqNum(row[5], "account.initial_balance"),
    is_archived: bool(row[6]),
    created_at: reqStr(row[7], "account.created_at"),
    updated_at: reqStr(row[8], "account.updated_at"),
  };
}

export function parseCategory(row: SheetRow): Category {
  return {
    id: reqStr(row[0], "category.id"),
    name: reqStr(row[1], "category.name"),
    kind: reqStr(row[2], "category.kind") as CategoryKind,
    parent_id: str(row[3]),
    is_default: bool(row[4]),
    sort_order: reqNum(row[5], "category.sort_order"),
    color: str(row[6]),
    created_at: reqStr(row[7], "category.created_at"),
    updated_at: reqStr(row[8], "category.updated_at"),
    // `is_active` was added in v4. Sheets created before that won't have
    // the column — default to `true` rather than `false` so legacy rows
    // don't all get marked archived on first pull.
    is_active: row[9] === undefined ? true : bool(row[9]),
  };
}

export function parseTransaction(row: SheetRow): Transaction {
  return {
    id: reqStr(row[0], "transaction.id"),
    type: reqStr(row[1], "transaction.type") as TransactionType,
    date: reqStr(row[2], "transaction.date"),
    month_key: reqStr(row[3], "transaction.month_key"),
    amount: reqNum(row[4], "transaction.amount"),
    currency_code: reqStr(row[5], "transaction.currency_code"),
    description: str(row[6]),
    notes: str(row[7]),
    category_id: str(row[8]),
    source_account_id: reqStr(row[9], "transaction.source_account_id"),
    created_by_user_id: str(row[10]),
    merchant: str(row[11]),
    is_deleted: bool(row[12]),
    origin: (str(row[13]) ?? "MANUAL") as TransactionOrigin,
    sheet_sync_status: "SYNCED" as SyncStatus,
    sheet_row_ref: null,
    exchange_rate: num(row[14]),
    amount_in_account_currency: num(row[15]),
    amount_in_debt_currency: num(row[16]),
    created_at: reqStr(row[17], "transaction.created_at"),
    updated_at: reqStr(row[18], "transaction.updated_at"),
  };
}

export function parseAllocation(row: SheetRow): TransactionAllocation {
  return {
    id: reqStr(row[0], "allocation.id"),
    transaction_id: reqStr(row[1], "allocation.transaction_id"),
    owner_type: reqStr(row[2], "allocation.owner_type") as OwnerType,
    share_percent: reqNum(row[3], "allocation.share_percent"),
    share_amount: reqNum(row[4], "allocation.share_amount"),
    settlement_effect_type: str(row[5]),
    created_at: reqStr(row[6], "allocation.created_at"),
    updated_at: reqStr(row[7], "allocation.updated_at"),
  };
}

export function parseRecurring(row: SheetRow): RecurringItem {
  return {
    id: reqStr(row[0], "recurring.id"),
    type: reqStr(row[1], "recurring.type") as RecurringType,
    name: reqStr(row[2], "recurring.name"),
    amount: reqNum(row[3], "recurring.amount"),
    currency_code: reqStr(row[4], "recurring.currency_code"),
    frequency: reqStr(row[5], "recurring.frequency") as Frequency,
    start_date: reqStr(row[6], "recurring.start_date"),
    end_date: str(row[7]),
    category_id: str(row[8]),
    source_account_id: str(row[9]),
    owner_type: reqStr(row[10], "recurring.owner_type") as OwnerType,
    default_shared_split_percent: num(row[11]),
    is_active: bool(row[12]),
    auto_include_in_projection: bool(row[13]),
    auto_generate_transaction: bool(row[14]),
    created_at: reqStr(row[15], "recurring.created_at"),
    updated_at: reqStr(row[16], "recurring.updated_at"),
  };
}

export function parseDebt(row: SheetRow): Debt {
  return {
    id: reqStr(row[0], "debt.id"),
    name: reqStr(row[1], "debt.name"),
    owner_type: reqStr(row[2], "debt.owner_type") as OwnerType,
    original_amount: reqNum(row[3], "debt.original_amount"),
    current_balance: reqNum(row[4], "debt.current_balance"),
    currency_code: reqStr(row[5], "debt.currency_code"),
    interest_rate: num(row[6]),
    minimum_payment: num(row[7]),
    payment_day: num(row[8]) === null ? null : Math.round(num(row[8])!),
    strategy_priority:
      num(row[9]) === null ? null : Math.round(num(row[9])!),
    notes: str(row[10]),
    is_active: bool(row[11]),
    created_at: reqStr(row[12], "debt.created_at"),
    updated_at: reqStr(row[13], "debt.updated_at"),
  };
}

export function parseDebtPayment(row: SheetRow): DebtPayment {
  return {
    id: reqStr(row[0], "debt_payment.id"),
    debt_id: reqStr(row[1], "debt_payment.debt_id"),
    transaction_id: str(row[2]),
    payment_date: reqStr(row[3], "debt_payment.payment_date"),
    amount: reqNum(row[4], "debt_payment.amount"),
    principal_amount: num(row[5]),
    interest_amount: num(row[6]),
    exchange_rate: num(row[7]),
    amount_in_account_currency: num(row[8]),
    amount_in_debt_currency: num(row[9]),
    created_at: reqStr(row[10], "debt_payment.created_at"),
    updated_at: reqStr(row[11], "debt_payment.updated_at"),
  };
}

export function parseSettlement(row: SheetRow): SettlementLedgerEntry {
  return {
    id: reqStr(row[0], "settlement.id"),
    date: reqStr(row[1], "settlement.date"),
    source_transaction_id: str(row[2]),
    from_party: reqStr(row[3], "settlement.from_party") as OwnerType,
    to_party: reqStr(row[4], "settlement.to_party") as OwnerType,
    amount: reqNum(row[5], "settlement.amount"),
    reason: reqStr(row[6], "settlement.reason"),
    notes: str(row[7]),
    created_at: reqStr(row[8], "settlement.created_at"),
    updated_at: reqStr(row[9], "settlement.updated_at"),
  };
}

export function parseFeedback(row: SheetRow): Feedback {
  return {
    id: reqStr(row[0], "feedback.id"),
    title: reqStr(row[1], "feedback.title"),
    message: reqStr(row[2], "feedback.message"),
    severity: reqStr(row[3], "feedback.severity") as FeedbackSeverity,
    tag: reqStr(row[4], "feedback.tag") as FeedbackTag,
    created_by_user_id: str(row[5]),
    is_deleted: bool(row[6]),
    created_at: reqStr(row[7], "feedback.created_at"),
    updated_at: reqStr(row[8], "feedback.updated_at"),
  };
}
