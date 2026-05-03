/**
 * Calculation engine — pure logic + DB-aware glue. See ADR-010 for scope
 * semantics and the allocation/owner inference rules.
 */

export {
  expenseAllocator,
  cashSourceFromAccount,
  roundCurrency,
  type AllocatorInput,
  type AllocatorAllocation,
  type AllocatorSettlement,
  type AllocatorResult,
  type SettlementReason,
  type AccountForSource,
  type AllocatorOwner,
} from "./allocator";

export {
  fromAccountToDebt,
  fromDebtToAccount,
  quoteFromDebtAmount,
  quoteFromAccountAmount,
  isSameCurrency,
  InvalidExchangeRateError,
  type FxQuote,
} from "./fx";

export {
  recomputeForTransaction,
  inferOwnerFromAllocations,
  inferSplitFranPercent,
  netBalance,
} from "./settlements";

export {
  monthlySummary,
  availableMoney,
  categoryBreakdown,
  type MonthlySummary,
  type CategorySliceRow,
} from "./aggregations";
