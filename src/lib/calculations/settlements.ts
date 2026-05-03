/**
 * Settlements engine — DB-aware glue between `expenseAllocator` and the
 * `settlement_ledger` table. Call `recomputeForTransaction(txId)` after
 * any create / edit / delete on a transaction; the engine wipes the
 * ledger entries that were derived from that transaction and re-derives
 * them from the current DB state. Idempotent.
 *
 * Net balances are still computed by `settlementsRepo.netBalance()` —
 * this module only writes the raw ledger.
 */

import { exec, selectAll, transaction } from "@/lib/db/client";
import { SEED_IDS } from "@/lib/db/seed";
import { coerceBooleans, newId, nowIso } from "@/lib/db/repositories/_helpers";
import type {
  Account,
  OwnerType,
  Transaction,
  TransactionAllocation,
} from "@/lib/db/types";
import {
  cashSourceFromAccount,
  expenseAllocator,
  type AllocatorOwner,
} from "./allocator";

interface MinimalContext {
  transaction: Transaction;
  allocations: TransactionAllocation[];
  account: Account;
}

const TX_BOOL_KEYS = ["is_deleted"] as const satisfies ReadonlyArray<
  keyof Transaction
>;
const ACCT_BOOL_KEYS = ["is_archived"] as const satisfies ReadonlyArray<
  keyof Account
>;

function readContext(transactionId: string): MinimalContext | null {
  const txRow = selectAll<Record<string, unknown>>(
    "SELECT * FROM transactions WHERE id = ?",
    [transactionId],
  )[0];
  if (!txRow) return null;
  const tx = coerceBooleans<Transaction>(txRow, TX_BOOL_KEYS);

  const allocations = selectAll<TransactionAllocation>(
    "SELECT * FROM transaction_allocations WHERE transaction_id = ?",
    [transactionId],
  );

  const acctRow = selectAll<Record<string, unknown>>(
    "SELECT * FROM accounts WHERE id = ?",
    [tx.source_account_id],
  )[0];
  if (!acctRow) {
    throw new Error(`Account ${tx.source_account_id} missing for tx ${tx.id}`);
  }
  const account = coerceBooleans<Account>(acctRow, ACCT_BOOL_KEYS);

  return { transaction: tx, allocations, account };
}

/**
 * Infer the economic owner from existing allocations:
 *  - exactly one row → that row's owner_type
 *  - multiple rows → HOUSEHOLD (a shared expense)
 *  - zero rows → throws (an inconsistent tx; caller should have written allocations)
 */
export function inferOwnerFromAllocations(
  allocations: TransactionAllocation[],
): AllocatorOwner {
  if (allocations.length === 0) {
    throw new Error("Cannot infer owner: transaction has no allocations");
  }
  if (allocations.length === 1) return allocations[0]!.owner_type;
  return "HOUSEHOLD";
}

/**
 * Infer Fran's split percentage from a household's two-row allocation.
 * Returns 50 if the allocation is non-standard (e.g. only one row).
 */
export function inferSplitFranPercent(
  allocations: TransactionAllocation[],
): number {
  const fran = allocations.find((a) => a.owner_type === "FRAN");
  return fran?.share_percent ?? 50;
}

const DEFAULT_FIXTURES = {
  franUserId: SEED_IDS.users.fran,
  samUserId: SEED_IDS.users.sam,
};

/**
 * Recompute the settlement_ledger for a single transaction. Wraps in a
 * DB transaction so the wipe + write is atomic.
 */
export function recomputeForTransaction(
  transactionId: string,
  fixtures: { franUserId: string; samUserId: string } = DEFAULT_FIXTURES,
): void {
  transaction(() => {
    // Always start from a clean slate for this tx.
    exec("DELETE FROM settlement_ledger WHERE source_transaction_id = ?", [
      transactionId,
    ]);

    const ctx = readContext(transactionId);
    if (!ctx) return;
    const { transaction: tx, allocations, account } = ctx;

    // Settlements are only meaningful for non-deleted EXPENSE transactions.
    if (tx.is_deleted || tx.type !== "EXPENSE") return;
    if (allocations.length === 0) return;

    const result = expenseAllocator({
      amount: tx.amount,
      source: cashSourceFromAccount(account, fixtures),
      owner: inferOwnerFromAllocations(allocations),
      splitFranPercent: inferSplitFranPercent(allocations),
    });

    const now = nowIso();
    for (const s of result.settlements) {
      exec(
        `INSERT INTO settlement_ledger (id, date, source_transaction_id,
            from_party, to_party, amount, reason, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          tx.date,
          tx.id,
          s.from,
          s.to,
          s.amount,
          s.reason,
          null,
          now,
          now,
        ],
      );
    }
  });
}

/**
 * Net balance "from owes to" between two parties — convenience that doesn't
 * need a DB connection in tests, exposed here for symmetry with the rest of
 * the engine. Repository-side `settlementsRepo.netBalance` is canonical.
 */
export function netBalance(
  ledger: Array<{ from_party: OwnerType; to_party: OwnerType; amount: number }>,
  from: OwnerType,
  to: OwnerType,
): number {
  let sum = 0;
  for (const e of ledger) {
    if (e.from_party === from && e.to_party === to) sum += e.amount;
    else if (e.from_party === to && e.to_party === from) sum -= e.amount;
  }
  return Math.round(sum * 100) / 100;
}
