# Architectural Decisions (ADRs)

Short, dated records of decisions that shape the codebase. Each entry is an ADR-lite: context, decision, consequences. Add new entries at the top.

---

## ADR-013 — IndexedDB snapshot for Safari iOS persistence
**Date:** 2026-05-08
**Status:** Accepted (Phase 9b follow-up)
**Context:** Safari on iOS does not expose `createSyncAccessHandle` on the main thread, so `installOpfsSAHPoolVfs` fails with "Missing required OPFS APIs". The DB falls back to `:memory:` and the user loses everything on reload — confirmed on a real iPhone. Two paths considered:
  1. **Worker promiser** — move sqlite-wasm into a dedicated Web Worker where SAH Pool works on Safari. Correct but async-ifies all 138 query call sites and every page-level `useMemo` reading the DB. Estimated ~1 day of refactor work, non-trivial regression risk.
  2. **In-memory + IndexedDB snapshot** — keep sqlite in `:memory:` on the main thread; after every write, serialize the entire DB via `sqlite3_js_db_export` and persist the bytes to a single IndexedDB key. On boot, deserialize before migrations run.

**Decision:** Take path 2. The dataset for a two-user household is tiny (KBs to maybe a few hundred KB), serialization is sub-millisecond, and the call-site signature stays synchronous. Wired in `src/lib/db/persistence.ts` + the snapshot machinery in `client.ts`.

**Mechanics:**
  - `markDirty()` is called from `exec()` and `execScript()`. It schedules a 500ms-debounced async save so a burst of writes (e.g. an Add Expense flow that touches `transactions`, `transaction_allocations`, and `settlement_ledger` in the same tick) coalesces into one IDB put.
  - `pagehide` and `visibilitychange → hidden` both trigger a synchronous serialize + fire-and-forget IDB put. Safari typically lets an in-progress IDB transaction commit even as the page enters bfcache.
  - Pull-from-Sheets writes go through `exec`, so they're snapshotted just like local writes.
  - Backend enum gains a third state, `"memory-snapshot"`, distinct from the `"memory"` (no-persistence) fallback when IDB is also unavailable. Settings shows a green pill for both `"opfs-sahpool"` and `"memory-snapshot"`.
  - Auto-snapshot is disabled under Vitest (`import.meta.env.MODE === "test"`) so happy-dom's IDB doesn't leak state across test files. The serialize/deserialize primitives are exposed via `_internal` for tests that want to exercise them directly.

**Consequences:**
  - Safari iOS now durably persists data across reloads + app cold-starts via IDB.
  - Every write triggers a full DB serialization. At our scale this is invisible (<1ms); if the dataset ever grows past ~5 MB, we'd need to switch to the worker promiser.
  - The IDB blob is opaque (raw SQLite file format). It's not human-inspectable like the OPFS path was, but the Sheets export remains the human-readable snapshot of record.
  - The same code path runs on Chrome too, but Chrome takes the OPFS SAH Pool branch first and never falls through to the snapshot path. So there's zero behavioral change there.
  - If a write happens between the last serialize and a sudden iOS process kill, that write is lost. The 500ms debounce window plus the visibility flush makes this rare; Sheets sync provides a second safety net since pushed writes survive even if the local IDB blob is stale.

---

## ADR-012 — Sheets sync: snapshot push first, incremental later
**Date:** 2026-05-04
**Status:** Accepted (Phase 9a)
**Context:** Two devices need to share a ledger. The spec (§14) chose Google Sheets as the sync target. Two architectures considered for the push direction:
  1. **Snapshot push** — every sync, the whole local DB is dumped into the raw_* tabs (clear + write).
  2. **Incremental push** — drain the `sync_queue` and apply per-row upserts.

**Decision:** Phase 9a uses snapshot. Reasons:
  - Correctness over speed: snapshot guarantees the Sheet matches local state exactly, including deletions, regardless of queue weirdness.
  - Volume is low (a 2-user household will write tens of rows per day at most).
  - Simpler code path: no row-finding logic in the Sheet, no edge cases when a sync fails midway.
  - The `sync_queue` is still populated by repos so we can switch to incremental in 9b without touching repo code.

**Consequences:**
  - A push call writes ~9 `clearValues` + ~9 `updateValues` per sync regardless of how few rows changed. Acceptable for our scale.
  - After a successful push, all queue items are marked SYNCED so the "pending changes" UI resets.
  - Phase 9b adds **pull + reconciliation** so both devices converge. Without pull, push from two devices can race — last writer wins, which is an acceptable tradeoff while pull is being built.

---

## ADR-011 — Node 22 LTS as the runtime baseline
**Date:** 2026-05-04
**Status:** Accepted (supersedes the temporary lru-cache override from Phase 8)
**Context:** Phase 8 (PWA) failed to build under Node 18.16.1 because `lru-cache@11`'s commonjs build calls `tracingChannel`, an API only present in Node 19+. We worked around it with a pnpm override pinning v11+ down to v10. Node 18 reached end-of-life in April 2025 anyway.
**Decision:** Adopt Node 22 LTS (Jod) as the project baseline:
  - `.nvmrc` pins `22` so any nvm-aware shell auto-switches when entering the directory.
  - `package.json` `engines` declares `node: ">=20.19.0"` (allow Node 20+ as a floor; Vite 7 needs the .19 patch).
  - The `pnpm.overrides.lru-cache` workaround from Phase 8 is removed.
**Consequences:**
- Anyone cloning the repo needs Node 20.19+ or 22+. CI (when added) should pin 22.
- The build is now ~30 KB smaller in node_modules (no v10 fallback) and `lru-cache` resolves to its current major.
- We can later upgrade to Vite 7 (Node 20.19+ requirement) without runtime work.

---

## ADR-010 — Allocation model and scope semantics
**Date:** 2026-05-03
**Status:** Accepted
**Context:** Spec §4 reference cases describe shared expenses as "household expenses +N (full)" while also splitting the cost between people for settlement purposes. This left two viable allocation shapes:
  1. **Single allocation row to HOUSEHOLD**, with split info stored separately for settlements.
  2. **Two allocation rows (FRAN + SAM)** that already encode the split.

Choosing the wrong one cascades into how the Home dashboard scopes (`Hogar / Fran / Sam / Todo`) compute their numbers.

**Decision:** Adopt model #2 — `transaction_allocations` represents the **breakdown of who economically owns what share** of a transaction:
  - **Personal expense** (owner FRAN or SAM): exactly one allocation row to that person at 100%.
  - **Shared expense** (owner HOUSEHOLD): two rows, FRAN and SAM, with `share_percent` summing to 100. The HOUSEHOLD owner is *inferred* from "this tx has ≥2 allocation rows" (or a single explicit HOUSEHOLD row, also accepted).

  The split percentage lives on the allocation rows themselves; no separate column needed.

**Scope semantics on the dashboard:**
  - **`fran` / `sam`** — personal P&L. Filter income/expenses by `transaction_allocations.owner_type = scope`. This naturally includes the person's *share* of shared expenses.
  - **`household`** — the joint household-cashflow view. Income is unfiltered (the household sees all incoming money). Expenses are restricted to *shared* transactions only (multi-row alloc OR single HOUSEHOLD row). Recurring items filtered to `owner_type='HOUSEHOLD'`.
  - **`all`** — no filter; sums everything.

  The "shared transaction" predicate is encoded as `(SELECT COUNT(*) FROM transaction_allocations WHERE transaction_id = t.id) > 1 OR EXISTS (SELECT 1 FROM transaction_allocations WHERE owner_type='HOUSEHOLD')`.

**Consequences:**
  - `expenseAllocator(amount, source, owner, splitFranPercent)` is the single source of truth for which rows go where; reused by Add Expense (live preview) and `settlementsEngine.recomputeForTransaction` (write path).
  - `inferOwnerFromAllocations` and `inferSplitFranPercent` let recompute work on existing seeded/imported data without storing the inputs again.
  - The Phase 3 seed already used this model — no migration needed.
  - If we later need an explicit `economic_owner` column for query performance, we can derive it from allocations during a later migration without breaking the API.

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
