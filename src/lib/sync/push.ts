/**
 * Push worker — Phase 9a snapshot strategy.
 *
 * Each call to `pushAll(spreadsheetId)`:
 *   1. Ensures all `raw_*` tabs exist with the canonical headers.
 *   2. Reads a full snapshot from local SQLite (one table per tab).
 *   3. For each tab, clears the data range (row 2 onwards) and writes
 *      the snapshot rows in one `updateValues` call.
 *   4. Marks any `sync_queue` PENDING items as SYNCED so the "X pending
 *      changes" indicator resets after a successful push.
 *
 * This is heavy compared to incremental sync but it's correct under the
 * common 2-user case (same data, occasional out-of-order edits) because
 * every push converges on what the local DB believes — and Phase 9b
 * adds pull/reconcile so the divergence window is short.
 */

import { clearValues, updateValues } from "@/lib/google/sheets-api";
import { RAW_TABS, columnLetter, ensureRawTabs } from "./tabs";
import { buildSnapshot, type SnapshotData } from "./writers";
import { listPending, markAllSynced } from "./queue";

export interface PushReport {
  spreadsheetId: string;
  totals: Record<string, number>;
  durationMs: number;
}

const TAB_KEY_BY_TITLE: Record<string, keyof SnapshotData> = {
  raw_users: "users",
  raw_accounts: "accounts",
  raw_categories: "categories",
  raw_transactions: "transactions",
  raw_transaction_allocations: "allocations",
  raw_recurring_items: "recurring",
  raw_debts: "debts",
  raw_debt_payments: "debt_payments",
  raw_settlement_ledger: "settlements",
  raw_feedback: "feedback",
};

export async function pushAll(spreadsheetId: string): Promise<PushReport> {
  const start = Date.now();

  await ensureRawTabs(spreadsheetId);
  const snapshot = buildSnapshot();
  const totals: Record<string, number> = {};

  // Capture the queue snapshot we are about to drain BEFORE the network
  // calls — anything enqueued while we push will stay PENDING for the next
  // round. Avoids losing changes that happen mid-push.
  const pendingIds = listPending().map((q) => q.id);

  for (const spec of RAW_TABS) {
    const key = TAB_KEY_BY_TITLE[spec.title];
    if (!key) continue;
    const rows = snapshot[key];
    const lastCol = columnLetter(spec.headers.length);

    // Always clear from row 2 onwards so removed rows really disappear.
    await clearValues(spreadsheetId, `${spec.title}!A2:${lastCol}`);

    if (rows.length > 0) {
      const range = `${spec.title}!A2:${lastCol}${1 + rows.length}`;
      await updateValues(spreadsheetId, range, rows);
    }
    totals[spec.title] = rows.length;
  }

  if (pendingIds.length > 0) markAllSynced(pendingIds);

  return {
    spreadsheetId,
    totals,
    durationMs: Date.now() - start,
  };
}
