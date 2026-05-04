/**
 * Sync queue helpers — small wrappers around the `sync_queue` table. The
 * Phase 9a push uses a snapshot strategy (write all rows on every sync),
 * so the queue isn't actually consumed yet, but we keep these helpers so
 * incremental sync (Phase 9b) has the API ready.
 *
 * Repos call `enqueueChange(...)` after every write so when we flip to
 * incremental, no repo code changes.
 */

import { exec, selectAll } from "@/lib/db/client";
import { newId, nowIso } from "@/lib/db/repositories/_helpers";
import type { SyncAction, SyncQueueItem } from "@/lib/db/types";

export function enqueueChange(
  entityType: string,
  entityId: string,
  action: SyncAction,
): void {
  const now = nowIso();
  exec(
    `INSERT INTO sync_queue (id, entity_type, entity_id, action_type, status,
       attempt_count, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'PENDING', 0, NULL, ?, ?)`,
    [newId(), entityType, entityId, action, now, now],
  );
}

export function listPending(): SyncQueueItem[] {
  return selectAll<SyncQueueItem>(
    "SELECT * FROM sync_queue WHERE status = 'PENDING' ORDER BY created_at ASC",
  );
}

export function markAllSynced(ids: string[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(", ");
  exec(
    `UPDATE sync_queue SET status = 'SYNCED', updated_at = ?
     WHERE id IN (${placeholders})`,
    [nowIso(), ...ids],
  );
}

export function markFailed(id: string, error: string): void {
  exec(
    `UPDATE sync_queue SET status = 'FAILED', attempt_count = attempt_count + 1,
       last_error = ?, updated_at = ?
     WHERE id = ?`,
    [error, nowIso(), id],
  );
}

/** For tests + the “clear queue history” admin button (later). */
export function clearSyncedOlderThan(isoCutoff: string): void {
  exec("DELETE FROM sync_queue WHERE status = 'SYNCED' AND updated_at < ?", [
    isoCutoff,
  ]);
}
