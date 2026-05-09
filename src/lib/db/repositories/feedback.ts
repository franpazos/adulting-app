import { exec, selectAll, selectOne } from "../client";
import type { Feedback, FeedbackSeverity, FeedbackTag } from "../types";
import { coerceBooleans, fromBool, newId, nowIso } from "./_helpers";
import { enqueueChange } from "@/lib/sync/queue";

const BOOL_KEYS = ["is_deleted"] as const satisfies ReadonlyArray<keyof Feedback>;

function map(row: Record<string, unknown>): Feedback {
  return coerceBooleans<Feedback>(row, BOOL_KEYS);
}

export interface CreateFeedbackInput {
  id?: string;
  title: string;
  message: string;
  severity: FeedbackSeverity;
  tag: FeedbackTag;
  created_by_user_id?: string | null;
}

export type UpdateFeedbackInput = Partial<
  Pick<CreateFeedbackInput, "title" | "message" | "severity" | "tag">
>;

export const feedbackRepo = {
  /** Active rows (excludes soft-deleted), newest first. */
  list(): Feedback[] {
    return selectAll<Record<string, unknown>>(
      `SELECT * FROM feedback
       WHERE is_deleted = 0
       ORDER BY created_at DESC`,
    ).map(map);
  },

  getById(id: string): Feedback | null {
    const row = selectOne<Record<string, unknown>>(
      "SELECT * FROM feedback WHERE id = ?",
      [id],
    );
    return row ? map(row) : null;
  },

  create(input: CreateFeedbackInput): Feedback {
    const now = nowIso();
    const f: Feedback = {
      id: input.id ?? newId(),
      title: input.title.trim(),
      message: input.message.trim(),
      severity: input.severity,
      tag: input.tag,
      created_by_user_id: input.created_by_user_id ?? null,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    };
    exec(
      `INSERT INTO feedback (id, title, message, severity, tag,
         created_by_user_id, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        f.id,
        f.title,
        f.message,
        f.severity,
        f.tag,
        f.created_by_user_id,
        fromBool(f.is_deleted),
        f.created_at,
        f.updated_at,
      ],
    );
    enqueueChange("feedback", f.id, "CREATE");
    return f;
  },

  update(id: string, input: UpdateFeedbackInput): void {
    const existing = feedbackRepo.getById(id);
    if (!existing) return;
    const next: Feedback = {
      ...existing,
      title: input.title?.trim() ?? existing.title,
      message: input.message?.trim() ?? existing.message,
      severity: input.severity ?? existing.severity,
      tag: input.tag ?? existing.tag,
      updated_at: nowIso(),
    };
    exec(
      `UPDATE feedback
       SET title = ?, message = ?, severity = ?, tag = ?, updated_at = ?
       WHERE id = ?`,
      [next.title, next.message, next.severity, next.tag, next.updated_at, id],
    );
    enqueueChange("feedback", id, "UPDATE");
  },

  softDelete(id: string): void {
    const now = nowIso();
    exec(
      "UPDATE feedback SET is_deleted = 1, updated_at = ? WHERE id = ?",
      [now, id],
    );
    enqueueChange("feedback", id, "DELETE");
  },
};
