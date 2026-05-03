# Adulting.app — Execution Plan

This document is the living plan of work. Each phase ends with a checklist update and a corresponding entry in [`progress-log.md`](./progress-log.md). The original spec lives in [`original-spec/`](./original-spec/) and must not be edited.

---

## Phase 0 — Bootstrap ✅ in progress
- [x] Vite + React + TypeScript scaffold (Vite 6, React 19, TS 5.8, Node 18+)
- [x] Install runtime deps (zustand, react-router-dom, zod, date-fns, lucide-react, i18next, react-i18next, @sqlite.org/sqlite-wasm, @fontsource/sora, @fontsource/inter, clsx, tailwind-merge, class-variance-authority)
- [x] Install dev deps (tailwindcss v3, postcss, autoprefixer, vite-plugin-pwa, vitest, @testing-library/react, jest-dom, jsdom)
- [x] Folder structure (`features/`, `lib/`, `store/`, `styles/`, `types/`, `components/`, `app/`, `assets/`, `public/icons/`, `docs/`, `tests/`)
- [x] Tailwind config with semantic tokens wired to CSS variables
- [x] `tokens.css` with Soft Premium light & dark palettes
- [x] Vite config: `@/*` alias, COOP/COEP headers for OPFS, vite-plugin-pwa manifest, vitest setup
- [x] `tsconfig.app.json` paths + vitest globals
- [x] App shell with bottom nav (Inicio / Movimientos / + / Deudas / Más) and central violet add button
- [x] ThemeProvider (light / dark / system, persisted)
- [x] i18n init (EN/ES dictionaries, browser detection, localStorage override)
- [x] Placeholder pages for all bottom-nav routes + ComingSoon for `more` rows
- [x] Placeholder SVG logo (mark + wordmark) and PWA icons (192, 512, favicon)
- [x] Documentation skeleton (`docs/`, `CLAUDE.md`, `README.md`)
- [ ] Verify dev server boots cleanly

## Phase 1 — Design system (Soft Premium) ✅
- [x] Tokens audit + finalize neutrals against the reference dashboard
- [x] Base components: `Card`, `Button`, `Input`/`AmountInput`, `SegmentedControl`, `Pill`, `Badge`, `Sheet`, `Toggle`, `Slider`, `IconButton`, `EmptyState`, `Skeleton`
- [x] Typography scale (display vs body, mobile-first) via `.h-display`, `.h-section`, `.h-card`, `.t-eyebrow`, `.t-label`, `.t-amount`, `.t-amount-lg`
- [x] Safe-area handling polish (`pt-safe-top`, `pb-safe-bottom`, viewport-fit=cover)
- [x] `ThemeToggle` wired in `/settings`
- [x] `MonthSelector` + `AppHeader` (logo + bell + month pill)
- [x] `useUiStore` (Zustand+persist) for `monthKey` + `scope`
- [x] Home page refreshed to match reference: scope segmented, Cuenta conjunta card, Gastos por categoría list, Settlements + Deudas pair
- [x] `AmountInput` debuted in Add Expense preview screen

## Phase 2 — Shell, navigation, i18n polish ✅
- [x] Header pattern with month selector (`Mayo 2026 ▾`) and notifications bell *(landed in Phase 1)*
- [x] Scope segmented control (`Hogar / Fran / Sam / Todo`) *(landed in Phase 1)*
- [x] Route transitions (220ms fade+slide on `Outlet` remount via `route-frame` keyframe; respects `prefers-reduced-motion`)
- [x] `LanguageToggle` (EN / ES segmented) wired into Settings; persists via `i18next-browser-languagedetector` localStorage cache
- [x] Illustrated empty states (`EmptyArt` ported from handoff `management.jsx`, three variants: transactions, debts, settlements). `EmptyState` extended with a `centered` variant for full-screen empty pages.
- [x] Transactions and Debts pages now use the centered illustrated empty state with primary action
- [x] Full i18n keys for empty-state copy and Settings sections (EN + ES)
- [x] New `--color-violet-tint` token used by the line-art illustrations

## Phase 3 — Data model & persistence ✅
- [x] `lib/db/client.ts` with sqlite-wasm + OPFS SAH Pool bootstrap (in-memory fallback)
- [x] Reentrant `transaction()` with auto-rollback on throw
- [x] Migration runner with `schema_migrations` tracking and idempotency
- [x] SQL migrations for all tables (`0001_initial_schema`)
- [x] Typed repositories: users, accounts, categories, transactions (with allocations + month-keyed indexes), recurring, debts, debt_payments, settlements
- [x] Multi-currency fields on `transactions` and `debt_payments` (`exchange_rate`, `amount_in_account_currency`, `amount_in_debt_currency`)
- [x] Seed data covering Cases A–E + salaries + recurring + USD debt to family (ADR-004)
- [x] `useDbStore` (Zustand) with backend / warning / seeded flags
- [x] `AppBoot` splash that initializes DB → migrations → seed before rendering
- [x] `lib/calculations/dashboard.ts` (read-only aggregations consumed by Home)
- [x] Home wired to live DB data; Settings shows DB backend pill
- [x] Vitest smoke suite (10/10) — DB bootstrap, migrations idempotency, seed, settlements ledger for Cases A/D/E, dashboard summary, category breakdown

## Phase 4 — Calculation engine (pure, tested) ✅
- [x] `expenseAllocator(amount, source, owner, splitFranPercent)` — pure, no DB; covers Cases A–E and the natural edges (zero amount, 0/100 split, paid by other personal account, splitFranPercent clamped)
- [x] `cashSourceFromAccount(account, fixtures)` — bridge from an Account row to the `CashSource` enum
- [x] `settlementsEngine.recomputeForTransaction(txId)` — DB-aware: wipes existing ledger entries for the tx, re-derives via `expenseAllocator` from the current allocations + source account, idempotent
- [x] `inferOwnerFromAllocations` and `inferSplitFranPercent` — work over existing rows (seed + future imports)
- [x] `monthlySummary(monthKey, scope)` — per scope: income, expenses, recurring, debt payments, available
- [x] `categoryBreakdown(monthKey, scope)` — same scope semantics, sorted by amount desc
- [x] `availableMoney(monthKey, scope)` — convenience wrapper around `monthlySummary`
- [x] FX helpers (`fromDebtToAccount`, `fromAccountToDebt`, `quoteFromDebtAmount`, `quoteFromAccountAmount`, `isSameCurrency`) — pure, throw on non-positive rates
- [x] Vitest coverage: 49 new tests across `allocator`, `fx`, `settlements`, `aggregations`. Total suite 59/59 passing.
- [x] ADR-010 documents the allocation model and scope semantics
- [x] Home page now consumes `monthlySummary` from the new module; legacy `dashboard.ts` removed

## Phase 5 — Add Expense flow ✅
- [x] Variation B (Flow diagram) implemented per the design handoff
- [x] Big amount input with € prefix, real-time consequence preview
- [x] Source segmented (Fran / Sam / Joint), owner segmented (Fran / Sam / Household)
- [x] Split slider (default 50/50) — only shown when shared with personal source
- [x] `FlowDiagram` (Avatar source → dashed violet arrow → Avatar owner) and `SettlementChip` (live "Fran → Sam · 50 €" pill or "No settlement impact" green pill)
- [x] `ConsequenceSentence` (i18n-aware "What happens" panel mirroring the chip)
- [x] Category picker (horizontal chip scroller, populated from DB)
- [x] Date input (defaults to today)
- [x] Description input
- [x] Sticky save FAB with violet gradient and live amount label
- [x] Save handler: `expenseAllocator` → `transactionsRepo.create` (writes tx + allocations atomically) → `recomputeForTransaction` (writes settlement_ledger) → `dbStore.bumpVersion()` so Home re-renders
- [x] Auto-navigates Home month selector to the saved tx's month
- [x] `dbVersion` counter on `dbStore`, with HomePage memo deps wired to it
- [x] EN + ES i18n for the entire flow (titles, segments, labels, live preview text, save button)
- [x] Vitest smoke test for the save path (3 scenarios: shared from personal, joint personal, no-impact case)
- [ ] Smart defaults from last entry — deferred to Phase 7 polish
- [ ] Sync queue enqueue — Phase 9 (Google Sheets sync)

## Phase 6 — Transactions, Settlements, Recurring
- [ ] Transactions list + filters + search + edit/delete with recompute
- [ ] Settlements page (net balances, ledger history, record settlement payment)
- [ ] Recurring CRUD (expense/income/debt payment) with monthly projection inclusion

## Phase 7 — Home dashboard, Debts, More
- [ ] Home cards (Household, Joint, Categories donut, Settlements summary, Debts summary, Fran summary, Sam summary)
- [ ] Scope segmented binding to data
- [ ] Debts page (list by owner, totals, multi-currency, monthly payment)
- [ ] More rows: Settlements, Recurring, Categories, Accounts, Settings (Appearance / Language / Defaults / Google Sheets / Backups & Data / About)

## Phase 8 — PWA + offline
- [ ] Service worker validation
- [ ] Install prompt + manifest icons
- [ ] Online/offline detection + sync badge
- [ ] DB persistence verification across reloads

## Phase 9 — Google Sheets sync
- [ ] OAuth client (no backend) — functional
- [ ] Sync queue worker with retry
- [ ] Raw tab writers (`raw_transactions`, `raw_transaction_allocations`, `raw_recurring_items`, `raw_debts`, `raw_debt_payments`, `raw_settlements`, `raw_monthly_snapshots`, `raw_accounts`, `raw_categories`)
- [ ] Month-sync service (ensure tabs/structure for active month)
- [ ] Explicit import flow

## Phase 10 — Polish
- [ ] Motion (sheet/card/theme transitions)
- [ ] Charts (donut + compact bars)
- [ ] Accessibility audit (AA contrast, ≥44px hit targets, focus states)
- [ ] README finalize, contributing notes, deployment notes
