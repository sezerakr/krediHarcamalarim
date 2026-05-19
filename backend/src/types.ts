// ============================================================
// Shared TypeScript types for the Personal Finance Dashboard
// ============================================================

/** Supported bank identifiers */
export type BankName = "ZİRAAT" | "PARAF";

/** Transaction direction */
export type TransactionType = "EXPENSE" | "INCOME";

/** Statement processing status */
export type StatementStatus = "pending" | "processing" | "processed" | "failed";

/** File type for uploaded statements */
export type FileType = "PDF" | "XLSX" | "CSV";

// --- Raw parsed transaction (before AI enrichment) ---
export interface RawParsedTransaction {
  bankName: BankName;
  transactionDate: string; // YYYY-MM-DD
  rawDescription: string;
  amount: number;
  currency: string; // "TRY" or "USD"
  transactionType: TransactionType;
  sector?: string; // From Paraf's Sektör column
  installmentCurrent?: number;
  installmentTotal?: number;
}

// --- Enriched transaction (after AI processing) ---
export interface EnrichedTransaction extends RawParsedTransaction {
  cleanName: string;
  isMonthlySubscription: boolean;
  category: string;
}

// --- Final normalized transaction for DB storage ---
export interface NormalizedTransaction {
  id?: number;
  statementId: number;
  userId: number;
  bankName: BankName;
  transactionDate: string;
  rawDescription: string;
  cleanName?: string;
  amount: number;
  currency: string;
  transactionType: TransactionType;
  isMonthlySubscription: boolean;
  installmentCurrent?: number;
  installmentTotal?: number;
  installmentAmount?: number;
  category?: string;
}

// --- Auth types ---
export interface JwtPayload {
  sub: number; // userId
  email: string;
  exp: number;
}

// --- API request/response types ---
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: number;
    email: string;
    name: string;
  };
}
