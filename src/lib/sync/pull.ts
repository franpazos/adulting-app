/**
 * Pull worker — Phase 9b reconciliation.
 *
 * For each raw_* tab:
 *   1. Read all rows (row 2 onwards — row 1 is the header).
 *   2. Parse each row into an entity using `readers.ts`.
 *   3. For each remote entity, look up the local row by ID:
 *        - If absent locally → INSERT.
 *        - If present and `remote.updated_at > local.updated_at` → UPDATE.
 *        - Otherwise (local is same age or newer) → skip.
 *
 * Reconciliation is **last-writer-wins by `updated_at`**. This means if
 * Sam edits a tx on her phone at 14:00 and Fran edits the same tx at
 * 14:01, then they both pull/push, the later edit wins on both phones.
 *
 * Remote deletions: a row stored remotely with `is_deleted = 1` will
 * propagate as a soft-delete locally on its next pull. Rows that exist
 * locally but **not** remotely are left alone (they may be brand-new
 * local writes pending push).
 *
 * The pull intentionally bypasses `enqueueChange` so the queue isn't
 * polluted with sync-derived writes that would re-push them on the
 * next round. Direct INSERT/UPDATE via the client's `exec`.
 */

import { exec, selectAll, selectOne, transaction } from "@/lib/db/client";
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
} from "./readers";
import { getValues, type SheetRow } from "@/lib/google/sheets-api";
import { fromBool, nowIso } from "@/lib/db/repositories/_helpers";
import { columnLetter, RAW_TABS } from "./tabs";
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

export interface PullReport {
  spreadsheetId: string;
  inserted: Record<string, number>;
  updated: Record<string, number>;
  skipped: Record<string, number>;
  durationMs: number;
}

interface ReconcileStats {
  inserted: number;
  updated: number;
  skipped: number;
}

interface LocalAge {
  id: string;
  updated_at: string;
}

/** Returns a map of {id → updated_at} for fast existence + freshness checks. */
function loadLocalAges(table: string): Map<string, string> {
  const rows = selectAll<LocalAge>(
    `SELECT id, updated_at FROM ${table}`,
  );
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.id, r.updated_at);
  return map;
}

/** Read raw_* rows for a tab, skipping the header. */
async function readTabRows(
  spreadsheetId: string,
  tabTitle: string,
  headerCount: number,
): Promise<SheetRow[]> {
  const range = `${tabTitle}!A2:${columnLetter(headerCount)}`;
  const values = await getValues(spreadsheetId, range);
  // Filter out completely empty rows that Sheets sometimes returns at the end.
  return values.filter((row) => row.some((cell) => cell !== "" && cell != null));
}

export async function pullAll(spreadsheetId: string): Promise<PullReport> {
  const start = Date.now();
  const inserted: Record<string, number> = {};
  const updated: Record<string, number> = {};
  const skipped: Record<string, number> = {};

  // Fetch all tabs in parallel — they're independent reads.
  const fetches = await Promise.all(
    RAW_TABS.map((spec) =>
      readTabRows(spreadsheetId, spec.title, spec.headers.length).then(
        (rows) => ({ spec, rows }),
      ),
    ),
  );

  // All upserts run in one DB transaction for atomicity.
  transaction(() => {
    for (const { spec, rows } of fetches) {
      const stats = applyTab(spec.title, rows);
      inserted[spec.title] = stats.inserted;
      updated[spec.title] = stats.updated;
      skipped[spec.title] = stats.skipped;
    }
  });

  return {
    spreadsheetId,
    inserted,
    updated,
    skipped,
    durationMs: Date.now() - start,
  };
}

function applyTab(tabTitle: string, rows: SheetRow[]): ReconcileStats {
  switch (tabTitle) {
    case "raw_users":
      return reconcileUsers(rows);
    case "raw_accounts":
      return reconcileAccounts(rows);
    case "raw_categories":
      return reconcileCategories(rows);
    case "raw_transactions":
      return reconcileTransactions(rows);
    case "raw_transaction_allocations":
      return reconcileAllocations(rows);
    case "raw_recurring_items":
      return reconcileRecurring(rows);
    case "raw_debts":
      return reconcileDebts(rows);
    case "raw_debt_payments":
      return reconcileDebtPayments(rows);
    case "raw_settlement_ledger":
      return reconcileSettlements(rows);
    default:
      return { inserted: 0, updated: 0, skipped: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-table reconcilers. Each parses the rows, looks up local age, and either
// INSERTs, UPDATEs, or skips. SQLite has FK constraints declared but not
// enforced (PRAGMA foreign_keys defaults to OFF) so insertion order doesn't
// matter — we go in the natural RAW_TABS order anyway.
// ─────────────────────────────────────────────────────────────────────────────

function reconcileUsers(rows: SheetRow[]): ReconcileStats {
  const ages = loadLocalAges("users");
  const stats: ReconcileStats = { inserted: 0, updated: 0, skipped: 0 };
  for (const raw of rows) {
    const u = safeParse(parseUser, raw);
    if (!u) continue;
    const local = ages.get(u.id);
    if (!local) {
      insertUser(u);
      stats.inserted++;
    } else if (u.updated_at > local) {
      updateUser(u);
      stats.updated++;
    } else {
      stats.skipped++;
    }
  }
  return stats;
}

function reconcileAccounts(rows: SheetRow[]): ReconcileStats {
  const ages = loadLocalAges("accounts");
  const stats: ReconcileStats = { inserted: 0, updated: 0, skipped: 0 };
  for (const raw of rows) {
    const a = safeParse(parseAccount, raw);
    if (!a) continue;
    const local = ages.get(a.id);
    if (!local) {
      insertAccount(a);
      stats.inserted++;
    } else if (a.updated_at > local) {
      updateAccount(a);
      stats.updated++;
    } else {
      stats.skipped++;
    }
  }
  return stats;
}

function reconcileCategories(rows: SheetRow[]): ReconcileStats {
  const ages = loadLocalAges("categories");
  const stats: ReconcileStats = { inserted: 0, updated: 0, skipped: 0 };
  for (const raw of rows) {
    const c = safeParse(parseCategory, raw);
    if (!c) continue;
    const local = ages.get(c.id);
    if (!local) {
      insertCategory(c);
      stats.inserted++;
    } else if (c.updated_at > local) {
      updateCategory(c);
      stats.updated++;
    } else {
      stats.skipped++;
    }
  }
  return stats;
}

function reconcileTransactions(rows: SheetRow[]): ReconcileStats {
  const ages = loadLocalAges("transactions");
  const stats: ReconcileStats = { inserted: 0, updated: 0, skipped: 0 };
  for (const raw of rows) {
    const t = safeParse(parseTransaction, raw);
    if (!t) continue;
    const local = ages.get(t.id);
    if (!local) {
      insertTransaction(t);
      stats.inserted++;
    } else if (t.updated_at > local) {
      updateTransaction(t);
      stats.updated++;
    } else {
      stats.skipped++;
    }
  }
  return stats;
}

function reconcileAllocations(rows: SheetRow[]): ReconcileStats {
  const ages = loadLocalAges("transaction_allocations");
  const stats: ReconcileStats = { inserted: 0, updated: 0, skipped: 0 };
  for (const raw of rows) {
    const a = safeParse(parseAllocation, raw);
    if (!a) continue;
    const local = ages.get(a.id);
    if (!local) {
      insertAllocation(a);
      stats.inserted++;
    } else if (a.updated_at > local) {
      updateAllocation(a);
      stats.updated++;
    } else {
      stats.skipped++;
    }
  }
  return stats;
}

function reconcileRecurring(rows: SheetRow[]): ReconcileStats {
  const ages = loadLocalAges("recurring_items");
  const stats: ReconcileStats = { inserted: 0, updated: 0, skipped: 0 };
  for (const raw of rows) {
    const r = safeParse(parseRecurring, raw);
    if (!r) continue;
    const local = ages.get(r.id);
    if (!local) {
      insertRecurring(r);
      stats.inserted++;
    } else if (r.updated_at > local) {
      updateRecurring(r);
      stats.updated++;
    } else {
      stats.skipped++;
    }
  }
  return stats;
}

function reconcileDebts(rows: SheetRow[]): ReconcileStats {
  const ages = loadLocalAges("debts");
  const stats: ReconcileStats = { inserted: 0, updated: 0, skipped: 0 };
  for (const raw of rows) {
    const d = safeParse(parseDebt, raw);
    if (!d) continue;
    const local = ages.get(d.id);
    if (!local) {
      insertDebt(d);
      stats.inserted++;
    } else if (d.updated_at > local) {
      updateDebt(d);
      stats.updated++;
    } else {
      stats.skipped++;
    }
  }
  return stats;
}

function reconcileDebtPayments(rows: SheetRow[]): ReconcileStats {
  const ages = loadLocalAges("debt_payments");
  const stats: ReconcileStats = { inserted: 0, updated: 0, skipped: 0 };
  for (const raw of rows) {
    const p = safeParse(parseDebtPayment, raw);
    if (!p) continue;
    const local = ages.get(p.id);
    if (!local) {
      insertDebtPayment(p);
      stats.inserted++;
    } else if (p.updated_at > local) {
      updateDebtPayment(p);
      stats.updated++;
    } else {
      stats.skipped++;
    }
  }
  return stats;
}

function reconcileSettlements(rows: SheetRow[]): ReconcileStats {
  const ages = loadLocalAges("settlement_ledger");
  const stats: ReconcileStats = { inserted: 0, updated: 0, skipped: 0 };
  for (const raw of rows) {
    const s = safeParse(parseSettlement, raw);
    if (!s) continue;
    const local = ages.get(s.id);
    if (!local) {
      insertSettlement(s);
      stats.inserted++;
    } else if (s.updated_at > local) {
      updateSettlement(s);
      stats.updated++;
    } else {
      stats.skipped++;
    }
  }
  return stats;
}

function safeParse<T>(
  fn: (row: SheetRow) => T,
  raw: SheetRow,
): T | null {
  try {
    return fn(raw);
  } catch (err) {
    console.warn("[pull] skipping malformed row:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Direct DB writers — bypass `enqueueChange` so pulled rows aren't pushed
// back. Each entity has a separate insert + update because INSERT OR REPLACE
// would also clobber columns we don't know about (none yet, but future-proof).
// ─────────────────────────────────────────────────────────────────────────────

function insertUser(u: User): void {
  exec(
    `INSERT INTO users (id, name, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [u.id, u.name, fromBool(u.is_active), u.created_at, u.updated_at],
  );
}
function updateUser(u: User): void {
  exec(
    `UPDATE users SET name = ?, is_active = ?, updated_at = ? WHERE id = ?`,
    [u.name, fromBool(u.is_active), u.updated_at, u.id],
  );
}

function insertAccount(a: Account): void {
  exec(
    `INSERT INTO accounts (id, name, type, owner_user_id, currency_code,
       initial_balance, is_archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      a.id,
      a.name,
      a.type,
      a.owner_user_id,
      a.currency_code,
      a.initial_balance,
      fromBool(a.is_archived),
      a.created_at,
      a.updated_at,
    ],
  );
}
function updateAccount(a: Account): void {
  exec(
    `UPDATE accounts SET name = ?, type = ?, owner_user_id = ?,
       currency_code = ?, initial_balance = ?, is_archived = ?, updated_at = ?
     WHERE id = ?`,
    [
      a.name,
      a.type,
      a.owner_user_id,
      a.currency_code,
      a.initial_balance,
      fromBool(a.is_archived),
      a.updated_at,
      a.id,
    ],
  );
}

function insertCategory(c: Category): void {
  exec(
    `INSERT INTO categories (id, name, kind, parent_id, is_default, sort_order,
       color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      c.id,
      c.name,
      c.kind,
      c.parent_id,
      fromBool(c.is_default),
      c.sort_order,
      c.color,
      c.created_at,
      c.updated_at,
    ],
  );
}
function updateCategory(c: Category): void {
  exec(
    `UPDATE categories SET name = ?, kind = ?, parent_id = ?, is_default = ?,
       sort_order = ?, color = ?, updated_at = ?
     WHERE id = ?`,
    [
      c.name,
      c.kind,
      c.parent_id,
      fromBool(c.is_default),
      c.sort_order,
      c.color,
      c.updated_at,
      c.id,
    ],
  );
}

function insertTransaction(t: Transaction): void {
  exec(
    `INSERT INTO transactions (id, type, date, month_key, amount, currency_code,
       description, notes, category_id, source_account_id, created_by_user_id,
       merchant, is_deleted, origin, sheet_sync_status, sheet_row_ref,
       exchange_rate, amount_in_account_currency, amount_in_debt_currency,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
      fromBool(t.is_deleted),
      t.origin,
      "SYNCED",
      null,
      t.exchange_rate,
      t.amount_in_account_currency,
      t.amount_in_debt_currency,
      t.created_at,
      t.updated_at,
    ],
  );
}
function updateTransaction(t: Transaction): void {
  exec(
    `UPDATE transactions SET type = ?, date = ?, month_key = ?, amount = ?,
       currency_code = ?, description = ?, notes = ?, category_id = ?,
       source_account_id = ?, created_by_user_id = ?, merchant = ?,
       is_deleted = ?, origin = ?, sheet_sync_status = ?,
       exchange_rate = ?, amount_in_account_currency = ?,
       amount_in_debt_currency = ?, updated_at = ?
     WHERE id = ?`,
    [
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
      fromBool(t.is_deleted),
      t.origin,
      "SYNCED",
      t.exchange_rate,
      t.amount_in_account_currency,
      t.amount_in_debt_currency,
      t.updated_at,
      t.id,
    ],
  );
}

function insertAllocation(a: TransactionAllocation): void {
  exec(
    `INSERT INTO transaction_allocations (id, transaction_id, owner_type,
       share_percent, share_amount, settlement_effect_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      a.id,
      a.transaction_id,
      a.owner_type,
      a.share_percent,
      a.share_amount,
      a.settlement_effect_type,
      a.created_at,
      a.updated_at,
    ],
  );
}
function updateAllocation(a: TransactionAllocation): void {
  exec(
    `UPDATE transaction_allocations SET transaction_id = ?, owner_type = ?,
       share_percent = ?, share_amount = ?, settlement_effect_type = ?,
       updated_at = ?
     WHERE id = ?`,
    [
      a.transaction_id,
      a.owner_type,
      a.share_percent,
      a.share_amount,
      a.settlement_effect_type,
      a.updated_at,
      a.id,
    ],
  );
}

function insertRecurring(r: RecurringItem): void {
  exec(
    `INSERT INTO recurring_items (id, type, name, amount, currency_code,
       frequency, start_date, end_date, category_id, source_account_id,
       owner_type, default_shared_split_percent, is_active,
       auto_include_in_projection, auto_generate_transaction,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
      fromBool(r.is_active),
      fromBool(r.auto_include_in_projection),
      fromBool(r.auto_generate_transaction),
      r.created_at,
      r.updated_at,
    ],
  );
}
function updateRecurring(r: RecurringItem): void {
  exec(
    `UPDATE recurring_items SET type = ?, name = ?, amount = ?,
       currency_code = ?, frequency = ?, start_date = ?, end_date = ?,
       category_id = ?, source_account_id = ?, owner_type = ?,
       default_shared_split_percent = ?, is_active = ?,
       auto_include_in_projection = ?, auto_generate_transaction = ?,
       updated_at = ?
     WHERE id = ?`,
    [
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
      fromBool(r.is_active),
      fromBool(r.auto_include_in_projection),
      fromBool(r.auto_generate_transaction),
      r.updated_at,
      r.id,
    ],
  );
}

function insertDebt(d: Debt): void {
  exec(
    `INSERT INTO debts (id, name, owner_type, original_amount, current_balance,
       currency_code, interest_rate, minimum_payment, payment_day,
       strategy_priority, notes, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
      fromBool(d.is_active),
      d.created_at,
      d.updated_at,
    ],
  );
}
function updateDebt(d: Debt): void {
  exec(
    `UPDATE debts SET name = ?, owner_type = ?, original_amount = ?,
       current_balance = ?, currency_code = ?, interest_rate = ?,
       minimum_payment = ?, payment_day = ?, strategy_priority = ?,
       notes = ?, is_active = ?, updated_at = ?
     WHERE id = ?`,
    [
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
      fromBool(d.is_active),
      d.updated_at,
      d.id,
    ],
  );
}

function insertDebtPayment(p: DebtPayment): void {
  exec(
    `INSERT INTO debt_payments (id, debt_id, transaction_id, payment_date,
       amount, principal_amount, interest_amount, exchange_rate,
       amount_in_account_currency, amount_in_debt_currency, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
    ],
  );
}
function updateDebtPayment(p: DebtPayment): void {
  exec(
    `UPDATE debt_payments SET debt_id = ?, transaction_id = ?,
       payment_date = ?, amount = ?, principal_amount = ?,
       interest_amount = ?, exchange_rate = ?,
       amount_in_account_currency = ?, amount_in_debt_currency = ?,
       updated_at = ?
     WHERE id = ?`,
    [
      p.debt_id,
      p.transaction_id,
      p.payment_date,
      p.amount,
      p.principal_amount,
      p.interest_amount,
      p.exchange_rate,
      p.amount_in_account_currency,
      p.amount_in_debt_currency,
      p.updated_at,
      p.id,
    ],
  );
}

function insertSettlement(s: SettlementLedgerEntry): void {
  exec(
    `INSERT INTO settlement_ledger (id, date, source_transaction_id, from_party,
       to_party, amount, reason, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      s.id,
      s.date,
      s.source_transaction_id,
      s.from_party,
      s.to_party,
      s.amount,
      s.reason,
      s.notes,
      s.created_at,
      s.updated_at,
    ],
  );
}
function updateSettlement(s: SettlementLedgerEntry): void {
  exec(
    `UPDATE settlement_ledger SET date = ?, source_transaction_id = ?,
       from_party = ?, to_party = ?, amount = ?, reason = ?, notes = ?,
       updated_at = ?
     WHERE id = ?`,
    [
      s.date,
      s.source_transaction_id,
      s.from_party,
      s.to_party,
      s.amount,
      s.reason,
      s.notes,
      s.updated_at,
      s.id,
    ],
  );
}

// Re-export the few helpers tests want without exposing the rest.
export const _internal = {
  loadLocalAges,
  applyTab,
  insertUser,
  updateUser,
  insertTransaction,
  updateTransaction,
};
// Suppress unused warnings if a future caller doesn't import all of these.
void selectOne;
void nowIso;
