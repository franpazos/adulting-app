import { exec, selectAll, selectOne } from "../client";
import type { AccountAdjustment } from "../types";
import { coerceBooleans, fromBool, newId, nowIso } from "./_helpers";
import { enqueueChange } from "@/lib/sync/queue";

const BOOL_KEYS = [
  "is_deleted",
] as const satisfies ReadonlyArray<keyof AccountAdjustment>;

function map(row: Record<string, unknown>): AccountAdjustment {
  return coerceBooleans<AccountAdjustment>(row, BOOL_KEYS);
}

export interface CreateAccountAdjustmentInput {
  id?: string;
  account_id: string;
  date: string;
  target_balance: number;
  delta: number;
  notes?: string | null;
}

export const accountAdjustmentsRepo = {
  /** All live (non-soft-deleted) adjustments for an account, newest first. */
  listForAccount(accountId: string): AccountAdjustment[] {
    return selectAll<Record<string, unknown>>(
      `SELECT * FROM account_adjustments
       WHERE account_id = ? AND is_deleted = 0
       ORDER BY date DESC, created_at DESC`,
      [accountId],
    ).map(map);
  },

  /** Most recent live adjustment for an account, or null. */
  lastForAccount(accountId: string): AccountAdjustment | null {
    const row = selectOne<Record<string, unknown>>(
      `SELECT * FROM account_adjustments
       WHERE account_id = ? AND is_deleted = 0
       ORDER BY date DESC, created_at DESC
       LIMIT 1`,
      [accountId],
    );
    return row ? map(row) : null;
  },

  getById(id: string): AccountAdjustment | null {
    const row = selectOne<Record<string, unknown>>(
      "SELECT * FROM account_adjustments WHERE id = ?",
      [id],
    );
    return row ? map(row) : null;
  },

  create(input: CreateAccountAdjustmentInput): AccountAdjustment {
    const now = nowIso();
    const adj: AccountAdjustment = {
      id: input.id ?? newId(),
      account_id: input.account_id,
      date: input.date,
      target_balance: input.target_balance,
      delta: input.delta,
      notes: input.notes ?? null,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    };
    exec(
      `INSERT INTO account_adjustments
         (id, account_id, date, target_balance, delta, notes, is_deleted,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adj.id,
        adj.account_id,
        adj.date,
        adj.target_balance,
        adj.delta,
        adj.notes,
        fromBool(adj.is_deleted),
        adj.created_at,
        adj.updated_at,
      ],
    );
    enqueueChange("account_adjustment", adj.id, "CREATE");
    return adj;
  },

  /**
   * Soft-delete: flips `is_deleted = 1` so the row is invisible to UI and
   * aggregations, but the row physically persists for sync round-trip. A
   * hard DELETE would let the pull reconciler re-INSERT the row from any
   * remote Sheet that still has it. Sync action is UPDATE so snapshot
   * push preserves the tombstone (same model as debts.delete, v7).
   */
  softDelete(id: string): void {
    exec(
      "UPDATE account_adjustments SET is_deleted = 1, updated_at = ? WHERE id = ?",
      [nowIso(), id],
    );
    enqueueChange("account_adjustment", id, "UPDATE");
  },
};
