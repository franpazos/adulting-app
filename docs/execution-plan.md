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
- [x] Verify dev server boots cleanly

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
- [x] Smart defaults from last entry — landed in Phase 10b
- [x] Sync queue enqueue — landed in Phase 9a

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
- [x] Filters/search on transactions — landed in Phase 10b
- [x] "Settle up" CTA on balance cards (writes a `SETTLEMENT_PAYMENT` tx) — landed in Phase 7

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
- [x] Home dashboard polish — landed in Phase 10b:
  - [x] Donut chart for category breakdown (Phase 10)
  - [x] CompareBar for income vs expenses (Phase 10)
  - [x] Joint snapshot card (current balance + monthly inflow/outflow)
  - [x] Side-by-side personal summaries (Fran + Sam) per spec §6.1
  - [x] Per-owner debt summary on Home (Fran / Sam / Household totals)
- [x] Filters/search on Transactions — landed in Phase 10b
- [x] Smart defaults from last entry — landed in Phase 10b
- [x] Settings expansion (Defaults, Backups & Data, About) — landed in Phase 10b

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

### 9b — Pull + reconcile ✅
- [x] Reader functions (row → entity per tab) — `src/lib/sync/readers.ts`
- [x] `pullAll`: download all raw_* tabs, reconcile by id + updated_at; remote `is_deleted=1` propagates as soft-delete locally
- [x] `syncAll` = pull → push; **pull failure aborts push** so a stale local view can't clobber remote rows the other device just pushed
- [x] Conflict resolution: last-writer-wins by `updated_at`. Pull bypasses `enqueueChange` so synced rows aren't re-pushed
- [x] Auto-sync hook (`useAutoSync`):
  - Boot sync gates on `sync_queue` PENDING count (durable across reloads + iOS timer death) plus a ≥60s last-push window
  - Visibility-change → visible triggers a sync (snappy "open the app, get fresh data")
  - 3s-debounced sync on `dbVersion` bump with PENDING-count check
  - Retry when back online if anything is unsynced
- [x] Sync status badge in AppHeader (`SyncBadge`): syncing spinner / 2s "Synced" confirmation / error pill
- [x] Import-from-Sheets on bind: `ConnectSheetBlock` runs `pullAll` after validating the sheet; new device joins an existing-data sheet without clobbering it
- [x] `manualOnly` toggle in SyncCard (Toggle in `ConnectedBlock`) — auto-sync defers to manual "Sync now" when on
- [x] Month-sync service scaffolded (`src/lib/sync/month-sync.ts`): `ensureMonthSheet(spreadsheetId, monthKey, opts)` checks for the month tab and either duplicates a designated template or creates blank. Per spec §14.6, exact template wiring is left as TODO until the user nominates their template title.
- [x] `duplicateSheet` Sheets API helper added
- [x] Tests (10 new in pull.test.ts): writer→reader round-trip per entity, FX null preservation, applyTab insert/update/skip/soft-delete propagation, malformed-row tolerance
- [x] Conflict-resolution UI — landed in Phase 10b (sync_conflicts table, detection during pull, /sync/conflicts page with Keep mine / Use remote per row)
- [x] Wire `ensureMonthSheet` into auto-sync — landed in Phase 10b (template title field in SyncCard, called pre-push from `syncAll` when set)

## Phase 10b — Spec coverage cleanup ✅
- [x] Per-owner debt totals on Debts page (spec §6.6): Fran / Sam / Household totals card + monthly minimum total per currency
- [x] Settings → **Defaults** section (`useDefaultsStore` persisted, prefills Add Expense source/owner/split)
- [x] Settings → **Backups & Data** section (download SQLite snapshot via new public `exportDb()`, "Clear local data" with confirm + reload)
- [x] Settings → **About** section (version + build date wired via Vite `define` reading `package.json`)
- [x] Transactions filters + search (spec §6.4): inline search bar, expandable filter panel with Source / Owner / Type segmented controls + Category chips, active-filter badge on the toggle, "Clear filters" affordance, "no matches" empty state. Filters apply client-side over the month's tx list.
- [x] Home dashboard expansion (spec §6.1): Joint snapshot card (account balance + monthly inflow/outflow), side-by-side Fran + Sam personal summaries, per-owner debt summary with multi-currency totals. Settlements + Debts cards now navigate to their detail pages on tap. New `accountBalance` and `accountMonthlyFlow` helpers in `lib/calculations/aggregations.ts`; `AccountsPage` refactored to use the shared helper.
- [x] Smart defaults from last entry on Add Expense: per-pattern (`source|owner|split`) memory of the last category used, persisted to localStorage. On form mount and on pattern change (without manual category touch), the suggested category updates automatically.
- [x] Sheets month-sync wired: `monthTemplateTitle` field in syncStore + `ConnectedBlock` Settings input, `syncAll` calls `ensureMonthSheet(currentMonthKey, { templateTitle })` before push when set. Best-effort — failure surfaces as `monthTabError` but doesn't block the push.
- [x] Conflict-resolution UI: new `sync_conflicts` table (migration v2), pull detects "remote update vs local PENDING" and stashes the conflict instead of overwriting. SyncCard shows a warning banner with the count linking to `/sync/conflicts`, where each conflict shows side-by-side field diffs and "Keep mine" / "Use remote" buttons. Resolution drops the matching PENDING queue entry (when using remote) or leaves it (when keeping local, so next push wins).

## Phase 10 — Polish ✅
- [x] **Code-split routes** via `React.lazy` + `Suspense`. Main bundle dropped from 896 kB → 802 kB; per-route chunks 3–10 kB each (gzipped 1–4 kB)
- [x] **Charts** on Home: SVG `DonutChart` for the category breakdown (with merge-tiny-slices into "Other"), `CompareBar` for income vs expenses below the stats grid. Pure SVG, no charting dep.
- [x] **Motion polish**: smooth theme cross-fade (220 ms on body bg/color via `transition` in base layer), `tap-card` press feedback for tappable cards, `pop-in` keyframe on the SettlementChip so the consequence pulses when source/owner toggles. All gated behind `prefers-reduced-motion: reduce`.
- [x] **Accessibility audit pass**:
  - 44 × 44 px hit area on `IconButton` regardless of visual size, via a transparent `::before` pseudo-element so layout doesn't change.
  - Bottom nav `+` button + nav items get `focus-visible:ring`, `min-h-11`.
  - `SegmentedControl` buttons gain `focus-visible:ring` + `min-h-9`.
  - Keyboard skip link (`Skip to content`) at the top of `AppShell`, sr-only until focused, jumps past the bottom nav for screen-reader / keyboard users.
- [x] **README finalize**: deployment, env vars, persistence strategy (3-tier), Sheets sync workflow, testing layout, contributing rules. Replaces the placeholder Phase-0 README.


## Future ideas (deferred, not committed)

Notification rules considered for the bell-icon sheet (`AppHeader.tsx::NotificationsBell`) but not built:

- **Open settlements** — surface when any of `netBalance(FRAN, SAM)`, `netBalance(FRAN, HOUSEHOLD)`, `netBalance(SAM, HOUSEHOLD)` is non-zero. Tap → `/settlements`. Not built (user opted out).
- **Debt payment due soon** — for any active `Debt` with `payment_day` set, fire when today is within ~3 days of that day AND no `debt_payment` row was logged for that debt in the current month. Tap → `/debts/<id>` (which has the Pay CTA). Saves real money in late fees / interest. Useful when users actually populate `payment_day`.
- **Recurring item missed** — for any active `recurring_item`, fire when its scheduled day this month was ≥5 days ago AND no transaction has been categorized to it yet. Tap → `/recurring/<id>` or `/add` prefilled. Catches forgotten transactions; the 5-day grace tries to avoid false positives.

Both deferred items use existing schema (no migrations). Implementation cost is one helper function per rule plus a card in `NotificationsBell`. Worth picking up after a few months of real use to see whether the absence is felt.
