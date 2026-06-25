import { exec, selectAll, selectOne, transaction } from "../client";
import type { Debt, DebtPayment, OwnerType } from "../types";
import { coerceBooleans, fromBool, newId, nowIso } from "./_helpers";
import { enqueueChange } from "@/lib/sync/queue";

const DEBT_BOOL_KEYS = [
  "is_active",
  "is_deleted",
] as const satisfies ReadonlyArray<keyof Debt>;

function mapDebt(row: Record<string, unknown>): Debt {
  return coerceBooleans<Debt>(row, DEBT_BOOL_KEYS);
}

interface CreateDebtInput
  extends Omit<Debt, "id" | "created_at" | "updated_at" | "is_deleted"> {
  id?: string;
  /** Defaults to false. Soft-deleted debts are unreachable from any UI flow. */
  is_deleted?: boolean;
}

export const debtsRepo = {
  // All read methods filter `is_deleted = 0` unconditionally — soft-deleted
  // debts are invisible to every UI path, including the "Archivadas"
  // section. Sync still round-trips them via the row's flag.
  list(activeOnly = true): Debt[] {
    const sql = activeOnly
      ? "SELECT * FROM debts WHERE is_active = 1 AND is_deleted = 0 ORDER BY name ASC"
      : "SELECT * FROM debts WHERE is_deleted = 0 ORDER BY name ASC";
    return selectAll<Record<string, unknown>>(sql).map(mapDebt);
  },

  listByOwner(owner: OwnerType): Debt[] {
    return selectAll<Record<string, unknown>>(
      "SELECT * FROM debts WHERE owner_type = ? AND is_active = 1 AND is_deleted = 0 ORDER BY name ASC",
      [owner],
    ).map(mapDebt);
  },

  getById(id: string): Debt | null {
    const row = selectOne<Record<string, unknown>>(
      "SELECT * FROM debts WHERE id = ? AND is_deleted = 0",
      [id],
    );
    return row ? mapDebt(row) : null;
  },

  create(input: CreateDebtInput): Debt {
    const now = nowIso();
    const d: Debt = {
      ...input,
      id: input.id ?? newId(),
      is_deleted: input.is_deleted ?? false,
      created_at: now,
      updated_at: now,
    };
    exec(
      `INSERT INTO debts (id, name, owner_type, original_amount, current_balance,
        currency_code, interest_rate, minimum_payment, payment_day, strategy_priority,
        notes, is_active, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        fromBool(d.is_deleted),
        d.created_at,
        d.updated_at,
      ],
    );
    enqueueChange("debt", d.id, "CREATE");
    return d;
  },

  /**
   * Apply a delta (signed, in debt currency) to the running balance.
   * When the resulting balance drops to (effectively) zero or below the
   * debt is auto-deactivated — the row stays for history, just no longer
   * appears in the default "active" listing.
   */
  adjustBalance(id: string, delta: number): void {
    const debt = this.getById(id);
    if (!debt) throw new Error(`Debt ${id} not found`);
    const next = round2(debt.current_balance + delta);
    const shouldAutoDeactivate = debt.is_active && next <= ZERO_BALANCE_EPS;
    const now = nowIso();
    if (shouldAutoDeactivate) {
      exec(
        "UPDATE debts SET current_balance = ?, is_active = 0, updated_at = ? WHERE id = ?",
        [next, now, id],
      );
    } else {
      exec(
        "UPDATE debts SET current_balance = ?, updated_at = ? WHERE id = ?",
        [next, now, id],
      );
    }
    enqueueChange("debt", id, "UPDATE");
  },

  /** Mark a debt as inactive without losing its history. Reversible. */
  deactivate(id: string): void {
    exec(
      "UPDATE debts SET is_active = 0, updated_at = ? WHERE id = ?",
      [nowIso(), id],
    );
    enqueueChange("debt", id, "UPDATE");
  },

  /** Bring an archived debt back to the active list. */
  reactivate(id: string): void {
    exec(
      "UPDATE debts SET is_active = 1, updated_at = ? WHERE id = ?",
      [nowIso(), id],
    );
    enqueueChange("debt", id, "UPDATE");
  },

  /**
   * Soft-delete (v7). Flips `is_deleted = 1` so every UI query filters
   * the row out, but the row physically persists. This is critical for
   * sync: a hard DELETE leaves no tombstone, and the pull reconciler
   * (which can't tell "deleted locally" from "never existed locally")
   * would re-INSERT the debt the next time it pulls a Sheet that still
   * has it. Soft-delete propagates the flag instead — same model as
   * `transactions.is_deleted`. `debt_payments` rows stay untouched too
   * (no cascade); they remain in `debt_payments_repo` but unreachable
   * because the only access path is `listForDebt(debtId)` and the
   * debt's getById returns null.
   *
   * Sync action is UPDATE, not DELETE — pushing as DELETE would remove
   * the row from the Sheet on snapshot push, defeating the tombstone.
   */
  delete(id: string): void {
    exec(
      "UPDATE debts SET is_deleted = 1, is_active = 0, updated_at = ? WHERE id = ?",
      [nowIso(), id],
    );
    enqueueChange("debt", id, "UPDATE");
  },

  update(id: string, input: Omit<CreateDebtInput, "id">): Debt {
    const now = nowIso();
    transaction(() => {
      exec(
        `UPDATE debts SET
           name = ?, owner_type = ?, original_amount = ?, current_balance = ?,
           currency_code = ?, interest_rate = ?, minimum_payment = ?,
           payment_day = ?, strategy_priority = ?, notes = ?, is_active = ?,
           updated_at = ?
         WHERE id = ?`,
        [
          input.name,
          input.owner_type,
          input.original_amount,
          input.current_balance,
          input.currency_code,
          input.interest_rate,
          input.minimum_payment,
          input.payment_day,
          input.strategy_priority,
          input.notes,
          fromBool(input.is_active),
          now,
          id,
        ],
      );
    });
    enqueueChange("debt", id, "UPDATE");
    const d = this.getById(id);
    if (!d) throw new Error(`Debt ${id} disappeared after update`);
    return d;
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// A debt with a balance under half a cent is treated as paid off — guards
// against float-drift on FX-converted payments leaving a balance like
// 0.0000003 that would never trigger an exact-zero auto-deactivate.
const ZERO_BALANCE_EPS = 0.005;

interface CreateDebtPaymentInput
  extends Omit<DebtPayment, "id" | "created_at" | "updated_at"> {
  id?: string;
}

export const debtPaymentsRepo = {
  listForDebt(debtId: string): DebtPayment[] {
    return selectAll<DebtPayment>(
      "SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY payment_date DESC",
      [debtId],
    );
  },

  create(input: CreateDebtPaymentInput): DebtPayment {
    const now = nowIso();
    const p: DebtPayment = {
      ...input,
      id: input.id ?? newId(),
      created_at: now,
      updated_at: now,
    };
    exec(
      `INSERT INTO debt_payments (id, debt_id, transaction_id, payment_date, amount,
        principal_amount, interest_amount, exchange_rate,
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
    enqueueChange("debt_payment", p.id, "CREATE");
    return p;
  },
};
