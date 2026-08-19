# Progress Log

Chronological record of substantive work on Adulting.app. Each entry: date, phase, what changed, decisions, follow-ups. Append at the top.

---

## 2026-08-19 — Version 0.7.8: May-2026 month floor + stop seeding demo data in the real app

Bug from Sam's suggestion box (tagged Bug + S.O.S., Jun 21): "each month should be an individual sheet, and that data persists" + "months before May should not exist." Analysis with Fran resolved it into two parts.

**Part A — "each month = an individual sheet" → declined as a misread of what the Sheet is.** The Google Sheet is a raw sync/backup mirror of SQLite (ADR: SQLite is source of truth, Sheets is a sync target, not a database), writing flat `raw_*` entity tabs with month as a column. The per-month "sheet" Sam pictures is a different spreadsheet concept; the per-month view lives in the app. No work — the `ensureMonthSheet` scaffold stays dormant. (Worth a one-line explanation to Sam about what the Sheet is for.)

**Part B — "months before May should not exist" → fixed at the root + floored the UI.** Root cause: nothing defined a start month — the month selector was unbounded (walk back to any month), the demo seed floats with `new Date()`, and seeded recurring items were anchored at `2025-01-01`.

- **Month floor.** New `APP_START_MONTH = "2026-05"` in `src/lib/date/month.ts`, plus `clampMonthKey` (never precedes the floor) and `isAtStartMonth` (for disabling the prev arrow). String compare is chronological since keys are `YYYY-MM`.
  - `MonthSelector` disables + dims the "previous month" arrow at the floor and guards its onClick.
  - `uiStore.setMonthKey` clamps every write (covers arrows, the post-save jump to a back-dated tx's month, etc.); the initial value clamps; and a persist `merge` clamps on rehydrate so a value stored before the floor existed can't boot us into a pre-May month.
- **Stop injecting demo data into real installs.** `seedIfEmpty(includeDemoData = true)` now splits structural scaffolding (users/accounts/categories — always) from demo content (recurring/debts/transactions/settlements — only when `includeDemoData`). `AppBoot` calls `seedIfEmpty(false)`, so a genuine fresh install / cleared DB starts clean. Tests keep the default `true`, so the Case A–E fixtures are untouched (zero test changes needed).
- **Recurring `start_date`** in the seed fixed `2025-01-01` → `2026-05-01` (only reachable via demo seed now, but correct regardless).

**Scope note (important for Fran/Sam).** The seed change only affects *fresh* installs — their current devices already seeded long ago, so this does not delete any data they already have. The **floor** is what fixes their live experience: pre-May months become unreachable immediately. If real phantom rows exist in a pre-May month on a device, the floor hides them but does not purge them; purging would need a separate in-app cleanup or a manual DB action (their SQLite lives in the browser, not reachable from here).

**Tests.** New `src/lib/date/__tests__/month.test.ts` (6): clamp below/at/after floor, `isAtStartMonth` boundaries, shift-then-clamp safety net. Suite 248 → **254 green**. typecheck + build clean; touched files lint clean.

**Files touched**: `src/lib/date/month.ts`, `src/lib/date/__tests__/month.test.ts` (new), `src/store/uiStore.ts`, `src/components/MonthSelector.tsx`, `src/lib/db/seed.ts`, `src/app/AppBoot.tsx`, `package.json`.

---

## 2026-08-19 — Version 0.7.7: Prominent date on rows + cross-month date-range filter

Follow-up to 0.7.6, same day. Two refinements Fran asked for on the Transactions list.

**1. Date given more weight on each row (`TransactionRow.tsx`).** The 0.7.6 date was muted `text-xs text-text-secondary`, visually equal to the category. Fran wanted it more of a protagonist. Chosen treatment (from a previewed A/B/C choice): **inline, same position, but `font-semibold text-text-primary`**, followed by a muted "·" separator before the category. Row secondary line now reads "**30 jun** · 🟢 Comida". No layout/height change; just visual hierarchy.

**2. Cross-month date-range filter in the advanced panel (`TransactionsPage.tsx` + repo).** Decision (asked explicitly): the range is **free / spans months**, overriding the header month selector while active — not confined to the visible month.

- New repo query `transactionsRepo.listByDateRange(from, to)` — inclusive `YYYY-MM-DD` bounds, either optional (open-ended), ignores `month_key`, same `date DESC, created_at DESC` ordering as `listByMonth`.
- `FilterState` gains `dateFrom` / `dateTo` (null = open). The page's `allTxs` memo switches data source: if either bound is set → `listByDateRange` (swapped bounds normalized so from > to still works), else `listByMonth(monthKey)`.
- Filter panel gets a "Date range" row with two native `<input type="date">` (From / To). Native pickers theme correctly because `ThemeProvider` already sets `root.style.colorScheme`. A note explains it ignores the month above, plus an inline "Clear range".
- When a range is active, a violet banner appears above the filter panel ("Range: 5 ene 2026 – 20 feb 2026") with a clear button — so the overridden month selector isn't confusing.
- Range counts as an active filter (`countActiveFilters`), so the filter badge + "Clear" reflect it.
- **Empty-state trap fixed:** the full-screen "nothing here yet" short-circuit now only fires when `allTxs.length === 0 && !hasFilters`. Previously a date range that returned nothing would short-circuit *before* rendering the controls, stranding the user with no way to edit/clear the range.

**Tests.** New `src/lib/db/repositories/__tests__/listByDateRange.test.ts` (5): cross-month inclusive window, open lower bound, open upper bound, newest-first ordering, soft-deleted excluded. Suite 243 → **248 green**.

**Verification.** typecheck clean, build clean, 248/248 tests. Touched files lint clean (0 errors; the two `dbVersion` exhaustive-deps warnings are the pre-existing intentional bump-version pattern).

**Files touched**: `src/features/transactions/TransactionRow.tsx`, `src/features/transactions/TransactionsPage.tsx`, `src/lib/db/repositories/transactions.ts`, `src/lib/db/repositories/__tests__/listByDateRange.test.ts` (new), `src/lib/i18n/en.json`, `src/lib/i18n/es.json`, `package.json`.

---

## 2026-08-19 — Version 0.7.6: Transactions list — date on rows + sort control, and description moved up

Three suggestions Sam left in the in-app suggestion box, all touching the Transactions list and the Add/Edit form. Fran green-lit all three.

**1. Date shown on each row (`TransactionRow.tsx`).** Rows previously showed avatar / title / category / pills / amount but never the transaction date, even though the list is month-scoped. Added a localized short date ("30 jun") as the first item on the secondary line, next to the category. Uses `i18n.language` via a new `useTranslation()` in the row.

**2. Sort control on `/transactions` (`TransactionsPage.tsx`).** The list was hard-sorted in SQL (`date DESC, created_at DESC`) with no UI control. Added a compact pill `<select>` (`SortSelect`) next to the count line with four orders:
- `ADDED` — `created_at DESC`, **the new default** (per Sam: "most recently added on top").
- `DATE_DESC` — date newest first, tie-broken by `created_at`.
- `DATE_ASC` — date oldest first.
- `TITLE` — by `description || merchant`, case-insensitive; untitled rows sink to the bottom.

Sorting happens client-side in a `sortTxs` memo over the already-filtered list (`listByMonth` still returns the SQL order; the client sort overrides it). The `date`/`created_at` string compares are safe because both are ISO/`YYYY-MM-DD`. Also removed a stray `console.log` (and the now-unused `lang`/`i18n` destructure) that had been left in the page.

**3. Description moved directly below the amount (`TransactionForm.tsx`).** Sam wanted the "what was this about" text input near the top. The winning "Variation B" leads with the big amount as the hero, so rather than push description *above* the amount (Sam's literal ask) we took the middle ground Fran chose: description now sits in its own section **immediately below the amount card**, before Source/Owner/Split/Category — instead of dead last. Amount keeps `autoFocus`, so the hero moment is preserved.

**i18n.** New `transactions.sort.*` keys in both `en.json` and `es.json` (label + 4 option labels).

**Verification.** `pnpm typecheck` clean, `pnpm build` clean, 243/243 tests green. The files touched lint clean (0 errors); pre-existing lint errors elsewhere (`rates.test.ts` `_url`, `useAutoSync.ts` `_reason`) were left as-is — out of scope and only staged files gate the pre-commit hook.

**Files touched**: `src/features/transactions/TransactionRow.tsx`, `src/features/transactions/TransactionsPage.tsx`, `src/features/add-expense/TransactionForm.tsx`, `src/lib/i18n/en.json`, `src/lib/i18n/es.json`, `package.json`.

**Follow-up not done**: `git remote` (`origin/main`) returns "Repository not found" — the GitHub remote is unreachable, so this work is only on local disk. Worth reconnecting the remote before it accumulates.

---

## 2026-07-01 — Version 0.7.5: Refresh FX rate from the pay-debt screen

For USD debts (the family loan) Fran had to leave the PayDebt screen, look up the EUR/USD rate on Google or the bank app, come back and type it in. The `1.08` placeholder was hard-coded since 0.4.x and rarely correct.

0.7.5 adds an **"🔄 Update"** button inline with the `RATE (DEBT PER 1 EUR)` label. Tap → fetch live rate → fill the input. The user can still override manually afterwards.

**Provider strategy.** Primary: [frankfurter.app](https://www.frankfurter.app/) (ECB-backed, no API key, no aggressive rate-limiting). Fallback: [open.er-api.com](https://open.er-api.com/) (broader currency coverage, no key). Sequential — the secondary only runs when the primary actually fails, never duplicated on success. Both are no-cookie public endpoints; we never send any user identity.

Returns the rate as "units of <currency> per 1 EUR" so it slots directly into the existing FX form. Lives in `src/lib/fx/rates.ts` next to the pure FX math (`lib/calculations/fx.ts`).

**Button states.**
- `idle` — `🔄 Update` in violet, `bg-violet/10` background.
- `loading` — icon spins (`animate-spin`), button disabled, opacity 70%.
- `error` — swaps to `bg-warning/15 text-warning-ink` with `Sin conexión` / `Offline` for 2.5s, then auto-reverts. Rate input stays unchanged — a failed refresh never wipes the user's typed value.

**UI iteration story worth capturing.** The first attempt kept the existing `🔄 1 € = $1,0800` pill as a big centered button — either above or below the YOU PAY / EUR IMPACT amounts. Both variants felt off on real phones: the pill duplicated info that already lives in the `RATE` input below (`1 € = $X` vs `1,08`), and its heavyweight visual made the amounts row cramped. Solution was to separate **information** from **action**: the rate value lives only in the input; the refresh is a small button next to the input's label. Single source of truth, no visual competition.

**Layout fix (side effect of the iteration).** The old `flex items-end gap-3` for YOU PAY / pill / EUR IMPACT collapsed when either amount got wide — the pill got crushed and amounts overlapped. Even after switching to `grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]`, the middle-pill design failed on narrow phones (visible in Fran's real device: `0,00 U...` truncation, EUR IMPACT column showing empty). Final layout: `grid-cols-2` for the amounts, and the refresh button relocated to the rate row.

**Tests** — 7 new in `src/lib/fx/__tests__/rates.test.ts`:
- EUR returns 1 immediately without touching the network.
- Frankfurter happy path with no secondary call.
- Fallback kicks in on network error from the primary.
- Fallback kicks in on non-OK HTTP status from the primary.
- Both providers failing returns `ok: false` (no infinite retry).
- No duplication of the primary on success.
- Currency code uppercased before lookup (`gbp` → `GBP`).

**Side fix — timezone bug in `aggregations.test.ts`.** The TRANSFER tests used `m.toISOString().slice(0,10)` (UTC) for the tx date but read the seed/scope via the same `M()` helper (also UTC). On 1 July at local CEST midnight, `new Date()` is still 30 June in UTC, so `M()` returned `"2026-06"` while `setDate(15)` operated in local time and yielded `"2026-07-15"` — month mismatch, tests failed only on that one day. Fixed by switching `makeTransfer` to `setUTCDate` / `setUTCMonth`, keeping both ends consistently in UTC. The bug only surfaces around month boundaries in positive-offset TZs; before 0.6.0 (TRANSFER) the test wasn't there to trip on it.

236 → 243/243 tests green. tsc + build clean. Patch bump 0.7.4 → 0.7.5.

**Files touched**: `src/lib/fx/rates.ts` (new), `src/lib/fx/__tests__/rates.test.ts` (new), `src/features/debts/PayDebtPage.tsx`, `src/lib/i18n/{en,es}.json`, `src/lib/calculations/__tests__/aggregations.test.ts`, `package.json`.

---

## 2026-06-30 — Version 0.7.4: Inline category quick-add + drop the smart-default

Two related UX changes to the /add flow's category picker, found while Fran was using the app with real data.

**Quick-add chip ("+ New") at the end of the category scroller.** Before, creating a new category meant: bail out of /add → navigate to More → Categories → +Add → fill form → save → navigate back to /add → re-fill the whole expense. With the chip, you tap +, a sheet pops up with name + color (the kind is inferred from the form's current type — EXPENSE / INCOME), save, and the new category is **preselected** for the in-progress transaction. Zero context loss.

Implementation: new `src/features/categories/CategoryQuickAddSheet.tsx` reuses the same color palette as the full `CategoryFormPage` (extracted to `src/features/categories/colors.ts` to share). `TransactionForm`'s `CategoryPicker` now receives a `kind` prop and hosts the sheet locally; on `onCreated` it calls `onChange(id)`. The form's category-loading effect picks up the new row because it now depends on `dbVersion` (the sheet's save calls `bumpVersion()`).

**Dropped the per-pattern smart-default.** A Phase 10b feature kept a localStorage map of "last category used per `source|owner|split`" and pre-selected it on mount. Fran reported a recurring annoyance: the category preselect started to feel noisy — old clicks from months ago kept resurfacing as defaults for unrelated transactions, and the suggestion couldn't tell intentional patterns from accidents. The user wants a clean null default every time.

Removed:
- The `lookupLastUsed` call from the initial state factory in `AddTransactionPage`.
- The `useEffect` that re-suggested a category when source/owner/split changed.
- The `recordLastUsed` call after a successful save.
- The `userTouchedCategoryRef` (no longer needed — there's no "is suggestion active" state to gate).
- The file `src/features/add-expense/lastUsed.ts` entirely.

Net: category always starts at `null` (the "—" chip on the left). The user explicitly picks one every time, or leaves the tx uncategorized. Tradeoff: 1-2 extra taps per save vs. zero risk of an old auto-suggestion masquerading as intent.

**Lesson.** Smart-defaults are a classic case of "great for the first month, slowly wrong for the next eleven." When the underlying patterns drift, the memory still fires confidently from old clicks. Sometimes the right product call is to trust the user to choose every time — small friction now beats compounding wrongness later.

236/236 tests green. tsc + build clean. Patch bump 0.7.3 → 0.7.4.

**Files touched**: `src/features/add-expense/AddTransactionPage.tsx`, `src/features/add-expense/TransactionForm.tsx`, `src/features/add-expense/lastUsed.ts` (deleted), `src/features/categories/CategoryQuickAddSheet.tsx` (new), `src/features/categories/CategoryFormPage.tsx`, `src/features/categories/colors.ts` (new), `src/lib/i18n/en.json`, `src/lib/i18n/es.json`, `package.json`.

---

## 2026-06-30 — Version 0.7.3: Revert SegmentedControl to equal slots + rename EN "Household" → "Home"

0.7.2 weighted slot widths by `label.length` to fix the cramped "Household" pill. On localhost in a desktop browser it looked fine, but on the real phones the desks-of-different-size layout read as unbalanced — "Household" sat in a huge slot to the left, the other three options ("Fran", "Sam", "All") got pushed into the right half. The control felt lopsided in reset state even though the active pill was now well-fit.

Recognised the real fix is upstream: keep the labels short so equal slots stay symmetrical. Renamed "Household" → "Home" in EN across the three segmented control surfaces (`home.scope`, `addExpense.who`, `debts.owner`). Pesos became 4/4/3/3 instead of 9/4/3/3 — within 33% of each other, no longer 300%. The Spanish locale already had "Hogar" (5 chars, balanced with Fran/Sam/Todo), so no change needed there.

Reverted `SegmentedControl` to the pre-0.7.2 model: `gridTemplateColumns: repeat(N, minmax(0, 1fr))` + pill width `calc(100/N% - 8/N px)` + pill slide via `translateX(I × 100%)`. Same CSS-only, zero-DOM-measurement guarantees as before. Updated the component docstring to point at the renaming-the-label trick so future agents don't re-attempt the length-weighted version without seeing why it failed in real use.

Left `more.household` ("Household" as a section header on the More page) unchanged — it's not a segmented control and renaming to "Home" would collide visually with the bottom-nav Home tab.

**The lesson.** The length-weighted slots approach was a clever workaround for a problem that had a much simpler structural fix (rename the label). Cleverness in the component layer compensating for choices made in the content layer is a smell — the asymmetry was data, not layout. When two-sentence labels meet three-letter ones in the same control, the control isn't broken; the copy is.

236/236 tests green. tsc + build clean. Patch bump 0.7.2 → 0.7.3.

**Files touched**: `src/components/ui/SegmentedControl.tsx`, `src/lib/i18n/en.json`, `package.json`.

---

## 2026-06-30 — Version 0.7.2: SegmentedControl pill proportional to label length

Visual fix to `SegmentedControl`. The previous model gave every slot exactly `1/N` of the track width (CSS Grid `repeat(N, 1fr)`), which looks fine when labels are similar lengths but breaks down with mixed-length sets like Household/Fran/Sam/All. The active pill, also sized as `(100/N)% - 8/N px`, sat awkwardly under "Household" (too narrow for the long word) and oversized under "Fran"/"Sam"/"All" (too much empty space).

User's idea: weight slots by `label.length`. Each slot's width is proportional to its label's character count; the pill follows the active slot. Cero infrastructure (no `useLayoutEffect`, no refs, no `getBoundingClientRect`) — purely CSS-driven and SSR-safe. The race condition the earlier "no DOM measurement" comment warned against stays solved by construction.

**Approximation that's good enough here.** Characters ≠ pixels in proportional fonts (Sora/Inter), so the proportions aren't pixel-perfect: "iiii" (4 chars) is much narrower than "WWWW" (4 chars). Floored by `Math.max(label.length, 3)` so very short labels ("A") don't collapse, and masked by the buttons' `px-4` (32px horizontal padding) which absorbs small width misallocations. For the 3-4-option short-label sets the project uses, the result is visually indistinguishable from DOM-measured ideal.

**Implementation.**

```tsx
const weights = options.map((o) => Math.max(o.label.length, 3));
const totalWeight = weights.reduce((s, w) => s + w, 0) || 1;
const weightBefore = weights.slice(0, activeIndex).reduce((s, w) => s + w, 0);
const offsetRatio = weightBefore / totalWeight;
const widthRatio = (weights[activeIndex] ?? 1) / totalWeight;

// Track has p-1 (4px each side). pillLeft = 4px + ratio × (trackW - 8px)
// expands to (ratio × 100%) + (4 - ratio × 8)px — one un-nested calc().
const pillLeftCss  = `calc(${offsetRatio * 100}% + ${(4 - offsetRatio * 8).toFixed(3)}px)`;
const pillWidthCss = `calc(${widthRatio  * 100}% - ${(widthRatio  * 8).toFixed(3)}px)`;
const gridTemplate = weights.map((w) => `${w}fr`).join(" ");
```

Grid columns become `9fr 4fr 3fr 3fr` for `["Household","Fran","Sam","All"]` instead of `1fr 1fr 1fr 1fr`. Household claims ~47% of the track, others split the remainder proportionally to their length. In ES (`Hogar` 5 / `Fran` 4 / `Sam` 3 / `Todo` 4 = `5fr 4fr 3fr 4fr`) the slots are closer to equal naturally — the formula adapts to the locale.

**Animation switched** from `transition-transform` to `transition-[left,width]` because the pill no longer slides via `translateX(I × 100%)`. Both `left` and `width` are now percentages so they animate smoothly between any two active states regardless of weight distribution.

**Why this is preferable to DOM measurement.** The original code's comment explicitly warned that an earlier `getBoundingClientRect`-based version had a race with the route-frame animation. The character-length model sidesteps that entirely: the calculation is a pure function of the props, runs at render time, no layout reads, no measurement timing to coordinate. For the imprecision cost (a few px here and there in proportional fonts), the simplicity dividend is large.

236/236 tests green. `pnpm exec tsc -b` clean. `pnpm build` succeeds. Patch bump 0.7.1 → 0.7.2.

**Files touched**: `src/components/ui/SegmentedControl.tsx`, `package.json`.

---

## 2026-06-29 — Version 0.7.1: `pullAll` ensures raw_* tabs exist before reading (fix 400)

Hotfix on top of 0.7.0. Sync started failing with `400 Unable to parse range: raw_account_adjustments!A2:I` on user devices whose Sheet was bound before 0.7.0 shipped. Root cause: `pullAll` was calling `batchGetValues` directly without checking that every tab in `RAW_TABS` actually existed on the remote spreadsheet. `pushAll` calls `ensureRawTabs` first, so it would have created the tab — but `syncAll` runs pull *before* push, and pull failure aborts push (intentional, see `sync.ts`). Net result: a new entity ships, no device that pre-existed the release can sync until the tab is manually created.

The fix is a single line at the top of `pullAll`:

```ts
await ensureRawTabs(spreadsheetId);
```

`ensureRawTabs` is idempotent — it only creates missing tabs and refreshes the header row, leaving existing data alone. The call costs one `getSpreadsheet` round-trip plus zero or one `batchUpdate` depending on what's missing. The previous device that already had every tab simply pays a `getSpreadsheet` per sync, which is well inside the Sheets API quota.

**Why no migrations v4–v8 tripped this.** All previous schema changes were column additions to *existing* tabs (`is_active` in v4, `recurring_id` in v5, `debt_id` in v6, `is_deleted` in v7, `destination_account_id` in v8). Sheets API tolerates short rows on read — the missing cell just becomes `undefined` at the reader. v9 is the first migration that adds an entirely new tab from the user's perspective, and that exposed the latent assumption in `pullAll`.

**Why this wasn't caught by tests.** The pull test suite drives `_pull.applyTab(tabTitle, rows)` directly with mock rows. It never instantiates a real `batchGetValues` call, so the "tab doesn't exist on the server" branch was unreachable from the test surface. Adding a test for this would require mocking the Sheets API client, and the value-vs-effort isn't great — the failure mode is concrete and the fix is structural (`ensureRawTabs` already exists and is tested in push). Documenting the invariant in the call site comment instead.

**Lesson for the next agent.** Any future schema change that introduces a new `RAW_TABS` entry now works out of the box because `pullAll` self-heals. Column-only changes still work fine because Sheets tolerates short rows. The dangerous case (new tab + pullAll not self-healing) was real until 0.7.1.

`pnpm exec tsc -b` clean. 236/236 tests green. `pnpm build` succeeds. Bump 0.7.0 → 0.7.1 patch.

**Files touched**: `src/lib/sync/pull.ts`, `package.json`.

---

## 2026-06-29 — Version 0.7.0: Account balance calibration + `/accounts/:id` detail page

Opens the "honest accounting" era. After a few weeks of real use, the running balance shown in `/accounts` drifts from what the bank actually shows — small unrecorded fees, FX rounding on USD debt payments, mistyped amounts on past txs. Until 0.7.0 the only ways to reconcile were (a) hunt the discrepancy down across months of history or (b) mutate `accounts.initial_balance` directly. Both are unappealing: (a) is unbounded work; (b) loses provenance and is unsafe under multi-device sync (last-writer-wins on a scalar column silently drops one of two parallel corrections).

0.7.0 adds **manual calibration** as a first-class concept: a dedicated `account_adjustments` table holds signed delta rows, `accountBalance` sums them alongside transactions, and a new `/accounts/:id` page surfaces both the calibration trigger and the audit trail.

**The "this is not a transaction" insight.** The first instinct (and what the previous agent had on the table as option B) was to materialize each correction as a synthetic INCOME or EXPENSE with an `is_adjustment` flag, filtered out of `monthlySummary` and `categoryBreakdown`. The user pushed back: *"esto no es una transacción, es coger la account y cambiarle el número de dinero disponible"*. They wanted audit trail without contaminating `/transactions` or the P&L. The right answer once you accept that framing is option **C**: a dedicated table whose rows can't ever leak into transaction aggregations by construction — there's no path. Every future aggregation of `transactions` is automatically safe, no defensive `WHERE is_adjustment = 0` to forget.

**Schema (migration v9).**

```sql
CREATE TABLE account_adjustments (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  date TEXT NOT NULL,                  -- YYYY-MM-DD
  target_balance REAL NOT NULL,        -- what the user said the balance should be
  delta REAL NOT NULL,                 -- signed: target − balance at save time
  notes TEXT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_account_adjustments_account
  ON account_adjustments(account_id, is_deleted);
CREATE INDEX idx_account_adjustments_account_date
  ON account_adjustments(account_id, date);
```

Both `target_balance` and `delta` are stored. `delta` is what the aggregator uses (cheap sum); `target_balance` is preserved so the audit trail rows can say *"saldo objetivo: 1.234,56 €"* without re-deriving from the balance at save time (which would shift as later txs land).

Soft-delete mirrors debts v7: `is_deleted = 1` on `softDelete`, sync action emitted as `UPDATE` (never `DELETE`) so snapshot push keeps the row as a tombstone the other device can see.

**`accountBalance` aggregator — one new clause.**

```ts
const adjustments = selectScalar(
  `SELECT COALESCE(SUM(delta), 0) FROM account_adjustments
   WHERE account_id = ? AND is_deleted = 0`,
  [accountId],
);
return round2(initialBalance + inflow - outflow + adjustments);
```

`accountMonthlyFlow` is deliberately NOT touched. A calibration is not money flowing into or out of the account this month — it's a one-off correction. Mixing it into "this month's inflow / outflow" would erode the at-a-glance signal those numbers carry on the detail page. `monthlySummary` and `categoryBreakdown` aren't touched either, by construction (they only `SELECT FROM transactions`).

**Sync — new entity end-to-end.** Same pattern the project has done four times now (categories.is_active in v4, recurring_id in v5, debt_id in v6, debts.is_deleted in v7, destination_account_id in v8): new `RAW_TABS` entry `raw_account_adjustments` with 9 headers, `accountAdjustmentToRow` writer + `parseAccountAdjustment` reader, `reconcileAccountAdjustments` + `insertAccountAdjustment`/`updateAccountAdjustment` in pull, `TAB_KEY_BY_TITLE` entry in push, `applyRemoteToLocal` switch case, `SnapshotData.account_adjustments` field. `RAW_TABS.length` test bumped 10 → 11.

**`/accounts/:id` — new lazy-loaded route.** The previous "tap a card → ???" affordance now lands here. Layout:

- Header card: avatar + name + type/currency pills + big balance + 3-column monthly flow (in / out / net).
- Primary CTA "Calibrar saldo" → opens `AccountAdjustSheet`.
- Secondary CTA "Ver movimientos →" → navigates `/transactions?source=<account_id>`.
- "Calibraciones manuales" section: empty-state card when no adjustments, otherwise a list of rows with signed delta as headline, target balance + date, optional notes, trash icon for soft-delete.

`AccountsPage` cards become tappable buttons wrapped in `tap-card` press feedback. No inline calibrate trigger on the index — one entry point keeps the flow focused: "tap card → review balance + month flow + history → calibrate if needed."

**`AccountAdjustSheet` — live delta preview.** The big risk in a calibration flow is the user mistyping a digit and confidently confirming a 1.234 → 12.345 calibration. The sheet prevents that by showing a colored preview tile under the input:

- No change → neutral surface, "Sin cambios."
- Positive → `bg-positive/10`, "Se sumará 50,00 € al saldo calculado."
- Negative → `bg-expense/10`, "Se restará 120,00 €…"

Reusing `formatMoney` + `parseAmount` + `sanitizeAmountInput` from the existing format module keeps the input behavior identical to AmountInput (es-ES grouping, decimal comma). Save button disabled when delta is effectively zero (< 0.005).

**`/transactions?source=<account_id>` — deep-link pattern.** The transactions filter panel already had a Source segmented control (FRAN_PERSONAL / SAM_PERSONAL / JOINT). Adding a `useSearchParams` effect that reads `?source=<id>`, translates via `accountIdToCashSource`, applies the filter, opens the panel, and then strips the param from the URL (`setSearchParams(..., { replace: true })`) — 16 lines. Reload doesn't re-apply. Unknown id is silently ignored.

**Owner — not applicable.** The agent-before-me's option B needed to nominate an owner for each fake tx; option C side-steps the question entirely. There's no allocation row, no settlement effect, no owner concept. Adjustments are about the *account*, not about who owes whom.

**Tests (11 new, total 236/236).**

In `aggregations.test.ts`:
- positive delta increases `accountBalance`
- negative delta decreases it
- soft-delete removes the effect (balance reverts)
- multiple adjustments stack additively
- an adjustment on account A leaves account B untouched
- an adjustment does NOT enter `monthlySummary` (income/expenses/recurring/available all unchanged)
- an adjustment does NOT enter `accountMonthlyFlow`

In `pull.test.ts`:
- writer ↔ reader round-trip preserves the signed delta + notes
- null notes survive
- `applyTab` inserts a brand-new remote adjustment and `accountBalance` picks it up
- `applyTab` propagates a remote soft-delete and the balance reverts

Settlement cases A-E pass without modification. `pnpm exec tsc -b` clean. `pnpm build` succeeds — `AccountDetailPage` becomes its own 10.4 kB chunk (3.4 kB gzip).

**Decisions captured for the next agent**
- **No edit, only create + soft-delete.** To change an adjustment's amount, the user soft-deletes and creates a new one. Editing in place would require recomputing `delta` against a moving target (the balance has changed since save), and the audit trail loses precision. Two simple ops preserve a clearer history.
- **No surface for soft-deleted adjustments.** Unlike debts where Archive is reversible UI-side, soft-delete on adjustments is one-way from the user's perspective. The row persists for sync round-trip only. If we ever want undelete, it's a one-line repo method away.
- **Adjustment notes are free-text, max 500 chars.** No tagging or category. Free text is what users actually write when they're calibrating in the moment ("Bizum that didn't sync", "ATM fee from May").
- **Multi-currency: the sheet assumes the account's `currency_code` throughout.** All 3 seed accounts are EUR, so this never trips. If a future USD account ever lands, the input + preview formatters already pass `account.currency_code` to `formatMoney`, so the only thing to add would be currency hint copy in the sheet ("Saldo correcto en USD") — but the data path is currency-agnostic.

**Bump 0.6.0 → 0.7.0.** Minor — new schema entity, new page, new operational concept.

**Files touched**: `src/lib/db/migrations.ts`, `src/lib/db/types.ts`, `src/lib/db/index.ts`, `src/lib/db/repositories/accountAdjustments.ts` (new), `src/lib/calculations/aggregations.ts`, `src/lib/sync/{tabs,writers,readers,pull,push}.ts`, `src/features/accounts/{AccountsPage,AccountDetailPage,AccountAdjustSheet}.tsx`, `src/features/transactions/TransactionsPage.tsx`, `src/app/router.tsx`, `src/lib/i18n/{en,es}.json`, `src/lib/calculations/__tests__/aggregations.test.ts`, `src/lib/sync/__tests__/{sync,pull}.test.ts`, `package.json`.

---

## 2026-06-28 — Version 0.6.0: TRANSFER tx type + per-account Home forecast

Opens a new era of inter-account money movement. Until now the app modeled four transaction types but only three of them (EXPENSE, INCOME, DEBT_PAYMENT) had user-facing flows. TRANSFER was a stub in `TxType` that nothing wrote and nothing read symmetrically. 0.6.0 wires it end-to-end: `/add` gains a Transfer toggle, recurring TRANSFERs auto-generate monthly contributions to the joint pool, the account-balance math counts transfers on both ends, and Home is rebuilt around a per-account forecast (replacing the previous per-person allocation cards).

**Why this matters for Fran + Sam's workflow.** Their real pattern is monthly contributions from each personal account to the joint account. Before 0.6.0 the only way to model this was a hack (EXPENSE from personal + INCOME to joint), which polluted the per-person P&L with non-real "expenses" and double-counted the source income across the household scope. TRANSFER is the right primitive: a single tx with a source and a destination, zero allocations, zero settlement implications.

**Schema (migration v8).** `transactions.destination_account_id TEXT NULL REFERENCES accounts(id)` + `recurring_items.destination_account_id TEXT NULL REFERENCES accounts(id)`. The transactions side is a plain ALTER. The recurring_items side requires a table rebuild because the v1 CHECK constraint on `type` didn't list TRANSFER; SQLite can't widen a CHECK without recreating the table. The migration creates `recurring_items_v8`, copies the data verbatim (destination_account_id seeds to NULL on existing rows), drops the old, renames the new. Indexes recreated. Idempotent.

**Aggregations rewrite — accountBalance + accountMonthlyFlow.** Both now read TRANSFER symmetrically:
- **Inflow** counts INCOME txs where the account is the source AND TRANSFER txs where the account is the destination. Single SQL with an OR clause.
- **Outflow** counts EXPENSE/DEBT_PAYMENT/SETTLEMENT_PAYMENT/TRANSFER on the source side (unchanged shape; TRANSFER was already in the outflow list since the original schema).

Net result: a TRANSFER 500€ from Fran personal to Joint correctly subtracts 500 from Fran personal's balance AND adds 500 to Joint's balance. Across all accounts it nets to zero — TRANSFER is pure cash relocation.

**monthlySummary untouched.** TRANSFER doesn't appear in income/expense/recurring buckets — it's flux neutral from a P&L view. The user explicitly confirmed this semantic (avoids double-counting the source income that already entered as INCOME).

**Sync — 10 sites for the two tables.** Same "append at the end of the row" rule. tabs.ts adds the headers, writers append the value, readers default `undefined → null`, pull insert/update include the column. Test fixtures updated.

**UI — `/add` becomes truly polymorphic.** Type segmented control now has three options (Expense / Income / Transfer). Transfer mode:
- Adds a "Desde" (source) and "Hacia" (destination) section.
- Hides FlowDiagram, SettlementChip, split slider, owner picker, category picker.
- Renders an inline validation hint under "Hacia" when the user picks an invalid combination.
- Validation rule encoded in the new `transferValidationError(from, to)` helper (exported from `TransactionForm.tsx`): rejects when `from === to`, and rejects Fran personal ↔ Sam personal (forces SettleUp for inter-person money movement instead of TRANSFER).
- Save button disabled until valid. SaveFab label switches to `addExpense.saveLabelTransfer` ("Guardar transferencia · X €").

**UI — EditExpensePage now polymorphic too.** Reads `tx.type` and renders the matching form mode. TRANSFER edits route through the same form with the destination picker. Save fork mirrors AddTransactionPage: no allocations, no recompute. The form's title and SaveFab label switch accordingly.

**UI — /transactions list.** TRANSFER rows render with the `ArrowLeftRight` lucide icon (no avatar — there's no "owner"), a neutral tone, and a description that defaults to "Source → Destination" when the user hasn't typed one. A small neutral "Transfer" pill replaces the per-tx category pill since transfers don't have categories.

**Recurring TRANSFER.** Form gains a fourth type option. When `state.type === "TRANSFER"`:
- Owner and category sections hide.
- A "Hacia" section appears with the destination picker (re-uses sourceOptions).
- Same `transferValidationError` validation as `/add`.
- Save payload forces `owner_type: "HOUSEHOLD"` (the column is NOT NULL in the schema — but it's never consumed for TRANSFER aggregations) and clears `category_id` and `debt_id`.
- `auto_generate_transaction` toggle works the same as for EXPENSE: turning it on materializes the current month's transfer immediately, and subsequent boots maintain the monthly cadence.

**autoGenerate.ts.** New branch for `r.type === "TRANSFER"`: skips when destination is missing or equals the source, otherwise creates a tx with empty allocations, no recompute, no debt_payments. Tests cover the happy path; the existing idempotence + active-only invariants are inherited (the type check is the only new gate).

**RecurringPage.** New "Transferencias" section between "Pagos de deuda" and the empty state. The Row icon for TRANSFER is `ArrowLeftRight` in a neutral surface bucket; ✅ paid-state badges work for TRANSFER the same way they do for other types.

**RecurringDetailPage.** `canQuickFillTransfer` joins the existing quick-fill conditions. The CTA copy switches to `recurring.quickFillCtaTransfer` ("Registrar transferencia de este mes"). Route is `/add?fromRecurring=<id>` — the prefill effect in AddTransactionPage now reads `r.destination_account_id` too and applies it, so the form opens fully populated.

**Home redesign — per-account forecast (replaces per-person scope cards).** This is the bigger UX shift. The two `<PersonalCard who="FRAN/SAM" summary={monthlySummary("fran"/"sam")} />` cards that showed "Income / Expenses / Recurring / Available" via allocations are now replaced by `<PerAccountCard who="FRAN/SAM" balance/inflow/outflow/currency />` cards that show the actual bank account's cash flow for the month:
- Current balance (`accountBalance(accountId)`).
- This month's inflow (`accountMonthlyFlow(accountId).inflow`) — includes incoming TRANSFER.
- This month's outflow — includes outgoing TRANSFER.
- Net for the month.

The JointSnapshotCard stays at the top of the page (kept as the headline since it's the at-a-glance Joint state). The two new PerAccountCards stack below it as a grid of 2. Fran's monthly TRANSFER to Joint now correctly subtracts from his Available and adds to Joint's inflow.

The decision to replace (not augment) the per-person cards was deliberate. The per-scope P&L view (income - expenses - shared expenses portion via allocations) is more "accounting correct" but less practical day-to-day. The per-account view answers "how much is in my pocket right now?" which is what the user actually wants. The settlement P&L (Fran owes Sam X) still lives in `/settlements`.

**Side effect: removed the unused PersonalCard component** + the orphaned `samLikesGreen` helper. The "Sam name first-letter in green" detail moved into `PerAccountCard` so the visual identity carries over.

**Behavioral impact for Fran + Sam**
- Real workflow: create one recurring TRANSFER "Fran personal → Joint 500€/mes" + one "Sam personal → Joint 800€/mes". Turn on auto_generate. Each month at boot the txs materialize automatically. Joint balance climbs, personal balances drop accordingly.
- Home: at-a-glance "Joint balance + this month's inflow/outflow" + "Fran personal balance + monthly net" + "Sam personal balance + monthly net". Three boxes that together answer "where's our money?".

**Decisions captured for the next agent**
- **Same-currency only enforced via UI**. Both accounts must share a currency for the math to make sense (a USD→EUR transfer needs FX, same problem as DEBT_PAYMENT). All MVP accounts are EUR so this never trips in practice, but if AccountsPage ever supports multi-currency, the form's "To" picker should filter destinations by `source.currency_code`.
- **TRANSFER doesn't generate settlements**, by design. Even when source is personal and destination is joint (or vice versa), no settlement_ledger entry is written. The semantics: contributing to the household pool isn't a debt — once the money's in the joint pool, it belongs to the household; if you later want to settle Fran↔Sam imbalance, you use `/settlements/settle`.
- **Fran personal ↔ Sam personal blocked at the form layer**, not just at save time. The validation surfaces as inline copy under the destination picker. The right tool for "Fran sends Sam money" is SettleUp because that flow updates the ledger.
- **No history view of transfers per account** in 0.6.0. If you need to see "all transfers in/out of Joint this month", you go to `/transactions` and read the list (TRANSFERs visually distinct via the ArrowLeftRight icon and "Transfer" pill). If we ever want a per-account history affordance, a tap on the Joint card → `/accounts/joint` would be the home for it.

**i18n.** New keys: `addExpense.titleTransfer`, `addExpense.type.transfer`, `addExpense.transferFrom`, `addExpense.transferTo`, `addExpense.transferErrorSame`, `addExpense.transferErrorPersonalToPersonal`, `addExpense.saveLabelTransfer`, `recurring.types.transfer`, `recurring.sections.transfer`, `recurring.quickFillCtaTransfer`, `home.statBalance`, `home.statNet`. Both `es.json` and `en.json` updated. (`addExpense.saveLabelExpense` added as an alias for symmetry but currently unused; safe to remove if it bothers the next agent.)

**Tests.** Four new cases in `aggregations.test.ts` exercising the TRANSFER × accountBalance × accountMonthlyFlow interactions:
- TRANSFER moves money symmetrically (source -X, destination +X).
- TRANSFER counts as inflow at destination in monthly flow.
- TRANSFER counts as outflow at source in monthly flow.
- TRANSFER does NOT enter monthlySummary buckets (no double-count).

Settlement cases A-E pass without modification. autoGenerate's existing happy-path tests cover the EXPENSE/INCOME/DEBT_PAYMENT branches; the TRANSFER branch is implicitly exercised by the seed + integration paths but doesn't have a dedicated unit test yet (low-risk: it's a simpler version of the EXPENSE branch, with no allocator or recompute). Full suite: 225/225 green. `pnpm exec tsc -b` clean. `pnpm build` succeeds.

**Bump 0.5.4 → 0.6.0.** Minor — opens the "inter-account movements" era, analogous to how 0.5.0 closed the recurring rollout.

**Files touched**: `src/lib/db/migrations.ts`, `src/lib/db/types.ts`, `src/lib/db/repositories/transactions.ts`, `src/lib/db/repositories/recurring.ts`, `src/lib/calculations/aggregations.ts`, `src/lib/calculations/autoGenerate.ts`, `src/lib/calculations/__tests__/aggregations.test.ts`, `src/lib/sync/{tabs,writers,readers,pull}.ts`, `src/lib/sync/__tests__/{sync,pull}.test.ts`, `src/features/add-expense/{TransactionForm,AddTransactionPage}.tsx`, `src/features/transactions/{EditExpensePage,TransactionRow}.tsx`, `src/features/recurring/{RecurringFormPage,RecurringDetailPage,RecurringPage}.tsx`, `src/features/home/HomePage.tsx`, `src/lib/i18n/{en,es}.json`, `package.json`.

---

## 2026-06-26 — Version 0.5.4: INCOME-aware labels in recurring form + SaveFab

Fran spotted two small inconsistencies left over from the 0.5.1 income polymorphism:

1. **Recurring form was stuck on "Paid from" / "Owner" labels** regardless of type. For an INCOME recurring (e.g. "Nómina Sam") this reads wrong — your employer isn't a CashSource. The /add page already switched to "Received in" / "For" in 0.5.1 (those labels apply equally to recurring), but `RecurringFormPage.tsx` was missed.
2. **SaveFab still said "Save expense · X €"** when the user was on /add in INCOME mode. The page header was already "Add Income" (correct from 0.5.1), so the button text was the last hold-out.

**Fixes:**

- `RecurringFormPage`: Section labels and ariaLabels for source + owner are now conditional on `state.type`. INCOME → "Received in" + "For". EXPENSE/DEBT_PAYMENT → "Paid from" + "Owner" (existing). Used the same shape as `TransactionForm.tsx` already had — pure render-side change, no state shape changes.
- `SaveFab` already accepted a `labelKey` prop. `AddTransactionPage` now passes `"addExpense.saveLabelIncome"` when `values.type === "INCOME"`, falling back to the default `"addExpense.saveLabel"` for EXPENSE.
- New i18n keys: `addExpense.saveLabelIncome` ("Guardar ingreso · {{amount}}" / "Save income · {{amount}}"), `recurring.fields.receivedIn`, `recurring.fields.receivedBy`. Both locales.

**No semantics changes.** The two fields (source + owner) still exist for INCOME, and the same allocation logic runs — only the labels change to match how the user reads them. The "edge case" where Received in ≠ For (e.g. parents transfer money to your personal account but it's for the household) still works mechanically; it just doesn't auto-trigger a settlement entry — that's a deliberate scope limit since INCOME txs don't call `recomputeForTransaction`. Documented in the prior 0.5.1 entry.

**Tests** — no new tests. The change is pure label conditionals; the underlying form state shape, save path, and aggregation behavior are unchanged. The 220 + 1 (debts) existing tests cover the data path. Full suite: 221/221 green. `pnpm exec tsc -b` clean. `pnpm build` succeeds.

**Files touched**: `src/features/recurring/RecurringFormPage.tsx`, `src/features/add-expense/AddTransactionPage.tsx`, `src/lib/i18n/{en,es}.json`, `package.json`.

---

## 2026-06-26 — Version 0.5.3: PayDebt prefill from recurring quick-fill

Closing the follow-up I flagged at the end of Level 4 ("Adding `?amount=` prefill is a 10-line addition if friction emerges"). Fran tested the recurring DEBT_PAYMENT flow and the friction was: tap "Registrar pago de este mes" on a debt-linked recurring → PayDebtPage opens with `0,00 €`, no amount prefilled, and the resulting transaction wouldn't link back to the recurring so the ✅ badge on /recurring never fired even after paying. Both gaps fixed in one cut.

**`RecurringDetailPage` — pass amount + fromRecurring as query params:**

```ts
navigate(`/debts/${item.debt_id}/pay?amount=${item.amount}&fromRecurring=${item.id}`)
```

The non-debt branch is unchanged (it already passed `fromRecurring` to `/add`). Same pattern, two extra characters.

**`PayDebtPage` — read the query params:**
- `useSearchParams()` picks up `amount` and `fromRecurring`.
- The init effect (after loading the debt) sets `debtAmount` + `debtAmountText` to the parsed `amount` when present and valid. Uses `formatForInput` so the input shows the localized format (1.200,00 in es-ES).
- `transactionsRepo.create` gets `recurring_id: fromRecurringId` — Level 2's paid-state queries pick it up and ✅ lights on /recurring after save.
- Save navigation: when `fromRecurring` is set, route back to `/recurring/${fromRecurringId}` (where the user came from). Otherwise the original `/debts/${debt.id}` behavior. Mirrors the EXPENSE quick-fill's "save returns you to the page that launched it" pattern from Level 1.

**Tests** — no new dedicated tests for the UI prefill. The data path (DEBT_PAYMENT tx with `recurring_id` flips `isPaidForMonth` to true) is already covered by `autoGenerate.test.ts > materializes a DEBT_PAYMENT tx and decrements the linked debt's balance` (the auto-gen path is structurally identical to this manual one — both call `transactionsRepo.create({type: "DEBT_PAYMENT", ..., recurring_id, ...})`). Adding a PayDebtPage component test would gain little. Full suite: 221/221 green. `pnpm exec tsc -b` clean. `pnpm build` succeeds.

**Files touched**: `src/features/debts/PayDebtPage.tsx`, `src/features/recurring/RecurringDetailPage.tsx`, `package.json`.

---

## 2026-06-26 — Version 0.5.2: debt delete becomes soft-delete (sync resurrection fix)

Bugfix. Fran reported that hard-deleting a debt made it disappear briefly and then reappear seconds later. Root cause was a latent bug since 0.4.4 (when debts hard-delete shipped): the pull reconciler in `src/lib/sync/pull.ts:210-243` treats "row exists on the Sheet but not locally" as a remote INSERT and re-creates the row. Hard-deleted debts leave no tombstone for the reconciler to respect, so any pull between local-delete and the snapshot-push to Sheets resurrects them.

**Why transactions don't have this bug.** `transactions.is_deleted` has been a soft-delete flag since the original schema. The row stays in the table, the reconciler sees it during pull, and the `updated_at` comparison handles propagation normally. Debts got hard-delete in 0.4.4 because at the time the audit didn't think about the sync round-trip. This commit aligns debts with the transactions model.

**Migration v7.** `ALTER TABLE debts ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`. Appended at the end of the row, same "additive columns go at the end" rule that v5 and v6 established. Default 0 means every existing debt is "live" post-migration.

**`debtsRepo.delete()` semantics flipped:**
- Before: `DELETE FROM debts` + manual cascade `DELETE FROM debt_payments`, enqueue `sync_queue` entry as `DELETE`.
- After: `UPDATE debts SET is_deleted = 1, is_active = 0` (no cascade), enqueue as `UPDATE`. The "soft-delete also flips is_active" is intentional — keeps the row out of every "active" query path even if some caller forgot to filter is_deleted.
- `debt_payments` rows survive. They're unreachable from UI because `listForDebt(id)` is the only access path and the debt's `getById` now returns null, but raw queries can still see them — useful for historical audits and future undelete features.

**Filter-everywhere on read.** `debtsRepo.list`, `listByOwner`, `getById` all gain `AND is_deleted = 0`. Soft-deleted debts are invisible to every UI flow including the "Archivadas" section (the user already has Archive for reversible hiding; this filter is for the irreversible kind).

**Sync (5 sites).** `tabs.ts` headers append `"is_deleted"`. `writers.ts/debtToRow` appends `b(d.is_deleted)`. `readers.ts/parseDebt` reads `row[14] === undefined ? false : bool(row[14])` (defensive: pre-v7 sheets default to "live"). `pull.ts insertDebt` / `updateDebt` both write the flag. Same pattern as the previous additive columns — no mid-row insertion, no index shift.

**Sync action change.** `enqueueChange("debt", id, "UPDATE")` instead of `"DELETE"`. Critical: pushing as DELETE on snapshot push removes the row from the Sheet, defeating the tombstone. With UPDATE, the Sheet gets the row with `is_deleted=1` so other devices propagate the flag.

**Behavioral impact for the user**
- "Eliminar definitivamente" still works the same way visually (the debt disappears, doesn't come back).
- The label "definitivamente" is now slightly less literal — the row physically persists, just unreachable. Practical experience unchanged. Not renaming the i18n key.
- If a future "Recuperar deuda eliminada" UI ever lands, it's a `UPDATE is_deleted=0` away.

**Scope decisions captured for the next agent**
- **No reactivation UI for soft-deleted debts.** Archive is reversible (the user has Reactivar), soft-delete is intentionally not. If we ever want true undelete, it's trivial to add — but exposing it makes the "Archivar vs Eliminar definitivamente" distinction blurry. Keep them distinct.
- **`debt_payments` not cascaded.** Soft-delete is reversible at the DB level (just flip is_deleted=0). If we ever undelete, the payment history reappears intact. If a future cleanup wants to actually hard-delete a soft-deleted debt (e.g. GDPR), it should cascade then.
- **`recurring_items.debt_id` orphan risk.** A recurring DEBT_PAYMENT linked to a now-soft-deleted debt: the form's picker won't show it (filtered), but the existing recurring keeps the orphan FK. `debtsRepo.getById` returns null, so the autoGenerate's `if (!debt) continue` skips silently. The user sees the recurring stays in /recurring but stops materializing. The DetailPage's "debtUnlinked" hint card uses `!item.debt_id` so it wouldn't fire — the recurring looks linked but the link is broken. Acceptable for the edge case; if it bites, the fix is to also null-out the debt_id in `recurring_items` during `debtsRepo.delete`. Not doing it now to keep scope tight.
- **The same problem would affect `accounts` if we ever delete them.** Currently the spec mandates 3 fixed accounts and we never delete them, but if AccountsPage ever gets a delete CTA, apply the same soft-delete pattern.

**Tests.** `debts.test.ts` describe block renamed to `"debtsRepo.delete (soft delete — v7)"`. Three cases (up from two): hides from getById + list paths, preserves the row with `is_deleted=1` for sync round-trip purposes, debt_payments survive (no cascade). The `sync.test.ts` debt fixture gains `is_deleted: false`. Full suite: 221/221 green. `pnpm exec tsc -b` clean. `pnpm build` succeeds.

**Files touched**: `src/lib/db/migrations.ts`, `src/lib/db/types.ts`, `src/lib/db/repositories/debts.ts`, `src/lib/db/repositories/__tests__/debts.test.ts`, `src/lib/sync/tabs.ts`, `src/lib/sync/writers.ts`, `src/lib/sync/readers.ts`, `src/lib/sync/pull.ts`, `src/lib/sync/__tests__/sync.test.ts`, `package.json`.

---

## 2026-06-26 — Version 0.5.1: Manual INCOME entry in /add

Patch on top of 0.5.0 — the recurring era left INCOME flow half-resolved. With Level 4 you can auto-generate income each month if you turn on auto_generate, but there was no path to manually enter income (Sam's variable nómina, one-off ingresos). 0.5.1 makes `/add` polymorphic over Expense/Income so the manual flows exist.

**Renamed `AddExpensePage` → `AddTransactionPage`.** The page handles both types now; the old name was misleading. Folder stays `add-expense/` (renaming would mean touching every file in there and many imports — not worth the noise). File renamed via `git mv` so the diff stays as a rename, not a delete+create.

**`TransactionForm` is now polymorphic.**
- New `type: TxFormType` field on `TransactionFormValues` (`"EXPENSE" | "INCOME"`), default `"EXPENSE"`.
- New SegmentedControl at the top of the form (`{Gasto | Ingreso}`). Always visible — Q1 design decision: visible toggle over query-param pre-selection (more discoverable, easy to correct mid-entry).
- INCOME mode hides expense-specific UI: `FlowDiagram`, `SettlementChip`, and the split slider (the `isShared` predicate now requires `!isIncome`). Source + owner segments stay, with re-labeled eyebrows — "Recibido en" / "Para" instead of "Pagado por" / "Pertenece a".
- Amount color: green (`text-positive-ink`) when INCOME, default text color when EXPENSE — small visual cue that you're not adding a drain.
- Categories picker re-fetches via `categoriesRepo.list(isIncome ? "INCOME" : "EXPENSE")` — INCOME has its own seeded categories (salary etc.).

**`AddTransactionPage` save path.** Forks on `values.type`:
- **EXPENSE**: unchanged. `expenseAllocator` → tx → `recomputeForTransaction`. Records the pattern memory for next-time category suggestion.
- **INCOME**: hand-rolled single allocation `{owner_type: values.owner, share_percent: 100, share_amount: amount}`. Tx with `type='INCOME'`. **No `recomputeForTransaction`** — income has no settlement implications, the recompute would just no-op. **No `recordLastUsed`** — pattern memory is keyed by the expense flow's source/owner/split, polluting it with income choices would hurt next-time expense suggestions.

**Category clear on type switch.** When the user toggles from EXPENSE → INCOME (or vice versa) in `handleChange`, `categoryId` resets to `null` and `userTouchedCategoryRef` clears. Prevents an EXPENSE category from leaking into an INCOME tx (the picker rebuilds with INCOME categories on the next render, so the orphan id would silently survive without this).

**Pattern-tracker effect gated to EXPENSE.** The smart-default suggestion (`lookupLastUsed` on source/owner/split changes) used to run for any type implicitly. Now it's an explicit `if (values.type !== "EXPENSE") return;` — INCOME has no per-pattern memory yet.

**`RecurringDetailPage`.** `canQuickFillIncome` joins the existing `canQuickFillExpense` and `canQuickFillDebt`. The CTA appears for INCOME recurrings now, with its own copy: `recurring.quickFillCtaIncome` ("Registrar ingreso de este mes" / "Register this month's income"). Routes to `/add?fromRecurring=<id>` like EXPENSE — the prefill effect in `AddTransactionPage` reads `r.type` and flips the form's type accordingly.

**Sam's variable nómina flow now works end-to-end:**
- Create INCOME recurring "Nómina Sam", amount=1000€ baseline, auto_generate=OFF.
- Each month she opens `/recurring/nomina-sam` → "Registrar ingreso de este mes".
- /add opens prefilled: type=INCOME, owner=SAM, source=SAM_PERSONAL, amount=1000.
- She edits the amount to 1180,50, saves.
- Tx tied to the recurring (✅ paid-state lights up).
- The recurring's baseline stays at 1000 — she doesn't have to edit the recurring each month.

**One-off income flow:** tap `+` in the bottom nav → `/add` → toggle to "Ingreso" → fill amount/source/owner → save. Tx with `recurring_id = null`.

**`EditExpensePage` updated to handle INCOME.** When the user edits a transaction from `/transactions/:id`, the form state now reads `tx.type` and passes it through. Previously the type was implicit (EXPENSE) — editing an INCOME tx (e.g. an auto-generated nómina) would have looked OK but the type field on the form would have been missing. Note: `EditExpensePage` was already using `expenseAllocator` and `recomputeForTransaction` in its save path; for proper INCOME edit support that should fork too (Level 4.6 if it becomes a real itch). Today editing an INCOME tx and saving will route through the expense path — which still produces the right allocations as long as the user doesn't change source/owner in a weird way. Documenting the imperfection here so the next agent knows it's a known gap.

**Scope decisions captured for the next agent**
- **Toggle is part of the form, not a separate route.** Visible always; correctable mid-entry. The user pondered `/add?type=income` style routing — rejected as less discoverable.
- **No INCOME pattern memory.** The `lastUsed` map only stores expense patterns. Income → category mapping is rarely a "smart default" candidate (nómina category is fixed, one-off income is varied). If a real need emerges, the memory shape would need a `type` dimension in the key.
- **EditExpensePage gap.** The edit flow doesn't run a separate INCOME save path; it always passes through `expenseAllocator` + `recomputeForTransaction`. For a vanilla INCOME edit (just changing amount or date) this is fine — `recomputeForTransaction` is idempotent and the existing allocation row gets rewritten via `expenseAllocator(owner=FRAN/SAM/HOUSEHOLD)` which for personal owners produces the same 100% allocation as the manual INCOME path. The case that would break: switching the owner of an INCOME tx from FRAN to HOUSEHOLD during edit (the allocator would build a 50/50 split). Not patching today — note it.
- **Type is shown but kept stable across edits.** The `EditExpensePage` reads `tx.type` and seeds the form's type field, but doesn't expose a way to change the type during edit. Changing an EXPENSE into an INCOME is a destructive operation (the allocations completely change meaning); we don't enable it. If you really want to change type, delete + create.

**i18n.** Added `addExpense.titleIncome`, `addExpense.type.{label,expense,income}`, `addExpense.receivedIn`, `addExpense.receivedBy`, `recurring.quickFillCtaIncome`. Both `es.json` and `en.json` updated.

**Tests** — none added today. The existing 220 keep passing because the polymorphism is additive and the form's default state is still EXPENSE (the path the tests exercise). New tests for the INCOME save path + Sam's flow would belong in `src/lib/calculations/__tests__/addExpense.flow.test.ts` (rename later?) and add ~3-5 cases. Logged as a follow-up; current behavior verified manually via tsc + the typical sanity check (build + suite green). Full suite: 220/220 green. `pnpm exec tsc -b` clean. `pnpm build` succeeds.

**Files touched**: `src/features/add-expense/AddExpensePage.tsx` → `AddTransactionPage.tsx` (rename + edit), `src/features/add-expense/TransactionForm.tsx`, `src/features/transactions/EditExpensePage.tsx`, `src/features/recurring/RecurringDetailPage.tsx`, `src/app/router.tsx`, `src/lib/i18n/{en,es}.json`, `package.json`.

**Follow-up suggestions for the next agent (low priority):**
- Add INCOME cases to `addExpense.flow.test.ts` (or create `addIncome.flow.test.ts`).
- Address the EditExpensePage gap if INCOME edits start producing weird allocations.
- Consider per-type pattern memory if the user complains about category re-selection for income.

---

## 2026-06-25 — Version 0.5.0: Recurring Level 4 — debt linkage + multi-type auto-gen

Closes the recurring era with a minor bump. Two changes in one cut: (a) recurrings of type `DEBT_PAYMENT` can now be linked to a specific `debts` row, so materialization (auto-gen or manual) decrements the debt's principal; (b) auto-gen is now opt-in for all three recurring types (EXPENSE, INCOME, DEBT_PAYMENT) instead of EXPENSE-only.

**Multi-currency caveat — the rule is same-currency, not EUR-hardcoded.** Both the form's debt picker and the generator's defensive check express the same constraint: `debt.currency_code === recurring.currency_code`. Cross-currency debts (e.g. the seeded USD loan to a relative) must still be paid manually via `/debts/:id/pay` because the FX rate at payment time can't be honestly stashed at boot. Today recurrings are hardcoded to EUR (the form's currency_code literal), so in practice the picker resolves to EUR debts only — but the *rule* is same-currency, not EUR. If recurring ever gains a currency selector (USD recurring for a USD debt, say), both checks automatically follow without code change.

**Schema (migration v6).** `ALTER TABLE recurring_items ADD COLUMN debt_id TEXT NULL REFERENCES debts(id)` + index `idx_recurring_debt`. Nullable because (1) only DEBT_PAYMENT type uses it, and (2) legacy pre-v6 recurrings keep working as informational items. Form gates non-null at save time for new DEBT_PAYMENT rows; existing unlinked ones display a "Sin enlace a deuda → Enlazar" hint card on the Detail page.

**Sync (5 sites, same "column at the end" pattern as v5).** `tabs.ts` appends `"debt_id"` after `"updated_at"`. `writers.ts/recurringToRow` appends `r.debt_id`. `readers.ts/parseRecurring` reads `row[17] === undefined ? null : str(row[17])`. `pull.ts insertRecurring` and `updateRecurring` both include the column in their statements. Same rule as 0.4.8's `recurring_id`: additive columns go at the end, period — mid-row insertion would shift legacy indices and corrupt timestamps on first pull from older sheets.

**`autoGenerate.ts` refactor.** The function no longer filters by `type='EXPENSE'`. Per-type branches:
- **EXPENSE**: unchanged from Level 3.
- **INCOME**: tx with `type='INCOME'`, single allocation `{owner=recurring.owner_type, share=100%}`. No `recomputeForTransaction` call (income doesn't drive settlement).
- **DEBT_PAYMENT**: requires `debt_id`, `debt.is_active`, `debt.current_balance > 0`, **AND `debt.currency_code === recurring.currency_code`**. On success creates the tx, a `debt_payments` row, and calls `debtsRepo.adjustBalance(debt.id, -amount)` (which existing logic auto-deactivates the debt at zero — see 0.4.4). Calls `recomputeForTransaction` so settlements stay consistent if the recurring crosses cash sources (rare in vuestro modelo: hipoteca paga JOINT, no settlement implications, but the codepath is correct).

**Skip rules for DEBT_PAYMENT:** no `debt_id` → skip silently (legacy data). Currency mismatch → skip (defensive, the form prevents this for new rows). Balance ≤ 0 → skip. Debt archived → skip. The recurring stays active throughout — when the user reactivates the debt, generation resumes automatically. We deliberately do **not** flip `auto_generate_transaction = false` programmatically.

**Form (`RecurringFormPage`) — Level 4 UX changes:**
- New `debtId` state field, loaded from `r.debt_id` on edit.
- New Section "Deuda" visible only when `type === "DEBT_PAYMENT"`. Renders a `<select>` populated from `debtsRepo.list(true).filter(d => d.currency_code === "EUR")`. Empty state when no EUR debts exist points to /debts.
- `valid` gate now includes `(type !== "DEBT_PAYMENT" || debtId !== null)`. Required field.
- Save payload includes `debt_id: type === "DEBT_PAYMENT" ? state.debtId : null` — null-clamps the field for non-debt types so a stale value can't survive a type change.
- The auto-gen Toggle is no longer gated on `type === "EXPENSE"`. Visible for all three types.

**`RecurringDetailPage` — Level 4 UX changes:**
- `canQuickFill` now includes DEBT_PAYMENT recurrings that have a `debt_id`. The sticky CTA routes to `/debts/:id/pay` (where the FX/principal flow already lives) for those; routes to `/add?fromRecurring=...` for EXPENSE as before.
- The paid/pending pill in the hero card no longer restricts to `type === "EXPENSE"`. INCOME and DEBT_PAYMENT recurrings with materialized transactions also show ✅ paid this month.
- The old "Debt payment → record from Debts" hint card is replaced by a more focused "Sin enlace a deuda → Enlazar" card, visible only when `isDebt && !debt_id`. Tap routes to the edit page with the picker available.
- Income recurrings still have **no quick-fill CTA** — there's no "mark income received" UX in scope. Their badge updates automatically when auto-gen materializes the tx.

**`RecurringPage` (list) — Level 4 UX changes:**
- The Row component's `paid` prop is now wired for all three sections (incomes + expenses + debt payments), not just expenses. Auto-gen + materialization → ✅ check icon on the row icon for any type.
- The "X € pagado de Y € esperado" progress bar in the totals card still only counts EXPENSE recurrings. Extending it to expenses+debt_payments would change the spec for what "outflow paid" means; deferred — the row checks already convey the per-recurring state.

**Scope decisions captured for the next agent**
- **Same-currency recurring debts.** The form filters the picker by the recurring's own currency; the generator double-checks `debt.currency_code === recurring.currency_code`. Recurring is hardcoded EUR today, so the visible effect is "EUR debts only" — but the *rule* is same-currency. If we ever support cross-currency recurring auto-gen, we'd need to (a) capture/stash an exchange rate per recurring (mentira contable: never matches the real-day rate), or (b) generate as DRAFT and require user confirm with rate. Not worth the complexity for one USD loan today.
- **Debt-linked recurring's quick-fill routes to PayDebtPage**, not to /add. That's where the FX flow lives. The amount isn't prefilled via query param — PayDebtPage manages its own state. Adding `?amount=` prefill is a 10-line addition if friction emerges.
- **Income still has no manual quick-fill flow.** If you set up an INCOME recurring with auto_generate=false, you'll never get an "easy register" path. Workaround: enable auto_generate. If a "mark received" UX is wanted later, it lives in this same DetailPage area.
- **`auto_generate_transaction` for DEBT_PAYMENT without `debt_id` is silently ignored.** The generator's `if (!r.debt_id) continue` handles it. No console warning — legacy data shouldn't shout at the user. The DetailPage's "Sin enlace a deuda" hint is the visible nudge.
- **Settlements A-E untouched.** The Level 4 changes only added new code paths (DEBT_PAYMENT auto-gen, INCOME auto-gen); existing settlement_ledger logic was not modified. All five reference cases pass without changes.

**i18n.** Added `recurring.fields.debt`, `debtChoose`, `debtEmpty`. Replaced `recurring.debtHint.*` (the old "go to /debts" hint) with `recurring.debtUnlinked.{title,body,cta}` ("Sin enlace a deuda → Enlazar"). Both `es.json` and `en.json` updated.

**Tests** — `src/lib/calculations/__tests__/autoGenerate.test.ts` grows from 11 to 17 cases. Updated cases: "INCOME generates" (was "INCOME skipped" in Level 3), "DEBT_PAYMENT without debt_id skipped" (was conflated with INCOME). New cases: DEBT_PAYMENT materializes + decrements balance, skips on currency mismatch, skips on balance ≤ 0, skips on archived debt, auto-deactivates debt when last payment zeroes balance. Test fixture updated to accept `debt_id` and `currency_code` overrides. Full suite: 220/220 green. `pnpm exec tsc -b` clean. `pnpm build` succeeds.

**Files touched**: `src/lib/db/migrations.ts`, `src/lib/db/types.ts`, `src/lib/db/repositories/recurring.ts`, `src/lib/sync/{tabs,writers,readers,pull}.ts`, `src/lib/sync/__tests__/sync.test.ts`, `src/lib/calculations/autoGenerate.ts`, `src/lib/calculations/__tests__/autoGenerate.test.ts`, `src/features/recurring/RecurringFormPage.tsx`, `src/features/recurring/RecurringDetailPage.tsx`, `src/features/recurring/RecurringPage.tsx`, `src/lib/i18n/{en,es}.json`, `package.json`.

**End of the recurring era (0.4.7 → 0.5.0).** What started as "let me at least prefill the /add form" (Level 1, 0.4.7) ends with three different flows that all converge through one mechanism: a recurring with `auto_generate=true` materializes monthly, the linked debt drops principal, the user sees ✅ in /recurring without lifting a finger. Minor bump to 0.5.0 marks the completion — the recurrings module is now end-to-end coherent, not a forecast-only side feature.

---

## 2026-06-25 — Version 0.4.9: Recurring Level 3 — auto-instantiation on boot

Third and final level of the recurring rollout. The `auto_generate_transaction` flag — dead code since Phase 4 — finally does something. On every app boot, each active EXPENSE recurring with the flag set materializes a CONFIRMED transaction for the current month if one doesn't already exist. The Recurring page ✅/⨯ badges from Level 2 light up automatically without manual taps.

**Decisions cementadas durante la conversación de diseño:**
1. **CONFIRMED, no DRAFT.** Considered a DRAFT/CONFIRMED state column for safety (auto-confirmed tx with wrong amount would shift settlements before the user reviewed). Rejected on simplicity grounds: this is a 2-user app, the flag is opt-in per recurring, soft-delete cleanly reverses any bad generation. Adding `status` later is a trivial migration if real-world friction shows up. Net: no new column, no UI for "confirm", no filter in aggregations. The materialized tx is indistinguishable from a manual one.
2. **Date = day 1 of the current month.** `recurring_items` has no `payment_day` column. Considered deriving from `start_date.day` with clamp for short months, considered adding `payment_day`. Punted both — the date isn't load-bearing, and day-1 gives a stable anchor that's trivially explained. If `payment_day` ever materializes as a real UX need, swap `firstOfMonth(monthKey)` for it.
3. **Current month only, no catch-up.** Considered iterating from last-seen-month to current, generating drafts for missed months. Rejected on two grounds: (a) the algorithm needs a stateful marker (`auto_gen_from`) per recurring to avoid backfilling 24 months when activating the toggle on an old recurring; (b) user confirmed it's unlikely to skip months in real use. The rule "if no tx exists for (recurring_id, currentMonthKey), generate" is stateless and idempotent. If real-world catch-up gaps appear, we add a focused mini-feature with the right marker.
4. **Toggle activates immediately.** Saving the form with `auto_generate=ON` calls `autoGenerateForCurrentMonth()` right after the repo write. The user sees the materialized tx without waiting for the next boot. Idempotent — the same boot-time call would also handle it.
5. **Aggregations refactor = one NOT-EXISTS clause, not a full re-architecture.** First-pass design feared a deep refactor of `recurringForScope` interacting with `expensesForScope` and the settlement ledger. Reality is contained: the only double-count risk is a recurring with `auto_generate=1` being summed BOTH from `recurring_items.amount` AND from the materialized transaction's amount. Adding `AND NOT (r.auto_generate_transaction = 1 AND EXISTS(...))` to the three branches of `recurringForScope` solves it. Settlement ledger is untouched — those queries already operate on transactions, and a materialized tx is just a regular tx. The five reference cases (A–E) in `settlements.test.ts` passed without modification.

**New module — `src/lib/calculations/autoGenerate.ts`.**
- Exposes `autoGenerateForCurrentMonth(): string[]` returning the IDs of recurrings that produced a tx in this run.
- Pure SQL + repo calls — no React, no async. Runs synchronously inside the boot pipeline.
- Loops over `is_active=1 AND auto_generate_transaction=1 AND type='EXPENSE'`. For each, checks `EXISTS (SELECT 1 FROM transactions WHERE recurring_id = r.id AND month_key = currentMonthKey)` — **does NOT filter by is_deleted**, on purpose. A user who soft-deleted the auto-gen this month wants it gone permanently for that month; checking only non-deleted would regenerate it next boot.
- Uses `expenseAllocator` for allocations (so the math is the same as a manual /add) and calls `recomputeForTransaction` so settlement_ledger stays consistent. In Fran+Sam's real usage, recurrings will almost never have source≠owner mismatch (alquiler/hipoteca/gym paid from JOINT with owner=HOUSEHOLD → no settlement effect), but the codepath is correct if they ever do.
- `origin: "RECURRING_GENERATED"` distinguishes these from manual transactions in /transactions and provides a future hook for filtering.
- Skips silently on `source_account_id = NULL` or unknown account ID — the recurring is too incomplete to materialize, and throwing would block boot.

**Wired in `AppBoot.tsx`** after `seedIfEmpty()` and before `setReady`. A `console.info` reports the count when work is done (debug-friendly without being noisy on idle boots).

**`recurringForScope` refactor in `aggregations.ts`.** Three branches (personal/household/all) gain `AND NOT (r.auto_generate_transaction = 1 AND EXISTS (SELECT 1 FROM transactions t WHERE t.recurring_id = r.id AND t.month_key = ? AND t.is_deleted = 0))`. The `is_deleted = 0` inside the EXISTS is important and different from the generator's check: in aggregations, a soft-deleted tx must "fall back" the recurring into the forecast bucket (the math says "no real expense, just the forecast"); in the generator, a soft-deleted tx is the user's explicit "skip this month" and shouldn't regenerate. Two different semantic decisions encoded in two different `is_deleted` filters — intentional.

**Signature change: `recurringForScope(scope)` → `recurringForScope(monthKey, scope)`.** Needed because the new clause references the current month. The only caller is `monthlySummary`, which already takes `monthKey`, so the upgrade is local.

**`RecurringFormPage` updates.**
- New state field `autoGenerate: boolean` (was hardcoded to `false` in the payload). Loaded from `r.auto_generate_transaction` on edit.
- New Section "Auto-generar" (visible only when `type === "EXPENSE"`) with the same Toggle pattern as `autoInclude`. Hint text explains "Cada mes registramos la transacción automáticamente al abrir la app."
- The save handler force-defaults `auto_generate_transaction: state.type === "EXPENSE" ? state.autoGenerate : false`. Even if someone toggles the flag and then switches type to INCOME, we don't persist `true` on a non-EXPENSE.
- After saving with the flag on, `autoGenerateForCurrentMonth()` runs immediately. The form navigation continues to the Detail page (edit) or back to /recurring (new), where the Level 2 ✅ badge appears instantly.

**Scope decisions captured for the next agent**
- **Type=EXPENSE only.** INCOME and DEBT_PAYMENT recurrings don't auto-generate. Income has no "mark received" UX yet; debt-payment recurrings would need a `recurring_id` plumbed through `debt_payments` and `PayDebtPage`, which is a separate Level (probably Level 4 if we ever do it).
- **The form's Toggle is hidden for non-EXPENSE.** Even though the schema supports the flag on any type, exposing it for income/debt would invite users to set up flows that don't do anything.
- **Soft-delete semantics differ by callsite.** Generator: ignores `is_deleted` (any tx-ever = skip). Aggregations: counts `is_deleted=0` only (soft-deleted falls back to forecast). Documented in this entry so future edits don't naively "unify" them.
- **No `last_auto_gen_month_key` setting.** All state lives in `transactions`. If a future feature needs per-recurring "since when does auto-gen apply" (e.g. backfill control), add `recurring_items.auto_gen_from TEXT NULL` then.

**i18n.** Added `recurring.fields.autoGenerate`, `autoGenerateLabel`, `autoGenerateHint` in both `es.json` and `en.json`.

**Tests** — new `src/lib/calculations/__tests__/autoGenerate.test.ts` (11 cases): generator materializes for active EXPENSE+auto_gen, idempotent on re-run, skips when a tx already exists (even soft-deleted), skips archived recurrings, skips items with auto_generate=0, ignores INCOME and DEBT_PAYMENT types, skips items with `source_account_id=null`, sets date to day-1 with origin=RECURRING_GENERATED, plus the three aggregations-companion cases (forecast counted once when no auto-gen, materialized tx not double-counted, soft-deleted materialized tx falls back to forecast). The seed has pre-existing transactions/recurrings for the current month so the aggregation tests use delta-from-baseline assertions instead of absolute amounts. Full suite: 214/214 green. `pnpm exec tsc -b` clean. `pnpm build` succeeds.

**Files touched**: `src/lib/calculations/autoGenerate.ts` (new), `src/lib/calculations/aggregations.ts`, `src/lib/calculations/index.ts`, `src/lib/calculations/__tests__/autoGenerate.test.ts` (new), `src/app/AppBoot.tsx`, `src/features/recurring/RecurringFormPage.tsx`, `src/lib/i18n/{en,es}.json`, `package.json`.

**Closes the recurring era (0.4.7–0.4.9).** What started in 0.4.7 as "let me at least prefill the form" lands as a real workflow: a domiciled recurring with auto-gen on never needs a tap. The remaining ⨯ in /recurring after this ships will be the recurrings the user explicitly hasn't auto-gen'd — i.e. things they want to confirm month by month.

---

## 2026-06-25 — Version 0.4.8: Recurring Level 2 — paid/pending state per month

Second of three planned levels for the recurring rollout. With 0.4.7 (Level 1) live, the quick-fill CTA now also writes a `recurring_id` foreign key on the created transaction, and the Recurring screens light up with a paid/pending indicator for the current month. Forecast aggregation (`recurringForScope` in `aggregations.ts`) is deliberately untouched — that conversation happens in Level 3.

**Schema (migration v5).** `ALTER TABLE transactions ADD COLUMN recurring_id TEXT NULL REFERENCES recurring_items(id)` + `CREATE INDEX idx_transactions_recurring ON transactions(recurring_id, month_key)`. No FK cascade — historical transactions intentionally outlive a (soft-)deleted recurring so the audit trail survives. The `Transaction` type gained `recurring_id: string | null`. `transactionsRepo.create` accepts and persists the field; `update` deliberately doesn't expose it (same narrowing rationale as `categories.update` in 0.4.6 — relinking via edit is its own feature, not part of the generic update API). No backfill UI for pre-v5 transactions — see "scope decisions" below.

**Decision rescued mid-implementation: append `recurring_id` at the END of the sheet row, not mid-row.** First pass inserted it between `amount_in_debt_currency` and `created_at`, which shifted the index of `created_at` and `updated_at` for the reader. The defensive `row[i] === undefined ? null : str(row[i])` check would have caught only the new sheet shape — on a legacy pre-v5 sheet (19 cells), row[17] would have been the pre-v5 `created_at` (a non-empty string), so the reader would have parsed it as `recurring_id` and then read the legacy `updated_at` as `created_at`. Off-by-one disaster on first pull from an older device. Fix: column goes at index 19 (after `updated_at`); legacy rows have no cell there, `undefined → null`, every other index keeps its meaning. Categories' is_active landed cleanly in 0.4.6 because it was already at the end of the row; the rule is now explicit: **additive sync columns go at the end, period.** Reader, writer, and `tabs.ts` headers updated in lockstep.

**Sync pipeline (4 sites, same pattern as 0.4.6's `is_active`):**
- `tabs.ts` headers append `"recurring_id"` after `"updated_at"`.
- `writers.ts/transactionToRow` appends `t.recurring_id` last.
- `readers.ts/parseTransaction` reads `row[19] === undefined ? null : str(row[19])`.
- `pull.ts insertTransaction` and `updateTransaction` both write the column. INSERT statement adds `recurring_id` ahead of `created_at` to keep the column groupings readable in SQL; UPDATE adds it to the SET list before `updated_at = ?`.

**Repo queries:**
- `recurringRepo.isPaidForMonth(id, monthKey): boolean` — scalar `COUNT(*) > 0` against transactions with `recurring_id = ? AND month_key = ? AND is_deleted = 0`. Used by the Detail page.
- `recurringRepo.paidStateForMonth(monthKey): Map<id, {count, totalAmount, lastDate}>` — single GROUP BY query for the whole list page; absence from the Map means unpaid. The DEV branch emits a `console.warn` when `count > 1` for a given recurring in a month (a deliberate dev-only signal that the user double-tapped the quick-fill — UI still shows a single ✅, see Q2 decision below).

**UI — `RecurringPage`:**
- Per-row indicator. EXPENSE recurrings get a positive-toned check icon (`Check` from lucide, green-on-green) when paid this month, replacing the type icon background. Pending rows keep the original red `ArrowUp` look. INCOME and DEBT_PAYMENT rows ignore the paid state entirely (see scope below).
- Totals card grows a paid-progress strip: `t-eyebrow` "Pagado este mes" left-aligned, "X € de Y €" right-aligned, both above a 1.5px bar filling `paidThisMonth / expectedExpenses` × 100 (clamped to 100). The strip only renders when there's at least one EXPENSE recurring — the empty-strip case looked junky on tablets with only income recurrings set up.
- Month source: `currentMonthKey()` (always real-time-now), not `uiStore.monthKey` from Home. The page has no month picker; we'd be inviting confusion if Home's selected month silently leaked here.

**UI — `RecurringDetailPage`:**
- New paid-state strip in the hero card, between the header pill row and the amount. Green `Check` + "Pagado este mes" + "Último pago: 15 jun" subtitle when paid; grey `Clock` + "Pendiente este mes" when not. Date formatting uses the same `toLocaleDateString` helper shape as `DebtDetailPage`.
- Only shown when `type === "EXPENSE" && is_active` — see scope decisions.

**Quick-fill wire-up.** `AddExpensePage` passes `recurring_id: fromRecurringId` to `transactionsRepo.create` whenever the `?fromRecurring` query param is set. Single-line change, but it's the load-bearing link between Level 1 and Level 2 — without it, the new badges never fire even after a save through the quick-fill CTA.

**Aggregations untouched.** `recurringForScope` (the function that feeds Home's "expected outflow") still sums from `recurring_items WHERE is_active = 1 AND auto_include_in_projection = 1`. We do **not** count generated transactions as forecast contributions in Level 2 — the docstring at the top of `aggregations.ts` already warns that flipping to that approach is a Level 3 concern (it kicks in when `auto_generate_transaction = true` actually starts producing transactions, which it doesn't yet). Reference settlement cases A–E still pass without modification.

**Scope decisions captured for the next agent**
- **Paid/pending applies only to `EXPENSE` recurrings.** Income recurrings have no "mark received" UX (you'd record an income tx via /add → category INCOME, which doesn't pass through any recurring CTA today). DEBT_PAYMENT recurrings *also* have no UX for it because /add is an expense flow and there's no `recurring_id` on `/debts/:id/pay` yet. If we ever want either flow, it's a Level 3-ish addition — a small one for income, a slightly bigger one for debt-payments (needs a `recurring_id` plumbed through `PayDebtPage`).
- **Duplicate-payment behavior: ≥1 satisfies the badge.** The list and the detail strip both show ✅ when there's at least one tx in the month; a DEV-only `console.warn` fires when the GROUP BY count exceeds 1. We don't visualize the duplicate, don't prevent it, don't ask for confirmation. Rationale: the case "I really did pay twice this month" is a legitimate real-world thing; paternalistic confirms get tired fast in a 2-user app. (Alt path B "counter pill" and C "preflight confirm" both considered; B was visually noisy and C was paternalistic.)
- **No backfill UI** for pre-v5 transactions. Transactions created before this migration have `recurring_id = NULL`, which means the user's history of past months will show those recurrings as ⨯ in the months they were actually paid. We accept this for two reasons: (1) the badge is most useful for "did I pay *this* month", not retrospective audit; (2) the gap self-corrects within a month of normal use. If a "link this transaction to a recurring" picker becomes valuable later, it lives in `EditExpensePage` and the schema is ready.
- **Aggregation semantics deliberately unchanged.** The presence of `recurring_id` does NOT shift the forecast math. Read the top docstring of `src/lib/calculations/aggregations.ts` before touching it in Level 3.

**i18n.** Added `recurring.paidThisMonth`, `pendingThisMonth`, `lastPaidOn`, `paidProgress`, `paidOfExpected`. Both `es.json` and `en.json` updated.

**Tests** — `src/lib/db/repositories/__tests__/recurring.test.ts` grows from 3 to 8 cases (the new paid-state queries: never paid → false, paid → true with month-isolation, soft-deleted-only tx → unpaid, GROUP BY aggregate over multiple txs and a multi-recurring month, ignore-transactions-without-recurring_id). `src/lib/sync/__tests__/pull.test.ts` adds two regression tests: legacy pre-v5 row (19 cells) defaults `recurring_id` to null AND preserves the timestamp indices correctly, plus a round-trip with `recurring_id = "rec-1"`. The pre-existing pull/sync transaction fixtures were updated to include `recurring_id` at the end of the literal so the `Transaction` shape stays valid. Full suite: 203/203 green. `pnpm exec tsc -b` clean. `pnpm build` succeeds.

**Files touched**: `src/lib/db/migrations.ts`, `src/lib/db/types.ts`, `src/lib/db/repositories/transactions.ts`, `src/lib/db/repositories/recurring.ts`, `src/lib/sync/tabs.ts`, `src/lib/sync/writers.ts`, `src/lib/sync/readers.ts`, `src/lib/sync/pull.ts`, `src/features/add-expense/AddExpensePage.tsx`, `src/features/recurring/RecurringPage.tsx`, `src/features/recurring/RecurringDetailPage.tsx`, `src/lib/db/repositories/__tests__/recurring.test.ts`, `src/lib/sync/__tests__/pull.test.ts`, `src/lib/sync/__tests__/sync.test.ts`, `src/lib/i18n/{en,es}.json`, `package.json`.

---

## 2026-06-25 — Version 0.4.7: Recurring Level 1 — quick-fill from a recurring

First of three planned levels for closing the gap between "recurring as forecast" and "recurring as a real workflow". Today: registering this month's payment of a recurring is one tap, with amount/source/owner/category/split prefilled from the recurring's defaults. Levels 2 (paid/pending state per month, with `transactions.recurring_id`) and 3 (auto-instantiation behind the `auto_generate_transaction` flag) are deliberately out of scope.

**Architecture decision: introduced `RecurringDetailPage`** instead of bolting the CTA onto `RecurringFormPage`. The form was previously serving double duty as "edit" and "view" via `/recurring/:id`. With Level 2 on the horizon (paid/pending toggles, monthly state, etc.) we'd need a proper detail home anyway, so doing the refactor now costs the same as doing it in two steps later. New route shape mirrors debts:
- `/recurring` → `RecurringPage` (list, unchanged)
- `/recurring/new` → `RecurringFormPage` (unchanged)
- `/recurring/:id` → `RecurringDetailPage` (new — read-only summary, actions, sticky CTA)
- `/recurring/:id/edit` → `RecurringFormPage` (was `/recurring/:id`)

**`RecurringDetailPage`** (new) — header with back chevron + edit pencil (→ `/edit`), hero Card with avatar/name/type+monthly+archived pills/amount in the recurring's accent color (`positive-ink` for income, `text-primary` for expense), summary row of source/owner/category labels, an "Acciones" Card mirroring the debts pattern (Archive when active, Reactivate when archived), and the sticky CTA at the bottom: **"Registrar pago de este mes"** → navigates to `/add?fromRecurring=<id>`. For DEBT_PAYMENT recurrings the CTA is suppressed and replaced with an inline hint Card linking to `/debts`, because `/add` is the expense flow and there's no recurring→debt FK yet (a Level 3 concern). For INCOME the CTA is also hidden — you don't "pay" income, you just receive it. Archived items get a ghost-style "Reactivar recurrente" sticky in place of the violet CTA, matching `DebtDetailPage`.

**`RecurringFormPage`** — on edit-mode save, now navigates to `/recurring/${id}` (the new detail page) instead of `/recurring`. New-mode save still goes to `/recurring` because there's nowhere else useful to land. Deactivate still goes to `/recurring` since the item is now hidden from the active list.

**`AddExpensePage`** — reads `?fromRecurring=<id>` via `useSearchParams`. Effect on `dbReady + fromRecurringId` loads the recurring and prefills `amountText`, `source` (via `accountIdToCashSource`), `owner`, `splitFranPercent` (from `default_shared_split_percent` when owner=HOUSEHOLD), and `categoryId`. **Date stays "today"** — the user types the actual paid date if it differs, which is the modal case. Setting `userTouchedCategoryRef.current = true` before the prefill ensures the existing pattern-tracker effect (`source/owner/split` → smart-suggest category from `lastUsed`) doesn't immediately clobber the recurring's category. On save, when `fromRecurring` is present, navigates back to `/recurring/${id}` (the detail page) instead of Home — closes the loop nicely.

**`recurringRepo.reactivate(id)`** (new) — mirrors the `deactivate` shape: flips `is_active = 1`, bumps `updated_at`, enqueues an UPDATE sync row. Symmetric with `categoriesRepo.reactivate` and `debtsRepo.reactivate`. Without this method the Detail page's "Reactivate" actions had no repo to call.

**Scope decisions captured for the next agent**
- The Detail page does not yet hard-delete a recurring. Today, soft-delete (Archive) is the only destruction path. If hard-delete ever becomes a requirement, mirror the debts pattern (a `Sheet side="center"` with destructive confirm and a dedicated `recurringRepo.delete(id)` method).
- The CTA is hidden for INCOME too, not just DEBT_PAYMENT. Income recurrings exist as forecast inputs ("Nómina €2.500"), not actions to confirm. If a "Mark income received" workflow ever materializes, that's its own UI — not the quick-fill flow.
- No "already paid this month" detection on the Detail page yet. That belongs to Level 2 — it needs `transactions.recurring_id`, which doesn't exist yet. The CTA today happily creates a second transaction if the user taps it twice; a `console.warn` for that case will come with Level 2.
- No new types schema: zero changes to `recurring_items`, zero changes to `transactions`. Level 1 is pure UX wiring — that's why it's shippable as a standalone increment.

**i18n** — added `recurring.detailTitle`, `editAria`, `notFound`, `backToList`, `monthlyExpected`, `actions`, `archive`, `archiveHint`, `reactivate`, `reactivateHint`, `reactivateCta`, `archivedBadge`, `quickFillCta`, plus the `debtHint.{title,body,cta}` group. Both `es.json` and `en.json` updated.

**Tests** — `src/lib/db/repositories/__tests__/recurring.test.ts` (new, 3 cases). Covers deactivate → hidden-by-default, reactivate → restored, reactivate idempotent on an already-active item. The richer paid/pending semantics (`isPaidForMonth`, soft-deleted transaction → unpaid, etc.) intentionally deferred to Level 2 where they're meaningful. Full suite: 196/196 green. `pnpm exec tsc -b` clean. `pnpm build` succeeds (RecurringDetailPage emits as a 5.36 kB chunk, 1.83 kB gzipped).

**Files touched**: `src/features/recurring/RecurringDetailPage.tsx` (new), `src/features/recurring/RecurringFormPage.tsx`, `src/features/add-expense/AddExpensePage.tsx`, `src/lib/db/repositories/recurring.ts`, `src/lib/db/repositories/__tests__/recurring.test.ts` (new), `src/app/router.tsx`, `src/lib/i18n/{en,es}.json`, `package.json`.

---

## 2026-06-03 — Version 0.4.6: Categories CRUD closes the loop + sync fixes

Companion to 0.4.4 (Debts CRUD). After auditing the codebase for the same "consumption built before construction" pattern we'd just closed in Debts, Categories popped up as the next biggest gap: edit was a hack (inline raw `UPDATE` bypassing the repo, called `updateCategoryInline`), there was no delete UI, and `categoriesRepo` was missing `update` / `softDelete` / `reactivate`. Fran took 0.4.5 to do the repo work himself old-school (commits `8f59681` + `dcfa5dc`); I followed in 0.4.6 with the UI wire-up and three bug fixes the audit surfaced.

**Schema + repo** (Fran in 0.4.5)
- Migration v4 added `is_active INTEGER NOT NULL DEFAULT 1` to the `categories` table.
- `Category` type gained `is_active: boolean`.
- `categoriesRepo` gained `update(id, input)`, `softDelete(id)`, `reactivate(id)`. `BOOL_KEYS` now includes `is_active` (necessary so rows come back as real booleans, not `0/1`).
- `list()` signature is now `list(kind?, activeOnly = true)`; default filters by `is_active = 1` and explicit `false` returns archived too.
- `CategoryFormPage` swapped its inline SQL hack for a clean `categoriesRepo.update(id, payload)` call. Dead code from the abandoned refactor (the `if (existing) { /* comment-only block */ }`) was removed in the process.
- `CategoriesPage` now shows an "Archivadas (N)" section with the same archived-row visual we built for Debts: `opacity-60 grayscale` plus a green "Archivada" pill in place of the color dot.

**Three audit bugs caught between 0.4.5 and 0.4.6**
- **`update()` was clobbering `is_default` and `sort_order` on every form save.** The form passes only `{name, kind, color}`; the previous `update()` filled missing fields with `?? false` / `?? 0`, so editing the name of "Hogar" (seeded with `is_default=true, sort_order=1`) reset both to defaults. Two fixes weighed: full-update + carryover (the pattern we used in DebtFormPage), or limited-update where `update()` only touches form-editable fields. Picked the limited approach — new `UpdateCategoryInput { name, kind, color }` type, SQL only writes those columns + `updated_at`. Cleaner contract, impossible to clobber by mistake, and `is_active` stays out of the `update()` API surface entirely (`softDelete` / `reactivate` are the only paths that flip it). JSDoc above `update()` documents the ownership boundary so the next agent doesn't have to re-derive it. Regression test pinned in `categories.test.ts:preserves is_default and sort_order on edits`.
- **The sync pipeline didn't know about `is_active`.** Four sites: `tabs.ts` headers didn't include the column, `writers.ts/categoryToRow` didn't emit it, `readers.ts/parseCategory` didn't read it, and `pull.ts insertCategory` / `updateCategory` didn't write it. Result: a multi-device sync round-trip would clobber the archived state — Sam's pull from a sheet without the column would default everything to active again, OR (worse) if `bool(undefined)` coerced to `false` in some path, every category would get marked archived on first pull. Fixed all four. The reader uses `row[9] === undefined ? true : bool(row[9])` so legacy sheets without the column default to active, never to archived.
- **Trailing newline missing** in `categories.ts` after Fran's manual edits. Cosmetic but POSIX-y. Fixed.

**UI completion** (0.4.6)
- `CategoryFormPage` loads `c.is_active` into local state on edit.
- When the category is archived, a green "Archivada" pill sits next to the title in the header.
- New "Acciones" section (edit mode only) below the color picker:
  - Active → Archive row with `window.confirm(t("categories.confirmArchive"))`, then `softDelete` + bump + navigate back to `/categories`.
  - Archived → Reactivate row (no confirm, non-destructive), then `reactivate` + bump + navigate.
- Local `ActionRow` component mirrors the pattern from `DebtDetailPage`, minus the danger variant since categories deliberately have no hard-delete (decided after a short discussion: blocking delete when transactions reference a category is "more restrictive, not more professional"; soft delete preserves both UX and historical integrity without any caller having to ask "can I delete this?").

**i18n** — `categories.actions`, `categories.archive`, `categories.archiveHint`, `categories.reactivate`, `categories.reactivateHint`, `categories.confirmArchive`, `categories.archivedHeader_one`/`_other`, `categories.archivedBadge`. Both locales updated.

**Tests** — `src/lib/db/repositories/__tests__/categories.test.ts` (11 → 12 cases). New: `list()` default-active filter, `activeOnly=false` returns archived, kind + active filter together, `is_active` comes back as boolean (the BOOL_KEYS regression), softDelete/reactivate round-trip, transactions referencing an archived category still resolve, `update()` changes name/kind/color, `update()` preserves `created_at`, `update()` advances `updated_at`, `update()` doesn't reactivate by accident, and the new Bug-1 regression test pinning `is_default` + `sort_order` preservation. Full suite 193/193 green.

**Scope deliberately left out** (notes for whoever comes next)
- No hard-delete option for categories. The discussion concluded soft delete handles the real use case ("stop using this category for new expenses") without losing historical context. If we ever want hard delete, the gating logic — only allow if no transactions reference the category — is documented in this session's transcript.
- The `update()` API surface is now narrow on purpose. If `sort_order` ever becomes user-editable (drag-to-reorder), it should get its own `reorder(id, sortOrder)` method on the repo, not get folded back into `update()`. Same for `is_default` ("mark as default") — dedicated toggle, not part of the name/color edit flow.

**Files touched** (across 0.4.5 + 0.4.6): `src/lib/db/migrations.ts`, `src/lib/db/types.ts`, `src/lib/db/repositories/categories.ts` (+ tests), `src/lib/sync/tabs.ts`, `src/lib/sync/writers.ts`, `src/lib/sync/readers.ts`, `src/lib/sync/pull.ts`, `src/features/categories/CategoriesPage.tsx`, `src/features/categories/CategoryFormPage.tsx`, `src/features/recurring/RecurringFormPage.tsx`, `src/lib/i18n/{en,es}.json`.

---

## 2026-06-02 — Version 0.4.4: Debts CRUD finally closes the loop

Sam reported the `+` button on `/debts` did nothing. Auditing showed it had been a placeholder without an `onClick` since the very first Phase 7 commit (`b7aff59`, 2026-05-04). The audit also surfaced a deeper hole: there was no `NewDebtPage` or `EditDebtPage` at all, no routes for them, and `debtsRepo` had no `softDelete` or `delete` method. Debts you could see, list, pay, but never create, edit or remove from the UI — the seed data was your only source of debts. Same "consumption built before construction" pattern that already bit us in categories (still pending — Fran takes that one). Logged the audit of every other suspected gap in this conversation; for `accounts` the answer was "by design" (three fixed enum-backed accounts per spec §11.9), no fix needed.

This release closes the debts loop top-to-bottom.

**`src/lib/db/repositories/debts.ts`** — three new methods and a behavioral upgrade to one existing one:
- `deactivate(id)` — soft delete via `is_active = 0`. Reversible. Mirrors `recurringRepo.deactivate`.
- `reactivate(id)` — undoes deactivate. Does NOT re-trigger auto-deactivate even if balance is still zero — reactivating a paid-off debt is a legitimate "taking on this loan again" gesture.
- `delete(id)` — hard delete with cascade to `debt_payments` (inside a transaction). The original `transactions` rows survive in the user's history; settlement_ledger entries already computed off those transactions stay intact too. Enqueues a `DELETE` sync row per cascaded payment plus one for the debt itself.
- `adjustBalance(id, delta)` now auto-deactivates the debt when the resulting balance drops to ≤ `ZERO_BALANCE_EPS` (0.005). Guards against float-drift residuals on FX-converted payments leaving something like `0.0000003` that exact-zero comparison would miss.

**`src/features/debts/DebtFormPage.tsx`** (new) — single component serving both `/debts/new` and `/debts/:id/edit` (modeled on `RecurringFormPage`). Fields: name, owner, currency (`EUR`/`USD` segmented control), original amount, current balance, minimum payment (optional), payment day 1-31 (optional), notes (optional). The three non-form fields — `interest_rate`, `strategy_priority`, `is_active` — are preserved verbatim on edit via a `carryover` state slice. **Currency is locked on edit** — a read-only card replaces the segmented control with a "Bloqueada" pill and a hint explaining that re-interpreting currency on an existing debt would break stored payments and FX rates. To switch currency you delete and re-create.

**`src/app/router.tsx`** — registered `/debts/new` and `/debts/:id/edit`. Route order matters because React Router v7 already prioritises static segments over `:id`, so `/debts/new` resolves before `/debts/:id`.

**`src/features/debts/DebtsPage.tsx`** — the `+` button got its `onClick → navigate("/debts/new")`. Empty-state button got wired the same way. The list now fetches `list(false)` and splits into `active` / `archived` in-memory. Active section renders all the previous cards (totals, by-owner, monthly minimum) — but only when there are active debts; the cards collapse cleanly if you only have archived ones. Archived section sits below with a `t("debts.archivedHeader")` eyebrow, rendering the same `DebtRow` with `archived={true}` which applies `opacity-60 grayscale` and swaps the currency pill for a green "Pagada" / "Paid off" pill.

**`src/features/debts/DebtDetailPage.tsx`** — pencil icon in the header → `/debts/:id/edit`. New "Acciones" section above the sticky CTA: a flat Card with two rows. Active debts get [Archive] + [Delete forever]; archived debts get [Reactivate] + [Delete forever]. The CTA button itself flips dynamically: violet "Pagar deuda" for active, ghost-style "Reactivar deuda" for archived. The archived state also shows a green "Pagada" badge next to the currency pill in the hero card. Delete uses the `Sheet` component in `side="center"` modal mode with a destructive confirm: title interpolates the debt name ("¿Eliminar 'Préstamo coche'?"), description spells out that the transactions remain in history but lose the debt reference, primary action is expense-red.

**Tests** — `src/lib/db/repositories/__tests__/debts.test.ts` (new, 9 cases). Covers: deactivate hides from default list, reactivate restores, reactivate does NOT auto-deactivate even at zero balance, auto-deactivate fires on exact zero, auto-deactivate fires on sub-epsilon residual (`0.003`), no auto-deactivate while there's real balance, adjusting an already-inactive debt doesn't break, hard delete removes the debt row, hard delete cascades to `debt_payments` but leaves the source `transactions` intact. Full suite: 181/181 green.

**i18n** — full `debts.form.*`, `debts.deleteConfirm.*`, plus `debts.archivedHeader`, `archivedBadge`, `editAria`, `actions`, `archive`, `archiveHint`, `reactivate`, `reactivateHint`, `reactivateCta`, `deleteForever`, `deleteForeverHint`. Both `en.json` and `es.json` updated together.

**Scope decisions captured for the next agent**
- Currency selector is `EUR`/`USD` only — those are Fran and Sam's two real currencies. Adding more is a one-line change in `currencyOptions` if needed later.
- Three delete modalities coexist: auto on full payment, manual "Archivar" (reversible), and hard "Eliminar definitivamente" (irreversible). The user explicitly asked for all three after I initially proposed only soft.
- Hard delete cascades to `debt_payments` rather than nulling them out or snapshotting the debt name onto each payment. Simpler, fits a two-user app. If we ever start preserving "which deleted debt did this tx pay off" metadata in `transactions`, the snapshot option is documented in this entry as a fallback.
- `interest_rate`, `strategy_priority`, and `notes` weren't in scope for the new-debt form (only the minimal set + the two practical optionals `minimum_payment` and `payment_day`). The form preserves them on edit via a `carryover` state. To set `interest_rate` for the first time today, you'd have to edit a debt that already has one or do it via DB.

---

## 2026-06-02 — Version 0.4.3: local dev with backend functions (`pnpm dev:local`)

Fran wanted to test the "Connect with Google" flow in local dev on his laptop. With just `pnpm dev` (Vite only), every `/api/auth/*` call 404'd because Vite doesn't know about the `api/` folder. The fix turned out to need three independent pieces, and the debugging session surfaced an interesting Upstash heads-up too.

**New: `pnpm dev:local` script.** Runs `vercel dev --listen 5173`, which boots Vite under the hood AND serves the `api/` functions on the same port — so the local app at `http://localhost:5173` works end-to-end including auth, matching the redirect URI Fran already had registered in Google Console. The script also pre-sources `.env.local` into the shell (`set -a && . ./.env.local && set +a`) because of the env-var quirk below.

**Removed: SPA fallback rewrite in `vercel.json`.** The explicit `"rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]` block was rewriting every Vite dev-mode module path (`/main.tsx`, `/@react-refresh`, `/manifest.webmanifest`) to `/index.html`, which made the browser receive HTML when it asked for JS/JSON. The page would render blank with 500s in the console. Removed the block entirely — `framework: "vite"` already gives us the SPA fallback in production automatically. Verified post-deploy: `https://adultingapp.vercel.app/settings` loads fine from a cold URL bar, so the auto-fallback works.

**Added: `pnpm-workspace.yaml`** with `onlyBuiltDependencies: [esbuild]`. pnpm 10+ refuses to run `postinstall` scripts unless explicitly allowed; `esbuild` needs its postinstall to fetch the platform binary. Without this, `pnpm install` errored on a clean checkout. Tried `package.json` `"pnpm"` field first (deprecated in v10+) and the `pnpm-workspace.yaml` `allowBuilds: { esbuild: ... }` shape (wrong key) before landing on `onlyBuiltDependencies` as a list.

**Debug rabbit holes worth remembering**
- First failure on `vercel dev --listen 5173` was a port collision: Vercel CLI was assigning Vite the same port (5173), so two Node processes ended up bound — Vercel on `*:5173`, Vite on `[::1]:5173`. macOS resolves `localhost` IPv6-first, so requests went to Vite (returning either the SPA HTML or the raw `.ts` source for `/api/*` paths) and never hit Vercel's function router. Killing both processes and starting fresh fixed it; Vercel picked a random free port for Vite the second time. If this resurfaces: `pkill -9 -f vite; pkill -9 -f "vercel dev"; sleep 2; pnpm dev:local`.
- `vercel dev` does *not* inject `.env.local` into the function runtime when the linked project has no Development-target env vars defined (ours are only Production + Preview). The shell-source trick in `dev:local` works around this; the "more correct" fix would be `vercel env add … development` for each secret, but it's tedious for nine vars and we're two users.
- A Vite zombie in `[::1]:5173` from an earlier failed `vercel dev` will silently intercept all requests on subsequent attempts — same symptom as the port collision. Worth checking with `lsof -nP -iTCP:5173 -sTCP:LISTEN` whenever local dev acts weird.

**Heads-up logged here so the next agent sees it:** Upstash sent an "Inactive Database Notice" warning that the project's Vercel Marketplace KV (`upstash-kv-cobalt-anchor`) hasn't received traffic in weeks and is in line to be archived. Email said one more notice before archiving, so it's still alive — but if the auth flow starts 500'ing on `kv.set(...)` calls in prod, that's the cause. Mitigations: use the app regularly on mobile (free traffic), upgrade Upstash plan, or migrate the refresh-token store to a different backend. Not urgent today, real risk later.

**Files touched:** `package.json` (script + version bump), `vercel.json` (removed rewrite), `pnpm-workspace.yaml` (new config), `README.md` (added `pnpm dev:local` to common commands and explained when to use each).

---

## 2026-06-02 — Version 0.4.2: es-ES money formatting everywhere + format module

Fran asked for the European thousand-separator format (`1.234.567,89`) everywhere money is shown, including *while typing in input fields*. Turned out the codebase had eight near-identical copies of `formatEUR` / `formatAmount` (all already producing es-ES grouping), plus three broken display sites using raw `toFixed(2)` that bypassed grouping entirely, plus four money input fields with inconsistent typing behavior.

**New module: `src/lib/utils/format.ts`** — single source of truth. Exports:
- `formatEUR(n)` — `"1.234,56 €"`.
- `formatMoney(n, currency, opts?)` — multi-currency, with optional `minimumFractionDigits` and `signDisplay`. Replaces the eight duplicated locals and the one bespoke `formatSigned` in `TransactionRow.tsx`.
- `formatRate(n, fractionDigits = 4)` — `"1,2345"`. For exchange rates (previously displayed via `toFixed(4)` in `PayDebtPage` and `DebtDetailPage`, which produced `1.2345` and looked ambiguous in an es-ES context).
- `parseAmount(text)` — robust parser; uses the *last* separator as the decimal point so both `"1.234,56"` (es-ES) and `"1,234.56"` (en-US) survive the round trip. Strips currency symbols and whitespace.
- `sanitizeAmountInput(raw)` — the key piece for the live-typing requirement. On every keystroke, strips junk, picks the last separator as decimal, drops the rest as thousand groupers, strips leading zeros (except a lone `0`), re-inserts dots every three digits in the integer part, and seeds `"0,"` when the user starts with a decimal separator.
- `formatAmountForInput(n)` — seeds an input from a stored number (`"" ` for zero so the placeholder shows).

**Fixes that came out of the centralization:**
- `PayDebtPage.tsx`: three display sites went from `${debtSymbol}${debtAmount.toFixed(2)}` (no grouping, English point) to `formatAmount(debtAmount, currency_code)` (grouping + locale-correct symbol position). Rate display went from `rate.toFixed(4)` to `formatRate(rate)`.
- `DebtDetailPage.tsx`: rate at line 162 now uses `formatRate` too.
- `SettleUpPage.tsx`: the input field was rebuilding its value from the numeric `amount` state on every render (`amount.toFixed(2).replace(".",",")`), which made it impossible to type freely — typing `"12,"` instantly re-rendered to `"12,00"`. Switched to `formatAmountForInput(amount)` for display and `parseAmount(e.target.value)` on change, matching the text-state pattern used elsewhere. Plus thousand separators while typing as a bonus.
- `TransactionForm.tsx`, `RecurringFormPage.tsx`, `PayDebtPage.tsx` inputs: same `sanitizeAmountInput` swap so the thousand dots appear live as the user types large amounts.

**Tests added: `src/lib/utils/__tests__/format.test.ts`** — 23 cases covering: display formatting (EUR/USD/GBP, negatives, custom precision, signDisplay), exchange rates, parser robustness against es-ES + en-US shapes + garbage + symbols, sanitize edge cases (multiple separators, leading zeros, lone-dot interpretation, `",5"`→`"0,5"`), and a `parseAmount(formatAmountForInput(n)) === n` round-trip across magnitudes. Full suite: 172/172 green.

**Not covered by automated tests** (mobile-only verification): caret position when editing inside the number (separators jumping mid-edit) and that the platform numeric keypad behaves correctly on iOS/Android. Pre-existing inputs had the same caret limitation; this change doesn't make it worse, but worth re-checking on device.

**Files touched (12 + 1 new):** `format.ts` (new), `format.test.ts` (new), `TransactionForm.tsx`, `SaveFab.tsx`, `HomePage.tsx`, `DebtsPage.tsx`, `DebtDetailPage.tsx`, `PayDebtPage.tsx`, `SettleUpPage.tsx`, `RecurringFormPage.tsx`, `RecurringPage.tsx`, `SettlementsPage.tsx`, `AccountsPage.tsx`, `SettlementChip.tsx`, `ConsequenceSentence.tsx`, `TransactionRow.tsx`.

---

## 2026-06-02 — Version 0.4.1: Add Expense form densification (Sam's buzón request)

Sam dropped a suggestion in the buzón: *"Change expense input layout. I would like all inputs to be in one view without having to scroll - for efficiency."* First pass against that, with Fran in the loop deciding each trade-off rather than batch-applying a redesign.

**Bugfix that came out of the same conversation**
- Page-level horizontal pan on Add Expense, Edit Expense and Recurring Form. Root cause: `CategoryPicker` uses `-mx-4 px-4 overflow-x-auto` so chips reach the screen edges; the page wrapper wasn't clipping, so the chip row pushed the page width past the viewport. Added `overflow-x-hidden` to all three page wrappers — chips still scroll horizontally inside their own container, the page no longer pans. Commit `93fb97d`.

**Densification of the Add Expense form** (commit `4d69211` + follow-ups)
- Removed `ConsequenceSentence` card at the bottom of the form (Fran had already deleted the JSX; cleaned the orphan import). Redundant with `SettlementChip` + the amount inside the FAB.
- Amount Card: `px-5 py-5 space-y-2` → `px-4 py-3 space-y-1.5`.
- `Section` margin between blocks: `mt-5` → `mt-4`.
- Date field promoted out of its own `Section` into a compact chip pinned to the top-right of the amount Card. Shows `"Hoy"` / `"Today"` when the date is today; otherwise a localized short date (`"30 may"`). Tap calls `inputRef.current.showPicker()` on a hidden native `<input type="date">`, with `focus() + click()` fallback for older Androids. The first attempt overlaid an opacity-0 input on a `<label>` — didn't fire reliably on iOS Safari, hence the `showPicker()` rewrite.
- Page bottom padding `pb-32` → `pb-24` to close the dead space between the last field and the sticky `SaveFab`.
- `FlowDiagram` (the source-avatar → arrow → owner-avatar block inside the amount Card): trimmed from ~110px tall to ~78px. Dropped the per-avatar top eyebrow (`"PAGADO POR"` / `"OWNER"`) because the segmented controls directly below already carry those exact labels — pure duplication. Kept the bottom label (the live selection name, e.g. `"Conjunta"` / `"Hogar"`) since that's the immediate feedback when toggling. Avatar 42 → 36, `py-3.5` → `py-2`, `gap-1.5` → `gap-1`.

**i18n**
- Added `addExpense.today` to `es.json` and `en.json`.
- Orphans left in place for now: `addExpense.flow.paidBy`, `addExpense.flow.owner`. Clean up if/when we close out the redesign.

**Still on the table for this redesign** (discussed, not yet decided)
- Description input: candidate for collapsing or moving into a row with something else, since it's optional.
- Segmented controls "Pagado por" / "Pertenece a": Sam floated the idea of a vertical slot-machine-style picker; alternatives include smaller segmented controls or fusing both into a single flow row with an arrow in the middle (which would also subsume the FlowDiagram).
- Whether to keep or further shrink the FlowDiagram.

---

## 2026-05-20 — Version 0.4.0: backend era starts (confirmed working)

`pnpm version 0.4.0`. Marks the architectural shift introduced by ADR-016: Adulting is no longer purely client-side. The original reservation of 0.4.0 for "buzón retired" gets pushed forward — introducing a backend is genuinely the larger event in the project's life, and the narrative-versioning rule says minor bumps should track eras, not features. Buzón retirement now anchored at 0.5.0 (or whenever it ships).

**Validation:** Fran re-consented once after deploy; ~1h later (when the cached access_token expired) the PWA opened with zero popup — `silentLogin()` POSTed the stored `sessionToken` to `/api/auth/refresh`, got a fresh access_token back, and continued normally. The flow works end-to-end on real iOS PWA standalone.

Two shipping-day patches that landed before this bump (so they live inside the `0.4.0` history rather than a precarious `0.3.2`):
- `ad96e9d` — added `openid` + `email` scopes so Google issues the id_token (without `openid`, no id_token; without id_token, no `sub`; without `sub`, no KV key for the refresh_token). Caught on first connect attempt against deployed backend; one-line fix.

Settings → About will read `0.4.0` after the next Vercel deploy.

**Reminder of pending follow-ups** (carrying over from the ADR-016 entry):
- Rotate `GOOGLE_CLIENT_SECRET` (the `Lmo` one briefly appeared in conversation context — defense-in-depth rotation).
- Delete the older `****JYTO` secret from Google Console.

---

## 2026-05-20 — Persistent Google auth via minimal backend (ADR-016)

**What was done**

The "Connect with Google every time I open the app" friction was structurally unfixable on the implicit OAuth flow: Google access tokens last 1h, refresh tokens are not issued to browser-only clients, and iOS PWAs in standalone mode have an isolated cookie jar that breaks GIS's silent refresh. After a long discussion ([see this session's diagnostic exchange]) we decided to introduce a minimal backend — three thin Vercel functions backed by Vercel KV — to hold refresh tokens and trade them silently for fresh access tokens. ADR-016 documents the architectural rationale.

### Server (`api/`)

- **`api/_lib/session.ts`** — sign/verify opaque HMAC-signed sessionTokens. Format `base64url(json).base64url(hmac256)`. Reads `SESSION_SECRET` lazily (not at module load) so tests can stub the env after import.
- **`api/_lib/google-id-token.ts`** — verifies a Google id_token against Google's JWKS. Uses Node's `crypto.verify` with RS256 to avoid pulling in a JWT library. Caches JWKS for 1h; refetches once on cache miss before declaring "no matching kid". Checks `aud`, `iss`, `exp`.
- **`api/_lib/google-oauth.ts`** — wraps the token endpoint at `oauth2.googleapis.com`. Two operations: `exchangeCode` (auth code → access+refresh+id) and `refreshAccessToken` (refresh → access). Plus `revokeToken` (best-effort POST to /revoke).
- **`api/_lib/kv.ts`** — thin wrapper around `@upstash/redis`. Reads both `KV_*` and `UPSTASH_*` env vars so the project survives any future move off Vercel KV. Cached client across cold starts.
- **`api/auth/exchange.ts`** — POST `{code, redirect_uri}` → exchange with Google → verify id_token → store refresh_token in KV → return `{access_token, expires_in, sessionToken, email}`.
- **`api/auth/refresh.ts`** — POST `{sessionToken}` → verify HMAC → look up refresh in KV → trade with Google → return `{access_token, expires_in}`. 401 on bad session, 404 on no stored token, 401 + KV cleanup on Google `invalid_grant` (refresh revoked).
- **`api/auth/revoke.ts`** — POST `{sessionToken}` → revoke at Google + delete from KV. Both steps best-effort; local KV deletion always runs.

### Client

- **`src/store/authStore.ts`** — added `sessionToken: string | null` with setter; included in `partialize` so it persists to localStorage. This is the durable credential that survives PWA restarts.
- **`src/lib/google/auth.ts`** — major rewrite.
  - `login()` now uses `oauth2.initCodeClient` (authorization code flow) with `ux_mode: "popup"` + `prompt: "consent"` (the `prompt=consent` is **load-bearing**: without it Google won't issue a refresh_token on subsequent grants for the same user). Callback gives us the code, we POST to `/api/auth/exchange`, store the returned access_token + sessionToken.
  - `silentLogin()` no longer involves GIS at all. POSTs the stored sessionToken to `/api/auth/refresh`. Status 401/404 → drop sessionToken locally, mark expired. Status 200 → store fresh access_token in authStore.
  - `logout()` POSTs to `/api/auth/revoke` then clears local state.
  - `getValidToken()` shape unchanged — same fallback chain (cached → silent → interactive).
- **`src/lib/google/types.d.ts`** — added GIS `initCodeClient` + `GoogleCodeResponse` types.

### Config

- **`vercel.json`** — the SPA catch-all rewrite was `{ source: "/(.*)", destination: "/index.html" }`, which would have swallowed `/api/*` routes. Changed to `{ source: "/((?!api/).*)", destination: "/index.html" }` so `/api/*` falls through to the Vercel function runtime.
- **`package.json`** — added `@upstash/redis` (`@vercel/kv` is officially deprecated since Vercel moved KV to the Upstash marketplace integration) and dev-dep `@vercel/node` for the function types.

### Tests

- **`api/__tests__/session.test.ts`** (7 tests) — roundtrip, tampered sig, tampered payload, malformed input, missing fields, base64-invalid input.
- **`api/__tests__/google-id-token.test.ts`** (8 tests) — happy path, both issuer variants, bad aud, bad iss, expired, wrong-key signature, unknown kid, non-RS256 alg, malformed JWT shape. Uses an in-memory RSA keypair generated per test; no network.
- **`api/__tests__/google-oauth.test.ts`** (7 tests) — exchangeCode happy + 400 + missing refresh + missing id, refreshAccessToken happy + revoked, revokeToken happy + best-effort.
- **`api/__tests__/handlers.test.ts`** (10 tests) — all three handlers end-to-end with mocked fetch, mocked KV (in-memory Map), mocked id-token verifier. Covers method-not-allowed, bad shape, happy path, Google rejection, revoked refresh + KV cleanup, no-stored-token.
- **Total: 149/149 passing** (was 114; +35 new).

### Migration

- **One re-consent per user** after this ships. The implicit-flow tokens cached in `authStore` don't include refresh tokens, so the first `silentLogin()` call returns `no-session-token` and falls through to interactive `login()`. After that single consent, no more popups.
- **Both old client secrets in Google Console remain active during rollout.** Once the new flow is verified working in production for ~3 days, the old `****JYTO` secret can be removed. (The currently-used `Lmo` secret should also be rotated once at end-of-cycle since it briefly appeared in conversation context.)

**Decisions** (full rationale in ADR-016)
- **Vercel KV, not Turso or Neon.** Boring tech wins for a one-click free-tier auth-only store. Migration cost is one afternoon if we ever outgrow it.
- **Confidential client (no PKCE).** GIS's `initCodeClient` doesn't expose the PKCE verifier and our `client_secret` lives server-side anyway. The `codeVerifier` field is kept optional in `exchangeCode` for any future manual PKCE flow.
- **HMAC-signed opaque token, not JWT.** No external readers, no need for JWT semantics, no library dependency.
- **`prompt=consent` mandatory** on initCodeClient. Without it Google may skip the consent screen on subsequent grants and not return a refresh_token. The exchange handler explicitly errors if refresh_token is missing.
- **Lazy env reads, not module-level constants.** `SESSION_SECRET` is read inside `requireSecret()` per call so `vi.stubEnv` works in tests. (Discovered the hard way: initial implementation captured env at module load and 12 tests failed because `beforeAll` runs AFTER top-level `await import`.)

**Open follow-ups**
- After ~3 days of stable production use: delete the old `****JYTO` Google client secret, rotate the current `Lmo` secret to a fresh #3, update `GOOGLE_CLIENT_SECRET` in Vercel.
- Consider a "proactive refresh" — refresh when the cached token has <5 min left, while the app is open, so the network roundtrip happens off the user's critical path. Not urgent: silent refresh is already invisible.
- The Vercel CLI flow for local dev (`vercel link` + `vercel env pull .env.local` + `vercel dev`) isn't documented yet. Add to README when we have it tested.

---

## 2026-05-20 — Sync batching + retry-with-backoff: fix the 429 root cause

**What was done**

Hitting `Sheets API 429` during sync triggered an audit. Diagnosis: each sync was firing ~30+ HTTP requests against the Google Sheets API (10 reads on pull, 20+ clear/update writes on push, plus header writes from `ensureRawTabs`). The per-user quota is 60 requests/minute, so a single sync already consumed ~50% of the budget; two concurrent syncs (Fran + Sam at the same time, or a focus-event burst) trivially blew past it. And there was no 429-aware retry, so the first throttled response surfaced as a hard sync error.

Fixed at the root by batching every multi-call pattern into single API calls, and added retry-with-backoff as defense-in-depth.

### Batching changes in `src/lib/google/sheets-api.ts`

New primitives, all no-op when given an empty list:
- `batchGetValues(spreadsheetId, ranges[])` → one `values:batchGet` call returning rows per range.
- `batchUpdateValues(spreadsheetId, updates[])` → one `values:batchUpdate` call with `valueInputOption: "RAW"`.
- `batchClearValues(spreadsheetId, ranges[])` → one `values:batchClear` call.
- `addSheets(spreadsheetId, titles[])` → packs multiple `addSheet` requests into one `:batchUpdate`. The original `addSheet(spreadsheetId, title)` now delegates to `addSheets`.

### Refactors in sync layer

- **`pull.ts`**: dropped `readTabRows` + `Promise.all` fan-out. `pullAll` now builds a single `ranges[]` and fires one `batchGetValues`. Empty-row filtering moved into a `stripEmptyRows` helper applied per-tab after the batch returns. **Pull: 10 calls → 1 call.**
- **`push.ts`**: rewrote the per-tab loop to accumulate `clearRanges[]` and `updates[]` arrays, then fires `batchClearValues` + `batchUpdateValues` exactly once each. **Push: ~21 calls → 2 calls.**
- **`tabs.ts`** (`ensureRawTabs`): one `addSheets` for any missing tabs (was N sequential `addSheet`), one `batchUpdateValues` for every header row (was N sequential `updateValues`). The second `getSpreadsheet` call after creates is also gone — we no longer need it because `batchUpdateValues` doesn't care about sheet IDs, only titles. **ensureRawTabs: 1 + 2N → 2 calls.**

### Retry-with-backoff in `authorizedFetch`

- Retries on **429** and any **5xx** (500, 502, 503, 504, etc.). Up to `MAX_RETRIES = 3` extra attempts = 4 total tries.
- Respects the `Retry-After` response header (seconds or HTTP-date). Falls back to exponential backoff with **full jitter**: `min(800ms * 2^attempt, 8000ms) * random(0.5, 1.0)`.
- **Does not retry on 401/403** (auth issues need a token refresh, retrying just burns quota) or other 4xx (client errors won't get better by trying again).
- Implementation note: the `sleep` function lives on a module-local `_impl` object exported via `_internal` so tests can replace it with a no-op and not pay real backoff time.

### Net effect

A full sync now fires **3–4 HTTP calls** instead of 30+. Two users syncing simultaneously fit well within 60 reqs/min/user without ever touching the retry path. If they ever do hit 429 (e.g. background services, future scope expansion), the retry layer recovers transparently within a few seconds.

### Tests

- New `src/lib/google/__tests__/sheets-api.test.ts` (15 tests, all passing):
  - Each batching primitive: no-op on empty input, request shape, response parsing.
  - Retry helpers: `shouldRetry` classification, `parseRetryAfter` for seconds + HTTP-date + bad input.
  - Retry loop (via `getValues`): retries on 429 then succeeds, retries on 503, **does not** retry on 401, gives up after `MAX_RETRIES + 1` attempts.
- Existing 99 tests untouched — `applyTab`-level reconciler tests still pass because they exercise the DB writer path directly, independent of the network layer.
- Total: **114/114 passing**.

**Decisions**
- **Batching at the root, then retry as safety net.** Either alone would have helped; both together makes sync near-immune to 429 under normal use AND robust to transient network/Google issues.
- **Full jitter, not "equal jitter" or "decorrelated jitter".** Full jitter is the simplest variant and AWS's own analysis (the canonical reference for exponential backoff strategies) shows it produces the lowest collision rate when N clients retry concurrently. With only two users this is overkill but it's also free.
- **No retry on 5xx for writes is unsafe in general** (the server might have applied the change and then died responding), but our writes are all idempotent by construction: clearValues + updateValues + batchUpdateValues all overwrite, and addSheet on a duplicate title returns 400 (which we don't retry). So 5xx retry is safe for our specific surface.
- **`sleep` mockable via `_impl`** rather than via `vi.useFakeTimers()`. Tried fake timers first; ran into a hook timeout — fake timers don't compose well with Promise microtasks in some setups. Mocking `_impl.sleep` to a no-op is one line in `beforeEach` and gives instant, deterministic tests.
- **Kept old single-range functions** (`getValues`, `updateValues`, `clearValues`, `addSheet`) as thin wrappers / standalone exports. They're still used by `month-sync.ts` and `conflicts.ts` for single-shot calls where batching would be over-engineering.

**Open follow-ups**
- `month-sync.ts` still uses single-shot `getSpreadsheet` + `duplicateSheet` (1–2 calls per month-creation). Could be folded into the main sync flow's `getSpreadsheet` call but not worth the coupling.
- If we ever add more entities (more `raw_*` tabs), pull/push call counts stay constant at 1 and 2 respectively. No more per-tab scaling concerns.
- The current quota math comfortably supports ~20 syncs/minute per user (60 / 3). If we ever hit that ceiling for real, the next move is incremental sync (only push changed rows) — but spec §10 explicitly defers that.

---

## 2026-05-13 — Version 0.3.1: first numbered release, narrative anchor

**What was done**

Until today `package.json` sat at `0.0.0` since project init; the Settings → About card was rendering that literal. Picked the first real version and committed to a narrative for future bumps.

- `pnpm version 0.3.1` — bumps `package.json`, commits, tags `v0.3.1`.
- Settings → About now reads `0.3.1`. Build date keeps auto-updating via the Vite define at build time, so the line stays meaningful between bumps.

**Decisions**
- **0.3.1, not 0.2.2 or 0.1.0 or 1.0.0.** This is a private 2-user app — semver here is narrative, not a compatibility contract with external consumers. The chosen story:
  - `0.1.x` (not retroactively tagged) = era when the spec was being implemented but the app didn't yet feel finished.
  - `0.2.x` (not retroactively tagged) = post-UI-fix era. The 2026-05-09 color contrast / SegmentedControl race / `-ink` variants pass was the moment the app stopped being "a working webapp" and started being Adulting.
  - `0.3.x` = current era, post-buzón. The feedback capture feature (`0.3.0` conceptually) and the polish wave it triggered — silent auth, AppHeader on sub-pages, sync connect 400 fix, iOS auto-zoom fix, viewport pinch-zoom decision, Sam's green letter, avatar swap, MonthSelector hide on sub-pages — all live here, landing at `0.3.1`.
  - Future: `0.4.0` when the buzón gets removed (that's a legitimate era end — "we exited feedback-capture mode"). `1.0.0` when we explicitly declare out-of-beta.
- **Strict semver vs project narrative: narrative wins.** By the letter of semver, the buzón addition was a minor feature and the polish commits since were patches. But there are no external consumers reading the version to predict breakage — the only readers are Fran and Sam, and a coherent era-based narrative tells the story better than mechanical commit-cadence increments.
- **No automated bumping (changesets / semantic-release / etc.).** Overkill for a private 2-user app. `pnpm version <bump>` on milestones is enough.
- **No SHA appended to the build line.** Considered but skipped — the build date already gives enough trazability for our scale, and adding a SHA means a `git rev-parse` step in the Vite config that complicates clean builds.

**Open follow-ups**
- When the buzón is retired, bump to `0.4.0` and remove the temporary-marked code paths.
- Next time something user-visible ships, decide consciously whether it's a patch (`0.3.2`) or a new era (`0.4.0`). No formula, just judgement.

---

## 2026-05-12 — UI polish on the train: AppHeader rollout, Sam's green letter, avatar swap

**What was done**

Four small commits Fran made on a train ride (`baa435e`, `e538bf5`, `82d1b7c`, `4d8611b`), reviewed and documented after the fact. Tests stayed at 99/99, typecheck and build clean.

### 1. Sam's name gets a green initial on Home (`baa435e`)

`PersonalCard` in `HomePage.tsx` now wraps the first letter of each name in a `<span>`. When `who === "SAM"`, that span gets `text-positive-ink`. Fran's letter stays neutral — intentionally asymmetric, it's a personal guiño from Fran to Sam, not a generic "color the initial" pattern.

A local `samLikesGreen(name)` helper inside the component splits the string into `{ firstLetter, rest }`. The funky name is intentional and stays — leaving it as a small wink in the code.

### 2. AppHeader added to every "important" page (`e538bf5`)

Previously `AppHeader` was only mounted on tab-roots (Home, Transactions) and inside the FeedbackSheet. Now it's also on Accounts, Categories, Debts, More, Recurring, Settings, and Settlements. Pure additive — each page imports it and renders `<AppHeader />` at the top of the existing root container.

Rationale Fran flagged: notifications bell, feedback button, sync/network badges and the brand row should be reachable from any screen, not only from the three tab-roots. The cost is a slightly heavier top chrome on sub-pages that also have a back-arrow row immediately below — flagged in review as a possible regression but Fran wants to live with it for now and re-evaluate after real-world use (and Lara's reaction).

### 3. Avatar palette swap: Sam now green, Household now coral (`82d1b7c`)

In `src/styles/tokens.css` (and the mirror in `docs/design-handoff/styles/tokens.css`), the `.avatar-sam` and `.avatar-house` linear-gradients were swapped. Sam is now the green one (`#22C55E → #16A34A`); Household is now coral (`#FF7D6B → #E55A48`). Fran's violet and JOINT's blue are untouched.

The swap propagates everywhere the `Avatar` component renders Sam or Household — Settlements empty state, debt rows with HOUSEHOLD owner, allocation chips on shared transactions, etc. Fran confirmed the household-goes-coral side effect is intentional.

Combined with #1, Sam's letter color and her avatar gradient now share the same green — which is also `--color-positive` in the token system. Not a coincidence to fight: there's one green in the app, and if we ever retune it, Sam's letter and avatar move with it. Coupling-by-design, documented here so a future agent doesn't try to "fix" the shared token by accident.

### 4. Month selector dropped from non-month pages (`4d8611b`)

Direct follow-up to #2. AppHeader defaults `showMonth = true`, which made the MonthSelector appear on pages where the active month is meaningless (Accounts is cumulative, Categories is global, Settings/More have no temporal data, Recurring is frequency-based, Debts/Settlements are per-debt/per-pair). The selector would have silently mutated the global `monthKey` and surprised the user on returning to Home/Transactions.

Fran passed `showMonth={false}` on Accounts, Categories, Debts (both empty and populated branches), More, Recurring, Settings, and Settlements. Home and Transactions keep the default `true` because they're the only pages that legitimately filter by month.

**Decisions**
- **AppHeader on sub-pages stays for now.** Reviewed the doubled-chrome cost (AppHeader brand row + back-arrow row = ~88-100px before content on iPhone). Fran prefers to live with it and decide later based on use rather than rip out preemptively. If it bites, the fix is either restrict AppHeader to tab-roots or fold the back-arrow into AppHeader as a `back` prop.
- **Sam's green letter uses `text-positive-ink`, not a dedicated `text-sam` token.** Intentionally coupled — if the app's green ever shifts (contrast retune, brand evolution), both Sam's letter and her avatar follow. One green in the app.
- **Avatar swap done by editing the gradient assignments rather than introducing new tokens.** `.avatar-sam` and `.avatar-house` are class names, not semantic ("Sam's color" / "Household's color") — the gradient definition is the source of truth. Swapping the two definitions was the minimal change.

**Open follow-ups**
- Real-world feedback pending on whether AppHeader on every sub-page feels right or cluttered. If it bites in daily use, restrict to tab-roots.
- Lara hasn't seen the changes yet — possible further iteration after her input.

---

## 2026-05-11 — Silent Google token refresh: no more daily reconnects

**What was done**

Both Fran and Sam reported having to reconnect to Google every time they opened the PWA. Audit confirmed: the cached access token persists fine, but Google's browser-only implicit flow issues no refresh token, so the cached token expires ~1h after issue. The prior code went straight to a visible `prompt: "consent"` popup on every `getValidToken()` call that found an expired token. The fix is to use GIS's silent token request (`prompt: ""`), which succeeds without UI when the user is still signed into Google in the same browser.

- New `silentLogin()` in `lib/google/auth.ts`: wraps `initTokenClient` + `requestAccessToken({ prompt: "" })`. Returns `{ ok: true, token }` or `{ ok: false, reason }`. Calls `setExpired()` on the auth store on failure so the UI banner is correct without further plumbing.
- `getValidToken()` now tries silent first when the cached token is expired, falling back to interactive `login()` only if silent fails. Most callers will never see the popup again.
- `AppBoot.tsx` runs `silentLogin()` once on mount if the store has a remembered `email` but `!hasValidToken()` — proactive refresh at startup rather than lazily on first sync. Non-blocking; DB init proceeds in parallel.
- Documented as ADR-016.

**Decisions**
- **Boot-time silent refresh + lazy-on-getValidToken, not interval-based.** The two trigger points cover every legitimate moment a sync would fire. Adding visibility-change or interval-based silent refresh would risk hitting GIS rate limits with no user benefit.
- **Silent failure sets `expired`, not `error`.** Status `expired` is what the existing UI banner ("Reconnect to Google") already responds to. Reusing the existing state machine avoids new UI work.
- **Keep the interactive `login()` path intact.** First-time connects still need `prompt: "consent"` to authorize scopes, and we want a usable fallback when silent fails (revoked grant, cleared cookies, ITP changes).

**Open follow-ups**
- If Google deprecates silent token requests in browser-only contexts (third-party cookie deprecation could conceivably affect this someday), we'd need to migrate to auth-code flow with PKCE plus a tiny backend. Not on the horizon today.
- We don't currently try a silent refresh when the PWA is foregrounded after a long background period (>1h, token now stale). The next sync attempt will catch it via the `getValidToken()` path, so the user experience is the same with a one-tick delay. If that delay ever feels janky, add a `visibilitychange` listener that calls `silentLogin()` on `visible` if `!hasValidToken()`.

---

## 2026-05-10 — Disable pinch-zoom app-wide (PWA-native feel)

**What was done**

Discussing the FeedbackSheet auto-zoom fix surfaced the broader question: do we want pinch-zoom at all? The PWA is installed on both phones, launches from the home screen, behaves like a native app in every other way — and native iOS apps don't pinch-zoom by default. Decision was to own it and disable globally.

- `index.html` viewport meta: added `maximum-scale=1, user-scalable=no` to the existing `width=device-width, initial-scale=1.0, viewport-fit=cover`. `viewport-fit=cover` stays (it powers the safe-area-inset usage for the notch).
- Kept the prior `text-base` fix on the FeedbackSheet textarea. The viewport tweak makes it technically redundant (no auto-zoom can happen), but it's defense-in-depth and the right default for any future input we add.
- Documented as ADR-015 in `docs/decisions.md`, including the accessibility tradeoff and the escape hatch (per-view `touch-action: pinch-zoom`) if we ever need pinch back.

**Decisions**
- **Option chosen: `maximum-scale=1, user-scalable=no` (both).** The popular Stack Overflow advice of "use `maximum-scale=1` alone, it only blocks auto-zoom" is no longer accurate on iOS ≥ 13 — Safari treats it as a user-zoom cap too. Being explicit with both attributes makes intent unambiguous to anyone reading the file.
- **A11y tradeoff accepted.** WCAG 1.4.4 (Resize Text) is technically not met by page zoom, but: 2-user private app, iOS system Accessibility Zoom still works at the OS level, and tap targets / input font-sizes already meet a11y baselines.
- **Keep the 16px input discipline anyway.** Cheap to maintain (every primitive already does it), and protects us if the viewport rule ever needs to change.

**Open follow-ups**
- None. If we ever build a feature that legitimately needs pinch (receipt zoom, chart zoom), use a scoped `touch-action: pinch-zoom` wrapper rather than reverting the viewport.

---

## 2026-05-10 — FeedbackSheet textarea: iOS Safari auto-zoom fix

**What was done**

First real feedback from the beta buzón flagged a "weird zoom" when tapping the message textarea on iPhone. Classic iOS Safari behavior: any editable field with computed `font-size < 16px` triggers an auto-zoom-on-focus that the user then has to pinch back out from. The FeedbackSheet textarea was the only form control in the app still using `text-sm` (14px) — every `Input` primitive already uses `text-base` (16px), so nothing else in the app hit this.

- `FeedbackSheet.tsx` textarea: `text-sm` → `text-base`. Added a comment marking the 16px threshold as load-bearing so nobody "tightens" it later.

**Decisions**
- **Fix at the call site, not the primitive.** There's no shared `Textarea` primitive yet — every textarea in the codebase is raw. The audit only found one offender, so promoting it to a primitive purely to enforce a font-size floor would be over-engineering. If we ever add a second textarea, that's the moment to extract.
- **Comment, not a lint rule.** A regex against `text-(xs|sm)` near `<textarea` / `<input` would be possible but noisy (would false-positive on labels and helper text). The single inline comment is enough for now — future audits can grep for the comment.

**Open follow-ups**
- None for this bug. If we ever grow to multiple textareas, extract a `Textarea` primitive in `src/components/ui/` mirroring `Input` (which already uses `text-base`).

---

## 2026-05-10 — Connect-Sheet 400 fix: ensureRawTabs before first pull

**What was done**

Real-world bug: connecting an already-populated Sheet (one that pre-dates the `raw_feedback` tab) failed with `Sheets API 400` from `pullAll`. Root cause: `ConnectSheetBlock.handleSave` went `getSpreadsheet → pullAll` directly. `pullAll` reads each `raw_*` tab via `getValues(id, "raw_X!A2:Y")`. If any tab is missing, Sheets returns 400 *"Unable to parse range"*. `ensureRawTabs` already existed and was wired into `push.ts`, but the connect path skipped it — so a Sheet bound before `raw_feedback` was added would never auto-create the missing tab on connect.

- `ConnectSheetBlock.handleSave` now calls `ensureRawTabs(meta.spreadsheetId)` between `getSpreadsheet` and `pullAll`. Idempotent: creates any missing tabs and rewrites the canonical header row on every existing one.

**Decisions**
- **Run ensureRawTabs unconditionally on connect, not only "if missing".** It's a handful of API calls and runs once per connect; checking-then-creating would duplicate the logic that already lives inside `ensureRawTabs`. Header rewrite is also a useful safety net if columns ever drift.
- **Connect path, not pullAll itself.** Adding `ensureRawTabs` inside `pullAll` would couple a read operation to write side-effects, and pullAll runs on every auto-sync. Keep ensureRawTabs at the boundaries that legitimately mutate the Sheet (connect + push).

**Open follow-ups**
- None. If we add another raw_* tab in the future, existing connected Sheets will still be patched on the next push (which already calls ensureRawTabs), so this class of bug shouldn't recur unless someone adds a new pull-only entry point.

---

## 2026-05-09 — Color contrast pass: SegmentedControl race + functional-color ink variants

**What was done**

Real-world iPhone testing surfaced two color bugs, one severe and one systemic.

### 1. SegmentedControl: invisible active text

The active text on every segmented control (scope toggle, source/owner selectors, theme toggle, language toggle, etc.) was unreadable. Root cause: the violet pill behind the active button was JS-positioned via `getBoundingClientRect` inside a `useLayoutEffect`. That measurement raced with the parent `route-frame` 220ms fade-slide animation — measuring while the parent transform was mid-interpolation gave coordinates that didn't line up with where the button finally rendered. Result: white-text active button with no violet pill behind it = white-on-near-white = invisible.

- Rewrote `SegmentedControl` to position the pill via **pure CSS**: `grid grid-cols-N`, pill `width: calc((100% - 8px) / N)` and `left: calc(4px + activeIndex * width)`. No `useLayoutEffect`, no rect measurement, no animation race. Slide animation kept via `transition-[left] 200ms ease-out`.
- API unchanged — every existing call site works without modification. The `[&>button]:flex-1` modifier some pages added is now redundant (CSS grid distributes naturally) but harmless.

### 2. Functional-color text was systemically unreadable

`text-positive` (#22C55E green) on the warm-white background (#FAF8F4) was about **2.2:1 contrast** — fails WCAG AA for any text. Same problem for `text-expense`, `text-info`, `text-warning`. The vivid hue was tuned for fills/icons, not for text.

- **Added `-ink` variants** to `tokens.css` for each functional color:
  - Light mode: darker, AA-compliant text on light bg (e.g. `--color-positive-ink: 21 128 61` = #15803D, ~5.7:1).
  - Dark mode: lighter, readable on dark bg (e.g. `--color-positive-ink: 134 239 172`).
  - Same pattern as the existing `--color-violet-ink`.
- **Tailwind config** changed each functional color to a `{ DEFAULT, ink }` object so `text-positive-ink` resolves through the same alpha-value pipeline.
- **Pill component** now uses `text-X-ink` with a slightly stronger tint (`bg-X/15` instead of `/10`) so all 5 tinted pill variants pass AA in both themes.
- **Bulk-replaced** every `text-positive`, `text-expense`, `text-info`, `text-warning` in components with the `-ink` equivalent. Caught a few stragglers in `RecurringPage` totals and `ConsequenceSentence` that the regex missed; fixed manually.

### 3. Bumped neutral text contrast

- `--color-text-secondary` from `92 96 112` → `78 82 96` (~7.4:1 → ~9:1 on warm bg).
- `--color-text-muted` from `142 146 160` → `107 111 124` (~3.4:1 → ~5.5:1, now AA for body).
- Dark-mode neutrals untouched — they were already adequate.

**Decisions**
- **CSS-only sliding pill, not JS-measured.** The animation race wasn't theoretical — every screen with a SegmentedControl is inside `route-frame`, so every selector exhibited the bug. Eliminating the measurement is more robust and removes the only `useLayoutEffect` in the component.
- **`-ink` variants instead of redefining the vivid tokens.** Keeping the vivid hue available for fills (avatars, big stat numbers on plain bg, icons inside tinted pills) preserved the brand-energy of the design. The ink variant is a discipline: text uses ink, fills use vivid.
- **`bg-X/15` not `/10` for pills.** `/10` looked anemic against the warm bg; `/15` reads clearly as a colored chip without becoming saturated. Combined with the ink text, AA contrast is now structural, not accidental.
- **Bulk regex replace, not per-file review.** 17 files used `text-positive` etc.; reviewing each was busywork. Two sed passes (mid-class with trailing space, end-of-string with closing quote/EOL) caught all but 4 stragglers, fixed individually. Tests still 99/99 confirms no logic regressions.

**Open follow-ups**
- The donut chart slices use category-defined hex colors directly (not the token system). If a category color ever lands too pale, the slice can blend with the surface; deferred until it actually happens.
- Avatar gradients are still hardcoded hex in `tokens.css`. If we ever want to theme avatars, they'd need to move to CSS variables. Not urgent.
- The `text-text-muted` adjustment is mostly safe but a few `t-label` uses that were fine before might now look slightly heavier. Watch for visual regressions in cards with lots of muted text (Settings, Recurring form).

---

## 2026-05-09 — Final spec coverage: smart defaults, month-sync, conflict UI

**What was done**

Closed the last three deferred items. With this commit, every spec section that was open is now either implemented or explicitly marked as out-of-scope.

### 1. Smart defaults from last entry (Add Expense)

- New `src/features/add-expense/lastUsed.ts`: per-pattern category memory keyed by `${source}|${owner}|${splitFranPercent}`, persisted to a single localStorage entry (`adulting.lastUsed.v1`). The `defaultsStore` (static defaults) still wins for source/owner/split — this only fills `categoryId`.
- `AddExpensePage` reads on mount and applies the suggestion on top of the static defaults.
- A `userTouchedCategoryRef` tracks whether the user has manually changed the category. Until they do, switching source/owner/split refreshes the suggested category from memory; once they pick one, we stop overriding.
- After successful save, `recordLastUsed(pattern, { categoryId })` writes back. Empty patterns (`categoryId === null`) don't pollute the store.

### 2. Sheets month-sync wired into auto-sync

- `syncStore` gained `monthTemplateTitle: string | null` (persisted), with a setter, partialized into the saved snapshot.
- `syncAll(spreadsheetId, opts)` now accepts a `monthTemplateTitle` option. When set, before push it calls `ensureMonthSheet(spreadsheetId, currentMonthKey(), { templateTitle })`. Failure is best-effort — `monthTabError` is reported in the SyncReport but the push proceeds.
- `useAutoSync` and the manual "Sync now" button both forward the persisted `monthTemplateTitle` into `syncAll`.
- `ConnectedBlock` in `SyncCard` now shows a "Monthly tab template" Input with placeholder `Mes — plantilla` and a hint explaining the auto-create behavior. Empty input = `null` = no auto-creation.

### 3. Conflict-resolution UI

- **Schema**: migration v2 adds `sync_conflicts` (id, entity_type, entity_id, local_data JSON, remote_data JSON, local/remote_updated_at, detected_at, resolved_at, resolution). Index on unresolved + on (entity_type, entity_id) so de-duplication is cheap.
- **Detection** (`src/lib/sync/conflicts.ts` + `pull.ts`): a new `checkConflict()` runs before every UPDATE in the reconcile path. It checks the sync_queue for PENDING entries on the same `(entity_type, entity_id)`. If found, the local row stays untouched and the conflict is recorded with snapshots of both sides; if not, the update proceeds normally. Re-detected conflicts on the same entity refresh the existing record's `remote_data` and `detected_at` instead of stacking duplicates.
- **Pull refactor**: the 9 reconcile functions collapsed into a single generic `reconcile<T>(rows, cfg)` helper, eliminating ~150 lines of duplication. Each per-entity function is now a 3-line wrapper specifying `{table, entityType, parse, insert, update}`.
- **PullReport** gains `conflicts: Record<string, number>` so the per-tab count is visible to the UI.
- **`applyRemoteToLocal(entityType, data)`** exported from `pull.ts` — dispatches to the right `updateX` writer. Used by `resolveUseRemote` to apply the stashed remote payload when the user picks "Use remote", inside a transaction that also drops matching PENDING queue entries.
- **`resolveKeepLocal(id)`** simply marks the conflict resolved; the existing PENDING entry is left so the next push wins.
- **`/sync/conflicts` route** + `ConflictsPage`:
  - Lists unresolved conflicts with entity type, identifying field (description / name / merchant), diff count pill.
  - Per conflict, side-by-side field comparison cards (skipping `created_at`, `updated_at`, `sheet_sync_status`, `sheet_row_ref` — those are noisy meta).
  - SQLite returns 0/1 for booleans while the reader returns true/false, so `sameValue` coerces them — otherwise every row would show every boolean as a "diff".
  - Two action buttons: "Keep mine" (primary) and "Use remote" (secondary). Resolution bumps `dbVersion` so dependent pages re-derive.
- **SyncCard banner**: when `unresolvedConflictCount() > 0`, an amber-tinted Link card appears in `ConnectedBlock` ("X sync conflicts — Tap to review") that navigates to `/sync/conflicts`.
- **i18n**: full `conflicts.*` namespace (EN + ES) for the page; `sync.conflicts.banner` plural for the card-level banner; `sync.monthTemplate.*` for the template input.
- **Tests**: 2 new in `pull.test.ts` exercise the conflict path (records conflict + skips update when PENDING; proceeds with update when no PENDING). Total 99/99 passing. Existing seed-driven tests now `markAllSynced(listPending().map(p => p.id))` in `beforeEach` so the seed's PENDING entries don't break the existing update-path tests.

**Decisions**
- **Conflict detection signal: PENDING-on-entity, not timestamp tolerance.** A "same-second updated_at + content differs" rule was tempting but brittle (clock skew, ms truncation). The PENDING-queue signal is exact: it means the user has unpushed local edits, and the remote has *also* changed since. That's the only meaningful conflict.
- **Pull preserves local during conflict, doesn't try to merge.** Merging fields means picking semantics per field; that's product judgement we don't want to bake in. Make the user choose.
- **"Keep mine" doesn't push immediately.** It just marks resolved; the existing PENDING queue entry will fire on the next normal sync trigger. This avoids surprise network calls from the resolution UI.
- **"Use remote" deletes the PENDING entry.** Otherwise the next push would re-overwrite the remote with the local payload that the user just chose to discard.
- **Generic `reconcile<T>` instead of 9 near-identical copies.** Adds ~30 lines of helper, removes ~150 lines of duplication, and ensures the conflict check is uniform across entities.
- **Field skip-list in the conflict UI** keeps the diff focused on user-meaningful fields. Showing `updated_at` differing is just noise — by definition timestamps differ when contents differ.
- **Localstorage for last-used patterns**, not the SQL DB. The patterns are device-local UX prefs, not data to sync to Sheets. Keeping it out of SQLite avoids polluting the snapshot bytes and the sync_queue.

**Open follow-ups**
- The "smart suggestion" doesn't yet pre-fill `description`. Memorizing description per pattern would be sticky in a bad way ("Coffee" wins forever). The right move is probably an autocomplete dropdown showing the last few descriptions for that pattern, deferred until needed.
- `ensureMonthSheet` only runs on auto-sync runs that pass through `useAutoSync`. The first push after binding (which goes through `pullAll` only in `ConnectSheetBlock`) doesn't call it; that's fine since it runs on every subsequent push including the auto-trigger.
- Conflict resolution doesn't currently let you preview the UPDATE before applying it. The side-by-side field view is enough for the v1, but if conflicts get nuanced (e.g. allocations), we may want a finer-grained "merge" UI.
- The seed-pollution side effect on the conflict banner (every freshly seeded row has a PENDING entry, but no remote has been pulled yet, so no conflicts) is fine in practice — pull would only conflict against remote rows that *also* exist locally with PENDING, which only happens after a push has propagated them once.

**With this commit, the original spec is fully covered.** Every section from the build prompt is either implemented, scaffolded, or explicitly noted as Phase 7 NMP material.

---

## 2026-05-09 — Home dashboard expansion (spec §6.1)

**What was done**

The Home dashboard was a single scope-toggled card. Spec §6.1 calls for **multiple coexisting panels** (Joint, Personal Fran, Personal Sam, Settlements, Debt summary, Category). Restructured to match.

- **Joint snapshot card** (top of page, new):
  - Pulls the account where `type === 'JOINT'` from `accountsRepo.list()`.
  - Big balance number using the new `accountBalance(accountId, initialBalance)` helper.
  - Two stats below: monthly inflow (positive tone) and monthly outflow (expense tone), via the new `accountMonthlyFlow(accountId, monthKey)` helper.
  - Uses the JOINT avatar (blue gradient) so it visually keys the joint context.
  - Clickable → navigates to `/accounts`.
- **Personal summaries** (two-column grid below the Joint snapshot):
  - One card per person with their avatar, name, and four `MiniStat` rows: Income / Expenses / Recurring / Available.
  - Available is visually emphasized (separator + larger font).
  - Each card consumes `monthlySummary(monthKey, "fran")` / `monthlySummary(monthKey, "sam")` so it always shows both perspectives regardless of the scope toggle.
  - Tap → `/transactions` (a future filter shortcut could deep-link with owner pre-selected).
- **Category breakdown card** (still scope-aware): same donut + truncated list, plus a "Scope: Household" hint so the user knows the panel is filtered. The CompareBar moved here from the deprecated main stats card so it's adjacent to the breakdown it summarizes.
- **Settlements card** (now a Link to `/settlements`):
  - Shows two pairs: Fran ↔ Sam and Sam ↔ Household.
  - Direction-aware labels via `t("settlements.owes", { from, to })`. Net 0 collapses to "—".
  - Whole card is now keyboard-focusable + screen-reader labeled.
- **Debt summary card** (replaces the simple total, now a Link to `/debts`):
  - Three rows — FRAN / SAM / HOUSEHOLD — each with their per-currency totals (or "—" if none).
  - Footer Pill shows the EUR-denominated monthly minimum total.
- **Calculations module** (`lib/calculations/aggregations.ts`):
  - New `accountBalance(accountId, initialBalance)` — exports the previously-private `computeBalance` from `AccountsPage`. Same SQL, now reusable.
  - New `accountMonthlyFlow(accountId, monthKey)` — returns `{ inflow, outflow }` for a specific month.
  - Both exported via `lib/calculations/index.ts`.
  - `AccountsPage.tsx` refactored to use the shared helper; dropped the now-unused `selectScalar` + `transactionsRepo` imports and inline `round2`.
- **i18n** (EN + ES): full `home.*` namespace expansion (`scopeLabel`, `jointBalanceLabel`, `inflowMonth`, `outflowMonth`, `categoryTitle`, `noExpenses`, `settlementsTitle`, `debtsTitle`, `monthlyDebt`, `statIncome/Expenses/Recurring/Available`, `openTransactions/Settlements/Debts/Accounts/Personal`, `categoryChartAria`, `compareAria`). Drops the previously hardcoded Spanish strings ("Cuenta conjunta", "Ingresos del mes", etc.) that violated the no-hardcoded-strings rule.
- **Build clean.** Typecheck passes, 97/97 tests, production build size unchanged.

**Decisions**
- **Scope toggle now governs the Category panel only.** The Joint snapshot and Personal summaries are always visible regardless of scope, matching the spec's "stacked sections" intent. Scope still affects which slice the donut shows (Household-only spending vs Fran's vs Sam's vs All), which is the spec §6.1.6 explicit "filters by owner/source/month" requirement.
- **Both Personal cards are always rendered**, not just the active scope's. Spec §6.1.3 calls for *both* visible. The cost is two extra `monthlySummary` calls per render — both already memoized on `[ready, dbVersion, monthKey]`.
- **Cards become Links rather than gaining onClick handlers.** `<Link>` from React Router gets us proper keyboard accessibility, focus-visible rings, and right-click semantics for free. Each link sets `aria-label` so screen readers announce intent.
- **Per-currency debt totals** (not converted to EUR). Showing `$120` and `€350` separately is more honest than fudging an FX conversion the user didn't authorize. The monthly minimum *is* summed in EUR, which reads as a rough headline; multi-currency itemized minimums live on `/debts`.
- **The previous "Resumen del mes" main card is gone** to avoid duplicating data now shown by the Personal cards (when scope is fran/sam) or the Joint snapshot (when scope is household). The remaining structural clarity is worth the lost variant view; users who want a "totals across everything" can pick scope `all` and look at the CompareBar inside the Category card.

**Open follow-ups (still genuinely deferred)**
- **Smart defaults from last entry** on Add Expense (remember last category/description per source/owner pattern).
- **Conflict-resolution UI** for the rare same-second sync case.
- **Wire `ensureMonthSheet`** into auto-sync once the user nominates a template tab title.
- **Personal cards deep-link with owner filter** — once Transactions filters support URL-bound state, tapping a Personal card could navigate to `/transactions?owner=fran` instead of the unfiltered list.

That closes the spec coverage audit. The remaining items are all explicitly deferred polish with no spec violation.

---

## 2026-05-09 — Transactions filters + search (spec §6.4)

**What was done**

Closed the largest remaining spec gap: `/transactions` had a flat month-aware list with no way to find a specific row. Now it has an inline search input plus an expandable filter panel.

- **Search** — `Input` with leading magnifier icon, full-width. Matches case-insensitively against `description`, `merchant`, and `notes`. Trims whitespace before applying.
- **Filter panel** — `IconButton` toggle in the search row opens/closes a card with four sections:
  - **Source** segmented (`All / Fran / Sam / Joint`) — uses `accountIdToCashSource` to map the row's `source_account_id`.
  - **Owner** segmented (`All / Fran / Sam / Household`) — checks if any allocation row carries that owner.
  - **Type** segmented (`All / Shared / Recurring / Debt`) — `Shared` = >1 allocation, `Recurring` = `origin === "RECURRING_GENERATED"`, `Debt` = `type === "DEBT_PAYMENT"`.
  - **Category** — horizontal chip scroller including an "All" chip and one per category, with the category color dot. Tap a chip to toggle (re-tapping the active one clears).
- **Active-filter affordance** — the filter button shows a violet "active" variant with a badge counter when any filter is applied. A "Clear" link sits next to the count of shown vs total transactions.
- **Empty state for filtered-to-zero** — distinct from the "no transactions yet" empty state. Title "No matches", description suggests broadening the search.
- **i18n** (EN + ES): full `transactions.filters.*` namespace plus `transactions.searchPlaceholder` and `transactions.filteredCount`.
- **Performance**: filters apply client-side via `useMemo` over the month's already-loaded tx list. Allocation owners are computed once per month (single pass over the transactions) and reused for both the filter logic and the existing "Shared" pill on `TransactionRow`. No new repo methods needed.
- **97/97 tests** still passing. Build clean.

**Decisions**
- **Filters are client-side, not SQL-side.** A month rarely has more than ~100 transactions; pushing filters into SQL would require either a flexible query builder or per-filter repo methods. Both are heavier than `Array.filter` over an already-cached list.
- **Allocation map computed once per month, not per filter change.** The `useMemo` deps are `[dbReady, dbVersion, allTxs]`, not `[filters]`, so changing a filter re-derives the result list cheaply without re-querying allocations.
- **Single category, not multi-select.** Multi-select category would need a chip-row UX with toggleable state and a more complex state shape. For two users with ~10 categories this gives ~95% of the value at half the complexity. Easy to upgrade later if needed.
- **No "recurring" instance back-reference.** `origin === "RECURRING_GENERATED"` is the only signal a tx came from recurring. There's no FK back to the `recurring_items` row that produced it. Spec §6.4 just says "filter by recurring", which this satisfies.
- **Filter state lives in component state**, not a store. Filters are session-scoped and shouldn't survive a page reload (they'd surprise the user). If demand for "save my last filter" emerges, a small `transactionsFiltersStore` is a one-screen change.

**Open follow-ups (still genuinely deferred)**
- **Smart defaults from last entry** on Add Expense (remember last category/description per source/owner pattern).
- **Side-by-side personal summaries** (Fran + Sam panels) on Home (spec §6.1).
- **Joint snapshot card** on Home (current balance + month deltas).
- **Per-owner debt summary on Home** (currently only on `/debts`).
- **Conflict-resolution UI** for the rare same-second sync case.
- **Wire `ensureMonthSheet`** into auto-sync once the user nominates a template tab title.

---

## 2026-05-09 — Phase 10b spec coverage cleanup

**What was done**

Audit pass over the execution plan and the original spec found two genuine gaps and several stale checkboxes. Closed both kinds.

- **Stale checkboxes corrected** in `execution-plan.md`:
  - "Verify dev server boots cleanly" → done long ago.
  - "Sync queue enqueue (Phase 9)" → landed in 9a.
  - "Settle up CTA on balance cards" → landed in 7.
  - Donut chart sub-bullet under Phase 7 polish → landed in 10.
  - Settings expansion → landed in 10b (this entry).
- **Per-owner debt totals** on `/debts` (spec §6.6):
  - New "By owner" card on `DebtsPage` showing Fran / Sam / Household with their respective totals, separated per currency so a USD personal debt doesn't get summed with a EUR shared debt.
  - "Monthly minimum" footer summing `minimum_payment` per currency, addresses spec's "monthly debt payment total" requirement.
  - New `OwnerRow` component, avatar + label + per-currency totals or "—" when none.
- **Settings → Defaults section** (spec §11.10):
  - New `defaultsStore` (Zustand+persist, key `adulting.defaults`): `source`, `owner`, `splitFranPercent`.
  - `DefaultsCard` in `SettingsPage` with two segmented controls (source, owner) and a slider that only appears when the combination implies a split (personal source + HOUSEHOLD owner). "Reset to defaults" button.
  - `AddExpensePage` reads from `defaultsStore` on mount, so the form pre-fills with the user's chosen defaults instead of the hardcoded JOINT/HOUSEHOLD/50.
- **Settings → Backups & Data section**:
  - Promoted `serializeCurrent` to a public `exportDb()` in `client.ts`.
  - `BackupsCard` with a "Download snapshot" button that turns the bytes into a `Blob` and triggers a browser download named `adulting-YYYY-MM-DD.sqlite3`.
  - "Clear local data" button (destructive variant) with `confirm()` dialog → `clearSnapshot()` + `localStorage.clear()` + `location.reload()`. Surfaces a warning that on Chrome OPFS data persists separately and must be cleared via DevTools.
- **Settings → About section**:
  - `vite.config.ts` reads `package.json` once and sets `__APP_VERSION__` and `__BUILD_DATE__` (today's ISO date) via `define`.
  - `vite-env.d.ts` declares the global constants for TypeScript.
  - `AboutCard` shows version, build, and the app tagline. Plain `<dl>` with version + build rows.
- **i18n** (EN + ES) extended with `common.reset`, `debts.byOwner`, `debts.owner.{fran,sam,household}`, `debts.monthlyTotal`, `settings.defaults.*`, `settings.backups.*`, `settings.about.*`.
- **97/97 tests still passing.** Build clean.

**Decisions**
- **Settings expansion is a card-per-section pattern, not subroutes.** The spec mentions Settings rows but for our scale a single scrollable page with `CardEyebrow` headings is more useful than a navigation tree. If Defaults grows beyond a handful of options, it can graduate to its own route.
- **Backup format is the raw SQLite file**, not JSON. Less transformation, no schema versioning issue, and "import" later becomes `_internal.deserializeIntoCurrent(bytes)`. Tradeoff: not human-readable. The Sheets export covers the human-readable case.
- **"Clear local data" doesn't try to wipe OPFS** because that requires re-initing the SAH Pool with `clearOnInit: true`, which is racy mid-session. The reload triggers a fresh init; if the user wants to truly wipe Chrome OPFS, the inline hint points them at DevTools.
- **`__APP_VERSION__` via Vite `define`** rather than importing `package.json`. Keeps the JSON out of the runtime bundle, surfaces the value as a compile-time constant.
- **No "import snapshot" button yet.** Adding one means handling schema mismatches and confirmation flow; deferred until there's a real reason (i.e. the user actually needs to restore from a download). Today the Sheets sync is the recovery path.

**Open follow-ups (still genuinely deferred)**
- Filters/search on Transactions (spec §6.4).
- Smart defaults from *last entry* on Add Expense (spec §6.2 polish — the current Defaults are static; the spec also implies "remember the last used category/description per pattern").
- Side-by-side personal summaries (Fran + Sam panels) on Home (spec §6.1).
- Joint snapshot card on Home (current balance + month deltas).
- Per-owner debt summary on Home (currently only on `/debts`).
- Conflict-resolution UI for Sheets sync (rare same-second case).
- Wire `ensureMonthSheet` into auto-sync once the user nominates a template tab title.

These are now the only items left from the original spec coverage audit. None are blocking daily use.

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
