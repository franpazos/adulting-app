# Adulting.app

A **local-first, mobile-first PWA** for two users — Fran and Sam — to manage personal, shared household finances, recurring expenses, debts, and internal settlements.

> **Private app for personal use only.** Not a commercial product. Optimize for simplicity, speed, correctness, and maintainability.

## At a glance

- **React 19 + TypeScript + Vite 6** PWA
- **Tailwind v3** with CSS-variable design tokens (Soft Premium — violet `#7B5CF6`, Sora + Inter)
- **SQLite in browser** via `@sqlite.org/sqlite-wasm` with OPFS persistence — source of truth
- **Google Sheets sync target** (Phase 9), local-first with offline queue
- **Light / dark / system** themes, **English / Spanish** i18n
- iOS-feel: bottom nav with elevated central violet `+`, rounded cards, soft shadows

## Project context for humans and AI agents

Read in this order:

1. [`CLAUDE.md`](./CLAUDE.md) — house rules and onboarding
2. [`docs/original-spec/01-build-prompt.md`](./docs/original-spec/01-build-prompt.md) — full spec (frozen)
3. [`docs/original-spec/02-brand-ui-direction.md`](./docs/original-spec/02-brand-ui-direction.md) — brand direction (frozen)
4. [`docs/execution-plan.md`](./docs/execution-plan.md) — phased plan, living
5. [`docs/progress-log.md`](./docs/progress-log.md) — chronological work record
6. [`docs/decisions.md`](./docs/decisions.md) — ADRs
7. [`docs/data-model.md`](./docs/data-model.md) — schema and recipes
8. [`docs/architecture.md`](./docs/architecture.md) — folder layout and layering rules

## Getting started

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

`pnpm` 10+ and Node 18+ are required.

### Other commands

```bash
pnpm build      # tsc + production build
pnpm preview    # preview production build
pnpm lint       # eslint
pnpm test       # vitest (added once tests land)
```

## SQLite & OPFS

The dev server sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` so that SQLite-wasm can persist via the Origin Private File System. Production hosting must replicate these headers.

## Google Sheets sync

OAuth credentials will be configured in Phase 9 via `.env.local` (`VITE_GOOGLE_CLIENT_ID`). Sheets is a sync target only; the SQLite DB is the source of truth.

## Contributing

This is a private project, but if a future agent or collaborator picks it up:

- Don't edit anything in `docs/original-spec/`.
- Update `docs/progress-log.md` at the end of every meaningful work session.
- Add ADRs to `docs/decisions.md` for non-obvious technical choices.
- Keep settlements correctness intact — see spec §4 reference cases.
- No hardcoded UI strings; no hex color literals in components.
