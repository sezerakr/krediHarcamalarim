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
// "55,24+" -> 55.24 (income)
// "+500,00TL" -> 500.00 (income)
// "871,44TL" -> 871.44
// ============================================================
interface ParsedAmount {
  value: number;
  isIncome: boolean;
}

function parseAmount(raw: string): ParsedAmount {
  if (!raw || raw.trim() === "") return { value: 0, isIncome: false };

  let cleaned = raw.trim();

  // Check for income indicators: + at start or end
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
// ZIRAAT BANKASI — PDF Text Parser (multi-page, space-separated)
//
// Actual PDF format (from extractText, array of pages):
//   DD.MM.YYYY DESCRIPTION CITY AMOUNT_TL AMOUNT_USD [BANKKART_LIRA]
//   Income marked with + suffix: "55,24+"
//   Card sections start with: "KART NO : 4345-####-####-2996 / NAME"
// ============================================================

/** Rows/lines to skip entirely */
const ZIRAAT_SKIP_PATTERNS = [
  /ÖNCEKİ AYDAN DEVİR/i,
  /SÖZLEŞME DEĞİŞİKLİĞİ/i,
  /DÖNEM BORCU/i,
  /ASGARİ ÖDEME/i,
  /SON ÖDEME TARİHİ/i,
  /HESAP ÖZETİ/i,
  /TOPLAM BORÇ/i,
  /Devreden Bakiye/i,
  /Harcamalarınız/i,
  /Ücretler ve/i,
  /Kesintiler/i,
  /Ödemeleriniz/i,
  /Büyük Mükellefler/i,
  /Ekstre ile ilgili/i,
  /Alışveriş faizi/i,
  /Nakit avans ücreti/i,
  /Nakit avans faizi/i,
  /Faiz ve Ücretler/i,
  /^Sayın\s/i,
  /^Müşteri Numarası/i,
  /^Hesap Kesim/i,
  /^Son Ödeme/i,
  /^Dönem Borcu/i,
  /^Asgari Ödeme/i,
  /^İşlem Tarihi\s+İşlem/i,
  /^Kart Limiti/i,
  /^Kullanılabilir/i,
  /^Nakit Avans Limiti/i,
  /^Sonraki/i,
  /^Bugüne Kadar/i,
  /^\d{4}-####-####-\d{4}\s/,
  /^KART NO\s*:/i,
];

export function parseZiraatPdf(rawText: string): RawParsedTransaction[] {
  const transactions: RawParsedTransaction[] = [];

  // Handle array input (pages) or single string
  const text = Array.isArray(rawText)
    ? rawText.join("\n")
    : String(rawText ?? "");

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Skip noise lines
    if (ZIRAAT_SKIP_PATTERNS.some((p) => p.test(line))) continue;

    // Main pattern: DD.MM.YYYY <description> <amount_tl> <amount_usd> [bankkart_lira]
    // The amounts are at the end. We need to extract date, description, and amounts.
    const dateMatch = line.match(/^(\d{2}\.\d{2}\.\d{4})\s+(.+)$/);
    if (!dateMatch) continue;

    const dateStr = dateMatch[1];
    const rest = dateMatch[2];

    // Turkish amounts always have comma as decimal separator: "1.320,00", "55,24+", "0,00"
    // USD prices in descriptions use dot: "USD 6.00", "USD 1.25"
    // Patterns:
    //   Normal:  "description 2.313,00 0,00"        → TL=2313, USD=0
    //   Income:  "description 55,24+"                → TL=55.24, income
    //   Fee:     "BSMV (Faiz) 111,54 0,00"           → TL=111.54
    //   USD desc: "ANTHROPIC USD 6.00 270,74 0,00"   → TL=270.74 (USD price is part of desc)

    // Turkish amount pattern: digits with optional thousand dots, comma, decimal digits, optional +
    const TRK_AMT = /(\d{1,3}(?:\.\d{3})*,\d{2}\+?)$/;

    // Try matching two Turkish amounts at end: "TL_AMOUNT 0,00"
    const twoAmounts = rest.match(
      /(\d{1,3}(?:\.\d{3})*,\d{2}\+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2}\+?)\s*$/
    );

    if (twoAmounts) {
      const description = rest
        .substring(0, rest.length - twoAmounts[0].length)
        .trim();
      const tlAmount = parseAmount(twoAmounts[1]);
      const usdAmount = parseAmount(twoAmounts[2]);

      let amount = tlAmount.value;
      let currency: "TRY" | "USD" = "TRY";
      let isIncome = tlAmount.isIncome || usdAmount.isIncome;

      // If TL is 0 but USD is not, it's a USD transaction
      if (tlAmount.value === 0 && usdAmount.value > 0) {
        amount = usdAmount.value;
        currency = "USD";
      }

      if (amount > 0 && description.length > 0) {
        transactions.push({
          bankName: "ZİRAAT",
          transactionDate: convertDate(dateStr),
          rawDescription: description.trim(),
          amount,
          currency,
          transactionType: isIncome ? "INCOME" : "EXPENSE",
        });
      }
    } else {
      // Try single Turkish amount at end (income lines without USD column)
      const singleAmount = rest.match(TRK_AMT);
      if (singleAmount) {
        const description = rest
          .substring(0, rest.length - singleAmount[0].length)
          .trim();
        const { value, isIncome } = parseAmount(singleAmount[1]);

        if (value > 0 && description.length > 0) {
          transactions.push({
            bankName: "ZİRAAT",
            transactionDate: convertDate(dateStr),
            rawDescription: description.trim(),
            amount: value,
            currency: "TRY",
            transactionType: isIncome ? "INCOME" : "EXPENSE",
          });
        }
      }
    }
  }

  return transactions;
}

// ============================================================
// PARAF / HALKBANK — XLSX/CSV Parser
//
// Actual XLSX format (from SheetJS):
// Row structure after "Ekstre İşlemleri" + "Önceki Dönem Bakiyeniz" + header:
//   0: İşlem Tarihi (DD.MM.YYYY)
//   1: Referans (number or string)
//   2: Açıklama
//   3: Sektör (often empty string "")
//   4: Orjinal Tutar (number for USD, or empty)
//   5: Tutar ("871,44TL " or "+500,00TL ")
//   6: Kalan Borç / Taksit (e.g., "2/12" or empty)
//   7: ParafPara(TL)
// ============================================================

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

  for (let i = startIdx; i < rows.length; i++) {
    const rowStr = (rows[i]?.join(" ") || "").toLowerCase();

    // Skip meta rows
    if (
      rowStr.includes("önceki dönem") ||
      rowStr.includes("işlem tarihi") ||
      rowStr.includes("referans")
    ) {
      continue;
    }

    // Skip card number header rows (e.g., "5430 81** **** 6535")
    const firstCellStr = String(rows[i]?.[0] || "").trim();
    if (/^\d{4}\s+\d{2}\*{2}\s+\*{4}\s+\d{4}$/.test(firstCellStr)) {
      continue;
    }

    const cells = rows[i];
    if (!cells || cells.length < 6) continue;

    const dateStr = String(cells[0] || "").trim();
    if (!isDateString(dateStr)) continue;

    // Column mapping
    const description = String(cells[2] || "").trim();
    const sector = String(cells[3] || "").trim();
    const amountStr = String(cells[5] || "").trim();

    if (!description || !amountStr) continue;

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
