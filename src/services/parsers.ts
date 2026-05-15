/**
 * Bank Statement Parsers
 *
 * Ziraat Bankası — PDF text parsing
 * Paraf (Halkbank) — XLSX/CSV parsing
 *
 * Both produce RawParsedTransaction[] for AI enrichment.
 */

import type { RawParsedTransaction, BankName } from "../types.ts";

// ============================================================
// Utility: Turkish date (DD.MM.YYYY) -> ISO (YYYY-MM-DD)
// ============================================================
function convertDate(turkishDate: string): string {
  const parts = turkishDate.trim().split(".");
  if (parts.length !== 3) return turkishDate;
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// ============================================================
// Utility: Turkish amount string -> number
// "1.320,00" -> 1320.00
// "1.320,00+" -> 1320.00 (income flag)
// "+6,99TL " -> 6.99 (income flag)
// "69,90TL " -> 69.90
// ============================================================
interface ParsedAmount {
  value: number;
  isIncome: boolean;
}

function parseAmount(raw: string): ParsedAmount {
  if (!raw || raw.trim() === "") return { value: 0, isIncome: false };

  let cleaned = raw.trim();

  // Check for income indicators
  const isIncome = cleaned.endsWith("+") || cleaned.startsWith("+");

  // Remove TL suffix, +/- signs, whitespace
  cleaned = cleaned
    .replace(/TL\s*/gi, "")
    .replace(/\+/g, "")
    .replace(/-/g, "")
    .trim();

  // Remove thousand separator dots, convert decimal comma to dot
  cleaned = cleaned.replace(/\./g, "").replace(",", ".");

  const value = parseFloat(cleaned);
  return { value: isNaN(value) ? 0 : Math.abs(value), isIncome };
}

// ============================================================
// Utility: Check if a string is a valid date (DD.MM.YYYY)
// ============================================================
function isDateString(str: string): boolean {
  return /^\d{2}\.\d{2}\.\d{4}$/.test(str.trim());
}

// ============================================================
// ZIRAAT BANKASI — PDF Text Parser
// ============================================================

/** Rows to ignore (noise) */
const ZIRAAT_NOISE_PATTERNS = [
  /KKDF/i,
  /BSMV/i,
  /Kredi faizi/i,
  /Gecikme faizi/i,
  /ÖNCEKİ AYDAN DEVİR/i,
  /SÖZLEŞME DEĞİŞİKLİĞİ/i,
  /DÖNEM BORCU/i,
  /ASGARİ ÖDEME/i,
  /SON ÖDEME TARİHİ/i,
  /HESAP ÖZETİ/i,
  /İşlem Tarihi/i,
  /TOPLAM BORÇ/i,
];

export function parseZiraatPdf(rawText: string): RawParsedTransaction[] {
  const transactions: RawParsedTransaction[] = [];
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);

  // Find the start anchor: the header line
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].includes("İşlem Tarihi") &&
      lines[i].includes("İşlem Açıklaması")
    ) {
      startIdx = i + 1;
      break;
    }
  }

  if (startIdx === -1) {
    // Fallback: try to find any line starting with a date
    startIdx = 0;
  }

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];

    // Stop at summary/footer sections
    if (ZIRAAT_NOISE_PATTERNS.some((p) => p.test(line))) continue;

    // Try to parse as CSV-like: "date", "description", "amount", ...
    // Or as space/tab separated
    const csvMatch = line.match(
      /^"?(\d{2}\.\d{2}\.\d{4})"?\s*[,;]\s*"?([^",;]+)"?\s*[,;]\s*"?([^",;]*)"?/
    );

    if (csvMatch) {
      const [, dateStr, description, amountStr] = csvMatch;
      const { value, isIncome } = parseAmount(amountStr);

      if (value > 0) {
        transactions.push({
          bankName: "ZİRAAT",
          transactionDate: convertDate(dateStr),
          rawDescription: description.trim(),
          amount: value,
          currency: "TRY",
          transactionType: isIncome ? "INCOME" : "EXPENSE",
        });
      }
      continue;
    }

    // Alternative: space/tab separated (common in PDF text extraction)
    const parts = line.split(/\t+|\s{2,}/);
    if (parts.length >= 3 && isDateString(parts[0])) {
      const dateStr = parts[0];
      const description = parts[1];
      const amountStr = parts[2];
      const { value, isIncome } = parseAmount(amountStr);

      // Check for USD amount in parts[3]
      let currency = "TRY";
      if (parts[3] && parts[3].trim() !== "" && parts[3].trim() !== "0,00") {
        currency = "USD";
      }

      if (value > 0) {
        transactions.push({
          bankName: "ZİRAAT",
          transactionDate: convertDate(dateStr),
          rawDescription: description.trim(),
          amount: value,
          currency,
          transactionType: isIncome ? "INCOME" : "EXPENSE",
        });
      }
    }
  }

  return transactions;
}

// ============================================================
// PARAF / HALKBANK — XLSX/CSV Parser
// ============================================================

/**
 * Parse Paraf data from a 2D array (rows of cells).
 * Works with both XLSX (converted via SheetJS) and CSV.
 */
export function parseParafRows(
  rows: (string | number | null | undefined)[][]
): RawParsedTransaction[] {
  const transactions: RawParsedTransaction[] = [];

  // Find "Ekstre İşlemleri" anchor
  let startIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const rowStr = rows[i]?.join(" ") || "";
    if (rowStr.includes("Ekstre İşlemleri")) {
      startIdx = i + 1;
      break;
    }
  }

  if (startIdx === -1) {
    // Fallback: scan for first date
    for (let i = 0; i < rows.length; i++) {
      const firstCell = String(rows[i]?.[0] || "");
      if (isDateString(firstCell)) {
        startIdx = i;
        break;
      }
    }
  }

  if (startIdx === -1) return transactions;

  // Skip "Önceki Dönem Bakiyeniz" row and header row
  for (let i = startIdx; i < rows.length; i++) {
    const rowStr = (rows[i]?.join(" ") || "").toLowerCase();
    if (
      rowStr.includes("önceki dönem") ||
      rowStr.includes("işlem tarihi") ||
      rowStr.includes("referans")
    ) {
      continue;
    }

    const cells = rows[i];
    if (!cells || cells.length < 6) continue;

    const dateStr = String(cells[0] || "").trim();
    if (!isDateString(dateStr)) continue;

    // Column mapping:
    // 0: İşlem Tarihi, 1: Referans, 2: Açıklama, 3: Sektör,
    // 4: Orjinal Tutar, 5: Tutar, 6: Taksit, 7: ParafPara
    const description = String(cells[2] || "").trim();
    const sector = String(cells[3] || "").trim();
    const amountStr = String(cells[5] || "").trim();

    const { value, isIncome } = parseAmount(amountStr);

    // Parse installment info from column 6
    let installmentCurrent: number | undefined;
    let installmentTotal: number | undefined;
    const installmentStr = String(cells[6] || "").trim();
    const installmentMatch = installmentStr.match(/(\d+)\s*\/\s*(\d+)/);
    if (installmentMatch) {
      installmentCurrent = parseInt(installmentMatch[1]);
      installmentTotal = parseInt(installmentMatch[2]);
    }

    if (value > 0) {
      transactions.push({
        bankName: "PARAF",
        transactionDate: convertDate(dateStr),
        rawDescription: description,
        amount: value,
        currency: "TRY",
        transactionType: isIncome ? "INCOME" : "EXPENSE",
        sector: sector || undefined,
        installmentCurrent,
        installmentTotal,
      });
    }
  }

  return transactions;
}

// ============================================================
// CSV parser helper (for Paraf CSV files)
// ============================================================
export function parseCsv(csvText: string): (string | null)[][] {
  const rows: (string | null)[][] = [];
  const lines = csvText.split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;

    // Simple CSV parser handling quoted fields
    const cells: (string | null)[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        cells.push(current.trim() || null);
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current.trim() || null);
    rows.push(cells);
  }

  return rows;
}
