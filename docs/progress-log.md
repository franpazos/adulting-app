# Progress Log

Chronological record of substantive work on Adulting.app. Each entry: date, phase, what changed, decisions, follow-ups. Append at the top.

---

## 2026-05-03 — Phase 6 Transactions, Settlements, Recurring

**What was done**
- **Transactions list** at `/transactions` (`TransactionsPage`):
  - Reads `transactionsRepo.listByMonth(monthKey)` keyed off `dbVersion` so saves/edits/deletes propagate.
  - New `TransactionRow` component: avatar (from source), description/category, amount with positive/negative tone. "Shared" pill (violet) when allocation has >1 row; "Debt" pill (info) for `DEBT_PAYMENT` type.
  - Tap row → `/transactions/:id`. Empty state still uses `EmptyArt kind="transactions"`.
- **Edit transaction** at `/transactions/:id` (`EditExpensePage`):
  - Loads tx + allocations, infers initial form values via `inferOwnerFromAllocations` and `inferSplitFranPercent` (reused from the calculation engine).
  - Reuses the new `TransactionForm` component extracted from `AddExpensePage` so Add and Edit can never visually drift.
  - Save → `transactionsRepo.update(id, ...)` (atomic: UPDATE row + DELETE allocations + INSERT new ones) → `recomputeForTransaction(id)` → `bumpVersion`.
  - Trash button → `transactionsRepo.softDelete` + recompute (clears the ledger entry).
- **Settlements page** at `/settlements` (`SettlementsPage`):
  - Three balance cards covering all party pairs (Fran↔Sam, Fran↔Household, Sam↔Household). Each card auto-orients so the arrow always points debtor → creditor.
  - "Outstanding" hero number sums the open balances; "All square" empty state when everything is zero.
  - Recent activity list reads `settlementsRepo.list().slice(0, 6)` with reason translated to a friendly label.
  - Subtle violet radial wash on each card, matching the handoff visual.
- **Recurring** at `/recurring` (`RecurringPage`) and `/recurring/new`/`/recurring/:id` (`RecurringFormPage`):
  - List shows monthly in/out totals + sections for Incomes / Expenses / Debt payments. Each row has a tone-coded icon, owner avatar, category, and amount.
  - Form covers type segmented (Expense / Income / Debt payment), name, amount, source, owner, category, start date, auto-include toggle.
  - Edit/deactivate paths via `recurringRepo.update` + `recurringRepo.deactivate`.
- **Repos extended:**
  - `transactionsRepo.update(id, input)` — atomic UPDATE + DELETE allocations + INSERT.
  - `transactionsRepo.softDelete(id)` — flips `is_deleted = 1`. `recomputeForTransaction` reads this flag and wipes derived ledger entries.
  - `recurringRepo.update(id, input)`, `recurringRepo.deactivate(id)`.
- **Shared infra:**
  - `accountIdToCashSource` in `features/add-expense/sources.ts` — reverse map for edit mode.
  - `TransactionForm` extracted from `AddExpensePage`. `AddExpensePage` is now ~100 lines (was ~290).
  - `SaveFab` extracted with a `labelKey` override so Edit can show "Save changes" instead of "Save expense · €X".
- **Routes wired:** `/transactions/:id`, `/settlements`, `/recurring`, `/recurring/new`, `/recurring/:id`. The `ComingSoon` stubs for these routes are gone.
- **i18n** namespaces extended in EN + ES: `transactions.empty.*`, `transactions.editTitle`, `transactions.confirmDelete`, plural `transactions.count`, `settlements.outstanding/openCount/recentActivity/reason.*`, full `recurring.*`.
- **Tests (69/69 passing):** new `editDelete.test.ts` (10 cases) covers edit-amount, edit-split, edit-source, soft-delete settlements clear, listByMonth filtering, and recurring deactivate. Total suite 7 files / 69 passing.

**Decisions**
- `TransactionForm` is a controlled component (parent owns `values` + `onChange`). Keeps Add and Edit in sync without state drift.
- Edit flow always re-derives owner/split from allocations rather than storing them on `transactions` directly. Aligns with ADR-010 (allocations are the source of truth for ownership shape).
- Recurring deactivate is a soft delete (`is_active = 0`). We retain history so monthly forecasts in past months are still accurate.
- Settlements page sorts by direction always positive (debtor → creditor). The repo `netBalance(a, b)` keeps the sign; the page flips it for display.

**Open follow-ups**
- Phase 7 (next): full Debts page (incl. USD FX flow), Categories management, Accounts management, Settings expansion, settle-up CTA on balance cards (writes `SETTLEMENT_PAYMENT` tx that nets out a balance).
- The TransactionsPage doesn't yet have filters or search. Add a filter bar (person/source/category/shared/recurring) + free-text search in Phase 7.
- The RecurringPage shows totals but doesn't currently project them onto the Home dashboard's recurring line — that wiring already exists in `aggregations.ts` (it sums `recurring_items` directly), so totals are consistent.

---

## 2026-05-03 — Phase 5 Add Expense (Variation B Flow diagram)

**What was done**
- Built the signature Add Expense flow following the handoff's winner Variation B (`docs/design-handoff/scripts/add-expense.jsx::AddExpenseB`).
- New components:
  - `Avatar.tsx` — bubble with brand-color gradients (`avatar-fran` violet, `avatar-sam` coral, `avatar-house` green, `avatar-joint` blue) defined as plain CSS in `tokens.css`. Exports `whoFromCashSource` for flow diagrams.
  - `FlowDiagram.tsx` — source avatar → dashed violet arrow ("belongs to") → owner avatar. Pure SVG arrow, no animation library needed.
  - `SettlementChip.tsx` — morphs between two pills: green "No settlement impact" with check, OR violet pill with two avatars and the FX-formatted amount.
  - `ConsequenceSentence.tsx` — i18n-aware Trans-driven sentence ("Paid from Sam · belongs to Household · Fran will owe Sam 50 €"). The chip is the visual; the sentence is the screen-reader-friendly mirror.
- New `AddExpensePage.tsx` (replaces the Phase 1 placeholder):
  - Top nav with X close → `navigate(-1)`.
  - Amount card with violet→surface gradient bg, big inline editor with sanitized digit/comma/period input.
  - FlowDiagram + SettlementChip live-driven by `expenseAllocator` (the *same* function the persistence layer uses — no logic divergence).
  - Source segmented (FRAN_PERSONAL / SAM_PERSONAL / JOINT), owner segmented (FRAN / SAM / HOUSEHOLD), and split slider that only appears when shared with a personal source.
  - Category picker (horizontal chip scroller, reads `categoriesRepo.list("EXPENSE")`).
  - Date input defaulting to today, description input, accent "What happens" panel echoing the consequence sentence.
  - Sticky save FAB with the violet gradient and live amount: "Save expense · €120,00".
- Save handler: `expenseAllocator(input)` → `transactionsRepo.create({ ..., allocations })` (writes tx + allocation rows atomically) → `recomputeForTransaction(tx.id)` (derives settlement_ledger from the just-written allocations) → `dbStore.bumpVersion()` → navigate Home, with month selector auto-jumped to the tx's month.
- `dbStore` extended with `dbVersion: number` + `bumpVersion()`. HomePage memo dependencies updated so its summary, categories, settlements, and debts panels re-fetch after a save.
- New i18n namespace `addExpense.*` in EN + ES, including HTML-mark-up keys (`<b>`, `<v>`, `<ok>`) consumed by `<Trans />` in the consequence sentence.
- Smoke test `addExpense.flow.test.ts` covers three scenarios end-to-end: shared from personal (net balance shifts), joint personal (settlement to household), and Case-B no-impact (balances unchanged, allocation preserved). Total suite: 62/62 passing.

**Decisions**
- Reused `expenseAllocator` for both UI live preview and persistence — single source of truth, no chance of UI/storage drift.
- The category picker is a horizontal scroller (not a sheet) for one-thumb reach. May upgrade to a sheet picker if the count grows beyond ~10 visible.
- Date input is a native `<input type="date">` for now. The handoff used a "Today" pill; we'll likely add a custom date picker in Phase 7 polish.
- Account → CashSource mapping is hard-coded against `SEED_IDS` for MVP. When users can edit/add accounts (Phase 7), this becomes a runtime lookup.

**Open follow-ups**
- Phase 6 (next): Transactions list, edit/delete (with `recomputeForTransaction` on update), Settlements page, Recurring CRUD.
- Phase 7: smart defaults (last source/owner/category), sheet-style category picker, custom date picker, full Debts page with FX flow, Settings expansion.
- The "Try a sample" button on the empty Transactions state still does nothing — wire it in Phase 6 to insert one of the seed cases.

---

## 2026-05-03 — Phase 4 calculation engine

**What was done**
- New `src/lib/calculations/` module with four files plus a barrel:
  - `allocator.ts` — pure `expenseAllocator(amount, source, owner, splitFranPercent)` returning `{ allocations, settlements }`. Implements the five reference cases from spec §4 and the natural edge cases. Also exports `cashSourceFromAccount(account, fixtures)` so feature code can derive the `CashSource` enum from a DB account row without duplicating logic.
  - `fx.ts` — multi-currency helpers: `fromDebtToAccount`, `fromAccountToDebt`, `quoteFromDebtAmount`, `quoteFromAccountAmount`, `isSameCurrency`. Convention is "rate = debt units per 1 account unit". `InvalidExchangeRateError` thrown on non-positive rates.
  - `settlements.ts` — DB-aware `recomputeForTransaction(txId)`: wipes existing ledger entries linked to the tx, re-derives them from current allocations + source account via `expenseAllocator`, writes new entries inside a single DB transaction. Idempotent. Also exports `inferOwnerFromAllocations` and `inferSplitFranPercent`.
  - `aggregations.ts` — `monthlySummary(monthKey, scope)` returning `{ income, expenses, recurring, debtPayments, available }`, plus `availableMoney` and `categoryBreakdown`. Scope semantics defined in ADR-010.
- Deleted the legacy `dashboard.ts` (its surface is now `monthlySummary` + `categoryBreakdown` from the calculations barrel). Home wired to the new module.
- Updated `db.smoke.test.ts` to remove the redundant dashboard-summary tests (now covered more rigorously in `aggregations.test.ts`).

**Decisions**
- ADR-010: settled the allocation model. `transaction_allocations` rows encode the **breakdown of economic ownership**, not a single-row "this is HOUSEHOLD". Personal = one row at 100%; shared = two rows summing to 100%. Owner inferred from row count + types. Split percentages live on the rows; no separate column needed.
- ADR-010 also pinned scope semantics: `fran/sam` filter by allocations.owner_type (includes share of shared); `household` is shared-expenses-only but full income; `all` is unfiltered. Encoded as `SHARED_TX_PREDICATE` SQL fragment.

**Tests (59/59 passing)**
- `allocator.test.ts` (24): all five cases, zero amount, 0/100 and 100/0 splits, default split, rounding invariant (Sam derived by subtraction), paid-by-other-personal-account, split clamping. `cashSourceFromAccount` mappings.
- `fx.test.ts` (10): direction-explicit conversions, rounding, round-trip, invalid rate.
- `settlements.test.ts` (5): recompute matches seed, edit-amount adjusts, soft-delete clears, full-DB-rebuild preserves net Fran↔Sam = 20, idempotent on repeat call.
- `aggregations.test.ts` (12): per-scope income/expenses/recurring/available numbers calibrated to the seed (FRAN 157.50 expenses, SAM 175.50, HOUSEHOLD 275 shared-only, ALL 333; recurring HOUSEHOLD 995; available formula).
- Existing `db.smoke.test.ts` (8): bootstrap, idempotency, seed correctness, ledger Cases A/D.

**Open follow-ups**
- Phase 5 (next): wire Add Expense flow with the live `expenseAllocator` preview and persistence using `recomputeForTransaction`. Use the handoff Variation B (Flow diagram) as the visual reference.
- Phase 7: when the Debts page gets its full UI, the FX form will use `quoteFromDebtAmount` so users can input "$100" and see the live EUR impact.
- The `ALL` scope's expense total (333) intentionally double-counts personal shares vs the household-only 275 — they answer different questions. If a future view wants "headline household total without double counting", expose a fourth helper rather than re-pivot the existing scopes.

---

## 2026-05-03 — Phase 2 polish (route transitions, language switcher, illustrated empty states)

**What was done**
- Closed the remaining Phase 2 items that hadn't landed inline during Phases 1/3.
- **Route transitions:** 220ms fade+slide animation on the `<Outlet>` via a `route-frame` keyframe + `key={location.pathname}` to force a remount on navigation. Respects `prefers-reduced-motion`.
- **Language switcher:** new `LanguageToggle` (segmented `EN / ES`), wired into Settings. Persists via the existing `i18next-browser-languagedetector` localStorage cache (key `adulting.lang`).
- **Illustrated empty states:**
  - Ported the geometric line-art SVGs from the handoff (`docs/design-handoff/scripts/management.jsx::EmptyArt`) into `src/components/EmptyArt.tsx` with three variants: `transactions`, `debts`, `settlements`. All colors flow through Tailwind tokens — no hex literals.
  - Extended `EmptyState` with a `centered` variant (full-screen, no border) for empty-page treatments. Existing `card` variant kept for inline list-style empty rows.
  - Transactions page: centered empty state with "Try a sample" secondary action.
  - Debts page: centered empty state when no debts exist; otherwise renders a simple list (placeholder until Phase 7 builds the full debts screen). The seed has three debts so this currently renders the list.
- **i18n:** added namespaces for `transactions.empty.*`, `debts.empty.*`, `settlements.empty.*`, and a full `settings.*` namespace (appearance / theme / language / database / backend / seededFresh) in EN and ES dictionaries.
- **Tokens:** added `--color-violet-tint` (light: `#EFEAFE`, dark: deep violet) and exposed it via Tailwind as `bg-violet-tint`, `text-violet-tint`, etc. Used by the empty-state illustrations.

**Open follow-ups**
- Settlements page itself is still a `ComingSoon`. When Phase 6 builds it, render `EmptyArt kind="settlements"` + "All square" copy when `netBalance` returns 0 across all party pairs.
- Add a `LanguageToggle` shortcut in `MorePage` if user testing shows Settings is too deep.
- Phase 4 next: pure calculation engine (expenseAllocator, settlementsEngine recompute, monthlyAggregations, availableMoney, FX helpers).

---

## 2026-05-03 — Final brand assets + design handoff archived

**What was done**
- Replaced the placeholder logo with Fran's final SVGs:
  - `src/assets/brand/adulting-logo.svg` (abstract A with chart bars) → inlined as `LogoMark` in `src/components/Logo.tsx` with React-namespaced gradient ids (prefixed `al-*`) so multiple instances can render side-by-side without id collisions.
  - `src/assets/brand/adulting-logo-coin.svg` (violet coin) → copied to `public/icons/favicon.svg`, `icon-192.svg`, `icon-512.svg`. The PWA install prompt and browser tab now show the final coin.
- Archived the Claude Design handoff bundle into `docs/design-handoff/` (HTML canvas, JSX prototypes, design tokens, image uploads). **Per Fran's instruction: ignore the brand assets in the handoff (`brand/*.svg`); the canonical logo + icon are the SVGs above.** Use the rest of the handoff (`scripts/*.jsx`, `Adulting Design Canvas.html`, `styles/tokens.css`) as the visual reference for upcoming screens.
- `LogoMark` now accepts `style` and `title` props so `LogoWordmark` can size it via CSS without re-creating the SVG. API stays backward-compatible with existing `<LogoMark className="size-7" />` call sites.

**Design handoff highlights (for future phases)**
- **Add Expense** — five variations explored. **Winner: Variation B (Flow diagram)** — avatar-to-avatar money flow (Paid by → belongs to) with a settlement chip showing the consequence. Live consequence sentence in a card below. Sticky FAB to save.
- Settlements screen with avatar-to-avatar net balance cards.
- Multi-currency debt payment with FX (USD input, live EUR impact).
- Home dashboard, Recurring (list + form), Categories, Accounts, Settings, Empty states for Transactions / Debts / Settlements.
- Tokens in `docs/design-handoff/styles/tokens.css` are nearly identical to ours; the only deltas are `--violet-tint` and slightly different shadow definitions — worth aligning in Phase 5/7 polish.

**Open follow-ups**
- Phase 4 (next): pure calculation engine. Use the `computeConsequence(amount, source, owner, split)` from `docs/design-handoff/scripts/add-expense.jsx` as the reference implementation for `expenseAllocator` + `settlementsEngine`.
- Phase 5: build Add Expense as Variation B (Flow diagram). Wire `computeConsequence` into the live preview.
- Phase 7: align Home with the handoff's Home screen and adopt the avatar gradients (`avatar-fran`, `avatar-sam`, `avatar-house`, `avatar-joint`) defined in the handoff tokens.

---

## 2026-05-03 — Phase 3 data model & persistence

> Decision: skipped Phase 2 (route transitions, language switcher) and went straight to Phase 3 to unblock Phase 4. Phase 2 polish is small and will be absorbed inline.

**What was done**
- Built the local DB layer end-to-end:
  - `src/lib/db/client.ts` — `@sqlite.org/sqlite-wasm` initializer that prefers `installOpfsSAHPoolVfs` (durable, main-thread) and falls back to `:memory:`. Synchronous `exec`, `selectAll`, `selectOne`, `selectScalar` plus a reentrant `transaction()` (depth counter, auto-rollback on throw). Test reset hook.
  - `src/lib/db/migrations.ts` — `0001_initial_schema` covering all 11 tables from `data-model.md` (users, accounts, categories, transactions, transaction_allocations, recurring_items, debts, debt_payments, settlement_ledger, monthly_snapshots, sync_queue) plus `schema_migrations` tracker. Indexes on month_key + is_deleted, source_account_id, category_id, allocations by tx and by owner, debt_payments by debt, settlement parties, sync_queue status.
  - `src/lib/db/types.ts` — TS mirrors of every entity, with explicit unions for the enum columns and multi-currency optional fields.
  - `src/lib/db/repositories/` — typed repos for users, accounts, categories, transactions (insert tx + allocations atomically; `monthOwnerTotal`, `monthAccountTotal`), recurring, debts, debt_payments, settlements (`netBalance(from, to)`).
  - `src/lib/db/seed.ts` — full seed: Fran/Sam users, three accounts (Fran personal EUR, Sam personal EUR, Cuenta conjunta EUR), six default categories, four recurring items (alquiler, internet, two salaries), three debts (shared EUR card, Sam personal EUR, **USD debt to family** exercising ADR-004), and seven sample transactions covering Cases A–E from spec §4 plus salaries. Settlement ledger entries written for Cases A, D, E.
- Added `lib/calculations/dashboard.ts` (read-only): `dashboardSummary(monthKey, scope)` and `categoryBreakdown(monthKey, scope)`. Phase 4 will move to a fuller calculation engine.
- Wired the boot flow:
  - `src/store/dbStore.ts` (Zustand) — status / backend / warning / seededOnThisLoad.
  - `src/app/AppBoot.tsx` — initializes DB → migrations → seed before children render. Soft splash with the logo while booting; error card on failure.
  - `src/main.tsx` — `<AppBoot>` wraps `<RouterProvider>`.
- Refreshed the Home page to read live data from the DB. The four-stat card, category breakdown list, Settlements net balances, and Deudas total all flow from real seed data. Numbers re-compute when `monthKey` or `scope` change.
- Settings now shows a "Local database" section with a backend pill (`OPFS (durable)` vs `in-memory`) and surfaces any init warning.
- Replaced jsdom with happy-dom (ADR-009) to fix Vitest under Node 18.
- Added 10 vitest smoke tests covering DB bootstrap, migration idempotency, seed correctness, settlements ledger for Cases A/D/E, dashboard summary, and category breakdown — all passing.

**Decisions**
- ADR-008 (sqlite-wasm main-thread + OPFS SAH Pool, in-memory fallback).
- ADR-009 (happy-dom over jsdom).
- Reentrant transactions: seed wraps writes atomically, but repository methods also use `transaction()` for their own atomicity. Fixed by a depth counter rather than savepoints — simpler and sufficient.
- Read path lives in `lib/calculations/` not in repository code, keeping repos focused on row I/O.

**Open follow-ups**
- Phase 4 (next): `expenseAllocator`, `settlementsEngine` (recompute on edit/delete), `monthlyAggregations`, `availableMoney`, FX helpers. Will replace the partial logic now sitting in `dashboard.ts`.
- The seed allocates Case-A/C/D/E "household" shared expenses to FRAN/SAM (50/50 or 70/30) rather than to a HOUSEHOLD owner row. That mirrors the spec but means the Home "household" scope shows 0 expenses for those — Phase 4 will rationalize whether household scope rolls up shared spending visually.
- When the user reloads the dev server, the OPFS pool persists. To wipe data: DevTools → Application → Storage → "Clear site data".
- Browser support: Safari shows the in-memory fallback. When mobile Safari matters, swap `client.ts` to the worker promiser pattern.

---

## 2026-05-03 — Phase 1 design system

**What was done**
- Installed Radix primitives: `@radix-ui/react-dialog`, `@radix-ui/react-slider`, `@radix-ui/react-switch`, `@radix-ui/react-scroll-area`.
- Added typography utilities to `src/index.css` (`.h-display`, `.h-section`, `.h-card`, `.t-eyebrow`, `.t-label`, `.t-amount`, `.t-amount-lg`) so feature code stays disciplined.
- Built the base UI kit under `src/components/ui/`:
  - `Card`, `CardHeader`, `CardTitle`, `CardEyebrow` (variants `default`/`flat`/`accent`, optional `compact`).
  - `Button` with CVA variants (primary/secondary/ghost/destructive) and sizes (sm/md/lg/icon, optional `block`).
  - `Input`, `AmountInput` (the big-number entry for Add Expense), `FieldLabel`.
  - `Pill` (neutral/violet/positive/expense/info/warning).
  - `Badge` (dot or counter).
  - `IconButton` (surface/ghost/violet, sm/md/lg).
  - `SegmentedControl` (iOS-style sliding violet pill via `useLayoutEffect` + absolute positioning).
  - `Sheet` (Radix Dialog–backed bottom drawer with handle, also supports center modal).
  - `Toggle` (Radix Switch), `Slider` (Radix Slider).
  - `Skeleton`, `EmptyState`.
  - Barrel `src/components/ui/index.ts` for ergonomic imports.
- Date helpers: `src/lib/date/month.ts` with `MonthKey` type, `toMonthKey`, `fromMonthKey`, `currentMonthKey`, `shiftMonthKey`, `formatMonthLabel` (locale-aware via date-fns `enUS` / `es`).
- Zustand store `src/store/uiStore.ts` (persisted) holding `monthKey` and `scope` (`household`/`fran`/`sam`/`all`).
- `MonthSelector` (header pill + bottom sheet with prev/next arrows) and `AppHeader` (logo + brand name + month pill + notifications bell with red dot).
- `ThemeToggle` segmented (Light / Auto / Dark) wired to `ThemeProvider`.
- Home page refresh that matches the reference image: `AppHeader`, scope `SegmentedControl`, "Cuenta conjunta" card with 4-stat grid, "Gastos por categoría" list with colored dots, side-by-side Settlements + Deudas cards. All numbers are mock — real data lands in Phase 3+.
- Add Expense (`/add`) is now a Phase-1 visual demo of the kit: `AmountInput`, source segmented, owner segmented, shared toggle, 50/50 split slider, accent "Live preview" card. No persistence yet.
- Transactions and Debts pages now use `EmptyState` with the violet-tinted icon container.
- New `/settings` route renders `SettingsPage` with the live `ThemeToggle` so light/dark/system can be tested end-to-end.

**Decisions**
- Picked a custom `SegmentedControl` (sliding pill) over `@radix-ui/react-toggle-group` because the iOS-feel motion is the signature of the bottom-nav and scope filter. Kept the API minimal (`options`, `value`, `onChange`, `tone`).
- Used CSS variables + `rgb(var(--token) / <alpha-value>)` syntax everywhere — no hex literals leaked into components. Theming is a single class flip on `<html>`.

**Open follow-ups**
- Phase 2 (next): mocked data store and wiring `scope` + `monthKey` into placeholder content; route transitions; language switcher.
- When the final logo SVG arrives, swap `src/components/Logo.tsx` and `public/icons/*` per the path documented in `CLAUDE.md`.
- Replace category dot colors in Home (`#22C55E`, `#7B5CF6`, `#F59E0B`, `#FF7D6B`, `#9CA3AF`) with token-based colors when category color storage lands in Phase 3.

---

## 2026-05-03 — Phase 0 bootstrap

**What was done**
- Initialized Vite + React 19 + TypeScript project (`pnpm create vite@6`).
- Installed full Phase-0 dependency set (see `package.json`): React Router, Zustand, Zod, date-fns, Lucide, i18next stack, sqlite-wasm, Sora + Inter fonts, Tailwind v3, vite-plugin-pwa, Vitest + Testing Library.
- Created project folder structure per spec §16 (`features/`, `lib/`, `store/`, `styles/`, `types/`, `components/`, `app/`, `assets/brand/`).
- Wrote `tailwind.config.js` with semantic tokens (bg, surface, border, text-primary/secondary/muted) wired to CSS variables, plus functional palette (violet, positive/expense/info/warning) and brand fonts (Sora/Inter).
- Wrote `src/styles/tokens.css` with Soft Premium light and dark token sets — values aligned with brand sheet (`#7B5CF6`, `#22C55E`, `#FF7D6B`, `#3B82F6`, `#F59E0B`).
- Configured `vite.config.ts`: `@/*` alias, COOP/COEP headers required for sqlite-wasm OPFS, `vite-plugin-pwa` manifest with icons, vitest jsdom setup.
- Updated `tsconfig.app.json` with `paths` and vitest globals.
- Built app shell: `src/main.tsx` mounts `<ThemeProvider>` + `<RouterProvider>`, `src/app/router.tsx` defines all bottom-nav routes plus `ComingSoon` stubs for `/settlements`, `/recurring`, `/categories`, `/accounts`, `/settings`.
- Bottom nav (`src/components/BottomNav.tsx`) with elevated central violet `+` add button, NavLink active state in violet.
- ThemeProvider with light/dark/system + system-pref listener, persisted in localStorage.
- i18n: EN + ES dictionaries, browser detection, manual override key `adulting.lang`.
- Placeholder pages for Home (with logo + month-style header), Transactions, Add, Debts, More (grouped Household + Preferences rows).
- Placeholder SVG assets:
  - `src/components/Logo.tsx` — `LogoMark` and `LogoWordmark` (abstract A + roof + chart bars in violet gradient). To be replaced when Fran provides the final-render SVG.
  - `public/icons/favicon.svg`, `public/icons/icon-192.svg`, `public/icons/icon-512.svg` — PWA icons in the violet coin style.
- Updated `index.html` with theme-color meta, Apple PWA metas, viewport-fit=cover, real title.
- Archived original spec into `docs/original-spec/` (`01-build-prompt.md`, `02-brand-ui-direction.md`, `03-conversation-prompts.md`).
- Created `docs/execution-plan.md` and this `progress-log.md`.

**Decisions**
- See `docs/decisions.md` for the formal ADRs (sqlite-wasm OPFS, react-router, Tailwind v3, multi-currency model, pnpm).

**Open follow-ups**
- Verify dev server boots cleanly (`pnpm dev`) before declaring Phase 0 complete.
- Replace placeholder logo and icons when final SVGs arrive.
- Phase 1: build out base UI components (Card/Button/Input/SegmentedControl/Pill/Sheet/Slider/EmptyState) and finalize the dashboard header pattern (`Mayo 2026 ▾` selector + scope segmented control) using the reference image as the visual target.
