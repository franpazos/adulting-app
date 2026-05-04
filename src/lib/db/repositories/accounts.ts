import { exec, selectAll, selectOne } from "../client";
import type { Account, AccountType } from "../types";
import { coerceBooleans, fromBool, newId, nowIso } from "./_helpers";
import { enqueueChange } from "@/lib/sync/queue";

const BOOL_KEYS = ["is_archived"] as const satisfies ReadonlyArray<keyof Account>;

function map(row: Record<string, unknown>): Account {
  return coerceBooleans<Account>(row, BOOL_KEYS);
}

interface CreateAccountInput {
  id?: string;
  name: string;
  type: AccountType;
  owner_user_id: string | null;
  currency_code: string;
  initial_balance?: number;
  is_archived?: boolean;
}

export const accountsRepo = {
  list(): Account[] {
    return selectAll<Record<string, unknown>>(
      "SELECT * FROM accounts WHERE is_archived = 0 ORDER BY name ASC",
    ).map(map);
  },

  getById(id: string): Account | null {
    const row = selectOne<Record<string, unknown>>(
      "SELECT * FROM accounts WHERE id = ?",
      [id],
    );
    return row ? map(row) : null;
  },

  create(input: CreateAccountInput): Account {
    const now = nowIso();
    const a: Account = {
      id: input.id ?? newId(),
      name: input.name,
      type: input.type,
      owner_user_id: input.owner_user_id,
      currency_code: input.currency_code,
      initial_balance: input.initial_balance ?? 0,
      is_archived: input.is_archived ?? false,
      created_at: now,
      updated_at: now,
    };
    exec(
      `INSERT INTO accounts (id, name, type, owner_user_id, currency_code,
        initial_balance, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        a.id,
        a.name,
        a.type,
        a.owner_user_id,
        a.currency_code,
        a.initial_balance,
        fromBool(a.is_archived),
        a.created_at,
        a.updated_at,
      ],
    );
    enqueueChange("account", a.id, "CREATE");
    return a;
  },
};
