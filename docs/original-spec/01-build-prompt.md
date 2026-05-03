# Adulting.app — Final Build Specification Prompt (v2)

Based on the original spec provided by the user fileciteturn0file0, build **Adulting.app**, a **local-first, mobile-first PWA** for two users — **Fran** and **Sam** — to manage personal finances, shared household finances, recurring expenses, debts, and internal settlements.

This is **not** a commercial multi-tenant product. It is a **private app for personal use only** by Fran and Sam. Optimize for simplicity, speed, correctness, and maintainability rather than enterprise complexity.

The app should feel like a polished iPhone app while being implemented as a **React + Vite + TypeScript PWA**. Use a modern aesthetic with personality. Avoid anything that feels like a spreadsheet clone.

---

## 1. Product vision

Build a finance app that makes it extremely easy to record expenses and understand:

- Fran's individual finances
- Sam's individual finances
- Shared household finances
- Shared and personal debts
- Internal balances / reimbursements / settlements between Fran, Sam, and the household
- Monthly cashflow and estimated money available after incomes, expenses, recurring obligations, and debt payments

The single most important flow is **adding an expense quickly**.

Primary principles:

1. **Local-first**: app works offline and stores data locally first
2. **SQLite is the source of truth**
3. **Google Sheets is a sync target and optional import source**, not the source of truth
4. **Mobile-first UX** with iOS-inspired styling
5. **Fast entry > feature bloat**
6. **Correct accounting model > simplistic but wrong shortcuts**
7. **Keep the UI simple, but let the data model be smart**

---

## 2. Locked technical decisions

- **Repo name:** `adulting-app`
- **App name:** `Adulting.app`
- **Framework:** React
- **Bundler:** Vite
- **Language:** TypeScript
- **App type:** PWA
- **Styling:** Tailwind CSS
- **UI components:** shadcn/ui or Radix primitives where helpful
- **State management:** Zustand
- **Client database:** SQLite in-browser
- **Data sync target:** Google Sheets API
- **Offline behavior:** local writes first, pending sync queue for remote sync
- **Themes:** light / dark / system
- **Languages:** English + Spanish, dictionary-based i18n

Avoid Next.js unless there is a truly necessary architectural reason. Do not introduce unnecessary backend complexity for MVP.

---

## 3. Core accounting model

The key domain insight is:

> Every financial event has both a **cash source** and an **economic owner**.

These are not always the same.

### 3.1 Cash source
Where the money actually came from:

- `FRAN_PERSONAL`
- `SAM_PERSONAL`
- `JOINT`

### 3.2 Economic owner
Who the expense belongs to:

- `FRAN`
- `SAM`
- `HOUSEHOLD`

### 3.3 Shared split
Some transactions are household/shared expenses but paid from a personal account. In those cases, the app must:

- count the transaction as household spending
- count the full outgoing cash from the actual source account
- calculate who owes whom based on split percentages
- update **Settlements** automatically

### 3.4 Settlements
Use the feature name **Settlements**.

Settlements represent internal balances such as:

- Fran owes Sam
- Sam owes Fran
- Fran owes Household
- Sam owes Household
- potentially Household owes Fran or Sam if one of them overfunds shared costs personally

This is **not external debt** and must be shown separately from formal debts.

The UI should present **net balances**, not raw confusing ledger noise.

---

## 4. Must-support scenarios

The logic must correctly support these cases.

### Case A: Sam pays a shared expense from her personal account
Example:
- amount: 100
- source: `SAM_PERSONAL`
- owner: `HOUSEHOLD`
- split: 50/50

Result:
- household expenses +100
- Sam personal cash outflow +100
- category +100 in household reporting
- Fran owes Sam 50 in Settlements

### Case B: Sam pays a personal expense from her personal account
Example:
- source: `SAM_PERSONAL`
- owner: `SAM`
- shared: false

Result:
- Sam expenses +amount
- no household expense impact
- no settlements impact

### Case C: Sam pays a shared expense from the joint account
Example:
- source: `JOINT`
- owner: `HOUSEHOLD`

Result:
- household expenses +amount
- joint account cash outflow +amount
- no Fran/Sam settlement change

### Case D: Sam pays a personal expense from the joint account
Example:
- source: `JOINT`
- owner: `SAM`
- shared: false

Result:
- Sam personal expenses +amount
- joint account cash outflow +amount
- Sam owes Household that amount in Settlements

### Case E: Custom shared split
Example:
- amount: 100
- source: `FRAN_PERSONAL`
- owner: `HOUSEHOLD`
- split: Fran 70 / Sam 30

If Fran paid the full 100 personally:
- household expense +100
- Fran covered 100 cash
- Sam owes Fran 30
- Fran effectively covered his 70 share already

Support variable splits. Default shared split should be 50/50.

---

## 5. Navigation and information architecture

The app must be designed primarily for phone use.

### 5.1 Bottom navigation
Use this bottom nav:

- `Home`
- `Transactions`
- `Add` (large central button)
- `Debts`
- `More`

The **Add** button should be visually emphasized and always easy to hit with one thumb.

### 5.2 More screen
The `More` screen should act as a clean secondary hub.

It should include grouped rows for:

#### Household
- Settlements
- Recurring
- Categories
- Accounts

#### Preferences
- Settings

This is cleaner than overloading the bottom navigation or turning Settings into a giant junk drawer.

### 5.3 Settings hierarchy
`Settings` should contain global app behavior, not everyday data management.

It should include:

- Appearance
- Language
- Defaults
- Google Sheets Sync
- Backups & Data
- About

Do **not** bury Categories, Accounts, and Recurring under Settings. Those should be dedicated management screens accessible from `More`.

---

## 6. MVP feature set

Build the MVP around these features.

### 6.1 Home dashboard
A mobile-friendly dashboard showing:

1. **Household / Joint overview**
   - estimated current balance for the joint account
   - income received this month
   - expenses this month
   - recurring obligations this month
   - debt payments this month
   - estimated available money

2. **Household spending overview**
   - total shared expenses this month
   - total shared recurring expenses this month
   - total shared debt payments this month
   - category breakdown

3. **Personal summaries**
   - Fran summary
   - Sam summary
   Each should show:
   - income this month
   - one-time expenses this month
   - recurring personal expenses this month
   - debt payments this month
   - estimated available money

4. **Settlements summary**
   - who owes whom right now
   - who owes Household right now

5. **Debt summary**
   - shared debt total
   - Fran personal debt total
   - Sam personal debt total
   - monthly debt obligations

6. **Category breakdown**
   - filters by owner/source/month
   - chart plus list

The Home screen should feel like a polished finance app with cards, spacing, and visual calm.

### 6.2 Add Expense flow
This is the highest-priority UX.

Requirements:
- reachable through a large central action button in bottom navigation
- optimized for mobile
- minimal typing
- default values intelligently chosen
- save locally instantly
- sync later if needed

Expense fields:
- amount
- date
- description / merchant
- category
- cash source (`Fran`, `Sam`, `Joint`)
- owner (`Fran`, `Sam`, `Household`)
- shared toggle
- split slider or percentage control (default 50/50 when shared)
- optional notes
- optional tags
- optional recurring-template link

Behavior rules:
- if source is `Joint`, shared should default to true, but the user may turn it off
- if owner is `HOUSEHOLD`, shared is effectively true
- if shared is false and source is personal, it should only count for that person's expenses
- if shared is false and source is `Joint`, create settlement from person to household

### 6.3 Live consequence preview on Add Expense
The Add Expense screen must clearly explain what will happen before saving.

Examples:
- `Paid from Sam · belongs to Household · Fran will owe Sam €50`
- `Paid from Joint · belongs to Sam · Sam will owe Household €100`
- `Paid from Fran · belongs to Fran · no settlement impact`

This is a signature UX detail and should increase trust in the app.

### 6.4 Transactions view
- list of transactions
- filters by month, person, source, category, shared, recurring, debt-related
- search by text/merchant/notes
- ability to edit and delete
- editing or deleting must recalculate settlements and aggregates correctly

### 6.5 Recurring items
A separate container/table for recurring obligations.

Types:
- recurring expense
- recurring income
- recurring debt payment
- recurring transfer if needed later

Requirements:
- stored separately from one-time transactions
- used for monthly projections automatically
- optionally instantiated as real transactions later
- should support start date, optional end date, frequency, amount, owner/source/category

At minimum support monthly recurrence.

### 6.6 Debts
Track both formal debts and internal Settlements separately.

External/personal/shared debts should support:
- name
- owner (`FRAN`, `SAM`, `HOUSEHOLD`)
- original amount
- current balance
- interest rate (optional)
- minimum payment
- due date / payment day (optional)
- lender / notes (optional)
- strategy flags for payoff planning

Debt page should show:
- Fran debt total
- Sam debt total
- Household/shared debt total
- monthly debt payment total
- payoff projections later

### 6.7 Settlements page
Separate from Debt page as a clear first-class screen, though discoverable near it.

Show:
- net Fran ↔ Sam balance
- Fran ↔ Household balance
- Sam ↔ Household balance
- settlement event history
- optional “record settlement payment” action

This page must make it obvious that Settlements are internal accounting, not bank debt.

### 6.8 Incomes
Support:
- recurring monthly income
- one-time / punctual income
- source person / destination account

The dashboard should estimate available money by taking incomes into account.

### 6.9 Monthly forecasting
The app should calculate, per month:
- actual incomes so far
- recurring incomes expected
- one-time expenses entered
- recurring expenses expected
- debt payments expected
- estimated remaining money

This must work at:
- household level
- Fran level
- Sam level
- joint account level

---

## 7. Non-MVP but design for later

Design code and data models so these can be added later cleanly:

- category budgets/goals
- bank CSV import
- bank balance reconciliation
- debt snowball vs avalanche planning
- charts/history trends
- notifications/reminders
- receipts / attachments
- exporting reports
- more sophisticated Google Sheets bidirectional sync conflict handling

---

## 8. UX / visual direction

The app should feel like a modern iOS-inspired finance app, not like a spreadsheet.

Requirements:
- mobile-first layouts
- touch-friendly controls
- bottom nav
- strong typography hierarchy
- generous spacing
- rounded cards with comfortable padding
- smooth transitions
- safe-area support for notch and home indicator
- installable PWA behavior
- polished empty states
- dark mode that looks intentional, not inverted

Avoid clunky desktop-style tables on the main mobile experience. Use cards, segmented controls, filters, drawers, sheets, and concise list rows.

For desktop, it can expand responsibly, but mobile is primary.

---

## 9. i18n requirements

Support **English** and **Spanish** using dictionary files.

Requirements:
- no hardcoded UI strings
- use translation keys everywhere
- browser/device language detection on first launch
- manual override in settings
- persist language choice locally
- use interpolation rather than separate keys for every name combination

Suggested structure:
- `src/i18n/en.json`
- `src/i18n/es.json`

Prefer predictable flat-ish keys, for example:
- `nav.home`
- `nav.transactions`
- `nav.debts`
- `nav.more`
- `expense.add`
- `settlements.title`
- `dashboard.availableMoney`

Prefer interpolation patterns such as:
- `settlements.owes = "{from} owes {to}"`

Keep localization practical and easy for the developer to tweak later.

---

## 10. Theme requirements

Support:
- light mode
- dark mode
- system default

Requirements:
- device theme detection
- manual override in settings
- persist choice locally
- theme tokens / CSS variables instead of hardcoded colors everywhere

---

## 11. Suggested screen structure

### 11.1 Home
Main cards/sections:
- Household overview
- Joint account snapshot
- Category breakdown
- Settlements summary
- Debt summary
- Fran summary
- Sam summary

### 11.2 Transactions
- filter row
- transaction list
- badges such as `Shared`, `Joint`, `Recurring`
- edit/delete

### 11.3 Add Expense
Prioritize speed:
- big amount input
- category picker
- source selector
- owner/shared controls
- split control when applicable
- date defaults to today
- sticky save button
- live consequence preview

### 11.4 Debts
- external debts list
- summaries by owner
- payoff strategy section later

### 11.5 More
Rows:
- Settlements
- Recurring
- Categories
- Accounts
- Settings

### 11.6 Settlements
- net balances
- ledger history
- record settlement payment

### 11.7 Recurring
- recurring incomes
- recurring expenses
- recurring debt payments

### 11.8 Categories
- list of categories
- create/edit/delete
- category behavior defaults if useful

### 11.9 Accounts
- Fran personal account
- Sam personal account
- Joint account
- optional estimated balance / initial balance setup

### 11.10 Settings
Rows:
- Appearance
- Language
- Defaults
- Google Sheets Sync
- Backups & Data
- About

---

## 12. Data model proposal

Implement a robust schema. You may refine names, but preserve the concepts.

### 12.1 Tables

#### `users`
Two rows only for now:
- Fran
- Sam

Fields:
- `id`
- `name`
- `is_active`
- timestamps

#### `accounts`
Fields:
- `id`
- `name`
- `type` (`PERSONAL`, `JOINT`)
- `owner_user_id` nullable for joint
- `currency_code`
- `initial_balance`
- `is_archived`
- timestamps

Accounts should represent at least:
- Fran personal account
- Sam personal account
- Joint account

#### `categories`
Fields:
- `id`
- `name`
- `kind` (`EXPENSE`, `INCOME`, maybe `TRANSFER`)
- `parent_id` nullable
- `is_default`
- `sort_order`
- `color` optional
- timestamps

#### `transactions`
Represents actual one-time recorded financial events.

Fields:
- `id`
- `type` (`EXPENSE`, `INCOME`, `TRANSFER`, `SETTLEMENT_PAYMENT`, `DEBT_PAYMENT`)
- `date`
- `month_key`
- `amount`
- `currency_code`
- `description`
- `notes`
- `category_id` nullable depending on type
- `source_account_id`
- `created_by_user_id` nullable
- `merchant` nullable
- `is_deleted` soft delete optional
- `origin` (`MANUAL`, `RECURRING_GENERATED`, `SHEET_IMPORT`)
- `sheet_sync_status` (`PENDING`, `SYNCED`, `FAILED`)
- `sheet_row_ref` nullable
- timestamps

#### `transaction_allocations`
Critical table. This is where economic ownership lives.

Fields:
- `id`
- `transaction_id`
- `owner_type` (`FRAN`, `SAM`, `HOUSEHOLD`)
- `share_percent`
- `share_amount`
- `settlement_effect_type` nullable
- timestamps

This enables clean handling of personal vs household ownership.

#### `recurring_items`
Fields:
- `id`
- `type` (`EXPENSE`, `INCOME`, `DEBT_PAYMENT`)
- `name`
- `amount`
- `currency_code`
- `frequency` (`MONTHLY` initially)
- `start_date`
- `end_date` nullable
- `category_id` nullable
- `source_account_id` nullable
- `owner_type` (`FRAN`, `SAM`, `HOUSEHOLD`)
- `default_shared_split_percent` nullable
- `is_active`
- `auto_include_in_projection`
- `auto_generate_transaction` false for MVP unless implemented safely
- timestamps

#### `debts`
Fields:
- `id`
- `name`
- `owner_type` (`FRAN`, `SAM`, `HOUSEHOLD`)
- `original_amount`
- `current_balance`
- `currency_code`
- `interest_rate` nullable
- `minimum_payment` nullable
- `payment_day` nullable
- `strategy_priority` nullable
- `notes` nullable
- `is_active`
- timestamps

#### `debt_payments`
Fields:
- `id`
- `debt_id`
- `transaction_id` nullable if tied to an actual transaction
- `payment_date`
- `amount`
- `principal_amount` nullable
- `interest_amount` nullable
- timestamps

#### `settlement_ledger`
A derived or persisted ledger of internal balances.

Fields:
- `id`
- `date`
- `source_transaction_id` nullable
- `from_party` (`FRAN`, `SAM`, `HOUSEHOLD`)
- `to_party` (`FRAN`, `SAM`, `HOUSEHOLD`)
- `amount`
- `reason`
- `notes` nullable
- timestamps

This should support recomputation if needed.

#### `monthly_snapshots`
Optional but useful.

Fields:
- `id`
- `month_key` (`YYYY-MM`)
- cached aggregates JSON or structured columns
- timestamps

#### `sync_queue`
Fields:
- `id`
- `entity_type`
- `entity_id`
- `action_type`
- `status`
- `attempt_count`
- `last_error`
- timestamps

---

## 13. Calculation rules

Implement calculation services cleanly and test them.

### 13.1 Expense ownership
- source account determines where cash left from
- allocations determine who economically owns the expense
- household-owned expenses count in household reporting
- personal-owned expenses count in personal reporting

### 13.2 Settlements generation
When a transaction is saved, edited, or deleted:
- recalculate its settlement effects
- write or recompute the related settlement ledger entries
- maintain current balances correctly

Examples:

#### Personal source, household owner
If Sam pays 100 from her personal account for household at 50/50:
- Fran owes Sam 50

#### Joint source, personal owner
If Sam pays 100 from joint for a personal purchase:
- Sam owes Household 100

#### Personal source, personal owner
- no settlements

#### Joint source, household owner
- no settlements

### 13.3 Net settlement balances
The UI should display net balances, not a confusing raw ledger.

Example:
- if Sam owed Fran 30 before
- and Fran now owes Sam 50 from a new event
- the net displayed balance should become Fran owes Sam 20

### 13.4 Available money
For each scope, calculate:

`available_money = actual_income + expected_remaining_income - actual_one_time_expenses - recurring_expenses_for_month - debt_payments_for_month - other planned obligations`

Support this for:
- Fran
- Sam
- Household
- Joint account
- optional combined couple overview

### 13.5 Monthly period handling
Use explicit month keys like `2026-05`.
Never rely on vague “current month” logic deep in calculations.

---

## 14. Google Sheets integration

Google Sheets integration is required, but keep it carefully scoped.

### 14.1 Important rule
**SQLite/local DB remains the source of truth.**
Google Sheets is:
- a sync target
- a readable external representation
- an optional import source when explicitly invoked

### 14.2 Authentication
Use OAuth appropriate for Google Sheets access.
Since this is a personal app for Fran and Sam, keep auth minimal and practical.
No separate internal user auth is required for MVP.

### 14.3 Sync behavior
When user records or edits data:
- save locally first
- mark record as `PENDING`
- enqueue sync job
- attempt background sync when online
- on success mark as `SYNCED`
- on failure retain error state and allow retry

### 14.4 Sync direction
MVP should prioritize:
- **app -> Google Sheets**

But also support limited, explicit **read/import from Sheets** when needed.
Do not build complex bidirectional conflict resolution in MVP.
If local and remote differ, local should generally win unless the user explicitly chooses import/merge.

### 14.5 Raw tabs concept
The current Google Sheet may contain nicely formatted monthly tabs and formulas. For app integration, create or use dedicated raw tabs such as:

- `raw_transactions`
- `raw_transaction_allocations`
- `raw_recurring_items`
- `raw_debts`
- `raw_debt_payments`
- `raw_settlements`
- `raw_monthly_snapshots`
- `raw_accounts`
- `raw_categories`

The app should write structured rows to these raw tabs. The prettier formula/month tabs can reference those raw tabs.

### 14.6 Current monthly sheet behavior
The user wants the app to update the existing spreadsheet for the current month and, if the month has changed, ensure the new month structure/formulas exist.

For MVP, design a **safe, explicit month-sync service** such that:
- the app knows the active month key (`YYYY-MM`)
- before writing month-related data, it checks whether the corresponding sheet/tab structure exists
- if it does not exist, it can create/copy the expected month template if that is safe and configurable
- avoid brittle magic based solely on existing formulas

Implement this modularly. It is acceptable to scaffold the service with a clear interface and TODOs if the exact existing spreadsheet template logic is not fully known yet.

### 14.7 Recommended sync payloads
Every synced row should include stable identifiers such as:
- local UUID
- created_at
- updated_at
- month_key
- source/account/owner identifiers
- sync version if needed

This prevents duplicate row chaos.

---

## 15. Offline-first behavior

Requirements:
- app is usable offline
- writes succeed locally immediately
- pending sync states are visible but not annoying
- online/offline state detectable
- queued sync retries later
- no data loss on refresh if browser storage is preserved

Use service worker + PWA installation setup.

---

## 16. Architecture guidance

Organize code cleanly by domain.

Suggested structure:

- `src/app`
- `src/components`
- `src/features/home`
- `src/features/transactions`
- `src/features/recurring`
- `src/features/debts`
- `src/features/settlements`
- `src/features/categories`
- `src/features/accounts`
- `src/features/settings`
- `src/lib/db`
- `src/lib/sync`
- `src/lib/i18n`
- `src/lib/theme`
- `src/lib/calculations`
- `src/lib/date`
- `src/lib/google`
- `src/store`
- `src/types`

Create pure calculation modules for:
- expense aggregation
- monthly summaries
- settlements generation
- debt summaries
- available money projections

Do not bury financial logic inside UI components.

---

## 17. Testing requirements

Because this app contains real accounting logic, tests matter.

At minimum include tests for:
- settlement generation
- custom split handling
- editing/deleting transaction recalculation
- monthly summary calculations
- recurring inclusion in monthly projections
- joint-account personal-expense handling
- net balance calculation

Add seed/demo data for Fran and Sam.

---

## 18. Seed/demo data

Provide initial seed data so the app is easy to run and inspect.

Include:
- users: Fran and Sam
- accounts: Fran personal, Sam personal, Joint
- a few categories
- a few recurring incomes
- a few recurring expenses
- sample debts
- sample transactions covering all major logic cases

This should make the app visually useful from first launch.

---

## 19. Implementation priorities

Build in this order:

### Phase 1
- app shell
- theme
- i18n
- local SQLite setup
- seed data
- bottom nav
- Home skeleton

### Phase 2
- Add Expense flow
- transaction storage
- categories
- list view
- edit/delete
- live consequence preview

### Phase 3
- settlement engine
- settlement ledger UI
- monthly aggregation logic

### Phase 4
- recurring items
- debt tracking
- debt summaries
- forecasting
- More screen management pages

### Phase 5
- Google Sheets OAuth and sync queue
- raw tab sync
- sync status UI
- limited import/read tools
- month-sync service scaffolding

### Phase 6
- refinements
- charts
- installability polish
- performance and UX improvements

---

## 20. Deliverables expected

Produce:

1. A working React + Vite + TypeScript PWA
2. Clear folder structure
3. SQLite/local persistence implementation
4. Seed data and runnable dev environment
5. Core screens implemented
6. Correct Settlements logic
7. Recurring and debt models
8. Google Sheets sync scaffold or implementation
9. Clean mobile-first UI
10. Reasonable tests for critical calculations

Also include:
- concise README
- setup instructions
- notes on how Google Sheets sync is configured
- explanation of assumptions and TODOs

---

## 21. Important product constraints

- Do not overbuild enterprise auth or permissions
- Do not make the UI feel like a spreadsheet clone
- Do not rely on Google Sheets as the primary database
- Do not hide critical financial logic in UI-only state
- Do not skip Settlements correctness
- Do not optimize for desktop first
- Do not make Settings a dumping ground for all management screens

---

## 22. Practical assumptions you may make

You may assume:
- single household using app privately
- euro currency for MVP, but code should not be hardcoded everywhere if avoidable
- no complicated multi-user cloud permissions needed
- no native mobile app required for MVP
- no perfect bidirectional sync required yet
- monthly frequency is enough for first recurring implementation

---

## 23. Nice-to-have UX ideas

If easy to implement, consider:
- recent categories on Add Expense screen
- smart defaults from last used source/category
- segmented owner selector
- slider for split percentage
- quick “Paid from / Belongs to” mental model in UI labels
- subtle sync badge showing pending/synced/failed
- sparkline or small trend visualizations
- onboarding tips explaining source vs owner
- sticky save button on the Add Expense screen

---

## 24. Final instruction

Build this like a serious personal finance product with clean architecture and elegant UX, but keep scope grounded. Favor correctness, clarity, and maintainability. When in doubt, choose the simpler implementation that preserves the accounting model and keeps expense entry fast.
