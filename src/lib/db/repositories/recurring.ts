import { exec, selectAll, selectOne } from "../client";
import type { RecurringItem, RecurringType } from "../types";
import { coerceBooleans, fromBool, newId, nowIso } from "./_helpers";

const BOOL_KEYS = [
  "is_active",
  "auto_include_in_projection",
  "auto_generate_transaction",
] as const satisfies ReadonlyArray<keyof RecurringItem>;

function map(row: Record<string, unknown>): RecurringItem {
  return coerceBooleans<RecurringItem>(row, BOOL_KEYS);
}

interface CreateRecurringInput
  extends Omit<RecurringItem, "id" | "created_at" | "updated_at"> {
  id?: string;
}

export const recurringRepo = {
  list(activeOnly = true): RecurringItem[] {
    const sql = activeOnly
      ? "SELECT * FROM recurring_items WHERE is_active = 1 ORDER BY name ASC"
      : "SELECT * FROM recurring_items ORDER BY name ASC";
    return selectAll<Record<string, unknown>>(sql).map(map);
  },

  listByType(type: RecurringType): RecurringItem[] {
    return selectAll<Record<string, unknown>>(
      "SELECT * FROM recurring_items WHERE type = ? AND is_active = 1 ORDER BY name ASC",
      [type],
    ).map(map);
  },

  getById(id: string): RecurringItem | null {
    const row = selectOne<Record<string, unknown>>(
      "SELECT * FROM recurring_items WHERE id = ?",
      [id],
    );
    return row ? map(row) : null;
  },

  create(input: CreateRecurringInput): RecurringItem {
    const now = nowIso();
    const r: RecurringItem = {
      ...input,
      id: input.id ?? newId(),
      created_at: now,
      updated_at: now,
    };
    exec(
      `INSERT INTO recurring_items (id, type, name, amount, currency_code, frequency,
        start_date, end_date, category_id, source_account_id, owner_type,
        default_shared_split_percent, is_active, auto_include_in_projection,
        auto_generate_transaction, created_at, updated_at)
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
    return r;
  },
};
