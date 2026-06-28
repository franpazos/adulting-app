/**
 * Tests for the monthly aggregations module. Asserts the scope semantics
 * documented in ADR-010: fran/sam are personal P&Ls (own income + share of
 * shared); household is shared-only for expenses but full-income; all is
 * unfiltered total.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initDb,
  runMigrations,
  seedIfEmpty,
  SEED_IDS,
  accountsRepo,
  transactionsRepo,
} from "@/lib/db";
import { _resetDbForTests } from "@/lib/db/client";
import {
  accountBalance,
  accountMonthlyFlow,
  categoryBreakdown,
  monthlySummary,
} from "@/lib/calculations/aggregations";

beforeEach(async () => {
  _resetDbForTests();
  await initDb();
  runMigrations();
  seedIfEmpty();
});

afterEach(() => {
  _resetDbForTests();
});

const M = () => new Date().toISOString().slice(0, 7);

describe("monthlySummary — income", () => {
  it("FRAN scope sees only Fran's income (1980)", () => {
    const s = monthlySummary(M(), "fran");
    expect(s.income).toBeCloseTo(1980, 2);
  });

  it("SAM scope sees only Sam's income (1000)", () => {
    const s = monthlySummary(M(), "sam");
    expect(s.income).toBeCloseTo(1000, 2);
  });

  it("HOUSEHOLD scope sees the full combined income (2980)", () => {
    const s = monthlySummary(M(), "household");
    expect(s.income).toBeCloseTo(2980, 2);
  });

  it("ALL scope sees the full combined income (2980)", () => {
    const s = monthlySummary(M(), "all");
    expect(s.income).toBeCloseTo(2980, 2);
  });
});

describe("monthlySummary — expenses", () => {
  // Seed cases per share_amount totals:
  //   A (shared from Sam): FRAN 50 / SAM 50  → total 100, Fran share 50, Sam share 50
  //   B (Sam personal):    SAM 18            → total 18, Sam share 18
  //   C (shared from Joint): FRAN 37.5 / SAM 37.5 → total 75
  //   D (Sam from Joint):  SAM 40            → total 40, Sam share 40
  //   E (shared from Fran 70/30): FRAN 70 / SAM 30 → total 100
  // Personal-share totals: FRAN 50+37.5+70 = 157.5; SAM 50+18+37.5+40+30 = 175.5
  // Shared-only (multi-alloc): A + C + E = 275
  // Total: 333

  it("FRAN scope sums Fran's allocations (157.50)", () => {
    expect(monthlySummary(M(), "fran").expenses).toBeCloseTo(157.5, 2);
  });

  it("SAM scope sums Sam's allocations (175.50)", () => {
    expect(monthlySummary(M(), "sam").expenses).toBeCloseTo(175.5, 2);
  });

  it("HOUSEHOLD scope counts shared transactions only (275.00)", () => {
    expect(monthlySummary(M(), "household").expenses).toBeCloseTo(275, 2);
  });

  it("ALL scope sums every transaction (333.00)", () => {
    expect(monthlySummary(M(), "all").expenses).toBeCloseTo(333, 2);
  });
});

describe("monthlySummary — recurring expenses", () => {
  // Seed: HOUSEHOLD recurring = Alquiler 950 + Internet 45 = 995
  it("HOUSEHOLD scope picks up shared recurring (995)", () => {
    expect(monthlySummary(M(), "household").recurring).toBeCloseTo(995, 2);
  });

  it("FRAN scope sees no personal recurring (0)", () => {
    expect(monthlySummary(M(), "fran").recurring).toBeCloseTo(0, 2);
  });

  it("ALL scope sums all recurring expenses (995)", () => {
    expect(monthlySummary(M(), "all").recurring).toBeCloseTo(995, 2);
  });
});

describe("monthlySummary — available money (spec §13.4)", () => {
  it("ALL = 2980 − 333 − 995 − 0 = 1652", () => {
    const s = monthlySummary(M(), "all");
    expect(s.available).toBeCloseTo(1652, 2);
  });

  it("HOUSEHOLD = 2980 − 275 − 995 − 0 = 1710", () => {
    const s = monthlySummary(M(), "household");
    expect(s.available).toBeCloseTo(1710, 2);
  });

  it("FRAN = 1980 − 157.5 − 0 − 0 = 1822.50", () => {
    const s = monthlySummary(M(), "fran");
    expect(s.available).toBeCloseTo(1822.5, 2);
  });
});

describe("categoryBreakdown", () => {
  it("returns slices sorted desc with percents that approximate 100", () => {
    const slices = categoryBreakdown(M(), "all");
    expect(slices.length).toBeGreaterThan(0);
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i - 1]!.amount).toBeGreaterThanOrEqual(slices[i]!.amount);
    }
    const total = slices.reduce((s, r) => s + r.percent, 0);
    expect(Math.abs(total - 100)).toBeLessThanOrEqual(2);
  });

  it("HOUSEHOLD scope only returns shared categories", () => {
    const slices = categoryBreakdown(M(), "household");
    const sum = slices.reduce((s, r) => s + r.amount, 0);
    // Should equal the shared expenses total (275)
    expect(sum).toBeCloseTo(275, 2);
  });
});

describe("TRANSFER tx and account flows (0.6.0)", () => {
  function makeTransfer(
    from: string,
    to: string,
    amount: number,
    monthOffset = 0,
  ) {
    const m = new Date();
    m.setDate(15);
    if (monthOffset) m.setMonth(m.getMonth() + monthOffset);
    const date = m.toISOString().slice(0, 10);
    return transactionsRepo.create({
      type: "TRANSFER",
      date,
      amount,
      currency_code: "EUR",
      source_account_id: from,
      origin: "MANUAL",
      sheet_sync_status: "PENDING",
      destination_account_id: to,
      allocations: [],
    });
  }

  it("a TRANSFER moves money: outflow at source, inflow at destination", () => {
    const fran = SEED_IDS.accounts.franPersonal;
    const joint = SEED_IDS.accounts.joint;
    const franInitial = accountsRepo.list().find((a) => a.id === fran)!.initial_balance;
    const jointInitial = accountsRepo.list().find((a) => a.id === joint)!.initial_balance;
    const franBefore = accountBalance(fran, franInitial);
    const jointBefore = accountBalance(joint, jointInitial);
    makeTransfer(fran, joint, 500);
    expect(accountBalance(fran, franInitial)).toBeCloseTo(franBefore - 500, 2);
    expect(accountBalance(joint, jointInitial)).toBeCloseTo(jointBefore + 500, 2);
  });

  it("accountMonthlyFlow counts TRANSFER as inflow at destination", () => {
    const fran = SEED_IDS.accounts.franPersonal;
    const joint = SEED_IDS.accounts.joint;
    const before = accountMonthlyFlow(joint, M());
    makeTransfer(fran, joint, 500);
    const after = accountMonthlyFlow(joint, M());
    expect(after.inflow - before.inflow).toBeCloseTo(500, 2);
    expect(after.outflow - before.outflow).toBeCloseTo(0, 2);
  });

  it("accountMonthlyFlow counts TRANSFER as outflow at source", () => {
    const fran = SEED_IDS.accounts.franPersonal;
    const joint = SEED_IDS.accounts.joint;
    const before = accountMonthlyFlow(fran, M());
    makeTransfer(fran, joint, 500);
    const after = accountMonthlyFlow(fran, M());
    expect(after.outflow - before.outflow).toBeCloseTo(500, 2);
    expect(after.inflow - before.inflow).toBeCloseTo(0, 2);
  });

  it("a TRANSFER does NOT enter the monthlySummary income or expense buckets", () => {
    const fran = SEED_IDS.accounts.franPersonal;
    const joint = SEED_IDS.accounts.joint;
    const before = monthlySummary(M(), "household");
    makeTransfer(fran, joint, 500);
    const after = monthlySummary(M(), "household");
    expect(after.income - before.income).toBe(0);
    expect(after.expenses - before.expenses).toBe(0);
    expect(after.recurring - before.recurring).toBe(0);
    expect(after.available - before.available).toBe(0);
  });
});
