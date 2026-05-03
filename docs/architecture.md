# Architecture

A short, opinionated map of how the codebase is organized.

## Folder layout

```
adulting-app/
├── docs/                        # canonical project context (read this first)
│   ├── original-spec/           # original prompts — never edit, just reference
│   ├── execution-plan.md        # phase plan, living
│   ├── progress-log.md          # chronological work record
│   ├── decisions.md             # ADR-lite
│   ├── data-model.md            # schema + recipes
│   └── architecture.md          # this file
├── public/
│   └── icons/                   # PWA icons + favicon (placeholders for now)
├── src/
│   ├── app/                     # router + AppShell (top-level composition)
│   ├── components/              # shared UI (BottomNav, Logo) and ui/ primitives
│   ├── features/                # one folder per product domain
│   │   ├── home/
│   │   ├── transactions/
│   │   ├── add-expense/
│   │   ├── recurring/
│   │   ├── debts/
│   │   ├── settlements/
│   │   ├── categories/
│   │   ├── accounts/
│   │   ├── settings/
│   │   └── more/
│   ├── lib/                     # cross-cutting infra
│   │   ├── db/                  # sqlite-wasm, migrations, repositories (Phase 3)
│   │   ├── sync/                # offline queue, retry (Phase 9)
│   │   ├── google/              # OAuth + Sheets API (Phase 9)
│   │   ├── i18n/                # i18next + en/es dictionaries
│   │   ├── theme/               # ThemeProvider (light/dark/system)
│   │   ├── calculations/        # pure financial logic (Phase 4)
│   │   ├── date/                # month-key helpers
│   │   └── utils/               # cn, etc.
│   ├── store/                   # Zustand stores (month, scope, sync, ui)
│   ├── styles/                  # tokens.css
│   ├── types/                   # shared TS types
│   └── assets/brand/            # brand assets (room for future final SVGs)
├── tests/                       # vitest setup
├── tailwind.config.js
├── vite.config.ts
└── package.json
```

## Layering rules

1. **`features/*` may import from `components/`, `lib/`, `store/`, `types/`** — but not from each other. Cross-feature collaboration happens through `store/` or `lib/`.
2. **`lib/calculations/` is pure** — no React, no DB I/O. It takes inputs, returns outputs. This is what gets unit-tested.
3. **`lib/db/` is the only place that talks to SQLite.** Features call typed repositories, never raw SQL.
4. **`lib/sync/`** consumes the `sync_queue` table and reaches out to `lib/google/`. Features don't import `lib/google` directly.
5. **`store/`** holds UI/session state (selected month, scope, theme, language, online/offline). It does not own domain data — domain data is queried from the DB through repositories or React Query (added when needed).

## Theming

- All colors flow through CSS variables in `src/styles/tokens.css`.
- Tailwind uses semantic names (`bg-bg`, `text-text-primary`, `bg-violet`) so dark mode is purely a class swap on `<html>`.
- New colors should be added as tokens first, then exposed in `tailwind.config.js`. Avoid hex literals in components.

## i18n

- Strings live in `src/lib/i18n/{en,es}.json`.
- Keys are flat-ish and grouped (`nav.*`, `home.*`, `settlements.*`).
- Use interpolation (`{{from}}`, `{{to}}`) instead of name-permutation keys.
- New strings: add to **both** dictionaries simultaneously.

## Routing

- `src/app/router.tsx` is the source of truth.
- Code-split by route via `React.lazy` once features grow (Phase 2/3).
- Bottom-nav routes live at `/`, `/transactions`, `/add`, `/debts`, `/more`. `More` rows fan out to `/settlements`, `/recurring`, `/categories`, `/accounts`, `/settings`.

## Local-first guarantees

- SQLite (OPFS-backed) is the source of truth.
- Every mutation writes locally first, then enqueues a `sync_queue` row.
- Google Sheets is a sync target, not a database. If local and remote diverge, local wins by default.

## Testing strategy

- **Unit tests** for `lib/calculations/*` — every spec scenario (Cases A–E in the build prompt) is a test.
- **Component tests** for tricky form logic (Add Expense live preview, multi-currency debt payment).
- **Integration tests** are deferred until Phase 9 to cover sync flows.
