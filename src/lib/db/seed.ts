/**
 * Seed data — runs once on first launch (or whenever the DB is empty).
 *
 * The seed is intentionally rich enough to make the app visually useful
 * from the first second and to cover all five reference settlement cases
 * from spec §4 (Cases A–E). Numbers are approximations modeled on the
 * reference dashboard image (`Mayo 2026`).
 *
 * If you need to reset the DB, delete the OPFS DB via DevTools and reload.
 */

import { selectScalar, transaction } from "./client";
import { usersRepo } from "./repositories/users";
import { accountsRepo } from "./repositories/accounts";
import { categoriesRepo } from "./repositories/categories";
import { transactionsRepo } from "./repositories/transactions";
import { recurringRepo } from "./repositories/recurring";
import { debtsRepo } from "./repositories/debts";
import { settlementsRepo } from "./repositories/settlements";

// Stable IDs make the seed idempotent and let other modules reference
// the same accounts/categories without lookup hops.
export const SEED_IDS = {
  users: { fran: "user-fran", sam: "user-sam" },
  accounts: {
    franPersonal: "acct-fran",
    samPersonal: "acct-sam",
    joint: "acct-joint",
  },
  categories: {
    home: "cat-home",
    food: "cat-food",
    transport: "cat-transport",
    leisure: "cat-leisure",
    other: "cat-other",
    salary: "cat-salary",
  },
  debts: {
    sharedCard: "debt-shared-card",
    samPersonal: "debt-sam-personal",
    franToFamilyUsd: "debt-fran-family-usd",
  },
} as const;

export function isSeeded(): boolean {
  return selectScalar("SELECT COUNT(*) FROM users") > 0;
}

/**
 * Seed a fresh database.
 *
 * `includeDemoData` splits structural scaffolding from demo content:
 *   - Always seeded: users, accounts, categories — the app needs these to
 *     function (you can't add an expense without an account + categories).
 *   - Only with `includeDemoData` (default true): the sample recurring items,
 *     debts, transactions and settlements that make the app look "lived-in".
 *
 * The real app (AppBoot) calls this with `false` so a genuine fresh install /
 * cleared DB starts clean — no fictional movements polluting real months.
 * Tests keep the default `true` so the Case A–E fixtures stay available.
 */
export function seedIfEmpty(includeDemoData = true): boolean {
  if (isSeeded()) return false;
  transaction(() => {
    seedUsersAndAccounts();
    seedCategories();
    if (includeDemoData) {
      seedRecurring();
      seedDebts();
      seedTransactions();
    }
  });
  return true;
}

function seedUsersAndAccounts() {
  usersRepo.create({ id: SEED_IDS.users.fran, name: "Fran" });
  usersRepo.create({ id: SEED_IDS.users.sam, name: "Sam" });

  accountsRepo.create({
    id: SEED_IDS.accounts.franPersonal,
    name: "Fran personal",
    type: "PERSONAL",
    owner_user_id: SEED_IDS.users.fran,
    currency_code: "EUR",
    initial_balance: 1500,
  });
  accountsRepo.create({
    id: SEED_IDS.accounts.samPersonal,
    name: "Sam personal",
    type: "PERSONAL",
    owner_user_id: SEED_IDS.users.sam,
    currency_code: "EUR",
    initial_balance: 1200,
  });
  accountsRepo.create({
    id: SEED_IDS.accounts.joint,
    name: "Cuenta conjunta",
    type: "JOINT",
    owner_user_id: null,
    currency_code: "EUR",
    initial_balance: 2500,
  });
}

function seedCategories() {
  const ids = SEED_IDS.categories;
  categoriesRepo.create({
    id: ids.home,
    name: "Hogar",
    kind: "EXPENSE",
    color: "#22C55E",
    sort_order: 1,
    is_default: true,
  });
  categoriesRepo.create({
    id: ids.food,
    name: "Alimentación",
    kind: "EXPENSE",
    color: "#7B5CF6",
    sort_order: 2,
    is_default: true,
  });
  categoriesRepo.create({
    id: ids.transport,
    name: "Transporte",
    kind: "EXPENSE",
    color: "#F59E0B",
    sort_order: 3,
    is_default: true,
  });
  categoriesRepo.create({
    id: ids.leisure,
    name: "Ocio",
    kind: "EXPENSE",
    color: "#FF7D6B",
    sort_order: 4,
    is_default: true,
  });
  categoriesRepo.create({
    id: ids.other,
    name: "Otros",
    kind: "EXPENSE",
    color: "#9CA3AF",
    sort_order: 5,
    is_default: true,
  });
  categoriesRepo.create({
    id: ids.salary,
    name: "Nómina",
    kind: "INCOME",
    color: "#22C55E",
    sort_order: 1,
    is_default: true,
  });
}

function seedRecurring() {
  recurringRepo.create({
    type: "EXPENSE",
    name: "Alquiler",
    amount: 950,
    currency_code: "EUR",
    frequency: "MONTHLY",
    start_date: "2026-05-01",
    end_date: null,
    category_id: SEED_IDS.categories.home,
    source_account_id: SEED_IDS.accounts.joint,
    owner_type: "HOUSEHOLD",
    default_shared_split_percent: 50,
    is_active: true,
    auto_include_in_projection: true,
    auto_generate_transaction: false,
  });
  recurringRepo.create({
    type: "EXPENSE",
    name: "Internet",
    amount: 45,
    currency_code: "EUR",
    frequency: "MONTHLY",
    start_date: "2026-05-01",
    end_date: null,
    category_id: SEED_IDS.categories.home,
    source_account_id: SEED_IDS.accounts.joint,
    owner_type: "HOUSEHOLD",
    default_shared_split_percent: 50,
    is_active: true,
    auto_include_in_projection: true,
    auto_generate_transaction: false,
  });
  recurringRepo.create({
    type: "INCOME",
    name: "Nómina Fran",
    amount: 1980,
    currency_code: "EUR",
    frequency: "MONTHLY",
    start_date: "2026-05-01",
    end_date: null,
    category_id: SEED_IDS.categories.salary,
    source_account_id: SEED_IDS.accounts.franPersonal,
    owner_type: "FRAN",
    default_shared_split_percent: null,
    is_active: true,
    auto_include_in_projection: true,
    auto_generate_transaction: false,
  });
  recurringRepo.create({
    type: "INCOME",
    name: "Nómina Sam",
    amount: 1000,
    currency_code: "EUR",
    frequency: "MONTHLY",
    start_date: "2026-05-01",
    end_date: null,
    category_id: SEED_IDS.categories.salary,
    source_account_id: SEED_IDS.accounts.samPersonal,
    owner_type: "SAM",
    default_shared_split_percent: null,
    is_active: true,
    auto_include_in_projection: true,
    auto_generate_transaction: false,
  });
}

function seedDebts() {
  debtsRepo.create({
    id: SEED_IDS.debts.sharedCard,
    name: "Tarjeta compartida",
    owner_type: "HOUSEHOLD",
    original_amount: 600,
    current_balance: 350,
    currency_code: "EUR",
    interest_rate: null,
    minimum_payment: 50,
    payment_day: 5,
    strategy_priority: 1,
    notes: null,
    is_active: true,
  });
  debtsRepo.create({
    id: SEED_IDS.debts.samPersonal,
    name: "Préstamo Sam",
    owner_type: "SAM",
    original_amount: 200,
    current_balance: 100,
    currency_code: "EUR",
    interest_rate: null,
    minimum_payment: 25,
    payment_day: 10,
    strategy_priority: 2,
    notes: null,
    is_active: true,
  });
  // USD debt to a relative — exercises the multi-currency model (ADR-004)
  debtsRepo.create({
    id: SEED_IDS.debts.franToFamilyUsd,
    name: "Préstamo familia (USD)",
    owner_type: "FRAN",
    original_amount: 500,
    current_balance: 500,
    currency_code: "USD",
    interest_rate: null,
    minimum_payment: 50,
    payment_day: 15,
    strategy_priority: 3,
    notes: "Devolver en USD al cambio del momento de cada pago.",
    is_active: true,
  });
}

/**
 * Sample transactions for current month covering all five spec cases:
 *   A. Sam pays shared expense from Sam personal (50/50)
 *   B. Sam pays personal expense from Sam personal
 *   C. Sam pays shared expense from joint
 *   D. Sam pays personal expense from joint
 *   E. Custom split: Fran pays shared expense from Fran personal (70/30)
 */
function seedTransactions() {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const day = (n: number) => `${month}-${String(n).padStart(2, "0")}`;
  const A = SEED_IDS.accounts;
  const C = SEED_IDS.categories;
  const U = SEED_IDS.users;

  // Case A — Sam pays shared expense from her personal account, 50/50
  const txA = transactionsRepo.create({
    type: "EXPENSE",
    date: day(3),
    amount: 100,
    currency_code: "EUR",
    description: "Compra supermercado",
    merchant: "Mercadona",
    category_id: C.food,
    source_account_id: A.samPersonal,
    created_by_user_id: U.sam,
    allocations: [
      { owner_type: "FRAN", share_percent: 50, share_amount: 50 },
      { owner_type: "SAM", share_percent: 50, share_amount: 50 },
    ],
  });
  settlementsRepo.create({
    date: day(3),
    source_transaction_id: txA.id,
    from_party: "FRAN",
    to_party: "SAM",
    amount: 50,
    reason: "shared_expense_personal_source",
    notes: null,
  });

  // Case B — Sam pays personal expense from her personal account
  transactionsRepo.create({
    type: "EXPENSE",
    date: day(5),
    amount: 18,
    currency_code: "EUR",
    description: "Café",
    merchant: "Starbucks",
    category_id: C.leisure,
    source_account_id: A.samPersonal,
    created_by_user_id: U.sam,
    allocations: [{ owner_type: "SAM", share_percent: 100, share_amount: 18 }],
  });

  // Case C — Sam pays shared expense from joint
  transactionsRepo.create({
    type: "EXPENSE",
    date: day(8),
    amount: 75,
    currency_code: "EUR",
    description: "Cena con amigos",
    merchant: "Restaurante",
    category_id: C.food,
    source_account_id: A.joint,
    created_by_user_id: U.sam,
    allocations: [
      { owner_type: "FRAN", share_percent: 50, share_amount: 37.5 },
      { owner_type: "SAM", share_percent: 50, share_amount: 37.5 },
    ],
  });

  // Case D — Sam pays personal expense from joint → Sam owes Household
  const txD = transactionsRepo.create({
    type: "EXPENSE",
    date: day(10),
    amount: 40,
    currency_code: "EUR",
    description: "Ropa Sam",
    merchant: "Zara",
    category_id: C.leisure,
    source_account_id: A.joint,
    created_by_user_id: U.sam,
    allocations: [{ owner_type: "SAM", share_percent: 100, share_amount: 40 }],
  });
  settlementsRepo.create({
    date: day(10),
    source_transaction_id: txD.id,
    from_party: "SAM",
    to_party: "HOUSEHOLD",
    amount: 40,
    reason: "personal_expense_joint_source",
    notes: null,
  });

  // Case E — Fran pays shared expense from his personal account, 70/30
  const txE = transactionsRepo.create({
    type: "EXPENSE",
    date: day(15),
    amount: 100,
    currency_code: "EUR",
    description: "Reparación coche",
    merchant: "Taller",
    category_id: C.transport,
    source_account_id: A.franPersonal,
    created_by_user_id: U.fran,
    allocations: [
      { owner_type: "FRAN", share_percent: 70, share_amount: 70 },
      { owner_type: "SAM", share_percent: 30, share_amount: 30 },
    ],
  });
  settlementsRepo.create({
    date: day(15),
    source_transaction_id: txE.id,
    from_party: "SAM",
    to_party: "FRAN",
    amount: 30,
    reason: "shared_expense_personal_source_custom_split",
    notes: null,
  });

  // Salary for the month — wired as actual income transactions so
  // the Home dashboard has something to show beyond expenses.
  transactionsRepo.create({
    type: "INCOME",
    date: day(1),
    amount: 1980,
    currency_code: "EUR",
    description: "Nómina Fran",
    category_id: C.salary,
    source_account_id: A.franPersonal,
    created_by_user_id: U.fran,
    allocations: [
      { owner_type: "FRAN", share_percent: 100, share_amount: 1980 },
    ],
  });
  transactionsRepo.create({
    type: "INCOME",
    date: day(1),
    amount: 1000,
    currency_code: "EUR",
    description: "Nómina Sam",
    category_id: C.salary,
    source_account_id: A.samPersonal,
    created_by_user_id: U.sam,
    allocations: [
      { owner_type: "SAM", share_percent: 100, share_amount: 1000 },
    ],
  });
}
