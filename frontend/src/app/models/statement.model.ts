import { BankName } from './bank.model';

export interface Statement {
  id: number;
  userId: number;
  fileName: string;
  bankName: BankName;
  fileType: 'PDF' | 'XLSX' | 'CSV';
  statementPeriod: string | null;
  uploadedAt: string;
  status: 'pending' | 'processing' | 'processed' | 'failed';
  errorMessage: string | null;
}

export interface Transaction {
  id: number;
  statementId: number;
  userId: number;
  bankName: BankName;
  transactionDate: string;       // "YYYY-MM-DD"
  rawDescription: string;
  cleanName: string | null;
  amount: number;
  currency: 'TRY' | 'USD';
  transactionType: 'EXPENSE' | 'INCOME';
  isMonthlySubscription: 0 | 1;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  installmentAmount: number | null;
  category: string | null;
  createdAt: string;
}

export interface UploadSummary {
  message: string;
  statementId: number;
  transactionCount: number;
  summary: {
    totalExpense: number;
    totalIncome: number;
    subscriptions: number;
  };
}
