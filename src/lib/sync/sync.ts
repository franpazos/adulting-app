/**
 * `syncAll` = pull → push, the single function the UI calls when the user
 * taps "Sync now" (and that auto-sync triggers periodically).
 *
 * Order matters: pull first so any local changes since the last push that
 * haven't been pushed yet stay on top of remote (their `updated_at` is
 * newer, so reconciliation skips the older remote rows). Then push the
 * merged state.
 *
 * **If pull fails, we abort the push.** Push is a snapshot replace —
 * clearing the raw_* tabs and writing the full local state. With a stale
 * local view (because pull didn't refresh it) we'd clobber remote rows
 * the other device may have just pushed. Better to fail loudly and let
 * the user retry once the pull issue clears (transient network, expired
 * token, etc.) than to silently corrupt the shared ledger.
 *
 * Pull returning zero rows is *not* a failure — that's the empty-sheet
 * case on a fresh spreadsheet, and push must run to populate it.
 */

import { pullAll, type PullReport } from "./pull";
import { pushAll, type PushReport } from "./push";

export interface SyncReport {
  pull: PullReport | null;
  push: PushReport | null;
  pullError: string | null;
  pushError: string | null;
  durationMs: number;
}

export async function syncAll(spreadsheetId: string): Promise<SyncReport> {
  const start = Date.now();
  let pull: PullReport | null = null;
  let pullError: string | null = null;
  try {
    pull = await pullAll(spreadsheetId);
  } catch (err) {
    pullError = err instanceof Error ? err.message : String(err);
    console.warn("[sync] pull failed, skipping push:", err);
  }

  let push: PushReport | null = null;
  let pushError: string | null = null;
  if (!pullError) {
    try {
      push = await pushAll(spreadsheetId);
    } catch (err) {
      pushError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    pull,
    push,
    pullError,
    pushError,
    durationMs: Date.now() - start,
  };
}
