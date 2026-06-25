import { exec, selectAll, selectOne, selectScalar, transaction } from "../client";
import type { RecurringItem, RecurringType } from "../types";
import { coerceBooleans, fromBool, newId, nowIso } from "./_helpers";
import { enqueueChange } from "@/lib/sync/queue";

/**
 * Paid-state summary for a single recurring within a month. `count` is
 * the number of non-deleted transactions tied to the recurring in that
 * month; a recurring is "paid" iff `count >= 1`. `lastDate` is the most
 * recent transaction date, used in the Detail page subtitle.
 */
export interface RecurringMonthState {
  count: number;
  totalAmount: number;
  lastDate: string | null;
}

const BOOL_KEYS = [
  "is_active",
  "auto_include_in_projection",
  "auto_generate_transaction",
] as const satisfies ReadonlyArray<keyof RecurringItem>;

function map(row: Record<string, unknown>): RecurringItem {
  return coerceBooleans<RecurringItem>(row, BOOL_KEYS);
}

interface CreateRecurringInput
  extends Omit<RecurringItem, "id" | "created_at" | "updated_at" | "debt_id"> {
  id?: string;
  /** Only meaningful for type=DEBT_PAYMENT (Level 4). Defaults to null. */
  debt_id?: string | null;
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
      debt_id: input.debt_id ?? null,
      created_at: now,
      updated_at: now,
    };
    exec(
      `INSERT INTO recurring_items (id, type, name, amount, currency_code, frequency,
        start_date, end_date, category_id, source_account_id, owner_type,
        default_shared_split_percent, is_active, auto_include_in_projection,
        auto_generate_transaction, debt_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        r.debt_id,
        r.created_at,
        r.updated_at,
      ],
    );
    enqueueChange("recurring_item", r.id, "CREATE");
    return r;
  },

  update(id: string, input: Omit<CreateRecurringInput, "id">): RecurringItem {
    const now = nowIso();
    transaction(() => {
      exec(
        `UPDATE recurring_items SET
           type = ?, name = ?, amount = ?, currency_code = ?, frequency = ?,
           start_date = ?, end_date = ?, category_id = ?, source_account_id = ?,
           owner_type = ?, default_shared_split_percent = ?,
           is_active = ?, auto_include_in_projection = ?, auto_generate_transaction = ?,
           debt_id = ?, updated_at = ?
         WHERE id = ?`,
        [
          input.type,
          input.name,
          input.amount,
          input.currency_code,
          input.frequency,
          input.start_date,
          input.end_date,
          input.category_id ?? null,
          input.source_account_id ?? null,
          input.owner_type,
          input.default_shared_split_percent ?? null,
          fromBool(input.is_active),
          fromBool(input.auto_include_in_projection),
          fromBool(input.auto_generate_transaction),
          input.debt_id ?? null,
          now,
          id,
        ],
      );
    });
    enqueueChange("recurring_item", id, "UPDATE");
    const r = this.getById(id);
    if (!r) throw new Error(`RecurringItem ${id} disappeared after update`);
    return r;
  },

  /** Soft delete by deactivation. We keep history rather than hard-delete. */
  deactivate(id: string): void {
    exec(
      "UPDATE recurring_items SET is_active = 0, updated_at = ? WHERE id = ?",
      [nowIso(), id],
    );
    enqueueChange("recurring_item", id, "UPDATE");
  },

  reactivate(id: string): void {
    exec(
      "UPDATE recurring_items SET is_active = 1, updated_at = ? WHERE id = ?",
      [nowIso(), id],
    );
    enqueueChange("recurring_item", id, "UPDATE");
  },

  /** True iff at least one non-deleted transaction links to this recurring in the given month. */
  isPaidForMonth(id: string, monthKey: string): boolean {
    const count = selectScalar(
      `SELECT COUNT(*) FROM transactions
       WHERE recurring_id = ? AND month_key = ? AND is_deleted = 0`,
      [id, monthKey],
    );
    return count > 0;
  },

  /**
   * Batched paid-state for every recurring touched in a month. Returns a
   * Map keyed by `recurring_id`; recurrings with no transaction in the
   * month are simply absent from the Map (caller treats absence as
   * unpaid). One query for the whole page, not N+1.
   */
  paidStateForMonth(monthKey: string): Map<string, RecurringMonthState> {
    const rows = selectAll<{
      recurring_id: string;
      count: number;
      total_amount: number;
      last_date: string;
    }>(
      `SELECT recurring_id,
              COUNT(*) AS count,
              COALESCE(SUM(amount), 0) AS total_amount,
              MAX(date) AS last_date
         FROM transactions
        WHERE recurring_id IS NOT NULL
          AND month_key = ?
          AND is_deleted = 0
        GROUP BY recurring_id`,
      [monthKey],
    );
    const map = new Map<string, RecurringMonthState>();
    for (const r of rows) {
      map.set(r.recurring_id, {
        count: r.count,
        totalAmount: r.total_amount,
        lastDate: r.last_date ?? null,
      });
      if (import.meta.env.DEV && r.count > 1) {
        // Surface duplicate payments while debugging; the UI still shows
        // a single ✅ — counting/visualizing duplicates is out of scope
        // for Level 2 (see decisions log).
        console.warn(
          `[recurring] ${r.recurring_id} has ${r.count} transactions in ${monthKey}`,
        );
      }
    }
    return map;
  },
};
