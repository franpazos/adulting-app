/**
 * `syncAll` = pull → push, the single function the UI calls when the user
 * taps "Sync now" (and that auto-sync triggers periodically).
 *
 * Order matters: pull first so any local changes since the last push that
 * haven't been pushed yet stay on top of remote (their `updated_at` is
 * newer, so reconciliation skips the older remote rows). Then push the
 * merged state.
 *
 * If pull fails we still try to push — better to have local writes uploaded
 * than to silently lose them. If push fails after a successful pull we
 * surface the push error.
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
    console.warn("[sync] pull failed, attempting push anyway:", err);
  }

  let push: PushReport | null = null;
  let pushError: string | null = null;
  try {
    push = await pushAll(spreadsheetId);
  } catch (err) {
    pushError = err instanceof Error ? err.message : String(err);
  }

  return {
    pull,
    push,
    pullError,
    pushError,
    durationMs: Date.now() - start,
  };
}
