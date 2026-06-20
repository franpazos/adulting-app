/**
 * Repo-level tests for the debt lifecycle: archive (soft), reactivate,
 * delete (hard with cascade), and the auto-deactivate behavior in
 * adjustBalance when a payment brings the balance to zero.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initDb,
  runMigrations,
  seedIfEmpty,
  debtsRepo,
  debtPaymentsRepo,
  SEED_IDS,
} from "@/lib/db";
import { _resetDbForTests, selectAll } from "@/lib/db/client";

beforeEach(async () => {
  _resetDbForTests();
  await initDb();
  runMigrations();
  seedIfEmpty();
});

afterEach(() => {
  _resetDbForTests();
});

describe("debtsRepo.deactivate / reactivate", () => {
  it("deactivates an active debt and hides it from the default list", () => {
    const id = SEED_IDS.debts.samPersonal;
    expect(debtsRepo.getById(id)?.is_active).toBe(true);
    expect(debtsRepo.list().some((d) => d.id === id)).toBe(true);

    debtsRepo.deactivate(id);

    expect(debtsRepo.getById(id)?.is_active).toBe(false);
    expect(debtsRepo.list().some((d) => d.id === id)).toBe(false);
    // Still visible when explicitly asked for inactive ones too.
    expect(debtsRepo.list(false).some((d) => d.id === id)).toBe(true);
  });

  it("reactivate brings the debt back to the default list", () => {
    const id = SEED_IDS.debts.samPersonal;
    debtsRepo.deactivate(id);
    debtsRepo.reactivate(id);
    expect(debtsRepo.getById(id)?.is_active).toBe(true);
    expect(debtsRepo.list().some((d) => d.id === id)).toBe(true);
  });

  it("reactivate does NOT auto-deactivate again even if balance is zero", () => {
    // Reactivating a paid-off debt is a legitimate "I'm taking on this
    // loan again" gesture; we shouldn't undo it just because balance == 0.
    const id = SEED_IDS.debts.samPersonal;
    debtsRepo.adjustBalance(id, -debtsRepo.getById(id)!.current_balance);
    expect(debtsRepo.getById(id)?.is_active).toBe(false);
    debtsRepo.reactivate(id);
    expect(debtsRepo.getById(id)?.is_active).toBe(true);
  });
});

describe("debtsRepo.adjustBalance auto-deactivate", () => {
  it("auto-deactivates when a payment drops the balance to zero", () => {
    const id = SEED_IDS.debts.samPersonal;
    const initial = debtsRepo.getById(id)!.current_balance;
    expect(initial).toBeGreaterThan(0);

    debtsRepo.adjustBalance(id, -initial);

    const after = debtsRepo.getById(id)!;
    expect(after.current_balance).toBe(0);
    expect(after.is_active).toBe(false);
  });

  it("auto-deactivates on tiny float-drift residuals (< 0.005)", () => {
    // Simulate the kind of residual FX-converted payments leave behind.
    const id = SEED_IDS.debts.samPersonal;
    const initial = debtsRepo.getById(id)!.current_balance;
    debtsRepo.adjustBalance(id, -(initial - 0.003));
    // After this, balance should be ~0.003 which rounds-to-cents to 0.00
    // and is below the epsilon — auto-deactivated.
    const after = debtsRepo.getById(id)!;
    expect(after.is_active).toBe(false);
  });

  it("does NOT deactivate while there's still real balance left", () => {
    const id = SEED_IDS.debts.samPersonal;
    const initial = debtsRepo.getById(id)!.current_balance;
    debtsRepo.adjustBalance(id, -initial / 2);
    const after = debtsRepo.getById(id)!;
    expect(after.is_active).toBe(true);
    expect(after.current_balance).toBeCloseTo(initial / 2, 2);
  });

  it("does not double-process: adjusting an already-inactive debt is a no-op for is_active", () => {
    const id = SEED_IDS.debts.samPersonal;
    debtsRepo.deactivate(id);
    debtsRepo.adjustBalance(id, -100);
    // Still inactive, balance updated.
    const after = debtsRepo.getById(id)!;
    expect(after.is_active).toBe(false);
  });
});

describe("debtsRepo.delete (hard delete with cascade)", () => {
  it("removes the debt row from the table", () => {
    const id = SEED_IDS.debts.franToFamilyUsd;
    expect(debtsRepo.getById(id)).not.toBeNull();
    debtsRepo.delete(id);
    expect(debtsRepo.getById(id)).toBeNull();
    expect(debtsRepo.list(false).some((d) => d.id === id)).toBe(false);
  });

  it("cascades to debt_payments but leaves the original transactions intact", () => {
    const id = SEED_IDS.debts.franToFamilyUsd;

    // Seed a debt_payment + transaction pointing at this debt.
    const txId = "tx-test-paydebt";
    selectAll(
      `INSERT INTO transactions (id, type, date, month_key, amount, currency_code,
         source_account_id, description, category_id, created_by_user_id, origin,
         sheet_sync_status, is_deleted, created_at, updated_at)
       VALUES (?, 'DEBT_PAYMENT', '2026-05-01', '2026-05', 100, 'USD',
         'acc-fran-personal', 'test', NULL, 'user-fran', 'MANUAL', 'PENDING', 0,
         '2026-05-01T00:00:00Z', '2026-05-01T00:00:00Z')`,
      [txId],
    );
    debtPaymentsRepo.create({
      debt_id: id,
      transaction_id: txId,
      payment_date: "2026-05-01",
      amount: 100,
      principal_amount: 100,
      interest_amount: 0,
      exchange_rate: null,
      amount_in_account_currency: null,
      amount_in_debt_currency: null,
    });
    expect(debtPaymentsRepo.listForDebt(id).length).toBe(1);

    debtsRepo.delete(id);

    // debt_payments row for this debt is gone.
    expect(debtPaymentsRepo.listForDebt(id).length).toBe(0);
    // The transaction itself stays in /transactions for history.
    const txRows = selectAll<{ id: string }>(
      "SELECT id FROM transactions WHERE id = ?",
      [txId],
    );
    expect(txRows.length).toBe(1);
  });
});
