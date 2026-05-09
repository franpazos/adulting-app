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
import {
  hasPendingForEntity,
  recordConflict,
} from "./conflicts";
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
  /** Per-tab count of remote updates that hit a local PENDING write. */
  conflicts: Record<string, number>;
  durationMs: number;
}

interface ReconcileStats {
  inserted: number;
  updated: number;
  skipped: number;
  conflicts: number;
}

/**
 * Decide whether a remote UPDATE should land or be deferred to the user
 * via a conflict record. Returns true if the caller should proceed with
 * the update; false if a conflict was recorded and the update was skipped.
 */
function checkConflict(
  entityType: string,
  table: string,
  id: string,
  remote: Record<string, unknown>,
  localUpdatedAt: string,
  remoteUpdatedAt: string,
): boolean {
  if (!hasPendingForEntity(entityType, id)) return true;
  const local = selectOne<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE id = ?`,
    [id],
  );
  if (!local) return true; // local somehow gone — fall through to insert path
  recordConflict({
    entity_type: entityType,
    entity_id: id,
    local,
    remote,
    local_updated_at: localUpdatedAt,
    remote_updated_at: remoteUpdatedAt,
  });
  return false;
}

function freshStats(): ReconcileStats {
  return { inserted: 0, updated: 0, skipped: 0, conflicts: 0 };
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
  const conflicts: Record<string, number> = {};

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
      conflicts[spec.title] = stats.conflicts;
    }
  });

  return {
    spreadsheetId,
    inserted,
    updated,
    skipped,
    conflicts,
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
      return freshStats();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-table reconcilers. Each parses the rows, looks up local age, and either
// INSERTs, UPDATEs, or skips. SQLite has FK constraints declared but not
// enforced (PRAGMA foreign_keys defaults to OFF) so insertion order doesn't
// matter — we go in the natural RAW_TABS order anyway.
// ─────────────────────────────────────────────────────────────────────────────

interface ReconcileConfig<T extends { id: string; updated_at: string }> {
  table: string;
  entityType: string;
  parse: (r: SheetRow) => T;
  insert: (e: T) => void;
  update: (e: T) => void;
}

function reconcile<T extends { id: string; updated_at: string }>(
  rows: SheetRow[],
  cfg: ReconcileConfig<T>,
): ReconcileStats {
  const ages = loadLocalAges(cfg.table);
  const stats = freshStats();
  for (const raw of rows) {
    const e = safeParse(cfg.parse, raw);
    if (!e) continue;
    const local = ages.get(e.id);
    if (!local) {
      cfg.insert(e);
      stats.inserted++;
    } else if (e.updated_at > local) {
      const proceed = checkConflict(
        cfg.entityType,
        cfg.table,
        e.id,
        e as unknown as Record<string, unknown>,
        local,
        e.updated_at,
      );
      if (proceed) {
        cfg.update(e);
        stats.updated++;
      } else {
        stats.conflicts++;
      }
    } else {
      stats.skipped++;
    }
  }
  return stats;
}

function reconcileUsers(rows: SheetRow[]) {
  return reconcile(rows, {
    table: "users",
    entityType: "user",
    parse: parseUser,
    insert: insertUser,
    update: updateUser,
  });
}
function reconcileAccounts(rows: SheetRow[]) {
  return reconcile(rows, {
    table: "accounts",
    entityType: "account",
    parse: parseAccount,
    insert: insertAccount,
    update: updateAccount,
  });
}
function reconcileCategories(rows: SheetRow[]) {
  return reconcile(rows, {
    table: "categories",
    entityType: "category",
    parse: parseCategory,
    insert: insertCategory,
    update: updateCategory,
  });
}
function reconcileTransactions(rows: SheetRow[]) {
  return reconcile(rows, {
    table: "transactions",
    entityType: "transaction",
    parse: parseTransaction,
    insert: insertTransaction,
    update: updateTransaction,
  });
}
function reconcileAllocations(rows: SheetRow[]) {
  return reconcile(rows, {
    table: "transaction_allocations",
    entityType: "transaction_allocation",
    parse: parseAllocation,
    insert: insertAllocation,
    update: updateAllocation,
  });
}
function reconcileRecurring(rows: SheetRow[]) {
  return reconcile(rows, {
    table: "recurring_items",
    entityType: "recurring_item",
    parse: parseRecurring,
    insert: insertRecurring,
    update: updateRecurring,
  });
}
function reconcileDebts(rows: SheetRow[]) {
  return reconcile(rows, {
    table: "debts",
    entityType: "debt",
    parse: parseDebt,
    insert: insertDebt,
    update: updateDebt,
  });
}
function reconcileDebtPayments(rows: SheetRow[]) {
  return reconcile(rows, {
    table: "debt_payments",
    entityType: "debt_payment",
    parse: parseDebtPayment,
    insert: insertDebtPayment,
    update: updateDebtPayment,
  });
}
function reconcileSettlements(rows: SheetRow[]) {
  return reconcile(rows, {
    table: "settlement_ledger",
    entityType: "settlement_ledger",
    parse: parseSettlement,
    insert: insertSettlement,
    update: updateSettlement,
  });
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

/**
 * Apply a remote-shaped record to the local DB, dispatched by entity
 * type. Used by the conflict-resolution UI when the user picks "Use
 * remote". The caller is responsible for stripping any pending queue
 * entries — see `conflicts.ts::resolveUseRemote`.
 */
export function applyRemoteToLocal(
  entityType: string,
  data: Record<string, unknown>,
): void {
  switch (entityType) {
    case "user":
      updateUser(data as unknown as User);
      break;
    case "account":
      updateAccount(data as unknown as Account);
      break;
    case "category":
      updateCategory(data as unknown as Category);
      break;
    case "transaction":
      updateTransaction(data as unknown as Transaction);
      break;
    case "transaction_allocation":
      updateAllocation(data as unknown as TransactionAllocation);
      break;
    case "recurring_item":
      updateRecurring(data as unknown as RecurringItem);
      break;
    case "debt":
      updateDebt(data as unknown as Debt);
      break;
    case "debt_payment":
      updateDebtPayment(data as unknown as DebtPayment);
      break;
    case "settlement_ledger":
      updateSettlement(data as unknown as SettlementLedgerEntry);
      break;
    default:
      throw new Error(`applyRemoteToLocal: unknown entityType "${entityType}"`);
  }
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
