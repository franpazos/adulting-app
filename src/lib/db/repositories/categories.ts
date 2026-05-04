import { exec, selectAll, selectOne } from "../client";
import type { Category, CategoryKind } from "../types";
import { coerceBooleans, fromBool, newId, nowIso } from "./_helpers";
import { enqueueChange } from "@/lib/sync/queue";

const BOOL_KEYS = ["is_default"] as const satisfies ReadonlyArray<keyof Category>;

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

export const categoriesRepo = {
  list(kind?: CategoryKind): Category[] {
    if (kind) {
      return selectAll<Record<string, unknown>>(
        "SELECT * FROM categories WHERE kind = ? ORDER BY sort_order ASC, name ASC",
        [kind],
      ).map(map);
    }
    return selectAll<Record<string, unknown>>(
      "SELECT * FROM categories ORDER BY kind ASC, sort_order ASC, name ASC",
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
    };
    exec(
      `INSERT INTO categories (id, name, kind, parent_id, is_default, sort_order,
        color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ],
    );
    enqueueChange("category", c.id, "CREATE");
    return c;
  },
};
