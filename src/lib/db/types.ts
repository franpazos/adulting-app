/**
 * Domain types — mirror the SQL schema in `migrations.ts`. See
 * `docs/data-model.md` for the canonical definition and recipes.
 *
 * Convention: dates and timestamps are ISO strings; booleans are `0|1`
 * INTEGER columns coerced to TS booleans by repositories.
 */

export type CashSource = "FRAN_PERSONAL" | "SAM_PERSONAL" | "JOINT";
export type OwnerType = "FRAN" | "SAM" | "HOUSEHOLD";
export type AccountType = "PERSONAL" | "JOINT";
export type CategoryKind = "EXPENSE" | "INCOME" | "TRANSFER";
export type TransactionType =
  | "EXPENSE"
  | "INCOME"
  | "TRANSFER"
  | "SETTLEMENT_PAYMENT"
  | "DEBT_PAYMENT";
export type RecurringType = "EXPENSE" | "INCOME" | "DEBT_PAYMENT";
export type Frequency = "MONTHLY";
export type TransactionOrigin =
  | "MANUAL"
  | "RECURRING_GENERATED"
  | "SHEET_IMPORT";
export type SyncStatus = "PENDING" | "SYNCED" | "FAILED";
export type SyncAction = "CREATE" | "UPDATE" | "DELETE";

export interface User {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  owner_user_id: string | null;
  currency_code: string;
  initial_balance: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  parent_id: string | null;
  is_default: boolean;
  sort_order: number;
  color: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean; // added in v4
}

export interface Transaction {
  id: string;
  type: TransactionType;
  date: string; // YYYY-MM-DD
  month_key: string; // YYYY-MM
  amount: number;
  currency_code: string;
  description: string | null;
  notes: string | null;
  category_id: string | null;
  source_account_id: string;
  created_by_user_id: string | null;
  merchant: string | null;
  is_deleted: boolean;
  origin: TransactionOrigin;
  sheet_sync_status: SyncStatus;
  sheet_row_ref: string | null;

  // Multi-currency (only populated when relevant — e.g. USD debt payment from EUR account)
  exchange_rate: number | null;
  amount_in_account_currency: number | null;
  amount_in_debt_currency: number | null;

  // Added in v5. Links a materialized transaction back to the recurring
  // item it satisfies (Level 2 of the recurring rollout). Always null for
  // transactions that don't come from a recurring; not auto-populated for
  // pre-v5 rows (no backfill UI — see decisions log for 0.4.8).
  recurring_id: string | null;

  created_at: string;
  updated_at: string;
}

export interface TransactionAllocation {
  id: string;
  transaction_id: string;
  owner_type: OwnerType;
  share_percent: number;
  share_amount: number;
  settlement_effect_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringItem {
  id: string;
  type: RecurringType;
  name: string;
  amount: number;
  currency_code: string;
  frequency: Frequency;
  start_date: string;
  end_date: string | null;
  category_id: string | null;
  source_account_id: string | null;
  owner_type: OwnerType;
  default_shared_split_percent: number | null;
  is_active: boolean;
  auto_include_in_projection: boolean;
  auto_generate_transaction: boolean;
  created_at: string;
  updated_at: string;
}

export interface Debt {
  id: string;
  name: string;
  owner_type: OwnerType;
  original_amount: number;
  current_balance: number;
  currency_code: string;
  interest_rate: number | null;
  minimum_payment: number | null;
  payment_day: number | null;
  strategy_priority: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DebtPayment {
  id: string;
  debt_id: string;
  transaction_id: string | null;
  payment_date: string;
  amount: number;
  principal_amount: number | null;
  interest_amount: number | null;
  exchange_rate: number | null;
  amount_in_account_currency: number | null;
  amount_in_debt_currency: number | null;
  created_at: string;
  updated_at: string;
}

export interface SettlementLedgerEntry {
  id: string;
  date: string;
  source_transaction_id: string | null;
  from_party: OwnerType;
  to_party: OwnerType;
  amount: number;
  reason: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonthlySnapshot {
  id: string;
  month_key: string;
  aggregates_json: string;
  created_at: string;
  updated_at: string;
}

export interface SyncQueueItem {
  id: string;
  entity_type: string;
  entity_id: string;
  action_type: SyncAction;
  status: SyncStatus;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Feedback — temporary "buzón de sugerencias" feature for the beta period.
// Remove when the feature retires.
// ─────────────────────────────────────────────────────────────────────────────

export type FeedbackSeverity = "meh" | "nice" | "want" | "sos";
export type FeedbackTag = "bug" | "idea" | "design" | "other";

export interface Feedback {
  id: string;
  title: string;
  message: string;
  severity: FeedbackSeverity;
  tag: FeedbackTag;
  created_by_user_id: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}
