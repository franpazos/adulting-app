/**
 * Pure-logic tests for expenseAllocator. These cover the five reference
 * cases from spec §4 plus the natural edge cases (zero amount, custom
 * splits, paid by other person). They do NOT touch the DB.
 */

import { describe, expect, it } from "vitest";
import {
  cashSourceFromAccount,
  expenseAllocator,
} from "@/lib/calculations/allocator";

describe("expenseAllocator — Case A: shared, personal source, 50/50", () => {
  const result = expenseAllocator({
    amount: 100,
    source: "SAM_PERSONAL",
    owner: "HOUSEHOLD",
    splitFranPercent: 50,
  });

  it("allocates 50/50 between Fran and Sam", () => {
    expect(result.allocations).toEqual([
      { owner_type: "FRAN", share_percent: 50, share_amount: 50 },
      { owner_type: "SAM", share_percent: 50, share_amount: 50 },
    ]);
  });

  it("records Fran owes Sam 50 in settlements", () => {
    expect(result.settlements).toEqual([
      {
        from: "FRAN",
        to: "SAM",
        amount: 50,
        reason: "shared_expense_personal_source",
      },
    ]);
  });
});

describe("expenseAllocator — Case B: personal expense, same personal source", () => {
  const result = expenseAllocator({
    amount: 18,
    source: "SAM_PERSONAL",
    owner: "SAM",
  });

  it("allocates the full amount to the owner", () => {
    expect(result.allocations).toEqual([
      { owner_type: "SAM", share_percent: 100, share_amount: 18 },
    ]);
  });

  it("creates no settlements", () => {
    expect(result.settlements).toEqual([]);
  });
});

describe("expenseAllocator — Case C: shared from joint", () => {
  const result = expenseAllocator({
    amount: 75,
    source: "JOINT",
    owner: "HOUSEHOLD",
    splitFranPercent: 50,
  });

  it("splits 50/50", () => {
    expect(result.allocations).toEqual([
      { owner_type: "FRAN", share_percent: 50, share_amount: 37.5 },
      { owner_type: "SAM", share_percent: 50, share_amount: 37.5 },
    ]);
  });

  it("creates no settlements (joint funds covered shared cost)", () => {
    expect(result.settlements).toEqual([]);
  });
});

describe("expenseAllocator — Case D: personal owner, joint source", () => {
  const result = expenseAllocator({
    amount: 40,
    source: "JOINT",
    owner: "SAM",
  });

  it("allocates the full amount to the owner", () => {
    expect(result.allocations).toEqual([
      { owner_type: "SAM", share_percent: 100, share_amount: 40 },
    ]);
  });

  it("makes the owner owe the household", () => {
    expect(result.settlements).toEqual([
      {
        from: "SAM",
        to: "HOUSEHOLD",
        amount: 40,
        reason: "personal_expense_joint_source",
      },
    ]);
  });
});

describe("expenseAllocator — Case E: shared, custom 70/30 split", () => {
  const result = expenseAllocator({
    amount: 100,
    source: "FRAN_PERSONAL",
    owner: "HOUSEHOLD",
    splitFranPercent: 70,
  });

  it("allocates per the custom split", () => {
    expect(result.allocations).toEqual([
      { owner_type: "FRAN", share_percent: 70, share_amount: 70 },
      { owner_type: "SAM", share_percent: 30, share_amount: 30 },
    ]);
  });

  it("Sam owes Fran her 30 share", () => {
    expect(result.settlements).toEqual([
      {
        from: "SAM",
        to: "FRAN",
        amount: 30,
        reason: "shared_expense_personal_source_custom_split",
      },
    ]);
  });
});

describe("expenseAllocator — edges", () => {
  it("zero amount produces no settlement", () => {
    const r = expenseAllocator({
      amount: 0,
      source: "SAM_PERSONAL",
      owner: "HOUSEHOLD",
    });
    expect(r.settlements).toEqual([]);
  });

  it("0/100 split records only the non-payer's debt", () => {
    const r = expenseAllocator({
      amount: 100,
      source: "FRAN_PERSONAL",
      owner: "HOUSEHOLD",
      splitFranPercent: 0,
    });
    // Fran's share is 0; Sam owes the full 100
    expect(r.settlements).toEqual([
      {
        from: "SAM",
        to: "FRAN",
        amount: 100,
        reason: "shared_expense_personal_source_custom_split",
      },
    ]);
  });

  it("100/0 split with same-person source produces no settlement", () => {
    const r = expenseAllocator({
      amount: 100,
      source: "FRAN_PERSONAL",
      owner: "HOUSEHOLD",
      splitFranPercent: 100,
    });
    // Sam's share is 0 → no debt
    expect(r.settlements).toEqual([]);
  });

  it("default split is 50/50 when not provided", () => {
    const r = expenseAllocator({
      amount: 60,
      source: "SAM_PERSONAL",
      owner: "HOUSEHOLD",
    });
    expect(r.allocations[0]?.share_amount).toBe(30);
    expect(r.allocations[1]?.share_amount).toBe(30);
  });

  it("rounding: 33.33/66.67 split keeps allocation sum exact", () => {
    const r = expenseAllocator({
      amount: 99.99,
      source: "FRAN_PERSONAL",
      owner: "HOUSEHOLD",
      splitFranPercent: 33.33,
    });
    const sum = r.allocations.reduce((s, a) => s + a.share_amount, 0);
    // The two allocations must add up to the original amount, even with
    // cents rounding — this is what derive-Sam-by-subtraction guarantees.
    expect(sum).toBeCloseTo(99.99, 5);
  });

  it("personal owner paid from the OTHER person's account", () => {
    // Fran's account paid for Sam's personal expense
    const r = expenseAllocator({
      amount: 25,
      source: "FRAN_PERSONAL",
      owner: "SAM",
    });
    expect(r.allocations).toEqual([
      { owner_type: "SAM", share_percent: 100, share_amount: 25 },
    ]);
    expect(r.settlements).toEqual([
      {
        from: "SAM",
        to: "FRAN",
        amount: 25,
        reason: "personal_expense_other_personal_source",
      },
    ]);
  });

  it("clamps splitFranPercent into 0..100", () => {
    const r = expenseAllocator({
      amount: 100,
      source: "FRAN_PERSONAL",
      owner: "HOUSEHOLD",
      splitFranPercent: 150, // out of range
    });
    // clamps to 100 → Sam share = 0 → no settlement
    expect(r.allocations[0]?.share_amount).toBe(100);
    expect(r.allocations[1]?.share_amount).toBe(0);
    expect(r.settlements).toEqual([]);
  });
});

describe("cashSourceFromAccount", () => {
  const fixtures = { franUserId: "u-fran", samUserId: "u-sam" };

  it("maps JOINT type", () => {
    expect(
      cashSourceFromAccount(
        { type: "JOINT", owner_user_id: null },
        fixtures,
      ),
    ).toBe("JOINT");
  });

  it("maps Fran's personal account", () => {
    expect(
      cashSourceFromAccount(
        { type: "PERSONAL", owner_user_id: "u-fran" },
        fixtures,
      ),
    ).toBe("FRAN_PERSONAL");
  });

  it("maps Sam's personal account", () => {
    expect(
      cashSourceFromAccount(
        { type: "PERSONAL", owner_user_id: "u-sam" },
        fixtures,
      ),
    ).toBe("SAM_PERSONAL");
  });

  it("throws on an unknown owner_user_id", () => {
    expect(() =>
      cashSourceFromAccount(
        { type: "PERSONAL", owner_user_id: "u-other" },
        fixtures,
      ),
    ).toThrow();
  });
});
