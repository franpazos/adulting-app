/**
 * Public surface of the local DB layer. Feature code should import from
 * here only — never reach into `client.ts` or specific repository files.
 */

export { initDb, type DbInitResult } from "./client";
export { runMigrations } from "./migrations";
export { seedIfEmpty, isSeeded } from "./seed";

export { usersRepo } from "./repositories/users";
export { accountsRepo } from "./repositories/accounts";
export { categoriesRepo } from "./repositories/categories";
export {
  transactionsRepo,
  type CreateTransactionInput,
  type AllocationInput,
} from "./repositories/transactions";
export { recurringRepo } from "./repositories/recurring";
export { debtsRepo, debtPaymentsRepo } from "./repositories/debts";
export { settlementsRepo } from "./repositories/settlements";

export type * from "./types";
