/**
 * Definitions for the raw_* tabs the app writes to inside the user's
 * existing Google Sheet. The headers are append-only — never reorder or
 * rename a column once it's in the wild, just add new ones at the end.
 *
 * These mirror the SQLite schema closely (see `docs/data-model.md`) so
 * the row layout is intuitive to read manually in the Sheet.
 */

import {
  addSheets,
  batchUpdateValues,
  getSpreadsheet,
  type ValueRangeUpdate,
} from "@/lib/google/sheets-api";

export interface RawTabSpec {
  /** Tab title in the Sheet (`raw_*` prefix per spec §14.5). */
  title: string;
  /** Header row, in column order. */
  headers: ReadonlyArray<string>;
}

export const RAW_TABS: ReadonlyArray<RawTabSpec> = [
  {
    title: "raw_users",
    headers: ["id", "name", "is_active", "created_at", "updated_at"],
  },
  {
    title: "raw_accounts",
    headers: [
      "id",
      "name",
      "type",
      "owner_user_id",
      "currency_code",
      "initial_balance",
      "is_archived",
      "created_at",
      "updated_at",
    ],
  },
  {
    title: "raw_categories",
    headers: [
      "id",
      "name",
      "kind",
      "parent_id",
      "is_default",
      "sort_order",
      "color",
      "created_at",
      "updated_at",
      "is_active",
    ],
  },
  {
    title: "raw_transactions",
    headers: [
      "id",
      "type",
      "date",
      "month_key",
      "amount",
      "currency_code",
      "description",
      "notes",
      "category_id",
      "source_account_id",
      "created_by_user_id",
      "merchant",
      "is_deleted",
      "origin",
      "exchange_rate",
      "amount_in_account_currency",
      "amount_in_debt_currency",
      "created_at",
      "updated_at",
      "recurring_id",
    ],
  },
  {
    title: "raw_transaction_allocations",
    headers: [
      "id",
      "transaction_id",
      "owner_type",
      "share_percent",
      "share_amount",
      "settlement_effect_type",
      "created_at",
      "updated_at",
    ],
  },
  {
    title: "raw_recurring_items",
    headers: [
      "id",
      "type",
      "name",
      "amount",
      "currency_code",
      "frequency",
      "start_date",
      "end_date",
      "category_id",
      "source_account_id",
      "owner_type",
      "default_shared_split_percent",
      "is_active",
      "auto_include_in_projection",
      "auto_generate_transaction",
      "created_at",
      "updated_at",
    ],
  },
  {
    title: "raw_debts",
    headers: [
      "id",
      "name",
      "owner_type",
      "original_amount",
      "current_balance",
      "currency_code",
      "interest_rate",
      "minimum_payment",
      "payment_day",
      "strategy_priority",
      "notes",
      "is_active",
      "created_at",
      "updated_at",
    ],
  },
  {
    title: "raw_debt_payments",
    headers: [
      "id",
      "debt_id",
      "transaction_id",
      "payment_date",
      "amount",
      "principal_amount",
      "interest_amount",
      "exchange_rate",
      "amount_in_account_currency",
      "amount_in_debt_currency",
      "created_at",
      "updated_at",
    ],
  },
  {
    title: "raw_settlement_ledger",
    headers: [
      "id",
      "date",
      "source_transaction_id",
      "from_party",
      "to_party",
      "amount",
      "reason",
      "notes",
      "created_at",
      "updated_at",
    ],
  },
  {
    // Temporary "buzón de sugerencias" tab for the beta period. Drop when
    // the feedback feature retires.
    title: "raw_feedback",
    headers: [
      "id",
      "title",
      "message",
      "severity",
      "tag",
      "created_by_user_id",
      "is_deleted",
      "created_at",
      "updated_at",
    ],
  },
];

/**
 * For each raw_* tab in `RAW_TABS`: create it if missing, then ensure the
 * header row matches the canonical order (overwrites row 1). Existing
 * data rows below row 1 are left untouched.
 *
 * Returns the spreadsheet metadata after any tab additions.
 */
export async function ensureRawTabs(spreadsheetId: string): Promise<void> {
  const meta = await getSpreadsheet(spreadsheetId);
  const existingTitles = new Set(meta.sheets.map((s) => s.title));

  // Create every missing tab in a single batchUpdate (one network call,
  // independent of how many tabs are missing).
  const missing = RAW_TABS.filter((spec) => !existingTitles.has(spec.title)).map(
    (spec) => spec.title,
  );
  if (missing.length > 0) {
    await addSheets(spreadsheetId, missing);
  }

  // Write/refresh every header row in a single values:batchUpdate. RAW
  // values, no formula risk.
  const headerUpdates: ValueRangeUpdate[] = RAW_TABS.map((spec) => ({
    range: `${spec.title}!A1:${columnLetter(spec.headers.length)}1`,
    values: [spec.headers as string[]],
  }));
  await batchUpdateValues(spreadsheetId, headerUpdates);
}

/** A → Z, then AA → AZ, BA → BZ, … (we never need beyond ~30 columns). */
export function columnLetter(n: number): string {
  if (n <= 0) throw new Error("columnLetter: n must be >= 1");
  let s = "";
  let remaining = n;
  while (remaining > 0) {
    const mod = (remaining - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return s;
}
