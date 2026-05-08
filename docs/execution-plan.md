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

## Phase 6 — Transactions, Settlements, Recurring ✅
- [x] Transactions list at `/transactions` with month-aware data, avatar + category + amount rows, "Shared" pill on multi-allocation rows, "Debt" pill on debt payments
- [x] Edit page at `/transactions/:id` reusing the shared `TransactionForm` component (extracted from AddExpensePage); loads existing values via `inferOwnerFromAllocations` + `inferSplitFranPercent`
- [x] Soft-delete with confirm dialog → `transactionsRepo.softDelete` + `recomputeForTransaction` clears the ledger entry, settlements update everywhere
- [x] Settlements page at `/settlements` with three balance cards (Fran↔Sam, Fran↔Household, Sam↔Household) showing direction and amount, recent activity ledger list with reasons in plain language, "All square" empty state
- [x] Recurring list at `/recurring` with monthly in/out totals + grouped sections (Incomes, Expenses, Debt payments), tap row → edit
- [x] Recurring form at `/recurring/new` and `/recurring/:id` with type segmented, name, amount, source, owner, category, start date, auto-include toggle; deactivate via trash icon
- [x] `transactionsRepo.update` and `softDelete`; `recurringRepo.update` and `deactivate`
- [x] EN + ES copy for transactions list/edit, settlements (open count, recent activity, reason labels), recurring (sections, fields)
- [x] Vitest coverage (10 new): edit-amount/split/source recompute paths, soft-delete clears settlements, soft-deleted txs hidden from list, recurring deactivate semantics. Total suite 69/69 passing.
- [ ] Filters/search on transactions — deferred to Phase 7 polish
- [ ] "Settle up" CTA on balance cards (writes a `SETTLEMENT_PAYMENT` tx) — deferred to Phase 7

## Phase 7 — Home dashboard, Debts, More ✅ (core)
- [x] Debts list at `/debts` with avatar + currency pill + balance + minimum payment, totals card grouped by currency
- [x] Debt detail at `/debts/:id` with progress bar (paid / original), payment history, "Pay" CTA
- [x] **Pay Debt with FX** at `/debts/:id/pay`: amount in debt currency, live EUR impact via `fromDebtToAccount`, editable rate, two-way input (edit either side), preset chips, FX caveat banner. Save flow: `expenseAllocator` → `transactionsRepo.create(DEBT_PAYMENT)` → `debtPaymentsRepo.create` → `debtsRepo.adjustBalance(-debtAmount)` → `recomputeForTransaction`. Same-currency case collapses the FX card.
- [x] Settle-up at `/settlements/settle?from=&to=`: pre-filled with current outstanding, partial-amount note, save writes `SETTLEMENT_PAYMENT` tx + reverse-direction ledger entry (preserved by recompute since recompute only manages EXPENSE/DEBT_PAYMENT entries)
- [x] "Settle up" CTA on each `BalanceCard` in `/settlements`
- [x] Categories CRUD at `/categories`, `/categories/new`, `/categories/:id` with kind segmented + 12-color palette picker
- [x] Accounts read-only at `/accounts` with computed estimated balance per account, totals grouped by currency
- [x] Bug fix: `recomputeForTransaction` now also processes `DEBT_PAYMENT` (was EXPENSE-only) so settlements stay consistent when debts are paid from a non-owner account
- [x] EN + ES copy for debts, payDebt, settleUp, categories, accounts namespaces
- [x] Vitest coverage: USD-debt-from-EUR-account, joint-source-personal-debt settlement, settle-up zeroing balance, partial settle-up, balance rounding (74/74 passing)
- [ ] Home dashboard polish (Joint snapshot card, donut chart, debts/category/people summary cards) — deferred to a future polish pass
- [ ] Filters/search on Transactions — deferred
- [ ] Smart defaults from last entry — deferred
- [ ] Settings expansion (Defaults, Backups & Data, About) — deferred

## Phase 8 — PWA + offline ✅
- [x] Service worker registered via `virtual:pwa-register` (Workbox under `vite-plugin-pwa`); `dist/sw.js` precaches 15 app-shell entries (~2 MB incl. sqlite-wasm)
- [x] `registerType: "prompt"` so updates surface as a banner instead of silently auto-installing
- [x] `devOptions.enabled = true` — SW is active in `pnpm dev` for end-to-end verification
- [x] Manifest tightened: maskable icon entry, scope, lang, categories; apple-touch-icon and apple-mobile-web-app-title in `index.html`
- [x] `NetworkBadge` component shows a subtle "Sin conexión / Offline" pill in the AppHeader when `navigator.onLine` is false
- [x] `InstallPrompt` banner: triggers `beforeinstallprompt` on Chrome/Edge; iOS Safari fallback explains "Share → Add to Home Screen"; dismissal persists in localStorage; hidden when already installed
- [x] `UpdatePrompt` banner appears at the top when a new SW is waiting; "Refresh" applies and reloads
- [x] `networkStore` (online + offlineReady + needRefresh + applyUpdate) and `installStore` (event + dismissed + installed)
- [x] Workbox runtime caching: fonts and `.wasm` go to long-lived CacheFirst stores
- [x] pnpm override `lru-cache@>=11 → ^10` so workbox-build runs on Node 18 (`tracingChannel` API only in Node 19+)
- [x] Production build verified: SW served, manifest served, full offline boot path

## Phase 9 — Google Sheets sync
### 9a — Push (snapshot) ✅
- [x] Google Identity Services token client (`lib/google/auth.ts`) with implicit OAuth flow
- [x] `authStore` with persistence; `getValidToken()` re-prompts when expired
- [x] Sheets API client (`lib/google/sheets-api.ts`): getSpreadsheet, addSheet, getValues, updateValues, clearValues
- [x] `parseSpreadsheetId` accepts URL or raw ID
- [x] `RAW_TABS` definitions for all 9 entities + `ensureRawTabs` (creates missing, refreshes headers)
- [x] Per-entity row mappers (`writers.ts`); `buildSnapshot` reads SQLite into snapshot data
- [x] Sync queue helpers (`queue.ts`); repositories enqueue on every write
- [x] `pushAll(spreadsheetId)` snapshot writer that clears + writes each raw_* tab and marks queue synced
- [x] `syncStore` + `SyncCard` UI in Settings with three states (not connected / no sheet bound / fully connected)
- [x] COOP relaxed to `same-origin-allow-popups` (vercel.json + vite.config) so OAuth popup keeps `window.opener`
- [x] EN + ES i18n for the sync namespace
- [x] 11 new tests (writers column counts, boolean coercion, snapshot completeness, queue lifecycle, column letter math). Total 85/85 passing.

### 9b — Pull + reconcile ✅ (core)
- [x] Reader functions (row → entity per tab) — `src/lib/sync/readers.ts`
- [x] `pullAll`: download all raw_* tabs, reconcile by id + updated_at; remote `is_deleted=1` propagates as soft-delete locally
- [x] `syncAll` = pull → push, used by both "Sync now" and the auto-sync hook
- [x] Conflict resolution: last-writer-wins by `updated_at`. Pull bypasses `enqueueChange` so synced rows aren't re-pushed
- [x] Auto-sync hook (`useAutoSync`): boot sync (≥60s gap), debounced 3s on `dbVersion` bump, retry when back online
- [x] Sync status badge in AppHeader (`SyncBadge`): syncing spinner / 2s "Synced" confirmation / error pill
- [x] Tests (10 new): writer→reader round-trip per entity, FX null preservation, applyTab insert/update/skip/soft-delete propagation, malformed-row tolerance
- [ ] Month-sync service for the formatted monthly tabs (spec §14.6)
- [ ] Explicit import-from-Sheets flow (one-shot pull without push, for first-device bootstrap)
- [ ] Conflict-resolution UI for the rare case the user wants local to win when remote is newer

## Phase 10 — Polish
- [ ] Motion (sheet/card/theme transitions)
- [ ] Charts (donut + compact bars)
- [ ] Accessibility audit (AA contrast, ≥44px hit targets, focus states)
- [ ] README finalize, contributing notes, deployment notes
