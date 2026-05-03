# Progress Log

Chronological record of substantive work on Adulting.app. Each entry: date, phase, what changed, decisions, follow-ups. Append at the top.

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
