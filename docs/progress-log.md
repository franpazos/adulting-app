# Progress Log

Chronological record of substantive work on Adulting.app. Each entry: date, phase, what changed, decisions, follow-ups. Append at the top.

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
