# Data Model

The data model implements the accounting concept defined in the spec: every financial event has both a **cash source** (where money came from) and an **economic owner** (who the expense belongs to). These are not always the same.

The model also supports **multi-currency** debts and payments (see ADR-004).

> Implementation status: schema below is the **target** for Phase 3. Migrations are not yet written. Tables live in `src/lib/db/migrations/`.

---

## Enums

```ts
type CashSource = "FRAN_PERSONAL" | "SAM_PERSONAL" | "JOINT";
type OwnerType  = "FRAN" | "SAM" | "HOUSEHOLD";
type AccountType = "PERSONAL" | "JOINT";
type CategoryKind = "EXPENSE" | "INCOME" | "TRANSFER";
type TxType = "EXPENSE" | "INCOME" | "TRANSFER" | "SETTLEMENT_PAYMENT" | "DEBT_PAYMENT";
type RecurringType = "EXPENSE" | "INCOME" | "DEBT_PAYMENT";
type Frequency = "MONTHLY"; // expand later
type TxOrigin = "MANUAL" | "RECURRING_GENERATED" | "SHEET_IMPORT";
type SyncStatus = "PENDING" | "SYNCED" | "FAILED";
```

---

## Tables

### `users`
Two rows only: Fran, Sam.
```
id TEXT PRIMARY KEY
name TEXT NOT NULL
is_active INTEGER NOT NULL DEFAULT 1
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

### `accounts`
At least Fran personal, Sam personal, Joint.
```
id TEXT PRIMARY KEY
name TEXT NOT NULL
type TEXT NOT NULL          -- AccountType
owner_user_id TEXT NULL     -- null for JOINT
currency_code TEXT NOT NULL -- e.g. "EUR", "USD"
initial_balance REAL NOT NULL DEFAULT 0
is_archived INTEGER NOT NULL DEFAULT 0
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

### `categories`
```
id TEXT PRIMARY KEY
name TEXT NOT NULL
kind TEXT NOT NULL          -- CategoryKind
parent_id TEXT NULL
is_default INTEGER NOT NULL DEFAULT 0
sort_order INTEGER NOT NULL DEFAULT 0
color TEXT NULL
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

### `transactions`
Actual one-time recorded financial events.
```
id TEXT PRIMARY KEY
type TEXT NOT NULL                       -- TxType
date TEXT NOT NULL                       -- ISO date
month_key TEXT NOT NULL                  -- YYYY-MM (denormalized for fast filtering)
amount REAL NOT NULL                     -- amount in source account's currency
currency_code TEXT NOT NULL              -- source account's currency at time of tx
description TEXT NULL
notes TEXT NULL
category_id TEXT NULL
source_account_id TEXT NOT NULL
created_by_user_id TEXT NULL
merchant TEXT NULL
is_deleted INTEGER NOT NULL DEFAULT 0
origin TEXT NOT NULL                     -- TxOrigin
sheet_sync_status TEXT NOT NULL          -- SyncStatus
sheet_row_ref TEXT NULL

-- Multi-currency (only relevant when tx ties to a different-currency entity, e.g. debt payment in USD from EUR account):
exchange_rate REAL NULL                  -- units of debt-currency per 1 account-currency unit
amount_in_account_currency REAL NULL     -- equals `amount` for normal txs; the EUR side for FX
amount_in_debt_currency REAL NULL        -- the USD side for an FX debt payment

created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

### `transaction_allocations`
Where economic ownership lives. One row per owner share.
```
id TEXT PRIMARY KEY
transaction_id TEXT NOT NULL
owner_type TEXT NOT NULL                 -- OwnerType
share_percent REAL NOT NULL              -- 0..100
share_amount REAL NOT NULL               -- precomputed for fast aggregation
settlement_effect_type TEXT NULL         -- e.g. "FRAN_OWES_SAM" — denormalized hint
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

### `recurring_items`
Templates for monthly projections; not actual transactions.
```
id TEXT PRIMARY KEY
type TEXT NOT NULL                       -- RecurringType
name TEXT NOT NULL
amount REAL NOT NULL
currency_code TEXT NOT NULL
frequency TEXT NOT NULL                  -- Frequency
start_date TEXT NOT NULL
end_date TEXT NULL
category_id TEXT NULL
source_account_id TEXT NULL
owner_type TEXT NOT NULL                 -- OwnerType
default_shared_split_percent REAL NULL
is_active INTEGER NOT NULL DEFAULT 1
auto_include_in_projection INTEGER NOT NULL DEFAULT 1
auto_generate_transaction INTEGER NOT NULL DEFAULT 0
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

### `debts`
External / formal debts (separate from internal Settlements).
```
id TEXT PRIMARY KEY
name TEXT NOT NULL
owner_type TEXT NOT NULL                 -- OwnerType
original_amount REAL NOT NULL
current_balance REAL NOT NULL
currency_code TEXT NOT NULL              -- e.g. "USD" for relative debts
interest_rate REAL NULL
minimum_payment REAL NULL
payment_day INTEGER NULL                 -- 1..31
strategy_priority INTEGER NULL
notes TEXT NULL
is_active INTEGER NOT NULL DEFAULT 1
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

### `debt_payments`
```
id TEXT PRIMARY KEY
debt_id TEXT NOT NULL
transaction_id TEXT NULL                 -- ties to a real cash event when applicable
payment_date TEXT NOT NULL
amount REAL NOT NULL                     -- amount applied in debt's currency
principal_amount REAL NULL
interest_amount REAL NULL

-- Multi-currency:
exchange_rate REAL NULL                  -- units of debt-currency per 1 account-currency unit
amount_in_account_currency REAL NULL     -- cash actually leaving the source account
amount_in_debt_currency REAL NULL        -- equals `amount` (kept for explicitness)

created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

### `settlement_ledger`
Internal balances between Fran ↔ Sam ↔ Household. Recomputable from transactions.
```
id TEXT PRIMARY KEY
date TEXT NOT NULL
source_transaction_id TEXT NULL
from_party TEXT NOT NULL                 -- OwnerType
to_party TEXT NOT NULL                   -- OwnerType
amount REAL NOT NULL
reason TEXT NOT NULL
notes TEXT NULL
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

### `monthly_snapshots` (optional cache)
```
id TEXT PRIMARY KEY
month_key TEXT NOT NULL UNIQUE           -- YYYY-MM
aggregates_json TEXT NOT NULL
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

### `sync_queue`
```
id TEXT PRIMARY KEY
entity_type TEXT NOT NULL                -- "transaction", "debt", etc.
entity_id TEXT NOT NULL
action_type TEXT NOT NULL                -- "CREATE" | "UPDATE" | "DELETE"
status TEXT NOT NULL                     -- SyncStatus
attempt_count INTEGER NOT NULL DEFAULT 0
last_error TEXT NULL
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

---

## Recipe — recording a shared expense paid from a personal account

Sam pays €100 from `SAM_PERSONAL` for a household groceries purchase, 50/50 split:

1. Insert into `transactions`: `type=EXPENSE`, `source_account_id=sam_personal`, `amount=100`, `currency_code=EUR`.
2. Insert two `transaction_allocations`:
   - `owner_type=FRAN`, `share_percent=50`, `share_amount=50`
   - `owner_type=SAM`, `share_percent=50`, `share_amount=50`
3. Settlement engine writes to `settlement_ledger`: `from=FRAN, to=SAM, amount=50, reason="shared_expense_personal_source"`.
4. Net balance shown in UI: **Fran owes Sam €50** (after netting against any prior balances).

## Recipe — recording a USD debt payment from EUR account

Pay $100 to a relative on a USD debt, FX rate 1.08 EUR/USD at time of payment:

1. Insert `transactions`: `type=DEBT_PAYMENT`, `source_account_id=fran_personal` (EUR), `amount=108`, `currency_code=EUR`, `exchange_rate=0.926` (USD per EUR), `amount_in_account_currency=108`, `amount_in_debt_currency=100`.
2. Insert `debt_payments`: `amount=100`, `exchange_rate=0.926`, `amount_in_account_currency=108`, `amount_in_debt_currency=100`.
3. Decrement `debts.current_balance` by 100 (in the debt's currency).
4. UI shows: cash out €108, debt reduced by $100.
