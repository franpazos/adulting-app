/**
 * End-to-end tests for the multi-currency debt-payment flow used by
 * PayDebtPage and the settle-up flow used by SettleUpPage.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initDb,
  runMigrations,
  seedIfEmpty,
  debtPaymentsRepo,
  debtsRepo,
  settlementsRepo,
  transactionsRepo,
  SEED_IDS,
} from "@/lib/db";
import { _resetDbForTests } from "@/lib/db/client";
import {
  expenseAllocator,
  fromDebtToAccount,
  recomputeForTransaction,
} from "@/lib/calculations";

beforeEach(async () => {
  _resetDbForTests();
  await initDb();
  runMigrations();
  seedIfEmpty();
});

afterEach(() => {
  _resetDbForTests();
});

const today = () => new Date().toISOString().slice(0, 10);

describe("Pay debt — USD debt from EUR account", () => {
  it("decrements the debt balance in debt currency, debits the account in EUR", () => {
    const debt = debtsRepo.getById(SEED_IDS.debts.franToFamilyUsd)!;
    expect(debt.currency_code).toBe("USD");
    expect(debt.current_balance).toBe(500);

    const usdAmount = 100;
    const rate = 1.08; // USD per EUR → 100 USD costs ~92.59 EUR
    const eurAmount = fromDebtToAccount(usdAmount, rate);
    expect(eurAmount).toBeCloseTo(92.59, 2);

    const allocation = expenseAllocator({
      amount: eurAmount,
      source: "FRAN_PERSONAL",
      owner: "FRAN", // debt owner
    });

    const tx = transactionsRepo.create({
      type: "DEBT_PAYMENT",
      date: today(),
      amount: eurAmount,
      currency_code: "EUR",
      source_account_id: SEED_IDS.accounts.franPersonal,
      origin: "MANUAL",
      sheet_sync_status: "PENDING",
      exchange_rate: rate,
      amount_in_account_currency: eurAmount,
      amount_in_debt_currency: usdAmount,
      allocations: allocation.allocations,
    });
    debtPaymentsRepo.create({
      debt_id: debt.id,
      transaction_id: tx.id,
      payment_date: today(),
      amount: usdAmount,
      principal_amount: null,
      interest_amount: null,
      exchange_rate: rate,
      amount_in_account_currency: eurAmount,
      amount_in_debt_currency: usdAmount,
    });
    debtsRepo.adjustBalance(debt.id, -usdAmount);
    recomputeForTransaction(tx.id);

    const after = debtsRepo.getById(debt.id)!;
    expect(after.current_balance).toBe(400);

    const payments = debtPaymentsRepo.listForDebt(debt.id);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.amount).toBe(100);
    expect(payments[0]!.exchange_rate).toBe(1.08);
    expect(payments[0]!.amount_in_account_currency).toBeCloseTo(92.59, 2);
  });

  it("Sam paying Fran's USD debt from JOINT triggers Sam-owes-Household", () => {
    // Edge case: the source is JOINT but the debt is owned by SAM (or in the
    // FRAN-USD seed, by FRAN). The same allocator rule applies as Case D —
    // the owner owes the household for using joint funds for a personal debt.
    const debt = debtsRepo.getById(SEED_IDS.debts.samPersonal)!;
    expect(debt.currency_code).toBe("EUR"); // same-currency case
    const before = settlementsRepo.netBalance("SAM", "HOUSEHOLD");

    const amount = 25;
    const allocation = expenseAllocator({
      amount,
      source: "JOINT",
      owner: "SAM",
    });

    const tx = transactionsRepo.create({
      type: "DEBT_PAYMENT",
      date: today(),
      amount,
      currency_code: "EUR",
      source_account_id: SEED_IDS.accounts.joint,
      origin: "MANUAL",
      sheet_sync_status: "PENDING",
      allocations: allocation.allocations,
    });
    debtPaymentsRepo.create({
      debt_id: debt.id,
      transaction_id: tx.id,
      payment_date: today(),
      amount,
      principal_amount: null,
      interest_amount: null,
      exchange_rate: null,
      amount_in_account_currency: amount,
      amount_in_debt_currency: amount,
    });
    debtsRepo.adjustBalance(debt.id, -amount);
    recomputeForTransaction(tx.id);

    expect(debtsRepo.getById(debt.id)!.current_balance).toBe(75);
    expect(settlementsRepo.netBalance("SAM", "HOUSEHOLD")).toBeCloseTo(
      before + amount,
      2,
    );
  });
});

describe("Settle up", () => {
  it("recording a settlement payment shifts the net balance toward zero", () => {
    // Seed: Fran owes Sam 20 (Case A 50 - Case E 30).
    const before = settlementsRepo.netBalance("FRAN", "SAM");
    expect(before).toBeCloseTo(20, 2);

    // Fran pays Sam 20 to settle.
    const tx = transactionsRepo.create({
      type: "SETTLEMENT_PAYMENT",
      date: today(),
      amount: 20,
      currency_code: "EUR",
      source_account_id: SEED_IDS.accounts.franPersonal,
      origin: "MANUAL",
      sheet_sync_status: "PENDING",
      allocations: [
        { owner_type: "SAM", share_percent: 100, share_amount: 20 },
      ],
    });
    settlementsRepo.create({
      date: today(),
      source_transaction_id: tx.id,
      from_party: "SAM", // reverse of Fran→Sam
      to_party: "FRAN",
      amount: 20,
      reason: "settlement_payment",
      notes: null,
    });

    expect(settlementsRepo.netBalance("FRAN", "SAM")).toBeCloseTo(0, 2);
  });

  it("partial settlement reduces but doesn't zero the net balance", () => {
    const before = settlementsRepo.netBalance("FRAN", "SAM");
    expect(before).toBeCloseTo(20, 2);

    const tx = transactionsRepo.create({
      type: "SETTLEMENT_PAYMENT",
      date: today(),
      amount: 8,
      currency_code: "EUR",
      source_account_id: SEED_IDS.accounts.franPersonal,
      origin: "MANUAL",
      sheet_sync_status: "PENDING",
      allocations: [
        { owner_type: "SAM", share_percent: 100, share_amount: 8 },
      ],
    });
    settlementsRepo.create({
      date: today(),
      source_transaction_id: tx.id,
      from_party: "SAM",
      to_party: "FRAN",
      amount: 8,
      reason: "settlement_payment",
      notes: null,
    });

    expect(settlementsRepo.netBalance("FRAN", "SAM")).toBeCloseTo(12, 2);
  });
});

describe("debtsRepo.adjustBalance", () => {
  it("rounds to 2 decimals after delta", () => {
    const debt = debtsRepo.getById(SEED_IDS.debts.franToFamilyUsd)!;
    debtsRepo.adjustBalance(debt.id, -33.333);
    const after = debtsRepo.getById(debt.id)!;
    expect(after.current_balance).toBe(466.67);
  });
});
