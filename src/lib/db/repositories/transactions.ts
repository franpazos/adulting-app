import { exec, selectAll, selectOne, selectScalar, transaction } from "../client";
import type {
  Transaction,
  TransactionAllocation,
  TransactionOrigin,
  TransactionType,
  OwnerType,
  SyncStatus,
} from "../types";
import { coerceBooleans, fromBool, newId, nowIso } from "./_helpers";

const BOOL_KEYS = ["is_deleted"] as const satisfies ReadonlyArray<keyof Transaction>;

function mapTx(row: Record<string, unknown>): Transaction {
  return coerceBooleans<Transaction>(row, BOOL_KEYS);
}

function mapAlloc(row: Record<string, unknown>): TransactionAllocation {
  return row as unknown as TransactionAllocation;
}

export interface AllocationInput {
  owner_type: OwnerType;
  share_percent: number;
  share_amount: number;
  settlement_effect_type?: string | null;
}

export interface CreateTransactionInput {
  id?: string;
  type: TransactionType;
  date: string;
  amount: number;
  currency_code: string;
  source_account_id: string;
  description?: string | null;
  notes?: string | null;
  category_id?: string | null;
  created_by_user_id?: string | null;
  merchant?: string | null;
  origin?: TransactionOrigin;
  sheet_sync_status?: SyncStatus;
  exchange_rate?: number | null;
  amount_in_account_currency?: number | null;
  amount_in_debt_currency?: number | null;
  allocations: AllocationInput[];
}

function monthKeyFromDate(date: string): string {
  return date.slice(0, 7); // YYYY-MM-DD → YYYY-MM
}

export const transactionsRepo = {
  /** Insert a transaction and its allocations atomically. */
  create(input: CreateTransactionInput): Transaction {
    const now = nowIso();
    const tx: Transaction = {
      id: input.id ?? newId(),
      type: input.type,
      date: input.date,
      month_key: monthKeyFromDate(input.date),
      amount: input.amount,
      currency_code: input.currency_code,
      description: input.description ?? null,
      notes: input.notes ?? null,
      category_id: input.category_id ?? null,
      source_account_id: input.source_account_id,
      created_by_user_id: input.created_by_user_id ?? null,
      merchant: input.merchant ?? null,
      is_deleted: false,
      origin: input.origin ?? "MANUAL",
      sheet_sync_status: input.sheet_sync_status ?? "PENDING",
      sheet_row_ref: null,
      exchange_rate: input.exchange_rate ?? null,
      amount_in_account_currency: input.amount_in_account_currency ?? null,
      amount_in_debt_currency: input.amount_in_debt_currency ?? null,
      created_at: now,
      updated_at: now,
    };

    transaction(() => {
      exec(
        `INSERT INTO transactions (id, type, date, month_key, amount, currency_code,
          description, notes, category_id, source_account_id, created_by_user_id,
          merchant, is_deleted, origin, sheet_sync_status, sheet_row_ref,
          exchange_rate, amount_in_account_currency, amount_in_debt_currency,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tx.id,
          tx.type,
          tx.date,
          tx.month_key,
          tx.amount,
          tx.currency_code,
          tx.description,
          tx.notes,
          tx.category_id,
          tx.source_account_id,
          tx.created_by_user_id,
          tx.merchant,
          fromBool(tx.is_deleted),
          tx.origin,
          tx.sheet_sync_status,
          tx.sheet_row_ref,
          tx.exchange_rate,
          tx.amount_in_account_currency,
          tx.amount_in_debt_currency,
          tx.created_at,
          tx.updated_at,
        ],
      );

      for (const alloc of input.allocations) {
        exec(
          `INSERT INTO transaction_allocations (id, transaction_id, owner_type,
            share_percent, share_amount, settlement_effect_type, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId(),
            tx.id,
            alloc.owner_type,
            alloc.share_percent,
            alloc.share_amount,
            alloc.settlement_effect_type ?? null,
            now,
            now,
          ],
        );
      }
    });

    return tx;
  },

  getById(id: string): Transaction | null {
    const row = selectOne<Record<string, unknown>>(
      "SELECT * FROM transactions WHERE id = ?",
      [id],
    );
    return row ? mapTx(row) : null;
  },

  listByMonth(monthKey: string, type?: TransactionType): Transaction[] {
    if (type) {
      return selectAll<Record<string, unknown>>(
        `SELECT * FROM transactions
         WHERE month_key = ? AND type = ? AND is_deleted = 0
         ORDER BY date DESC, created_at DESC`,
        [monthKey, type],
      ).map(mapTx);
    }
    return selectAll<Record<string, unknown>>(
      `SELECT * FROM transactions
       WHERE month_key = ? AND is_deleted = 0
       ORDER BY date DESC, created_at DESC`,
      [monthKey],
    ).map(mapTx);
  },

  allocationsFor(transactionId: string): TransactionAllocation[] {
    return selectAll<Record<string, unknown>>(
      "SELECT * FROM transaction_allocations WHERE transaction_id = ?",
      [transactionId],
    ).map(mapAlloc);
  },

  /**
   * Update a transaction's editable fields and replace its allocations
   * atomically. The caller is responsible for running
   * `recomputeForTransaction(id)` after this returns so the settlement
   * ledger reflects the new state.
   */
  update(
    id: string,
    input: Omit<CreateTransactionInput, "id" | "type"> & {
      type?: TransactionType;
    },
  ): Transaction {
    const now = nowIso();
    transaction(() => {
      exec(
        `UPDATE transactions SET
           type = COALESCE(?, type),
           date = ?, month_key = ?, amount = ?, currency_code = ?,
           description = ?, notes = ?, category_id = ?,
           source_account_id = ?, created_by_user_id = ?, merchant = ?,
           exchange_rate = ?, amount_in_account_currency = ?, amount_in_debt_currency = ?,
           updated_at = ?
         WHERE id = ?`,
        [
          input.type ?? null,
          input.date,
          monthKeyFromDate(input.date),
          input.amount,
          input.currency_code,
          input.description ?? null,
          input.notes ?? null,
          input.category_id ?? null,
          input.source_account_id,
          input.created_by_user_id ?? null,
          input.merchant ?? null,
          input.exchange_rate ?? null,
          input.amount_in_account_currency ?? null,
          input.amount_in_debt_currency ?? null,
          now,
          id,
        ],
      );
      exec(
        "DELETE FROM transaction_allocations WHERE transaction_id = ?",
        [id],
      );
      for (const alloc of input.allocations) {
        exec(
          `INSERT INTO transaction_allocations (id, transaction_id, owner_type,
            share_percent, share_amount, settlement_effect_type, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId(),
            id,
            alloc.owner_type,
            alloc.share_percent,
            alloc.share_amount,
            alloc.settlement_effect_type ?? null,
            now,
            now,
          ],
        );
      }
    });
    const tx = this.getById(id);
    if (!tx) throw new Error(`Transaction ${id} disappeared after update`);
    return tx;
  },

  /**
   * Soft-delete a transaction. The caller must run
   * `recomputeForTransaction(id)` afterwards so dependent ledger entries
   * are wiped.
   */
  softDelete(id: string): void {
    exec(
      "UPDATE transactions SET is_deleted = 1, updated_at = ? WHERE id = ?",
      [nowIso(), id],
    );
  },

  /** Sum of `share_amount` for a given owner across a month, by transaction type. */
  monthOwnerTotal(
    monthKey: string,
    owner: OwnerType,
    type: TransactionType,
  ): number {
    return selectScalar(
      `SELECT COALESCE(SUM(a.share_amount), 0)
       FROM transaction_allocations a
       JOIN transactions t ON t.id = a.transaction_id
       WHERE t.month_key = ?
         AND a.owner_type = ?
         AND t.type = ?
         AND t.is_deleted = 0`,
      [monthKey, owner, type],
    );
  },

  /** Total cash flow on an account in a month, by tx type (positive number). */
  monthAccountTotal(
    monthKey: string,
    accountId: string,
    type: TransactionType,
  ): number {
    return selectScalar(
      `SELECT COALESCE(SUM(amount), 0)
       FROM transactions
       WHERE month_key = ? AND source_account_id = ? AND type = ? AND is_deleted = 0`,
      [monthKey, accountId, type],
    );
  },
};
