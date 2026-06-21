import { exec, selectAll, selectOne } from "../client";
import type { Category, CategoryKind } from "../types";
import { coerceBooleans, fromBool, newId, nowIso } from "./_helpers";
import { enqueueChange } from "@/lib/sync/queue";

const BOOL_KEYS = ["is_default", "is_active"] as const satisfies ReadonlyArray<keyof Category>;

function map(row: Record<string, unknown>): Category {
  return coerceBooleans<Category>(row, BOOL_KEYS);
}

interface CreateCategoryInput {
  id?: string;
  name: string;
  kind: CategoryKind;
  parent_id?: string | null;
  is_default?: boolean;
  sort_order?: number;
  color?: string | null;
}

/**
 * Update only the user-editable surface from the form: name, kind,
 * color. The non-form fields (`is_default`, `sort_order`, `parent_id`,
 * `is_active`) stay untouched — they're owned by other paths (seed,
 * future reordering UI, `softDelete` / `reactivate`).
 */
interface UpdateCategoryInput {
  name: string;
  kind: CategoryKind;
  color?: string | null;
}

export const categoriesRepo = {
  list(kind?: CategoryKind, activeOnly = true): Category[] {
    const whereParts: string[] = [];
    const params: unknown[] = [];
    if (kind) {
      whereParts.push("kind = ?");
      params.push(kind);
    }
    if (activeOnly) {
      whereParts.push("is_active = 1");
    }
    const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
    const orderBy = kind
      ? "ORDER BY sort_order ASC, name ASC"
      : "ORDER BY kind ASC, sort_order ASC, name ASC";
    return selectAll<Record<string, unknown>>(
      `SELECT * FROM categories ${where} ${orderBy}`,
      params,
    ).map(map);
  },

  getById(id: string): Category | null {
    const row = selectOne<Record<string, unknown>>(
      "SELECT * FROM categories WHERE id = ?",
      [id],
    );
    return row ? map(row) : null;
  },

  create(input: CreateCategoryInput): Category {
    const now = nowIso();
    const c: Category = {
      id: input.id ?? newId(),
      name: input.name,
      kind: input.kind,
      parent_id: input.parent_id ?? null,
      is_default: input.is_default ?? false,
      sort_order: input.sort_order ?? 0,
      color: input.color ?? null,
      created_at: now,
      updated_at: now,
      is_active: true,
    };
    exec(
      `INSERT INTO categories (id, name, kind, parent_id, is_default, sort_order,
        color, created_at, updated_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.id,
        c.name,
        c.kind,
        c.parent_id,
        fromBool(c.is_default),
        c.sort_order,
        c.color,
        c.created_at,
        c.updated_at,
        fromBool(c.is_active),
      ],
    );
    enqueueChange("category", c.id, "CREATE");
    return c;
  },

  /**
   * Edit a category's user-facing fields (name, kind, color).
   *
   * Deliberately does NOT touch `is_active`, `is_default`, `sort_order`
   * or `parent_id`. `is_active` is owned by `softDelete` / `reactivate`
   * (editing a name shouldn't accidentally un-archive a category). The
   * other three are populated by the seed today and would belong to
   * future dedicated flows (drag-to-reorder, "make default" toggle,
   * subcategory picker) — not to this form.
   */
  update(id: string, input: UpdateCategoryInput): Category {
    const now = nowIso();
    exec(
      `UPDATE categories SET name = ?, kind = ?, color = ?, updated_at = ?
       WHERE id = ?`,
      [input.name, input.kind, input.color ?? null, now, id],
    );
    enqueueChange("category", id, "UPDATE");
    const c = this.getById(id);
    if (!c) throw new Error(`Category ${id} disappeared after update`);
    return c;
  },

  softDelete(id: string): void {
    exec(
      "UPDATE categories SET is_active = 0, updated_at = ? WHERE id = ?",
      [nowIso(), id],
    );
    enqueueChange("category", id, "UPDATE");
  },

  reactivate(id: string): void {
    exec(
      "UPDATE categories SET is_active = 1, updated_at = ? WHERE id = ?",
      [nowIso(), id],
    );
    enqueueChange("category", id, "UPDATE");
  },
};
