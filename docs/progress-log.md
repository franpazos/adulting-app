# Progress Log

Chronological record of substantive work on Adulting.app. Each entry: date, phase, what changed, decisions, follow-ups. Append at the top.

---

## 2026-05-08 — Phase 10 polish (charts, motion, a11y, code-splitting, README)

**What was done**

Closed Phase 10. Five sub-items, all landed.

- **Code-split routes** (`src/app/router.tsx`): every feature page wrapped in `React.lazy` + `Suspense`, except `HomePage` which stays eager (it's the landing page, lazy-loading it would only buy a loading flash). New `lazyNamed()` helper handles named-export modules so we don't need to default-export every page. Fallback is a discreet `LogoMark` pulse.
  - Bundle impact: main JS dropped from 896 kB → 802 kB (266 kB → 244 kB gzip). Per-route chunks land in 3–10 kB / 1–4 kB gzip range. The remaining bulk in main is sqlite-wasm + React + zustand + lucide; further wins would require lazy DB init, deferred.
- **Charts** on Home:
  - `src/components/charts/DonutChart.tsx`: pure SVG, declarative slices `{ id, percent, color }`, with `minPercent` threshold that merges tiny wedges into a neutral "Other" slice so the donut doesn't fragment visually. `centerLabel` slot via `<foreignObject>`.
  - `src/components/charts/CompareBar.tsx`: horizontal stacked bar for income vs expenses with a `transition-[width]` so values animate when the month/scope changes.
  - Wired into `HomePage`: donut next to the category list, CompareBar below the stats grid (only when there's at least one income or expense).
  - No charting dependency added — both components are <100 lines each.
- **Motion polish** (`src/index.css`):
  - Body and any `[data-theme-surface]` element transitions `bg-color`, `color`, `border-color` over 220 ms cubic-bezier on theme switch — light/dark/system flips no longer hard-cut.
  - `.tap-card` utility: `transform scale(0.985)` on `:active` for tappable cards (140 ms ease).
  - `.pop-in` keyframe (240 ms scale 0.94 → 1.02 → 1) applied to `SettlementChip` with a `key` prop tied to the consequence so the chip pulses every time source/owner/amount changes the result.
  - All three gated by `@media (prefers-reduced-motion: reduce)`.
- **Accessibility audit pass**:
  - `IconButton` now guarantees a 44 × 44 px tappable area regardless of visual size, via a transparent `::before { inset: 0; m-auto; h-11; w-11 }` pseudo-element. No layout impact, fixes Apple HIG / WCAG 2.5.5.
  - `BottomNav`: `+` button gets `focus-visible:ring-4` (more pronounced for the primary action), nav items get `focus-visible:ring-2` + `min-h-11` and rounded focus area.
  - `SegmentedControl` buttons get `focus-visible:ring-2` + `min-h-9`.
  - `AppShell` gets a "Skip to content" link — `sr-only` until focused, then becomes a fixed violet pill at top-left, hrefs to `#main-content` so keyboard users can bypass the nav.
- **README** rewritten end-to-end:
  - Replaces the placeholder structure that hadn't been updated since Phase 0.
  - Sections: at-a-glance feature list, agent reading order, dev commands, env vars, architecture in one screen + layering rules, **persistence strategy** (3-tier), **Google Sheets sync workflow** (how OAuth + bind + auto-sync interact), deploy guide (with Vercel + Google Cloud OAuth setup checklist), testing layout, contributing rules.
- **Build clean:** typecheck passes, 97/97 tests, production build green.

**Decisions**
- **Hand-rolled SVG charts over a library.** For two visualizations on one screen, importing recharts/visx (~80 kB) would have erased the code-splitting win. The donut + bar combined are <2 kB gzipped.
- **`HomePage` stays eager.** Code-splitting it would mean every cold start shows the fallback while the chunk fetches, just to avoid duplicating ~6 kB. Net negative UX.
- **44 px hit target via pseudo-element**, not visual resize. Several existing `IconButton` instances are deliberately compact (e.g. close-X in headers); blowing them up to 44 px would have rebroken the tight visual rhythm. The pseudo-element is the right escape hatch — invisible, doesn't affect layout, captures taps in the surrounding gutter.
- **Skip-link before nav**, not via `aria-skip-content` attribute. Standard accessible pattern, works in every screen reader, no extra dependencies.

**Open follow-ups**
- The bundle warning (`> 500 kB`) still fires on the main chunk. Future polish could lazy-load `@sqlite.org/sqlite-wasm` itself (defer DB init until after first paint) — but that would change the boot ordering meaningfully, so deferred.
- The `tap-card` utility is defined but not yet applied to any specific Card on screens — opportunistic adoption when feature work touches a tappable card.
- A formal Lighthouse / axe audit hasn't been run; the changes here are the obvious-wins pass. A future polish session could run an automated audit and patch whatever remains.

**Phase 10 closes the original execution plan.** Remaining work is opportunistic polish (Home dashboard expansion, Transactions filters/search, Add Expense smart defaults, Settings expansion, Accounts CRUD) — all listed in execution-plan.md as carryover, none blocking daily use.

---

## 2026-05-08 — Phase 9 finish (faster auto-sync, import-on-bind, manualOnly, month-sync scaffold)

**What was done**

Closed Phase 9b. Real-world testing surfaced two issues — auto-sync getting stranded after iOS suspended a debounce timer, and the risk that a fresh device would clobber the shared sheet by pushing seed-only state. Both fixed.

- **Auto-sync gates on the durable signal.** `useAutoSync` now reads `sync_queue` PENDING count instead of a transient in-memory ref:
  - **Boot sync** runs if there are any pending writes *or* if it's been ≥60s since `lastPushAt`. Survives reloads and iOS background suspension — a write that didn't push earlier always catches up on next app open.
  - **Visibility-change → visible** triggers a sync. Open the app, fresh data arrives — no 60s wait. Catches Sam's phone seeing your new transactions immediately when she unlocks her phone.
  - **Write debounce** also checks PENDING > 0 so spurious dbVersion bumps (e.g. from a pull bumping the version) don't fire a redundant sync.
  - **Online retry** uses the same PENDING check.
- **Pull failure aborts push.** Previously `syncAll` fell through to push even when pull failed, on the theory "better to upload local writes than lose them". With snapshot-replace push semantics, a stale local view would clobber any remote rows the other device pushed since our last successful pull. New policy: pull fails → skip push, surface error, retry next cycle. Pull returning zero rows is *not* a failure (covers the empty-sheet bootstrap case).
- **Import-from-Sheets on bind** (`src/features/sync/SyncCard.tsx::ConnectSheetBlock`):
  - After validating the sheet exists, the bind handler runs `pullAll` synchronously *before* calling `setSheet`.
  - Fresh device hydrates from the shared sheet first, so when auto-sync subsequently kicks in, the push reflects the merged state, not seed-only state.
  - Two-stage button label: `"Connecting…"` while validating, `"Importing data…"` while pulling.
  - On pull failure the binding does not persist — user sees the error and can retry.
- **`manualOnly` toggle** added to `ConnectedBlock` as a Toggle row. Reads/writes `syncStore.manualOnly` (already persisted, already honored by `useAutoSync`'s `canSync` gate). EN/ES copy added under `sync.manualOnly.{label,hint}`.
- **Month-sync service scaffold** (`src/lib/sync/month-sync.ts`):
  - `ensureMonthSheet(spreadsheetId, monthKey, opts)`: checks if a tab named per `formatTitle(monthKey)` exists; if not, duplicates a designated `templateTitle` tab via the new `duplicateSheet` Sheets API helper, or falls back to a blank `addSheet`.
  - Idempotent (returns `{ sheet, created: false, source: "existing" }` when the tab is already there).
  - Not yet wired into auto-sync — per spec §14.6, "scaffold the service with a clear interface and TODOs". The user's existing template format (Spanish vs English, formula structure, naming convention) is unknown to this codebase, so wiring is deferred until they nominate a template tab title via Settings.
- **`duplicateSheet`** added to `sheets-api.ts` as the underlying primitive (Google Sheets `duplicateSheet` batchUpdate request, returning the new tab's metadata).
- **Tests still 97/97 passing.** Build clean (no new test surface — the new code is mostly UI wiring + a Sheets-API-dependent service that's better validated in production than mocked).

**Decisions**
- **Pull-failure-aborts-push** is the right default for snapshot push. With incremental push (future ADR) the trade-off would flip — incremental upserts can safely run independently. Documented inline in `sync.ts`.
- **Import-on-bind, not on first auto-sync.** Doing it as part of the bind action makes the UX cause-and-effect clear ("I just connected, it imported existing data"), and prevents a subtle race where auto-sync could fire before the import completes. Cost: the bind call is now multi-second on a populated sheet. Acceptable.
- **`sync_queue` PENDING count is the durable "is anything unsynced?" signal.** It's already persisted via SQLite (and now via the IDB snapshot on Safari), so it survives reloads and OS-level suspension. The hook's previous `syncedVersionRef` was correctly described as the bug — a transient ref couldn't carry state across reloads.
- **Month-sync stays read-only of intent until the user nominates a template.** Auto-creating month tabs blindly would risk polluting the user's spreadsheet. The scaffold is callable from a future Settings UI; today nothing invokes it.

**Open follow-ups**
- Validate the snappier auto-sync in production: add an expense on phone A, lock phone, open phone B → expense should appear without manual "Sync now".
- Validate `manualOnly` toggle works end-to-end (turn on → no auto-sync; turn off → auto-sync resumes on next trigger).
- Validate import-on-bind by unlinking + re-binding the sheet on Sam's phone (should show "Importing data…" briefly, then connect).
- When the template format is nominated, add a Settings row "Monthly tab template: [dropdown of tab names]" + "Format: [YYYY-MM | custom]" and wire `ensureMonthSheet` into auto-sync's pre-push step.
- Consider a one-time "first sync done" marker so the SyncCard can show different copy on first connect vs subsequent syncs.

---

## 2026-05-08 — Safari iOS persistence via IndexedDB snapshot

**What was done**

iPhone Safari can't initialize OPFS SAH Pool on the main thread (the synchronous access handle API isn't exposed). The DB was silently falling back to `:memory:` and losing all data on reload. Verified on a real iPhone — Settings showed "in-memory", and the console reported "Missing required OPFS APIs".

Implemented Option B from the planning conversation: keep SQLite in-memory but persist a serialized snapshot to IndexedDB. See ADR-013 for the rationale.

- **`src/lib/db/persistence.ts`** — single-key, single-store IDB wrapper: `loadSnapshot()`, `saveSnapshot(bytes)`, `clearSnapshot()`, `isPersistenceAvailable()`. ~80 lines, no new deps. Uses raw IndexedDB.
- **`src/lib/db/client.ts`** — three-tier persistence strategy:
  1. OPFS SAH Pool (Chrome) — unchanged, fastest path.
  2. **In-memory + IDB snapshot** — new fallback. After OPFS fails, opens `:memory:`, attempts `loadSnapshot()`, calls `sqlite3_deserialize` to restore. Backend reported as `"memory-snapshot"`.
  3. In-memory (no persistence) — last-resort if IDB is also unavailable. Backend reported as `"memory"` with a warning.
- **Snapshot save lifecycle:**
  - `markDirty()` runs from every `exec()` / `execScript()`. Schedules a 500ms-debounced async save via `flushSnapshot()`.
  - In-flight saves coalesce: while one IDB put is running, additional dirty marks just keep `pendingSnapshot = true` and a follow-up save fires.
  - `pagehide` + `visibilitychange → hidden` both trigger `flushSnapshotBlocking()` — synchronous serialize + fire-and-forget IDB put. Handles Safari putting the page into bfcache.
  - `flushPendingSnapshot()` exported for explicit flush before destructive ops.
- **Auto-snapshot disabled in tests** (`import.meta.env.MODE === "test"`) so happy-dom's IDB doesn't carry rows between test files. Tests exercise the primitives directly via `_internal.serializeCurrent` / `_internal.deserializeIntoCurrent`.
- **Backend enum** gained a third state: `"opfs-sahpool" | "memory-snapshot" | "memory"`. Updated `dbStore.ts`, `SettingsPage.tsx`, and i18n (EN/ES) — both `opfs-sahpool` and `memory-snapshot` show a positive (green) pill since both are durable.
- **Tests (2 new in `snapshot.test.ts`, total 97/97):**
  - Serialize a populated DB → reset → fresh init → deserialize bytes → row counts and values match exactly.
  - Idempotent: deserialize → serialize → deserialize gives the same DB.
- **Build clean:** typecheck passes, `pnpm build` produces a 2 MB precache bundle as before.

**Decisions**
- See ADR-013 for the snapshot-vs-worker tradeoff. Short version: 138 query call sites would have to become async to use a worker; the snapshot path is ~150 lines and zero call-site changes.
- Why `sqlite3_js_db_export` + `sqlite3_deserialize` instead of `VACUUM INTO`: the export API returns a Uint8Array directly (no temp file shuffle), and deserialize replaces the in-memory DB's "main" schema atomically. Faster and simpler for our case.
- Why a single key (not chunked): typical dataset is well under 1 MB. IDB has no problem with a sub-MB blob in one entry. If we ever cross ~10 MB, we'd switch to chunked or the worker promiser path.
- Why debounce 500ms: covers the burst of writes in `Add Expense` (insert tx + N allocation rows + recompute settlement_ledger entry, all in the same tick) without making the user wait. Visibility flushes catch anything still pending if they leave the page early.

**How to validate on iPhone**
1. Hard refresh the deployed PWA (or kill + reopen from home screen).
2. Settings → "Local database" pill should now read "in-memory + snapshot" (positive/green tone), not "in-memory (no persistence)" (warning/amber).
3. Add a test transaction.
4. Force-quit Safari (swipe up the app card) → reopen.
5. Transaction should still be there.

**Open follow-ups**
- The snapshot is opaque (raw SQLite file bytes). If a future debugging need arises, we can add a "Download snapshot" button in Settings for offline inspection.
- Sam's phone, on its first install, will start empty and snapshot from there. The Sheets pull will populate it on first sync. We may still want an explicit "import from Sheets" flow for that bootstrap (already in the 9b carryover list).
- Consider exposing `flushPendingSnapshot()` before the user explicitly logs out / disconnects sync so the latest writes are durable before a potentially destructive operation.

---

## 2026-05-08 — Phase 9b Google Sheets sync (pull + auto-sync)

**What was done**

Closed the pull half of Sheets sync. Two devices can now alternate pushes safely: the next sync pulls remote changes first, reconciles by `updated_at`, then pushes the merged state.

- **Readers** (`src/lib/sync/readers.ts`): `parseUser`, `parseAccount`, `parseCategory`, `parseTransaction`, `parseAllocation`, `parseRecurring`, `parseDebt`, `parseDebtPayment`, `parseSettlement`. Each is the inverse of the corresponding `writers.ts` mapper. Defensive coercion (`str/num/bool`) handles Sheets' string-vs-number ambiguity and our 0/1 boolean encoding. Required-field readers throw with the field name; the pull worker treats those throws as "skip this row" and logs a warning.
- **Pull worker** (`src/lib/sync/pull.ts`):
  - `pullAll(spreadsheetId)` reads `A2:<lastCol>` for each `raw_*` tab in parallel, then runs all upserts in one `transaction()` for atomicity.
  - Reconciliation = **last-writer-wins by `updated_at`**: insert if id absent locally, update if `remote.updated_at > local.updated_at`, skip otherwise. Counted into `PullReport.{inserted,updated,skipped}` per tab.
  - Direct `exec` writes (separate `insert*`/`update*` per entity) **bypass `enqueueChange`** so synced rows don't re-enter the queue and bounce back on the next push.
  - Remote `is_deleted = 1` propagates as a soft-delete locally on the next pull.
  - Rows existing locally but **not** remotely are left alone — they're brand-new local writes pending push.
  - `_internal` exports `loadLocalAges`, `applyTab`, `insertUser`, `updateUser`, `insertTransaction`, `updateTransaction` for tests.
- **`syncAll`** (`src/lib/sync/sync.ts`): pull → push. If pull throws, push still runs (better to upload pending local writes than silently lose them); the report carries both errors so the UI can surface them. `SyncCard` now invokes `syncAll` (not bare `pushAll`) and bumps `dbVersion` when pull pulled in any new/updated row.
- **Auto-sync hook** (`src/lib/sync/useAutoSync.ts`, mounted in `AppShell`):
  - Boot sync once per app load when ≥60s have elapsed since `lastPushAt`.
  - Debounced 3s sync on every `dbVersion` bump (so a burst of edits coalesces into one round trip).
  - Retry sync when the browser comes back online and `dbVersion > syncedVersion`.
  - Skips silently when DB isn't ready, offline, no valid token, no sheet bound, `manualOnly` is set, or a sync is already in flight (guarded by `inFlightRef` + `phase` check).
- **Sync badge in AppHeader** (`SyncBadge`): violet "Syncing…" pill with spinner during pulling/pushing, 2-second positive "Synced" confirmation after success, expense-tone "Sync error" pill on failure. Hidden in steady state and when no sheet is bound.
- **i18n**: added `sync.badge.{syncing,synced,error}` plus `sync.{syncNow,syncing,pulling,syncError}` in EN + ES.
- **Type fixes**: `pull.ts` reconcilers now accept `SheetRow[]` (was `unknown[][]`) so they line up with `parseX(row: SheetRow)`. `SyncCard.tsx` now defines `sumValues` locally (was implicitly imported from nowhere).
- **`syncStore`** gained a `manualOnly` flag (persisted) for users who want to opt out of auto-sync. Not wired to UI yet — surface in Settings later if needed.
- **Tests (10 new in `pull.test.ts`, total 95/95):**
  - Writer → reader round-trip preserves every entity, including FX null columns.
  - Boolean round-trip (`is_active` true → `1` → `true`).
  - FX columns survive when present (`exchange_rate`, `amount_in_account_currency`, `amount_in_debt_currency`).
  - Reader rejects rows missing the primary key.
  - `applyTab`: inserts brand-new remote tx, updates when remote is newer, skips when local is newer (last-writer-wins), propagates remote soft-deletes.
  - Malformed rows are skipped without aborting the run.
  - `loadLocalAges` size matches local row count.

**Decisions**
- **Last-writer-wins by `updated_at`** (no per-field merge, no vector clocks). For a two-user app with distinct edit cadences this is correct >99% of the time; the rare conflict case (two devices editing the same row within 3s + offline + simultaneous push) can be addressed later with an explicit conflict UI when pulled-row `updated_at == local.updated_at` but contents differ.
- **Pull bypasses the sync queue.** The queue's job is to track *local-origin* changes that need to push. Sync-derived writes shouldn't enter it — otherwise every pull would trigger a redundant push of the rows we just received.
- **Pull-then-push order** (not push-then-pull). Push first risks overwriting newer remote rows we haven't seen yet; pull first ensures local edits with later `updated_at` survive into the merged state pushed back.
- **Auto-sync on `dbVersion` bump, not on individual repo events.** `dbVersion` is already bumped after every meaningful write, so debouncing on it gives us "after-write sync" for free without instrumenting every repo.
- **Boot sync gated to ≥60s gap** so a fast page reload doesn't burn an extra round trip.

**Open follow-ups**
- **Month-sync service** for the formatted monthly tabs (spec §14.6) — Phase 9b's only remaining must-have.
- **Explicit "import from Sheets"** flow for first-device bootstrap (pull-only, no push, with a confirm step since it would clobber the freshly-seeded local rows on a clean install).
- **Conflict UI**: when remote and local both edited within the same `updated_at` second (pathological but possible), surface a chooser. Currently the pull silently wins.
- **`manualOnly` toggle** in Settings → SyncCard. Stub exists in `syncStore` and is honored by `useAutoSync`; just needs the UI control.
- The "pending changes" counter in `SyncCard` will go to zero on the first successful auto-sync after boot. If the seed-pollution count on a fresh install is jarring, short-circuit `enqueueChange` during the seed.

---

## 2026-05-04 — Phase 9a Google Sheets sync (push)

**What was done**

Push half of the Google Sheets sync. The app can now connect to a Google account and push a complete snapshot of the local SQLite into raw_* tabs of a user-specified spreadsheet. Pull + auto-sync land in 9b.

- **OAuth via Google Identity Services** (`src/lib/google/auth.ts`):
  - Loads `https://accounts.google.com/gsi/client` async from `index.html`.
  - `waitForGis()` polls until `window.google.accounts` is ready before any auth attempt.
  - `login()` opens the GIS token client popup, captures the access token and expiry, stores them in `authStore`, and opportunistically fetches the user's email via OIDC userinfo for display.
  - `getValidToken()` re-prompts when the cached token has <60s of life left.
  - `logout()` revokes the token and clears local state. Best-effort — clears locally even if revoke fails.
  - `GoogleAuthError` for typed error handling at call sites.
- **Stores:**
  - `authStore` (persisted): status / token / email / error.
  - `syncStore` (persisted): `sheet` binding (id + title), phase, lastPushAt, lastError, pendingChanges.
- **Sheets API client** (`src/lib/google/sheets-api.ts`): `getSpreadsheet`, `addSheet`, `getValues`, `updateValues`, `clearValues`. Authorized fetch wrapper handles token refresh + JSON error reporting via `SheetsApiError`.
- **Drive helpers** (`src/lib/google/drive-api.ts`): `parseSpreadsheetId` accepts either a full Sheets URL or a raw ID.
- **Tab management** (`src/lib/sync/tabs.ts`):
  - `RAW_TABS` declares 9 tabs with canonical column order: `raw_users`, `raw_accounts`, `raw_categories`, `raw_transactions`, `raw_transaction_allocations`, `raw_recurring_items`, `raw_debts`, `raw_debt_payments`, `raw_settlement_ledger`.
  - `ensureRawTabs(spreadsheetId)` adds missing tabs (no-op if present), then writes the canonical header row to row 1 of each. **Never touches non-raw tabs** — your existing monthly tabs and formulas stay untouched.
  - `columnLetter(n)` for the spreadsheet column math (1→A, 27→AA, etc).
- **Row mappers** (`src/lib/sync/writers.ts`): pure functions per entity emitting `(string|number|boolean|null)[]` cells in header order. Booleans coerce to 0/1 to match SQLite. `buildSnapshot()` reads all rows from local DB (including soft-deleted) and returns the full snapshot.
- **Sync queue** (`src/lib/sync/queue.ts`): `enqueueChange(entity, id, action)`, `listPending`, `markAllSynced(ids)`, `markFailed(id, error)`. Repositories call `enqueueChange` on every create/update/delete (including `transactionsRepo.softDelete`, `debtsRepo.adjustBalance`, etc.).
- **Push worker** (`src/lib/sync/push.ts`): `pushAll(spreadsheetId)` calls `ensureRawTabs`, builds the snapshot, then for each tab clears row 2+ and writes the new rows. Captures pending queue ids before pushing so anything enqueued mid-push survives. Marks captured ids as SYNCED on success.
- **`SyncCard` UI** (`src/features/sync/SyncCard.tsx`) in Settings:
  - State 1 (no Google token): "Connect with Google" button → triggers `login()`.
  - State 2 (token but no sheet): paste-URL input. Validates by fetching `getSpreadsheet(id)`; rejects with friendly error if sheet doesn't exist or user lacks access.
  - State 3 (fully connected): account email, sheet title (linked), last push relative-time, pending changes counter, "Push now" button (with phase-aware spinner/icon), unlink + disconnect actions.
- **COOP relaxed** to `same-origin-allow-popups` (vercel.json + vite.config dev server) so the GIS popup retains `window.opener`. `Cross-Origin-Embedder-Policy: require-corp` stays — OPFS continues to work.
- **Configuration:**
  - `index.html` loads the GIS script.
  - `.env.example` documents `VITE_GOOGLE_CLIENT_ID`. Set it in `.env.local` for dev and in Vercel Project Settings → Environment Variables for production.
  - `src/lib/google/types.d.ts` declares the minimal `window.google.accounts` types we use.
- **i18n** (EN + ES): full `sync.*` namespace covering connect/disconnect, intro copy, paste-URL flow, push status, error messages, "not configured" state.
- **Tests (85/85 passing — 9 files):** `src/lib/sync/__tests__/sync.test.ts` adds 11 cases covering RAW_TABS shape, column letter math, every row mapper's column count vs its tab header count, boolean coercion, snapshot inclusion of soft-deleted rows, queue lifecycle (enqueue → listPending → markAllSynced → markFailed bumps attempt_count).

**Decisions**
- ADR-012 documents the snapshot-vs-incremental tradeoff: 9a uses snapshot for correctness simplicity; 9b can switch to incremental without changing repo code (queue is already populated).
- `same-origin-allow-popups` is the right COOP value for OAuth-via-popup. It still isolates us from arbitrary cross-origin iframes; OPFS sync access handles continue to work.
- Sheet binding stored in `syncStore` (localStorage) so it survives reloads but is per-device. Each device chooses (or pastes) its own sheet — both should pick the same one.
- Repos enqueue **inside** their existing DB transaction so a write + its queue entry are atomic. If the write rolls back, the queue entry rolls back too.

**Open follow-ups**
- **Phase 9b — pull + reconcile.** Without pull, two devices pushing in alternation overwrite each other. Pull-then-push on every "Sync now" + auto-sync on boot will fix it.
- The "pending changes" counter shows post-seed inflation (~50 items) until the first successful push because the seed enqueues every row. Phase 9b can short-circuit enqueue during seed if desired, or just let the first push absorb the seed.
- Auto-push on save (debounced ~3s) is deferred to 9b along with pull.
- The user must add `VITE_GOOGLE_CLIENT_ID` to Vercel env vars after creating the OAuth client. Without it the SyncCard shows "not configured" copy and the rest of the app works as before.

---

## 2026-05-04 — Vercel deploy preparation

**What was done**
- Added `vercel.json` with the three things the app needs in production:
  1. **COOP/COEP headers** on `/(.*)` — without these, sqlite-wasm OPFS silently degrades to in-memory and data evaporates on reload (ADR-008).
  2. **Cache headers**: `/sw.js`, `/workbox-*.js`, and `/index.html` get `max-age=0, must-revalidate` so update prompts surface promptly; `/assets/*` and `/fonts/*` get `max-age=31536000, immutable` since Vite emits hashed filenames.
  3. **SPA fallback** rewrite `/(.*) → /index.html`. Vercel checks for real files first, so `/assets/foo.js` is served as-is and only client-only paths like `/transactions/abc` fall through.
- `framework: "vite"` declared explicitly so Vercel auto-detects the right buildCommand and outputDirectory.
- `installCommand: pnpm install --frozen-lockfile` enforces the lockfile in CI deploys.
- Added `.vercel` to `.gitignore` so local CLI state doesn't land in commits.
- New `docs/deployment.md` covering: what each `vercel.json` rule does, first-time CLI deploy, GitHub continuous deploy, header verification with `curl -I`, iPhone install steps, troubleshooting (OPFS not persisting, SW 404, stale versions).
- README updated to point at the deploy guide.

**Decisions**
- **Phase 9 OAuth caveat noted in deployment.md**: `COOP=same-origin` blocks `window.opener` access from popup callbacks. When Phase 9 lands, switch to OAuth via redirect or relax COOP to `same-origin-allow-popups`.

**Open follow-ups**
- Run `pnpm dlx vercel` to actually deploy and verify the headers in the wild.
- After install on iPhone, validate that OPFS persists across reloads in Safari iOS (Phase 8 verified Chrome desktop).

---

## 2026-05-04 — Phase 8 PWA + offline UX

**What was done**
- **Service worker registration:**
  - `src/lib/pwa/registerSW.ts` wraps `virtual:pwa-register` from `vite-plugin-pwa`. Idempotent. Bridges Workbox events into Zustand:
    - `onOfflineReady` → `networkStore.setOfflineReady(true)`
    - `onNeedRefresh` → `networkStore.setNeedRefresh(true, applyFn)` so the UI can apply the update on tap
  - Called once at app boot in `main.tsx`, before React mounts.
  - `vite-plugin-pwa` now uses `registerType: "prompt"` (we surface updates manually) and `injectRegister: false` (we register manually so the wiring is testable).
- **Online/offline detection:**
  - `networkStore` reads `navigator.onLine` initially and listens for `online`/`offline` events via `startNetworkWatcher`.
  - `NetworkBadge` (`src/components/NetworkBadge.tsx`) — small amber pill in `AppHeader` when offline. Hidden when online.
- **Install prompt:**
  - `installPrompt.ts` captures `beforeinstallprompt` (Chrome/Edge), `appinstalled`, and detects `display-mode: standalone`. State lives in a tiny dedicated `installStore` so the banner survives re-renders.
  - `InstallPrompt` banner (`src/components/InstallPrompt.tsx`) appears above the bottom nav when the browser fires the event. Tapping "Install" runs `event.prompt()`. Dismissal persists in localStorage (`adulting.installDismissed = "1"`).
  - **iOS Safari fallback:** since iOS doesn't fire `beforeinstallprompt`, we detect iOS Safari via UA + WebKit heuristic and show an instructional copy with the share icon ("Share → Add to Home Screen").
- **Update prompt:**
  - `UpdatePrompt` banner (`src/components/UpdatePrompt.tsx`) — appears at the top of `AppShell` with safe-area padding when a new SW is waiting. "Refresh" calls `applyUpdate()` (which runs `updateSW(true)` → reload).
- **Manifest hardening:**
  - Added scope, lang, categories.
  - Maskable icon variant (Android adaptive icons crop the SVG; `purpose: "maskable"` tells the OS this asset has safe padding).
  - `apple-touch-icon` link in `index.html` so iOS pulls our coin SVG when adding to home screen.
  - `apple-mobile-web-app-title` set to "Adulting" (otherwise iOS shows the full title).
- **Workbox caching:**
  - Precache covers `js/css/html/svg/woff2/wasm` so the sqlite-wasm bundle is offline-first.
  - Runtime caching adds dedicated CacheFirst stores for fonts and `.wasm` (1y).
- **Build hygiene:**
  - Installed `workbox-window` (peer needed by `virtual:pwa-register`).
  - pnpm override `lru-cache@>=11 → ^10` because Node 18.16.1 lacks the `tracingChannel` API that `lru-cache@11`'s commonjs build calls during workbox post-build glob scanning. Babel still uses its own older lru-cache pin, so the selector targets only v11+.
- **Verification:** `pnpm build` produces `dist/sw.js` (15 entries, ~2 MB precache including the wasm), `manifest.webmanifest` is valid, `pnpm preview` serves the SW + manifest at HTTP 200. 74/74 tests still pass.

**Decisions**
- **Manual SW registration** (not auto via the plugin's `injectRegister`) so the registration timing is explicit and the wiring into our state store is testable. The cost is one extra import in `main.tsx`.
- **`registerType: "prompt"`** rather than `autoUpdate` so users see "new version available" and choose when to refresh. For a personal-use app this prevents data-mid-flow weirdness when Workbox swaps controllers silently.
- **iOS Safari instructional fallback** rather than a blocking modal — iOS users can dismiss the hint and use the app in Safari indefinitely; PWA install is a nicety, not a gate.

**Open follow-ups**
- The `offlineReady` flag in `networkStore` is captured but not yet displayed. We could add a one-time toast on first install ("Now works offline") in a Phase 8b polish pass.
- Bundle size warning: the main JS is 858 kB (256 kB gzip). Phase 10 polish should code-split routes via `React.lazy`.

---

## 2026-05-04 — Phase 7 Debts FX, Settle up, Categories, Accounts

**What was done**
- **Debts list** (`DebtsPage`): redesigned from the simple list to a real screen — totals card grouped by currency (EUR + USD shown separately), rows with avatar + currency pill + minimum payment + chevron. Tap → detail.
- **Debt detail** (`DebtDetailPage` at `/debts/:id`): hero with avatar, current balance + progress bar (paid / original × 100), minimum payment + due day metadata, payment history list (with FX rate + EUR impact when applicable), sticky "Pay debt" CTA.
- **Pay Debt with FX** (`PayDebtPage` at `/debts/:id/pay`):
  - Big amount input in debt currency with $/£/€ prefix.
  - **FX exchange card** (only visible when debt currency ≠ EUR): "You pay $X" ↔ "EUR impact €Y", an editable rate (`debt-units per 1 EUR`), and the new balance preview. Both sides are editable — typing in EUR back-computes the debt amount via `fromAccountToDebt` and vice versa via `fromDebtToAccount`.
  - Preset chips ($50/$100/$250/$500 for FX, €25/€50/€100/€200 same-currency).
  - FX caveat banner reminding the user the bank rate may differ.
  - Save flow: `expenseAllocator(amount=eurAmount, source, owner=debt.owner_type)` → `transactionsRepo.create(type='DEBT_PAYMENT', exchange_rate, amount_in_*)` → `debtPaymentsRepo.create` → `debtsRepo.adjustBalance(-debtAmount)` → `recomputeForTransaction`.
- **Settle up** (`SettleUpPage` at `/settlements/settle?from=&to=`):
  - Pre-fills the outstanding balance for the (`from`, `to`) pair.
  - Partial amounts: "X € will remain after this payment" hint when amount < outstanding.
  - Save flow: writes a `SETTLEMENT_PAYMENT` tx (cash flows from→to, allocation 100% to creditor) plus a reverse-direction `settlement_ledger` entry (`from=to`, `to=from`) that cancels the original debt direction. Since `recomputeForTransaction` only manages EXPENSE/DEBT_PAYMENT-derived entries, the manual reverse entry is preserved.
- **"Settle up" CTA** added to every `BalanceCard` on `/settlements`. Single-tap → navigates with `?from&to` query params.
- **Categories CRUD**:
  - `CategoriesPage` lists Expense and Income groups separately, tap row → edit.
  - `CategoryFormPage` covers create + edit with kind segmented and a 12-color palette picker (uses ring-2 for active state). Inline `updateCategoryInline` helper avoids broadening the repo for a single call site.
- **Accounts read-only** (`AccountsPage`):
  - Per-account card with avatar (inferred from account name for now), type/currency pills, and computed estimated balance.
  - Totals card grouped by currency. Estimated balance = `initial_balance + Σ INCOME − Σ (EXPENSE | DEBT_PAYMENT | SETTLEMENT_PAYMENT | TRANSFER)`.
- **Repos extended:**
  - `debtsRepo.adjustBalance(id, delta)` (rounded to 2dp) and `debtsRepo.update`.
- **Bug fix discovered by tests:** `recomputeForTransaction` previously short-circuited unless `tx.type === 'EXPENSE'`. Debt payments from joint accounts (Sam pays a personal-owned debt from JOINT) need to trigger the same Case-D settlement (Sam owes Household). Updated to process both `EXPENSE` and `DEBT_PAYMENT`. SETTLEMENT_PAYMENT remains skipped because its ledger entry is written manually by SettleUpPage.
- **Routes wired:** `/debts/:id`, `/debts/:id/pay`, `/settlements/settle`, `/categories`, `/categories/new`, `/categories/:id`, `/accounts`. The `ComingSoon` stubs for these are gone.
- **i18n** (EN + ES) namespaces extended with `debts.*` (totalOutstanding, summary plural, currentBalance, paid, minimumPayment, dueDay, history, payCta, etc.), `payDebt.*` (exchange, youPay, eurImpact, rate, fxCaveat, saveLabel), `settleUp.*` (cta, outstanding, partial, saveLabel), `categories.*` (kind segmented + fields), `accounts.*` (totals, estimatedBalance, balanceNote).
- **Tests (74/74 passing — 8 files):** new `payDebt.flow.test.ts` covers
  - USD debt paid from EUR account with rate 1.08 (balance decrements by USD amount, account debited by EUR amount, debt_payments row carries both)
  - Joint-source debt payment for a personal debt → Sam owes Household 25 (the bug-fix scenario)
  - Settle-up zeroing Fran↔Sam balance
  - Partial settle-up reducing 20 → 12
  - `adjustBalance` rounds to 2dp

**Decisions**
- For the FX flow, store the exchange rate as **debt-units per 1 EUR** (e.g. `1.08` for "1 € = $1.08"). This matches the design handoff visual ("1 € = $1.0825") and lets the user reason about "for every euro I spend, how many of the debt currency does it cover?" `fx.ts` was already aligned with this convention.
- Settlement payments are recorded as a **separate ledger entry** (not via the allocator) because their semantic is the inverse: cash flows from debtor to creditor, and the goal is to cancel an existing balance, not to allocate spending. Keeping them out of `recomputeForTransaction` avoids the engine re-deriving them away.
- Account avatars are inferred from the account name (`includes("fran")`, `includes("sam")`) for now. When the Accounts CRUD lands (Phase 7b or later), each account will store an explicit `owner` field for UI purposes.

**Open follow-ups**
- Phase 8 (next): PWA install prompt, online/offline badge, sync queue UI, service worker validation. The DB layer is already offline-first; this phase wraps the install + UX polish.
- Phase 7b (deferred polish): Home dashboard expansion (Joint snapshot card, donut chart, multiple summary cards), filters + search on Transactions, smart defaults from last entry, Settings expansion (Defaults / Backups / About), Accounts CRUD.

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
