/**
 * Repo-level tests for the category lifecycle: update, softDelete /
 * reactivate, and the is_active filtering in list(). Also covers a
 * couple of "data integrity after soft-delete" cases that the UI cares
 * about — most importantly that transactions referencing an archived
 * category still resolve back to it via getById.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initDb,
  runMigrations,
  seedIfEmpty,
  categoriesRepo,
  transactionsRepo,
  SEED_IDS,
} from "@/lib/db";
import { _resetDbForTests } from "@/lib/db/client";

beforeEach(async () => {
  _resetDbForTests();
  await initDb();
  runMigrations();
  seedIfEmpty();
});

afterEach(() => {
  _resetDbForTests();
});

describe("categoriesRepo.list", () => {
  it("defaults to active-only", () => {
    const before = categoriesRepo.list();
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((c) => c.is_active)).toBe(true);

    categoriesRepo.softDelete(SEED_IDS.categories.leisure);
    const after = categoriesRepo.list();
    expect(after.some((c) => c.id === SEED_IDS.categories.leisure)).toBe(false);
  });

  it("returns archived ones too when activeOnly = false", () => {
    categoriesRepo.softDelete(SEED_IDS.categories.leisure);
    const all = categoriesRepo.list(undefined, false);
    const leisure = all.find((c) => c.id === SEED_IDS.categories.leisure);
    expect(leisure).toBeDefined();
    expect(leisure?.is_active).toBe(false);
  });

  it("filters by kind AND is_active together", () => {
    categoriesRepo.softDelete(SEED_IDS.categories.food);
    const expense = categoriesRepo.list("EXPENSE");
    expect(expense.some((c) => c.id === SEED_IDS.categories.food)).toBe(false);
    expect(expense.every((c) => c.kind === "EXPENSE")).toBe(true);
    expect(expense.every((c) => c.is_active)).toBe(true);
  });

  it("kind filter with activeOnly = false returns archived of that kind", () => {
    categoriesRepo.softDelete(SEED_IDS.categories.food);
    const all = categoriesRepo.list("EXPENSE", false);
    expect(all.some((c) => c.id === SEED_IDS.categories.food)).toBe(true);
    expect(all.every((c) => c.kind === "EXPENSE")).toBe(true);
  });

  it("coerces is_active to a real boolean, not a 0/1", () => {
    // If BOOL_KEYS forgets is_active the row comes back with `1` /
    // `0` (number) and strict comparisons break. Guard against that.
    const list = categoriesRepo.list();
    for (const c of list) {
      expect(typeof c.is_active).toBe("boolean");
    }
  });
});

describe("categoriesRepo.softDelete / reactivate", () => {
  it("softDelete hides from default list, reactivate brings it back", () => {
    const id = SEED_IDS.categories.transport;
    categoriesRepo.softDelete(id);
    expect(categoriesRepo.list().some((c) => c.id === id)).toBe(false);
    expect(categoriesRepo.getById(id)?.is_active).toBe(false);

    categoriesRepo.reactivate(id);
    expect(categoriesRepo.list().some((c) => c.id === id)).toBe(true);
    expect(categoriesRepo.getById(id)?.is_active).toBe(true);
  });

  it("transactions referencing an archived category still resolve via getById", () => {
    // This is the whole point of soft delete: history is preserved.
    // /transactions should still be able to show "Alimentación" on a
    // transaction even after the category has been archived.
    const id = SEED_IDS.categories.food;

    // Create a transaction explicitly so the test doesn't depend on
    // which months the seed populates.
    const tx = transactionsRepo.create({
      type: "EXPENSE",
      date: "2026-05-15",
      amount: 12.5,
      currency_code: "EUR",
      source_account_id: SEED_IDS.accounts.joint,
      description: "Test",
      category_id: id,
      created_by_user_id: SEED_IDS.users.fran,
      origin: "MANUAL",
      sheet_sync_status: "PENDING",
      allocations: [
        {
          owner_type: "HOUSEHOLD",
          share_percent: 100,
          share_amount: 12.5,
        },
      ],
    });

    categoriesRepo.softDelete(id);

    // The category row still exists.
    expect(categoriesRepo.getById(id)).not.toBeNull();
    expect(categoriesRepo.getById(id)?.is_active).toBe(false);
    // And the transaction's foreign key still resolves.
    const persisted = transactionsRepo.getById(tx.id);
    expect(persisted).not.toBeNull();
    expect(persisted?.category_id).toBe(id);
  });
});

describe("categoriesRepo.update", () => {
  it("changes name, color and kind", () => {
    const id = SEED_IDS.categories.other;
    const updated = categoriesRepo.update(id, {
      name: "Renamed",
      kind: "INCOME",
      color: "#abcdef",
    });
    expect(updated.name).toBe("Renamed");
    expect(updated.kind).toBe("INCOME");
    expect(updated.color).toBe("#abcdef");
  });

  it("returns a row whose updated_at moved forward", async () => {
    const id = SEED_IDS.categories.other;
    const before = categoriesRepo.getById(id)!;
    // Sleep a millisecond so the ISO timestamp can advance.
    await new Promise((r) => setTimeout(r, 5));
    const after = categoriesRepo.update(id, {
      name: before.name,
      kind: before.kind,
      color: before.color,
    });
    expect(after.updated_at >= before.updated_at).toBe(true);
  });

  it("preserves created_at (does not overwrite with now)", async () => {
    const id = SEED_IDS.categories.other;
    const before = categoriesRepo.getById(id)!;
    await new Promise((r) => setTimeout(r, 5));
    const after = categoriesRepo.update(id, {
      name: "Renamed again",
      kind: before.kind,
      color: before.color,
    });
    expect(after.created_at).toBe(before.created_at);
  });

  it("does not flip is_active back to true if the category was archived", () => {
    // Important: update() doesn't write is_active. A consumer editing
    // an archived category's name shouldn't accidentally reactivate it.
    const id = SEED_IDS.categories.other;
    categoriesRepo.softDelete(id);
    expect(categoriesRepo.getById(id)?.is_active).toBe(false);

    categoriesRepo.update(id, {
      name: "Edited while archived",
      kind: "EXPENSE",
      color: "#123456",
    });
    expect(categoriesRepo.getById(id)?.is_active).toBe(false);
  });
});
