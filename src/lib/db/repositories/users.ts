import { exec, selectAll, selectOne } from "../client";
import type { User } from "../types";
import { coerceBooleans, fromBool, newId, nowIso } from "./_helpers";

const BOOL_KEYS = ["is_active"] as const satisfies ReadonlyArray<keyof User>;

function map(row: Record<string, unknown>): User {
  return coerceBooleans<User>(row, BOOL_KEYS);
}

export const usersRepo = {
  list(): User[] {
    return selectAll<Record<string, unknown>>(
      "SELECT * FROM users ORDER BY name ASC",
    ).map(map);
  },

  getById(id: string): User | null {
    const row = selectOne<Record<string, unknown>>(
      "SELECT * FROM users WHERE id = ?",
      [id],
    );
    return row ? map(row) : null;
  },

  create(input: Pick<User, "id" | "name"> & Partial<Pick<User, "is_active">>): User {
    const now = nowIso();
    const u: User = {
      id: input.id ?? newId(),
      name: input.name,
      is_active: input.is_active ?? true,
      created_at: now,
      updated_at: now,
    };
    exec(
      `INSERT INTO users (id, name, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [u.id, u.name, fromBool(u.is_active), u.created_at, u.updated_at],
    );
    return u;
  },
};
