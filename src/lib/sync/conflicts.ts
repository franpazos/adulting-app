/**
 * Sync conflict tracking — populated by the pull worker, consumed by the
 * `/sync/conflicts` UI.
 *
 * A conflict is recorded when the pull would UPDATE a local row whose
 * entity has a PENDING sync_queue entry. That signals the user has local
 * unpushed edits and the remote has *also* been edited since — the two
 * versions disagree and the user should pick.
 *
 * Detection happens **before** the UPDATE writes to the local table, so
 * recording a conflict means we *skipped* the update. The local row
 * stays as-is until the user resolves it, which means push will keep
 * winning while the conflict is unresolved.
 *
 * Resolution paths:
 *   - **Keep local**: mark resolved, leave the queue PENDING. Next push
 *     overwrites the remote with our version.
 *   - **Use remote**: apply the stashed remote payload to the local row,
 *     drop any matching PENDING queue entries, mark resolved.
 */

import { exec, selectAll, transaction } from "@/lib/db/client";
import { newId, nowIso } from "@/lib/db/repositories/_helpers";

export interface SyncConflictRow {
  id: string;
  entity_type: string;
  entity_id: string;
  local_data: string; // JSON
  remote_data: string; // JSON
  local_updated_at: string;
  remote_updated_at: string;
  detected_at: string;
  resolved_at: string | null;
  resolution: "local" | "remote" | null;
}

export interface SyncConflict {
  id: string;
  entity_type: string;
  entity_id: string;
  local: Record<string, unknown>;
  remote: Record<string, unknown>;
  local_updated_at: string;
  remote_updated_at: string;
  detected_at: string;
}

export function recordConflict(args: {
  entity_type: string;
  entity_id: string;
  local: Record<string, unknown>;
  remote: Record<string, unknown>;
  local_updated_at: string;
  remote_updated_at: string;
}): void {
  // If an unresolved conflict for this entity already exists, refresh its
  // remote_data + remote_updated_at instead of stacking duplicates. The
  // user only needs to resolve once; the latest remote view is the most
  // useful comparison.
  const existing = selectAll<SyncConflictRow>(
    `SELECT * FROM sync_conflicts
     WHERE entity_type = ? AND entity_id = ? AND resolved_at IS NULL
     LIMIT 1`,
    [args.entity_type, args.entity_id],
  );
  const now = nowIso();
  if (existing.length > 0) {
    exec(
      `UPDATE sync_conflicts
       SET remote_data = ?, remote_updated_at = ?, detected_at = ?
       WHERE id = ?`,
      [
        JSON.stringify(args.remote),
        args.remote_updated_at,
        now,
        existing[0].id,
      ],
    );
    return;
  }
  exec(
    `INSERT INTO sync_conflicts (
       id, entity_type, entity_id, local_data, remote_data,
       local_updated_at, remote_updated_at, detected_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      args.entity_type,
      args.entity_id,
      JSON.stringify(args.local),
      JSON.stringify(args.remote),
      args.local_updated_at,
      args.remote_updated_at,
      now,
    ],
  );
}

export function listUnresolvedConflicts(): SyncConflict[] {
  const rows = selectAll<SyncConflictRow>(
    `SELECT * FROM sync_conflicts
     WHERE resolved_at IS NULL
     ORDER BY detected_at DESC`,
  );
  return rows.map(parseRow);
}

export function unresolvedConflictCount(): number {
  const [row] = selectAll<{ c: number }>(
    "SELECT COUNT(*) AS c FROM sync_conflicts WHERE resolved_at IS NULL",
  );
  return row?.c ?? 0;
}

export function hasPendingForEntity(
  entityType: string,
  entityId: string,
): boolean {
  const [row] = selectAll<{ c: number }>(
    `SELECT COUNT(*) AS c FROM sync_queue
     WHERE entity_type = ? AND entity_id = ? AND status = 'PENDING'`,
    [entityType, entityId],
  );
  return (row?.c ?? 0) > 0;
}

/**
 * Resolve a conflict by **keeping local**. Doesn't touch the local row;
 * just marks the conflict resolved. Sync queue entries stay PENDING so
 * the next push overwrites remote with the local view.
 */
export function resolveKeepLocal(conflictId: string): void {
  exec(
    `UPDATE sync_conflicts SET resolved_at = ?, resolution = 'local' WHERE id = ?`,
    [nowIso(), conflictId],
  );
}

/**
 * Resolve a conflict by **using remote**. Applies the stashed remote
 * payload to the local row (delegating to a per-entity applier passed
 * in by the caller — we don't want this module to depend on every
 * insert/update writer in pull.ts directly). Drops any matching PENDING
 * queue entries since the local edits are being discarded.
 */
export function resolveUseRemote(
  conflictId: string,
  apply: (
    entityType: string,
    remote: Record<string, unknown>,
  ) => void,
): void {
  const [row] = selectAll<SyncConflictRow>(
    "SELECT * FROM sync_conflicts WHERE id = ?",
    [conflictId],
  );
  if (!row || row.resolved_at) return;
  const remote = JSON.parse(row.remote_data) as Record<string, unknown>;
  transaction(() => {
    apply(row.entity_type, remote);
    // Discard pending local queue entries — the local edits are being
    // overwritten by remote, so there's nothing to push anymore.
    exec(
      `DELETE FROM sync_queue
       WHERE entity_type = ? AND entity_id = ? AND status = 'PENDING'`,
      [row.entity_type, row.entity_id],
    );
    exec(
      `UPDATE sync_conflicts SET resolved_at = ?, resolution = 'remote' WHERE id = ?`,
      [nowIso(), conflictId],
    );
  });
}

function parseRow(r: SyncConflictRow): SyncConflict {
  return {
    id: r.id,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    local: safeParse(r.local_data),
    remote: safeParse(r.remote_data),
    local_updated_at: r.local_updated_at,
    remote_updated_at: r.remote_updated_at,
    detected_at: r.detected_at,
  };
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
