# Progress Log

Chronological record of substantive work on Adulting.app. Each entry: date, phase, what changed, decisions, follow-ups. Append at the top.

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
