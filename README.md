# Adulting.app

A **local-first, mobile-first PWA** for two users — Fran and Sam — to manage personal, shared household finances, recurring expenses, debts, and internal settlements.

> **Private app for personal use only.** Not a commercial product. Optimize for simplicity, speed, correctness, and maintainability.

## At a glance

- **React 19 + TypeScript + Vite 6** PWA, code-split per route
- **Tailwind v3** with CSS-variable design tokens (Soft Premium — violet `#7B5CF6`, Sora + Inter)
- **SQLite in browser** via `@sqlite.org/sqlite-wasm` — durable on Chrome via **OPFS SAH Pool**, durable on Safari via an **in-memory + IndexedDB snapshot** fallback (ADR-013)
- **Google Sheets sync** — `pull → push` reconciliation by `updated_at`, auto-sync on boot / focus / write / online
- **PWA installable**, offline-first via Workbox, install prompt on Android / instructional fallback on iOS
- **Light / dark / system** themes with smooth cross-fade, **English / Spanish** i18n with both locales kept in sync
- iOS-feel: bottom nav with elevated central violet `+`, rounded cards, soft shadows, AA contrast, ≥44 px hit targets

## Project context for humans and AI agents

Read in this order:

1. [`CLAUDE.md`](./CLAUDE.md) — house rules and onboarding (start here if you're an agent)
2. [`docs/original-spec/01-build-prompt.md`](./docs/original-spec/01-build-prompt.md) — full spec (frozen)
3. [`docs/original-spec/02-brand-ui-direction.md`](./docs/original-spec/02-brand-ui-direction.md) — brand direction (frozen)
4. [`docs/execution-plan.md`](./docs/execution-plan.md) — phased plan, living
5. [`docs/progress-log.md`](./docs/progress-log.md) — chronological work record (newest first)
6. [`docs/decisions.md`](./docs/decisions.md) — ADRs (architectural decision records)
7. [`docs/data-model.md`](./docs/data-model.md) — schema and recipes
8. [`docs/architecture.md`](./docs/architecture.md) — folder layout and layering rules

## Getting started

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

**Node 22 LTS** (pinned in `.nvmrc`; minimum 20.19 enforced via `package.json` engines) and **pnpm 10+** are required. If you use nvm, `cd` into the directory and run `nvm use` to pick up the correct Node automatically.

### Common commands

```bash
pnpm dev        # dev server with HMR + service worker
pnpm build      # type-check + production build (writes dist/)
pnpm preview    # preview the production build locally
pnpm lint       # eslint
pnpm test       # vitest, runs the full suite once
pnpm typecheck  # tsc -b --noEmit
```

### Environment variables

Copy `.env.example` to `.env.local` for dev, mirror the same vars in Vercel for prod. Vite only exposes vars prefixed with `VITE_` to the client — anything without the prefix is stripped at build time.

```
VITE_GOOGLE_CLIENT_ID=<your-oauth-client-id>.apps.googleusercontent.com
VITE_URL_GOOGLE_SHEET=https://docs.google.com/spreadsheets/d/<your-sheet-id>/edit
```

- **`VITE_GOOGLE_CLIENT_ID`** (required for sync) — without it, the Sheets sync card in Settings shows a "not configured" hint and the rest of the app works offline-only.
- **`VITE_URL_GOOGLE_SHEET`** (optional) — pre-fills the "Connect sheet" URL input on a fresh device so you don't paste it every time. Leave empty and the input starts blank. The value is **inlined into the JS bundle at build time**, so changing it requires a redeploy.

## Architecture in one screen

```
src/
├── app/                     # Router, AppShell, AppBoot
├── features/                # One folder per route/screen
│   ├── home/                # Dashboard with charts
│   ├── transactions/        # List + edit
│   ├── add-expense/         # The signature flow (Variation B / Flow diagram)
│   ├── debts/               # List, detail, FX-aware payment
│   ├── settlements/         # Net balances + "Settle up" flow
│   ├── recurring/           # Monthly fixtures
│   ├── categories/          # CRUD
│   ├── accounts/            # Read-only
│   ├── settings/            # Theme, language, DB backend, Sync card
│   └── sync/                # SyncCard (Settings-embedded)
├── components/              # Cross-feature primitives + charts/
├── lib/
│   ├── db/                  # SQLite client, migrations, repos, snapshot persistence
│   ├── calculations/        # Pure: allocator, FX, settlements engine, aggregations
│   ├── sync/                # Push, pull, syncAll, useAutoSync, month-sync
│   ├── google/              # OAuth + Sheets API client
│   ├── i18n/                # en.json + es.json
│   ├── theme/               # ThemeProvider (light/dark/system)
│   ├── pwa/                 # registerSW
│   └── date/                # Month key helpers
├── store/                   # Zustand: ui, db, theme, network, sync, auth, install
└── styles/tokens.css        # CSS variables for Soft Premium light + dark
```

**Layering rules** (enforced by the architecture, not the compiler):

- `lib/calculations/` is **pure** — no DB writes, only reads via `lib/db/client`. The expense allocator is the single source of truth for both UI live-preview and DB persistence (no logic divergence possible).
- Repositories in `lib/db/repositories/` only do row I/O. Aggregations live in `lib/calculations/`.
- Settlements correctness is non-negotiable. The five reference cases (A–E in spec §4) are pinned in `lib/calculations/__tests__/`.
- No hex color literals in components — use Tailwind tokens (`bg-violet`, `text-text-primary`).
- No hardcoded UI strings — everything goes through `i18next` with both `en` and `es` updated together.

## Persistence strategy

The DB layer tries each strategy in order, picking the first that works:

1. **OPFS SAH Pool VFS** — durable, fast, synchronous. Chrome/Edge desktop and Android.
2. **In-memory + IndexedDB snapshot** — Safari iOS doesn't expose the sync OPFS access handle on the main thread (ADR-013). The DB runs against `:memory:` and after every write we serialize the entire DB via `sqlite3_js_db_export` and persist the bytes to a single IDB key. On boot we deserialize before migrations run. `pagehide` and `visibilitychange→hidden` flush synchronously to handle bfcache.
3. **In-memory only** — last-resort fallback when even IndexedDB is unavailable. The Settings page shows a warning pill so it's never silent.

The Settings backend pill reads:
- ✅ `OPFS (durable)` (positive/green)
- ✅ `in-memory + snapshot` (positive/green)
- ⚠️ `in-memory (no persistence)` (warning/amber)

## Google Sheets sync

Local-first: SQLite is always the source of truth, Sheets is a sync target.

Workflow:

1. Settings → "Connect with Google" — OAuth via Google Identity Services token client (popup).
2. Paste a sheet URL — the app validates access and **immediately pulls** existing raw_* tab data so a fresh device joining a populated sheet doesn't clobber it on first push.
3. Auto-sync activates: pull → push, triggered on boot if there are pending writes, on every `visibilitychange→visible`, debounced 3 s after local writes, and when coming back online.
4. The `sync_queue` table tracks every write with `status = PENDING`; pushes mark them `SYNCED`. The queue is the durable signal for "is anything unsynced?" — survives reloads and iOS background suspension.

Conflict resolution: **last-writer-wins by `updated_at`**. Pull bypasses `enqueueChange` so synced rows don't bounce back on the next push. Pull failure aborts push (so a stale local view can't clobber remote rows the other device just pushed).

A `manualOnly` toggle in the Sync card disables auto-sync if the user wants explicit control.

The `month-sync` service (`src/lib/sync/month-sync.ts`) is scaffolded per spec §14.6 — `ensureMonthSheet(spreadsheetId, monthKey, opts)` either duplicates a designated template tab or creates a blank one. Not yet auto-wired pending the user nominating a template title via Settings.

## Deploy

```bash
pnpm dlx vercel        # first-time prompt-driven deploy
pnpm dlx vercel --prod # promote to production
```

`vercel.json` sets the COOP (`same-origin-allow-popups`, required for the OAuth popup) and COEP (`require-corp`, required for OPFS) headers, the cache rules for `sw.js` / `index.html` / `assets/*`, and the SPA fallback. Full guide including iPhone install steps in [`docs/deployment.md`](./docs/deployment.md).

After the first prod deploy:

1. Add `VITE_GOOGLE_CLIENT_ID` to Vercel → Project Settings → Environment Variables.
2. In Google Cloud Console, add the deployed origin (e.g. `https://adulting.app`) and `http://localhost:5173` to the OAuth client's Authorized JavaScript origins.
3. On iPhone, open the URL in Safari → Share → "Add to Home Screen". Open from the home-screen icon for standalone PWA mode.

## Testing

Vitest + Testing Library + happy-dom (chosen over jsdom for Node 18 compatibility, ADR-009). Snapshot persistence is disabled under Vitest (`import.meta.env.MODE === "test"`) so happy-dom's IndexedDB doesn't leak state across files.

```
✓ 11 test files, 97 tests passing

src/lib/db/__tests__/             # bootstrap, migrations, seed correctness, snapshot round-trip
src/lib/calculations/__tests__/   # allocator (Cases A–E), FX, settlements engine, aggregations
src/lib/sync/__tests__/           # writers, queue, readers, applyTab reconcile
src/features/add-expense/__tests__/ # save flow, edit + soft-delete
src/features/debts/__tests__/     # FX debt payment, settle-up
```

Run a single file: `pnpm test src/lib/calculations/__tests__/allocator.test.ts`.

## Contributing

This is a private project, but if a future agent or collaborator picks it up:

- Don't edit anything in `docs/original-spec/`.
- Update `docs/progress-log.md` at the end of every meaningful work session (newest entry on top, dated).
- Add ADRs to `docs/decisions.md` for non-obvious technical choices.
- Keep settlements correctness intact — see spec §4 reference cases.
- No hardcoded UI strings; no hex color literals in components; both `en` and `es` i18n updated together.
- Mobile-first: design for the phone, expand to desktop second.
