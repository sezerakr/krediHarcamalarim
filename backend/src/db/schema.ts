import { sqliteTable, text, integer, real } from "npm:drizzle-orm/sqlite-core";
import { sql } from "npm:drizzle-orm";

// ============================================================
// Users table
// ============================================================
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ============================================================
// Statements table — one per uploaded PDF/XLSX file
// ============================================================
export const statements = sqliteTable("statements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  fileName: text("file_name").notNull(),
  bankName: text("bank_name").notNull(), // "ZİRAAT" | "PARAF"
  fileType: text("file_type").notNull(), // "PDF" | "XLSX" | "CSV"
  fileHash: text("file_hash"), // SHA-256 hash for duplicate detection
  statementPeriod: text("statement_period"), // e.g. "2025-01"
  uploadedAt: text("uploaded_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  status: text("status").notNull().default("pending"), // pending | processing | processed | failed
  errorMessage: text("error_message"),
});

// ============================================================
// Transactions table — individual purchases/payments
// ============================================================
export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  statementId: integer("statement_id")
    .notNull()
    .references(() => statements.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  bankName: text("bank_name").notNull(), // denormalized for fast filtering
  transactionDate: text("transaction_date").notNull(), // YYYY-MM-DD
  rawDescription: text("raw_description").notNull(),
  cleanName: text("clean_name"),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("TRY"),
  transactionType: text("transaction_type").notNull().default("EXPENSE"), // EXPENSE | INCOME
  isMonthlySubscription: integer("is_monthly_subscription").notNull().default(0),
  installmentCurrent: integer("installment_current"),
  installmentTotal: integer("installment_total"),
  installmentAmount: real("installment_amount"),
  category: text("category"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Type helpers for inserting/selecting
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Statement = typeof statements.$inferSelect;
export type NewStatement = typeof statements.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

// ============================================================
// Predictions cache table — stores LLM prediction results
// ============================================================
export const predictions = sqliteTable("predictions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  predictionData: text("prediction_data").notNull(), // JSON string
  transactionCount: integer("transaction_count").notNull(), // cache key
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Prediction = typeof predictions.$inferSelect;
