import { drizzle } from "npm:drizzle-orm/libsql";
import { createClient } from "npm:@libsql/client";
import * as schema from "./schema.ts";

const client = createClient({ url: "file:./dev.db" });

export const db = drizzle(client, { schema });

// ============================================================
// Initialize database tables (CREATE IF NOT EXISTS)
// Called once on app startup — no migration tooling needed
// ============================================================
export async function initializeDatabase(): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS statements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      file_name TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_hash TEXT,
      statement_period TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_id INTEGER NOT NULL REFERENCES statements(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      bank_name TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      raw_description TEXT NOT NULL,
      clean_name TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'TRY',
      transaction_type TEXT NOT NULL DEFAULT 'EXPENSE',
      is_monthly_subscription INTEGER NOT NULL DEFAULT 0,
      installment_current INTEGER,
      installment_total INTEGER,
      installment_amount REAL,
      category TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_bank_name ON transactions(bank_name);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_statements_user_id ON statements(user_id);
  `);

  // Migration: add file_hash column if it doesn't exist (for existing DBs)
  try {
    await client.execute("ALTER TABLE statements ADD COLUMN file_hash TEXT");
  } catch {
    // Column already exists — ignore
  }

  // Create index on file_hash (safe to run after migration)
  try {
    await client.execute("CREATE INDEX IF NOT EXISTS idx_statements_file_hash ON statements(file_hash)");
  } catch {
    // ignore
  }

  // Predictions cache table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      prediction_data TEXT NOT NULL,
      transaction_count INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  console.log("✅ Database initialized successfully");
}
