/**
 * Gemini AI Enrichment Service
 *
 * Takes raw parsed transactions and enriches them with:
 * - cleanName (human-readable merchant name)
 * - isMonthlySubscription (boolean flag)
 * - category (standardized Turkish category)
 *
 * Uses Gemini's structured output (responseSchema) to guarantee valid JSON.
 */

import {
  GoogleGenerativeAI,
  SchemaType,
} from "@google/generative-ai";
import type { RawParsedTransaction, EnrichedTransaction } from "../types.ts";

// ============================================================
// Gemini response schema — enforces exact JSON structure
// ============================================================
const enrichmentSchema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      index: {
        type: SchemaType.NUMBER,
        description: "Original array index of the transaction",
      },
      cleanName: {
        type: SchemaType.STRING,
        description:
          "Human-readable merchant/purchase name. E.g. 'ŞOK-13240 ADANA SARI' -> 'Şok Market'",
      },
      isMonthlySubscription: {
        type: SchemaType.BOOLEAN,
        description:
          "true if this is a recurring monthly subscription (Netflix, Spotify, iCloud, gym, insurance, etc.)",
      },
      category: {
        type: SchemaType.STRING,
        description:
          "One of: Market, Yemek, Ulaşım, Eğlence, Giyim, Sağlık, Eğitim, Fatura, Abonelik, Transfer, Teknoloji, Diğer",
      },
    },
    required: ["index", "cleanName", "isMonthlySubscription", "category"],
  },
};

// ============================================================
// System prompt for Gemini
// ============================================================
const SYSTEM_PROMPT = `Sen bir Türk banka ekstresi analiz uzmanısın. Sana ham işlem açıklamaları verilecek.

Her işlem için şunları yapmalısın:

1. **cleanName**: Ham açıklamayı temiz, okunabilir bir isme dönüştür.
   - "ŞOK-13240 ADANA SARI" → "Şok Market"
   - "İYZİCO /AmazonPrimeT ISTANBUL" → "Amazon Prime"
   - "MIGROS SANAL MARKET" → "Migros"
   - "UBER *TRIP HELP.UBER.C" → "Uber"
   - "4015 şube-hesaptan ödeme-teşekkür ederiz" → "Kredi Kartı Ödemesi"

2. **isMonthlySubscription**: Aylık abonelik mi? true/false
   - Netflix, Spotify, YouTube Premium, iCloud, Google One, Amazon Prime, Apple Music, Disney+, HBO Max, ChatGPT Plus, spor salonu üyelikleri, sigorta primleri → true
   - Tek seferlik alışverişler → false

3. **category**: Aşağıdaki kategorilerden BİRİNİ seç:
   Market, Yemek, Ulaşım, Eğlence, Giyim, Sağlık, Eğitim, Fatura, Abonelik, Transfer, Teknoloji, Diğer

Sektör bilgisi verilmişse bunu kategori belirlemede ipucu olarak kullan.`;

// ============================================================
// Build the user prompt from raw transactions
// ============================================================
function buildUserPrompt(transactions: RawParsedTransaction[]): string {
  const items = transactions.map((t, i) => {
    let line = `[${i}] "${t.rawDescription}"`;
    if (t.sector) line += ` (Sektör: ${t.sector})`;
    return line;
  });

  return `Aşağıdaki ${transactions.length} işlemi analiz et:\n\n${items.join("\n")}`;
}

// ============================================================
// Enrich transactions with Gemini AI
// ============================================================
export async function enrichWithGemini(
  transactions: RawParsedTransaction[]
): Promise<EnrichedTransaction[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");

  // If no API key, return transactions with fallback values
  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    console.warn("⚠️  GEMINI_API_KEY not set — skipping AI enrichment");
    return transactions.map((t) => ({
      ...t,
      cleanName: t.rawDescription,
      isMonthlySubscription: false,
      category: t.sector || "Diğer",
    }));
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  // Process in batches of 50 to stay within token limits
  const BATCH_SIZE = 50;
  const enrichedMap = new Map<
    number,
    { cleanName: string; isMonthlySubscription: boolean; category: string }
  >();

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    const userPrompt = buildUserPrompt(batch);

    try {
      const result = await model.generateContent({
        contents: [
          { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + userPrompt }] },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: enrichmentSchema,
        },
      });

      const responseText = result.response.text();
      const parsed = JSON.parse(responseText) as Array<{
        index: number;
        cleanName: string;
        isMonthlySubscription: boolean;
        category: string;
      }>;

      for (const item of parsed) {
        // Map batch-local index to global index
        const globalIdx = i + item.index;
        enrichedMap.set(globalIdx, {
          cleanName: item.cleanName,
          isMonthlySubscription: item.isMonthlySubscription,
          category: item.category,
        });
      }
    } catch (err) {
      console.error(`❌ Gemini batch error (items ${i}-${i + batch.length}):`, err);
      // Fallback for failed batch
      for (let j = 0; j < batch.length; j++) {
        enrichedMap.set(i + j, {
          cleanName: batch[j].rawDescription,
          isMonthlySubscription: false,
          category: batch[j].sector || "Diğer",
        });
      }
    }
  }

  // Merge enrichment data with raw transactions
  return transactions.map((t, idx) => {
    const enrichment = enrichedMap.get(idx) || {
      cleanName: t.rawDescription,
      isMonthlySubscription: false,
      category: t.sector || "Diğer",
    };
    return { ...t, ...enrichment };
  });
}

/**
 * Utility: Get the file structure/format info to help understand
 * what will be sent to the AI. Useful for debugging.
 */
export function describeParsingPipeline(
  transactions: RawParsedTransaction[]
): object {
  return {
    totalTransactions: transactions.length,
    banks: [...new Set(transactions.map((t) => t.bankName))],
    dateRange: {
      earliest: transactions
        .map((t) => t.transactionDate)
        .sort()[0],
      latest: transactions
        .map((t) => t.transactionDate)
        .sort()
        .pop(),
    },
    breakdown: {
      expenses: transactions.filter((t) => t.transactionType === "EXPENSE").length,
      income: transactions.filter((t) => t.transactionType === "INCOME").length,
    },
    samplePrompt: buildUserPrompt(transactions.slice(0, 3)),
    geminiSchema: enrichmentSchema,
  };
}
