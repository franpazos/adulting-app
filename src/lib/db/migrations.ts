import { exec, execScript, selectAll, selectScalar, transaction } from "./client";

/**
 * Migrations are append-only. To change the schema, add a new entry to
 * `MIGRATIONS` with a higher `version`. Never edit a past migration.
 *
 * Tracking table: `schema_migrations` (id INTEGER PK, version INTEGER UNIQUE,
 * name TEXT, applied_at TEXT). The runner runs every migration whose
 * version is > the max applied version, in order, in a transaction.
 *
 * SQL conventions:
 *  - PRIMARY KEY columns are TEXT UUIDs created in app code.
 *  - Booleans stored as INTEGER (0/1).
 *  - Dates as ISO strings (YYYY-MM-DD or full timestamp).
 *  - month_key as YYYY-MM for fast filtering.
 */

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('PERSONAL', 'JOINT')),
        owner_user_id TEXT NULL REFERENCES users(id),
        currency_code TEXT NOT NULL,
        initial_balance REAL NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('EXPENSE', 'INCOME', 'TRANSFER')),
        parent_id TEXT NULL REFERENCES categories(id),
        is_default INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        color TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_categories_kind ON categories(kind);

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('EXPENSE', 'INCOME', 'TRANSFER', 'SETTLEMENT_PAYMENT', 'DEBT_PAYMENT')),
        date TEXT NOT NULL,
        month_key TEXT NOT NULL,
        amount REAL NOT NULL,
        currency_code TEXT NOT NULL,
        description TEXT NULL,
        notes TEXT NULL,
        category_id TEXT NULL REFERENCES categories(id),
        source_account_id TEXT NOT NULL REFERENCES accounts(id),
        created_by_user_id TEXT NULL REFERENCES users(id),
        merchant TEXT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        origin TEXT NOT NULL CHECK (origin IN ('MANUAL', 'RECURRING_GENERATED', 'SHEET_IMPORT')),
        sheet_sync_status TEXT NOT NULL CHECK (sheet_sync_status IN ('PENDING', 'SYNCED', 'FAILED')),
        sheet_row_ref TEXT NULL,
        exchange_rate REAL NULL,
        amount_in_account_currency REAL NULL,
        amount_in_debt_currency REAL NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions(month_key, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source_account_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);

      CREATE TABLE IF NOT EXISTS transaction_allocations (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        owner_type TEXT NOT NULL CHECK (owner_type IN ('FRAN', 'SAM', 'HOUSEHOLD')),
        share_percent REAL NOT NULL,
        share_amount REAL NOT NULL,
        settlement_effect_type TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_alloc_tx ON transaction_allocations(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_alloc_owner ON transaction_allocations(owner_type);

      CREATE TABLE IF NOT EXISTS recurring_items (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('EXPENSE', 'INCOME', 'DEBT_PAYMENT')),
        name TEXT NOT NULL,
        amount REAL NOT NULL,
        currency_code TEXT NOT NULL,
        frequency TEXT NOT NULL CHECK (frequency IN ('MONTHLY')),
        start_date TEXT NOT NULL,
        end_date TEXT NULL,
        category_id TEXT NULL REFERENCES categories(id),
        source_account_id TEXT NULL REFERENCES accounts(id),
        owner_type TEXT NOT NULL CHECK (owner_type IN ('FRAN', 'SAM', 'HOUSEHOLD')),
        default_shared_split_percent REAL NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        auto_include_in_projection INTEGER NOT NULL DEFAULT 1,
        auto_generate_transaction INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS debts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_type TEXT NOT NULL CHECK (owner_type IN ('FRAN', 'SAM', 'HOUSEHOLD')),
        original_amount REAL NOT NULL,
        current_balance REAL NOT NULL,
        currency_code TEXT NOT NULL,
        interest_rate REAL NULL,
        minimum_payment REAL NULL,
        payment_day INTEGER NULL,
        strategy_priority INTEGER NULL,
        notes TEXT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS debt_payments (
        id TEXT PRIMARY KEY,
        debt_id TEXT NOT NULL REFERENCES debts(id),
        transaction_id TEXT NULL REFERENCES transactions(id),
        payment_date TEXT NOT NULL,
        amount REAL NOT NULL,
        principal_amount REAL NULL,
        interest_amount REAL NULL,
        exchange_rate REAL NULL,
        amount_in_account_currency REAL NULL,
        amount_in_debt_currency REAL NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON debt_payments(debt_id);

      CREATE TABLE IF NOT EXISTS settlement_ledger (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        source_transaction_id TEXT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        from_party TEXT NOT NULL CHECK (from_party IN ('FRAN', 'SAM', 'HOUSEHOLD')),
        to_party TEXT NOT NULL CHECK (to_party IN ('FRAN', 'SAM', 'HOUSEHOLD')),
        amount REAL NOT NULL,
        reason TEXT NOT NULL,
        notes TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_settlement_parties ON settlement_ledger(from_party, to_party);

      CREATE TABLE IF NOT EXISTS monthly_snapshots (
        id TEXT PRIMARY KEY,
        month_key TEXT NOT NULL UNIQUE,
        aggregates_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action_type TEXT NOT NULL CHECK (action_type IN ('CREATE', 'UPDATE', 'DELETE')),
        status TEXT NOT NULL CHECK (status IN ('PENDING', 'SYNCED', 'FAILED')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
    `,
  },
  {
    version: 2,
    name: "sync_conflicts",
    sql: `
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        local_data TEXT NOT NULL,
        remote_data TEXT NOT NULL,
        local_updated_at TEXT NOT NULL,
        remote_updated_at TEXT NOT NULL,
        detected_at TEXT NOT NULL,
        resolved_at TEXT NULL,
        resolution TEXT NULL CHECK (resolution IN ('local', 'remote'))
      );
      CREATE INDEX IF NOT EXISTS idx_sync_conflicts_unresolved
        ON sync_conflicts(resolved_at) WHERE resolved_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_sync_conflicts_entity
        ON sync_conflicts(entity_type, entity_id);
    `,
  },
  {
    // Temporary "buzón de sugerencias" feature for live testing. To remove
    // when beta wraps: drop this migration's table, the raw_feedback tab,
    // the FeedbackButton/Sheet/Page components, and the i18n keys.
    version: 3,
    name: "feedback",
    sql: `
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('meh', 'nice', 'want', 'sos')),
        tag TEXT NOT NULL CHECK (tag IN ('bug', 'idea', 'design', 'other')),
        created_by_user_id TEXT NULL REFERENCES users(id),
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_feedback_active
        ON feedback(is_deleted);
    `,
  },
  {
    version: 4,
    name: "categories_update",
    sql: `
      ALTER TABLE categories ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
    `,
  },
  {
    // Level 2 of the recurring rollout: link a transaction back to the
    // recurring item it materializes. Lets the UI show paid/pending per
    // month without touching forecast aggregation (see aggregations.ts
    // top docstring — that warning only fires in Level 3).
    version: 5,
    name: "transactions_recurring_id",
    sql: `
      ALTER TABLE transactions ADD COLUMN recurring_id TEXT NULL REFERENCES recurring_items(id);
      CREATE INDEX IF NOT EXISTS idx_transactions_recurring
        ON transactions(recurring_id, month_key);
    `,
  },
  {
    // Level 4: link a recurring DEBT_PAYMENT to a specific debt so that
    // materialization (manual or auto-gen) also decrements the debt's
    // current_balance via debt_payments. Nullable for backwards-compat
    // (existing pre-v6 recurrings keep working as informational items);
    // the form gates the requirement at save time for new DEBT_PAYMENT
    // rows.
    version: 6,
    name: "recurring_items_debt_id",
    sql: `
      ALTER TABLE recurring_items ADD COLUMN debt_id TEXT NULL REFERENCES debts(id);
      CREATE INDEX IF NOT EXISTS idx_recurring_debt
        ON recurring_items(debt_id);
    `,
  }
];

function ensureMigrationsTable(): void {
  exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
}

function appliedVersions(): Set<number> {
  const rows = selectAll<{ version: number }>(
    "SELECT version FROM schema_migrations ORDER BY version ASC",
  );
  return new Set(rows.map((r) => r.version));
}

export function runMigrations(): { applied: number; current: number } {
  ensureMigrationsTable();
  const already = appliedVersions();
  const pending = MIGRATIONS.filter((m) => !already.has(m.version)).sort(
    (a, b) => a.version - b.version,
  );

  let applied = 0;
  for (const m of pending) {
    transaction(() => {
      execScript(m.sql);
      exec(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        [m.version, m.name, new Date().toISOString()],
      );
    });
    applied++;
  }

  const current = selectScalar(
    "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
  );
  return { applied, current };
}
