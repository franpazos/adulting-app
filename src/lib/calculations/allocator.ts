/**
 * Pure expense allocator — given (amount, source, owner, splitFranPercent)
 * returns the allocations to write into `transaction_allocations` and the
 * settlement entries to write into `settlement_ledger`.
 *
 * This is the canonical implementation of the five reference cases from
 * spec §4 (Cases A–E) plus the natural edge cases. NO DB ACCESS — this is
 * a pure function that the persistence layer (`settlements.ts`) and the
 * UI (`Add Expense` live preview) both consume.
 *
 * See `docs/decisions.md` ADR-010 for the allocation/scope semantics.
 */

import type { CashSource, OwnerType } from "@/lib/db/types";

export type AllocatorOwner = OwnerType;

export interface AllocatorInput {
  amount: number;
  source: CashSource;
  owner: AllocatorOwner;
  /**
   * Fran's share percentage (0–100) when the owner is `HOUSEHOLD`.
   * Defaults to 50. Ignored when owner is `FRAN` or `SAM`.
   */
  splitFranPercent?: number;
}

export interface AllocatorAllocation {
  owner_type: OwnerType;
  share_percent: number;
  share_amount: number;
}

export type SettlementReason =
  | "shared_expense_personal_source"
  | "shared_expense_personal_source_custom_split"
  | "personal_expense_joint_source"
  | "personal_expense_other_personal_source";

export interface AllocatorSettlement {
  from: OwnerType;
  to: OwnerType;
  amount: number;
  reason: SettlementReason;
}

export interface AllocatorResult {
  allocations: AllocatorAllocation[];
  settlements: AllocatorSettlement[];
}

const DEFAULT_FRAN_SPLIT = 50;

export function expenseAllocator(input: AllocatorInput): AllocatorResult {
  const amount = roundCurrency(input.amount);

  // Personal owner — exactly one allocation row to that person.
  if (input.owner === "FRAN" || input.owner === "SAM") {
    return personalOwnerAllocation(input.owner, amount, input.source);
  }

  // owner === HOUSEHOLD → shared expense, use the Fran/Sam split.
  return householdOwnerAllocation(amount, input.source, input.splitFranPercent);
}

function personalOwnerAllocation(
  owner: "FRAN" | "SAM",
  amount: number,
  source: CashSource,
): AllocatorResult {
  const allocations: AllocatorAllocation[] = [
    { owner_type: owner, share_percent: 100, share_amount: amount },
  ];

  // Case D — joint funds covered a personal expense.
  if (source === "JOINT") {
    return {
      allocations,
      settlements: amount === 0
        ? []
        : [
            {
              from: owner,
              to: "HOUSEHOLD",
              amount,
              reason: "personal_expense_joint_source",
            },
          ],
    };
  }

  const sourcePerson: OwnerType =
    source === "FRAN_PERSONAL" ? "FRAN" : "SAM";

  // Case B — the person paid for their own expense from their own account.
  if (sourcePerson === owner) {
    return { allocations, settlements: [] };
  }

  // Edge: paid from the OTHER person's personal account → owe them.
  return {
    allocations,
    settlements: amount === 0
      ? []
      : [
          {
            from: owner,
            to: sourcePerson,
            amount,
            reason: "personal_expense_other_personal_source",
          },
        ],
  };
}

function householdOwnerAllocation(
  amount: number,
  source: CashSource,
  splitFranPercent: number | undefined,
): AllocatorResult {
  const split = clampPercent(splitFranPercent ?? DEFAULT_FRAN_SPLIT);
  const franShare = roundCurrency((amount * split) / 100);
  // Always derive Sam's share by subtraction so cents-rounding never breaks
  // the invariant `franShare + samShare === amount`.
  const samShare = roundCurrency(amount - franShare);

  const allocations: AllocatorAllocation[] = [
    { owner_type: "FRAN", share_percent: split, share_amount: franShare },
    {
      owner_type: "SAM",
      share_percent: roundPercent(100 - split),
      share_amount: samShare,
    },
  ];

  // Case C — joint funds covered a shared expense → no settlement.
  if (source === "JOINT") {
    return { allocations, settlements: [] };
  }

  // Personal source covered a shared expense → the OTHER person owes the
  // payer their share. (Cases A and E.)
  const sourcePerson: OwnerType =
    source === "FRAN_PERSONAL" ? "FRAN" : "SAM";
  const otherPerson: OwnerType = sourcePerson === "FRAN" ? "SAM" : "FRAN";
  const otherShare = sourcePerson === "FRAN" ? samShare : franShare;

  if (otherShare === 0) {
    return { allocations, settlements: [] };
  }

  const reason: SettlementReason =
    split === DEFAULT_FRAN_SPLIT
      ? "shared_expense_personal_source"
      : "shared_expense_personal_source_custom_split";

  return {
    allocations,
    settlements: [
      { from: otherPerson, to: sourcePerson, amount: otherShare, reason },
    ],
  };
}

/**
 * Map an account record (type + owner_user_id) into the CashSource enum that
 * the allocator consumes. Lives here so `settlements.ts` and `Add Expense`
 * agree on the mapping.
 */
export interface AccountForSource {
  type: "PERSONAL" | "JOINT";
  owner_user_id: string | null;
}

export function cashSourceFromAccount(
  account: AccountForSource,
  fixtures: { franUserId: string; samUserId: string },
): CashSource {
  if (account.type === "JOINT") return "JOINT";
  if (account.owner_user_id === fixtures.franUserId) return "FRAN_PERSONAL";
  if (account.owner_user_id === fixtures.samUserId) return "SAM_PERSONAL";
  throw new Error(
    `Cannot map personal account to CashSource (owner_user_id=${account.owner_user_id})`,
  );
}

export function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundPercent(n: number): number {
  return Math.round(n * 100) / 100;
}

function clampPercent(p: number): number {
  if (Number.isNaN(p)) return DEFAULT_FRAN_SPLIT;
  return Math.max(0, Math.min(100, p));
}
