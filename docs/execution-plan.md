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

## Phase 1 — Design system (Soft Premium)
- [ ] Tokens audit + finalize neutrals against the reference dashboard
- [ ] Base components: `Card`, `Button`, `Input`, `SegmentedControl`, `Pill`, `Badge`, `Sheet`/`Drawer`, `Toggle`, `Slider`, `IconButton`, `EmptyState`
- [ ] Typography scale (display vs body, mobile-first)
- [ ] Safe-area handling polish (notch + home indicator)
- [ ] Theme toggle component (used in Settings later)
- [ ] Loading + skeleton primitives

## Phase 2 — Shell, navigation, i18n polish
- [ ] Header pattern with month selector (`Mayo 2026 ▾`) and notifications bell
- [ ] Scope segmented control (`Hogar / Fran / Sam / Todo`)
- [ ] Route transitions
- [ ] Language switcher in Settings stub
- [ ] Empty-state visuals on placeholder screens

## Phase 3 — Data model & persistence
- [ ] `lib/db` with sqlite-wasm + OPFS bootstrap
- [ ] Migration runner
- [ ] SQL migrations for all tables in `data-model.md`
- [ ] Typed repositories per entity
- [ ] Multi-currency fields on `transactions` and `debt_payments` (`exchange_rate`, `amount_in_account_currency`, `amount_in_debt_currency`)
- [ ] Seed data (Fran, Sam, accounts, categories, recurring, debts, sample transactions covering Cases A–E)
- [ ] Zustand store: month selector, scope, theme, language, sync state

## Phase 4 — Calculation engine (pure, tested)
- [ ] `expenseAllocator` (source vs owner vs split)
- [ ] `settlementsEngine` (create/edit/delete recompute, net balances)
- [ ] `monthlyAggregations` (per scope: Fran, Sam, Household, Joint)
- [ ] `availableMoney` (per spec §13.4)
- [ ] FX conversion helpers for multi-currency debt payments
- [ ] Vitest coverage for Cases A–E + edits + deletes + netting

## Phase 5 — Add Expense flow
- [ ] Big amount input, date, description/merchant, category picker (recents)
- [ ] Source segmented (`Fran` / `Sam` / `Joint`), owner segmented, shared toggle
- [ ] Split slider (default 50/50)
- [ ] Live consequence preview ("Pagado por Sam · pertenece a Hogar · Fran le deberá 50 €")
- [ ] Smart defaults from last entry
- [ ] Local write + sync queue enqueue
- [ ] Sticky save button

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
