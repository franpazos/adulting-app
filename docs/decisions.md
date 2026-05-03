# Architectural Decisions (ADRs)

Short, dated records of decisions that shape the codebase. Each entry is an ADR-lite: context, decision, consequences. Add new entries at the top.

---

## ADR-009 — happy-dom over jsdom for Vitest environment
**Date:** 2026-05-03
**Status:** Accepted
**Context:** `jsdom@29` ships a CJS `html-encoding-sniffer` that does `require()` on the ESM `@exodus/bytes`, which Node 18 rejects (`ERR_REQUIRE_ESM`). Pinning jsdom to v25 was an option but `happy-dom` is faster, ESM-friendly, and already supports everything we need (DOM + globalThis.crypto).
**Decision:** Use `happy-dom` as the default Vitest environment.
**Consequences:** None observable for our test surface. If a future test hits a jsdom-only API (rare in Testing Library), switch that file with `// @vitest-environment jsdom` and add jsdom locally.

---

## ADR-008 — sqlite-wasm on the main thread (no worker yet)
**Date:** 2026-05-03
**Status:** Accepted
**Context:** Two viable patterns for `@sqlite.org/sqlite-wasm`:
  1. **Worker promiser** — DB owned by a Web Worker, all queries are async messages. Required by Safari for OPFS sync access handles.
  2. **Main-thread OPFS SAH Pool** — synchronous queries, simpler call sites, works on Chrome/Edge.
**Decision:** Main-thread for now via `installOpfsSAHPoolVfs()` with an in-memory fallback. The interface in `src/lib/db/client.ts` (`exec` / `selectAll` / `selectOne` / `transaction`) is small and synchronous, so swapping to a worker later is a self-contained change.
**Consequences:**
- Tests run under happy-dom on Node where OPFS isn't available — falls through to `:memory:` cleanly.
- Safari users would see the in-memory fallback today (data lost on reload). Acceptable: this is a personal app for Fran on Mac/Chrome. When mobile Safari support matters, swap to the worker promiser behind the same module surface.
- `transaction()` is reentrant via a depth counter so seed and repository code can both wrap their own writes without nested-BEGIN errors.

---

## ADR-007 — Placeholder logo until final SVG arrives
**Date:** 2026-05-03
**Status:** Accepted (temporary)
**Context:** Fran will provide a final, exact-render SVG of the Option 1B logo and the violet coin app icon. The build can't wait.
**Decision:** Use a placeholder SVG (`src/components/Logo.tsx` + `public/icons/*.svg`) that captures the abstract-A + roof + chart-bars concept in the brand violet gradient. Document the swap path.
**Consequences:** When the final SVG arrives, replace the three icons under `public/icons/` and the inline path in `Logo.tsx`. No layout changes should be needed.

---

## ADR-006 — pnpm as package manager
**Date:** 2026-05-03
**Status:** Accepted
**Context:** Sibling project `fran-finance` uses pnpm; Fran already has pnpm 10 installed.
**Decision:** Use pnpm. Lockfile is `pnpm-lock.yaml`.
**Consequences:** Scripts in `package.json` assume pnpm. No npm/yarn lockfiles in the repo.

---

## ADR-005 — Google Sheets OAuth: functional in Phase 9
**Date:** 2026-05-03
**Status:** Accepted
**Context:** Fran wants real Sheets sync, not just a scaffold.
**Decision:** Implement Google OAuth client-side (no backend) and a real sync worker writing to `raw_*` tabs. SQLite remains the source of truth; Sheets is a target and an optional explicit import source.
**Consequences:** Need OAuth client ID configured in `.env.local`. Sync handles offline-first with retry queue. No bidirectional conflict resolution in MVP — local wins by default.

---

## ADR-004 — Multi-currency for debts with FX at payment time
**Date:** 2026-05-03
**Status:** Accepted
**Context:** Fran has debts to relatives in USD that must be repaid in USD, but cash sources are in EUR. The FX rate at the moment of payment matters and varies.
**Decision:** Default app currency = EUR. Each `debt` has its own `currency_code`. `transactions` and `debt_payments` carry: `exchange_rate`, `amount_in_account_currency`, `amount_in_debt_currency`. The debt principal decreases by the debt-currency amount; the source account decreases by the account-currency amount.
**Consequences:** Forms for cross-currency debt payments must capture the rate (manual or suggested). Calculations must keep currencies separate per scope. UI displays each amount in its native currency by default.

---

## ADR-003 — react-router-dom for navigation
**Date:** 2026-05-03
**Status:** Accepted
**Context:** Choosing between `react-router-dom` and `@tanstack/router`.
**Decision:** Use `react-router-dom` v7. It's mature, the routes are simple, and bottom-nav UX doesn't need TanStack's type-safe loaders for MVP.
**Consequences:** Standard `BrowserRouter` / `createBrowserRouter`. Code-splitting later via `React.lazy` per route.

---

## ADR-002 — Tailwind v3 (not v4) for now
**Date:** 2026-05-03
**Status:** Accepted
**Context:** Tailwind v4 is current but the shadcn/Radix component ecosystem and documentation are still v3-dominant.
**Decision:** Tailwind v3 with CSS-variable-based theme tokens. Migrate to v4 later if the trade-off shifts.
**Consequences:** `tailwind.config.js` is the canonical config. Tokens live in `src/styles/tokens.css` and are referenced via `rgb(var(--token) / <alpha-value>)`.

---

## ADR-001 — SQLite via official `@sqlite.org/sqlite-wasm` with OPFS
**Date:** 2026-05-03
**Status:** Accepted
**Context:** Need a local-first, durable client database. Two options: `sql.js` (in-memory + manual IndexedDB serialization) vs official `@sqlite.org/sqlite-wasm` (OPFS-backed real file).
**Decision:** Use the official build with OPFS persistence.
**Consequences:**
- Vite must serve the app with COOP/COEP headers (already configured in `vite.config.ts`).
- The wasm package must be excluded from `optimizeDeps`.
- Web worker pattern for DB access is recommended for non-blocking I/O.
- Production hosting needs the same COOP/COEP headers (or use Cross-Origin-Isolation).
