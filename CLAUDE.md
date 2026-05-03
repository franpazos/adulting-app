# CLAUDE.md

Onboarding for AI coding agents (and humans) working on Adulting.app. **Read this first.**

## What is this project?

A **local-first, mobile-first PWA** for two users (Fran and Sam) to manage personal, shared, and household finances. Not a commercial product — private use by Fran and Sam only. Optimize for **simplicity, speed, correctness, and maintainability**, not enterprise complexity.

## Where the canonical context lives

1. [`docs/original-spec/01-build-prompt.md`](./docs/original-spec/01-build-prompt.md) — full technical & conceptual spec from Fran. **Source of truth for product behavior.**
2. [`docs/original-spec/02-brand-ui-direction.md`](./docs/original-spec/02-brand-ui-direction.md) — brand & UI direction (Soft Premium, Option 1B, violet `#7B5CF6`, Sora + Inter).
3. [`docs/original-spec/03-conversation-prompts.md`](./docs/original-spec/03-conversation-prompts.md) — verbatim kickoff messages from Fran.
4. [`docs/execution-plan.md`](./docs/execution-plan.md) — phase-by-phase plan, **living**.
5. [`docs/progress-log.md`](./docs/progress-log.md) — chronological work record.
6. [`docs/decisions.md`](./docs/decisions.md) — ADR-lite for cross-cutting choices.
7. [`docs/data-model.md`](./docs/data-model.md) — schema, enums, recipes.
8. [`docs/architecture.md`](./docs/architecture.md) — folder layout and layering rules.

If you're an agent picking this project up cold, read 1 → 2 → 4 → 7 → 8 in that order.

## House rules

- **Don't touch `docs/original-spec/`.** It's a frozen archive. New context goes into `docs/progress-log.md`, `docs/decisions.md`, or topic docs.
- **Update `docs/progress-log.md` at the end of every meaningful work session** (new entry at the top, dated, with what changed and what's next).
- **Update `docs/decisions.md`** when you make a non-obvious technical choice. Use the ADR-lite format already in the file.
- **Keep `docs/execution-plan.md` checkboxes honest.** Tick what's done, leave what isn't.
- **Don't bury financial logic in UI components.** Pure calculations live in `src/lib/calculations/` and are unit-tested.
- **SQLite is the source of truth.** Google Sheets is a sync target, not a database.
- **Settlements correctness is non-negotiable.** All five reference cases (A–E in `01-build-prompt.md` §4) must pass.
- **Don't break the multi-currency model** — see ADR-004 in `docs/decisions.md`.
- **No hex literals in components.** Use Tailwind semantic tokens (`bg-violet`, `text-text-primary`). Tokens are defined in `src/styles/tokens.css`.
- **No hardcoded UI strings.** Everything goes through i18next with keys in `src/lib/i18n/{en,es}.json`. Update **both** locales.
- **Mobile-first.** Default layouts are phone-sized; desktop expansion is responsible second.

## Tech stack at a glance

- React 19 + TypeScript + Vite 6
- Tailwind v3 (CSS-variable tokens) + Radix-flavored shadcn-style primitives (built locally as needed)
- React Router v7
- Zustand for UI/session state
- SQLite via `@sqlite.org/sqlite-wasm` with OPFS persistence (requires COOP/COEP)
- i18next + react-i18next (en + es)
- vite-plugin-pwa for installability
- Vitest + Testing Library for tests
- Google Sheets API client-side (Phase 9)
- pnpm

## Common commands

```bash
pnpm install      # install dependencies
pnpm dev          # start dev server (http://localhost:5173)
pnpm build        # type-check + production build
pnpm preview      # preview production build
pnpm lint         # eslint
pnpm test         # vitest (once configured in package.json — Phase 0+)
```

## When the user asks for new functionality

1. Identify which phase it belongs to in `docs/execution-plan.md`. If it's out of order, ask before reordering.
2. If it touches the data model, update `docs/data-model.md` and write a migration in `src/lib/db/migrations/`.
3. If it touches financial calculations, write tests first in `src/lib/calculations/__tests__/` covering the spec cases.
4. UI work: respect the Soft Premium brand direction. Use existing tokens and components.
5. Update `docs/progress-log.md` when you wrap.

## Logo & icon swap path

The logo and PWA icons are **placeholders**. When Fran provides the final SVGs:
- Replace `src/components/Logo.tsx` (`LogoMark`, `LogoWordmark`)
- Replace `public/icons/favicon.svg`, `icon-192.svg`, `icon-512.svg`

No layout changes should be needed.
