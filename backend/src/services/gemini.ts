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
          "One of: Market, Yemek, Ulaşım, Eğlence, Giyim, Sağlık, Eğitim, Fatura, Abonelik, Transfer, Teknoloji, Faiz, Cashback, Diğer",
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
   - "ŞOK13240 ADANA SARI" → "Şok Market"
   - "7557 ADANA SARIÇAM T" → "Şok Market" (7557 = Şok market kodu)
   - "IYZICO/AmznPrimeTR 1 İSTANBUL TRTR" → "Amazon Prime"
   - "MIGROS SANAL MARKET" → "Migros"
   - "TOPLU TASIMA GECIS U ADANA" → "Toplu Taşıma"
   - "Google *YouTubePremi g.co/helppay#" → "YouTube Premium"
   - "STEAMGAMES.COM 42595" → "Steam"
   - "TT NET ANONIM STI İSTANBUL" → "TürkTelekom İnternet"
   - "ANTHROPIC USD 6.00" → "Anthropic (Claude AI)"
   - "CLOUDFLARE USD 10.46" → "Cloudflare"
   - "DIGITALOCEAN.COM AMSTERDAM" → "DigitalOcean"
   - "BİM7679 KAYALIBAGAD" → "BİM"
   - "TAVUK DUNYASI ADANA" → "Tavuk Dünyası"
   - "MESTAV TAVUKCULUK" → "Mestav Tavukçuluk"
   - "Hesaptan Ödeme - Teşekkür Ederiz -" → "Kredi Kartı Ödemesi"
   - "810002852734 FATURA ÖDEME" → "Fatura Ödemesi"
   - "ADANA ASKI GN.MD." → "ASKİ Su Faturası"
   - "Gecikme faizi" → "Gecikme Faizi"
   - "BSMV (Faiz)" → "BSMV"
   - "KKDF" → "KKDF"
   - "Kredi faizi" → "Kredi Faizi"
   - "İnternet Harcama İndirimi" → "Cashback İndirimi"
   - "ADANA OPTIMUM AVM FC" → "Optimum AVM"

2. **isMonthlySubscription**: Aylık abonelik mi? true/false
   - Netflix, Spotify, YouTube Premium, iCloud, Google One, Amazon Prime, Apple Music, Disney+, HBO Max, ChatGPT Plus, Anthropic (Claude), spor salonu, sigorta, TürkTelekom internet → true
   - DigitalOcean, Cloudflare gibi sunucu/hosting hizmetleri → true (aylık tekrar eden)
   - Tek seferlik alışverişler, market, yemek → false
   - Faiz, BSMV, KKDF → false
   - Cashback / iade → false

3. **category**: Aşağıdaki kategorilerden BİRİNİ seç:
   - **Market**: Şok, BİM, Migros, A101, CarrefourSA, market alışverişleri
   - **Yemek**: Restoran, kafe, fast-food (Tavuk Dünyası, burger, pizza, döner)
   - **Ulaşım**: Toplu taşıma, Uber, taksi, benzin, otopark
   - **Eğlence**: Sinema, oyun (Steam), konser, etkinlik, AVM eğlence
   - **Giyim**: Giyim mağazaları, ayakkabı, aksesuar
   - **Sağlık**: Eczane, hastane, doktor, optik
   - **Eğitim**: Kitap, kurs, okul, eğitim platformları
   - **Fatura**: Elektrik, su (ASKİ), doğalgaz, internet (TürkTelekom), telefon
   - **Abonelik**: Netflix, Spotify, YouTube Premium, Amazon Prime, iCloud, streaming servisleri
   - **Transfer**: Havale, EFT, kredi kartı ödemesi, "Hesaptan Ödeme"
   - **Teknoloji**: DigitalOcean, Cloudflare, Anthropic, domain, sunucu, yazılım, donanım, Hepsiburada/Trendyol teknoloji ürünleri
   - **Faiz**: Kredi faizi, gecikme faizi, BSMV, KKDF, banka masrafı, komisyon
   - **Cashback**: İnternet harcama indirimi, puan iadesi, cashback, kampanya iadesi
   - **Diğer**: Yukarıdaki kategorilere uymayan işlemler (SON ÇARE olarak kullan!)

ÖNEMLİ: "Diğer" kategorisini sadece hiçbir kategoriye uymayan işlemlerde kullan. Çoğu işlem yukarıdaki kategorilere girer.
Sektör bilgisi verilmişse bunu kategori belirlemede ipucu olarak kullan.`;

// ============================================================
// Pre-enrichment rules: categorize obvious items without LLM
// This saves tokens and improves accuracy for known patterns
// ============================================================
interface PreEnrichResult {
  cleanName: string;
  category: string;
  isMonthlySubscription: boolean;
}

const PRE_ENRICH_RULES: Array<{
  pattern: RegExp;
  result: PreEnrichResult;
}> = [
  // Bank fees / interest
  { pattern: /^Gecikme faizi$/i, result: { cleanName: "Gecikme Faizi", category: "Faiz", isMonthlySubscription: false } },
  { pattern: /^BSMV\s*\(?Faiz\)?$/i, result: { cleanName: "BSMV", category: "Faiz", isMonthlySubscription: false } },
  { pattern: /^KKDF$/i, result: { cleanName: "KKDF", category: "Faiz", isMonthlySubscription: false } },
  { pattern: /^Kredi faizi$/i, result: { cleanName: "Kredi Faizi", category: "Faiz", isMonthlySubscription: false } },
  // Cashback
  { pattern: /İnternet Harcama İndirimi/i, result: { cleanName: "Cashback İndirimi", category: "Cashback", isMonthlySubscription: false } },
  { pattern: /Dijital Platform.*İndirimi/i, result: { cleanName: "Dijital Platform İadesi", category: "Cashback", isMonthlySubscription: false } },
  { pattern: /Puan İadesi/i, result: { cleanName: "Puan İadesi", category: "Cashback", isMonthlySubscription: false } },
  // Card payment
  { pattern: /Hesaptan Ödeme.*Teşekkür/i, result: { cleanName: "Kredi Kartı Ödemesi", category: "Transfer", isMonthlySubscription: false } },
  // Tech & Subscriptions
  { pattern: /ANTHROPIC/i, result: { cleanName: "Anthropic (Claude AI)", category: "Abonelik", isMonthlySubscription: true } },
  { pattern: /Google Claude/i, result: { cleanName: "Anthropic (Claude AI)", category: "Abonelik", isMonthlySubscription: true } },
  { pattern: /DIGITALOCEAN/i, result: { cleanName: "DigitalOcean", category: "Teknoloji", isMonthlySubscription: true } },
  { pattern: /CLOUDFLARE/i, result: { cleanName: "Cloudflare", category: "Teknoloji", isMonthlySubscription: true } },
  // Public transport
  { pattern: /TOPLU TASIMA GECIS/i, result: { cleanName: "Toplu Taşıma", category: "Ulaşım", isMonthlySubscription: false } },
];

/**
 * Try to pre-categorize a transaction using rules.
 * Returns null if no rule matches (needs LLM enrichment).
 */
export function tryPreEnrich(description: string): PreEnrichResult | null {
  for (const rule of PRE_ENRICH_RULES) {
    if (rule.pattern.test(description)) {
      return rule.result;
    }
  }
  return null;
}

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

  // Step 1: Pre-enrich known patterns (saves tokens!)
  const preEnriched = new Map<number, PreEnrichResult>();
  const needsLlm: { globalIdx: number; tx: RawParsedTransaction }[] = [];

  for (let idx = 0; idx < transactions.length; idx++) {
    const pre = tryPreEnrich(transactions[idx].rawDescription);
    if (pre) {
      preEnriched.set(idx, pre);
      console.log(`✅ Pre-enriched [${idx}]: "${transactions[idx].rawDescription}" → ${pre.category}`);
    } else {
      needsLlm.push({ globalIdx: idx, tx: transactions[idx] });
    }
  }

  console.log(`📊 Pre-enriched: ${preEnriched.size}/${transactions.length}, needs LLM: ${needsLlm.length}`);

  // If no API key, return transactions with pre-enriched + fallback values
  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    console.warn("⚠️  GEMINI_API_KEY not set — skipping AI enrichment");
    return transactions.map((t, idx) => {
      const pre = preEnriched.get(idx);
      return {
        ...t,
        cleanName: pre?.cleanName ?? t.rawDescription,
        isMonthlySubscription: pre?.isMonthlySubscription ?? false,
        category: pre?.category ?? t.sector ?? "Diğer",
      };
    });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // Step 2: Send only unknown transactions to Gemini in batches
  const BATCH_SIZE = 50;
  const llmEnriched = new Map<
    number,
    { cleanName: string; isMonthlySubscription: boolean; category: string }
  >();

  for (let i = 0; i < needsLlm.length; i += BATCH_SIZE) {
    const batch = needsLlm.slice(i, i + BATCH_SIZE);
    const batchTxs = batch.map((b) => b.tx);
    const userPrompt = buildUserPrompt(batchTxs);

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
        const globalIdx = batch[item.index]?.globalIdx;
        if (globalIdx !== undefined) {
          llmEnriched.set(globalIdx, {
            cleanName: item.cleanName,
            isMonthlySubscription: item.isMonthlySubscription,
            category: item.category,
          });
        }
      }
    } catch (err) {
      console.error(`❌ Gemini batch error (items ${i}-${i + batch.length}):`, err);
      // Fallback for failed batch
      for (const b of batch) {
        llmEnriched.set(b.globalIdx, {
          cleanName: b.tx.rawDescription,
          isMonthlySubscription: false,
          category: b.tx.sector || "Diğer",
        });
      }
    }
  }

  // Step 3: Merge all enrichment data
  return transactions.map((t, idx) => {
    const pre = preEnriched.get(idx);
    if (pre) {
      return { ...t, ...pre };
    }
    const llm = llmEnriched.get(idx) || {
      cleanName: t.rawDescription,
      isMonthlySubscription: false,
      category: t.sector || "Diğer",
    };
    return { ...t, ...llm };
  });
}

// ============================================================
// Re-categorize "Diğer" items using LLM
// Takes DB transaction records, returns array of {id, cleanName, category, isMonthlySubscription}
// ============================================================
export async function reCategorizeDigerItems(
  items: Array<{ id: number; rawDescription: string; category: string }>
): Promise<Array<{ id: number; cleanName: string; category: string; isMonthlySubscription: boolean }>> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  
  const digerItems = items.filter((i) => i.category === "Diğer");
  if (digerItems.length === 0) return [];

  console.log(`🔄 Re-categorizing ${digerItems.length} 'Diğer' items...`);

  const results: Array<{ id: number; cleanName: string; category: string; isMonthlySubscription: boolean }> = [];
  const needsLlm: typeof digerItems = [];

  // Step 1: Pre-enrich rules
  for (const item of digerItems) {
    const pre = tryPreEnrich(item.rawDescription);
    if (pre) {
      results.push({
        id: item.id,
        cleanName: pre.cleanName,
        category: pre.category,
        isMonthlySubscription: pre.isMonthlySubscription,
      });
      console.log(`✅ Pre-enriched in re-categorize: "${item.rawDescription}" → ${pre.category}`);
    } else {
      needsLlm.push(item);
    }
  }

  // Step 2: LLM for the rest
  if (needsLlm.length > 0 && apiKey && apiKey !== "your-gemini-api-key-here") {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = needsLlm
      .map((item, idx) => `[${idx}] "${item.rawDescription}"`)
      .join("\n");

    try {
      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  SYSTEM_PROMPT +
                  "\n\nÖNEMLİ: Bu işlemler daha önce 'Diğer' olarak sınıflandırılmış. Lütfen doğru kategorileri belirle. 'Diğer' KULLANMA!\n\n" +
                  `Aşağıdaki ${needsLlm.length} işlemi yeniden kategorize et:\n\n${prompt}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: enrichmentSchema,
        },
      });

      const parsed = JSON.parse(result.response.text()) as Array<{
        index: number;
        cleanName: string;
        isMonthlySubscription: boolean;
        category: string;
      }>;

      for (const p of parsed) {
        if (p.category !== "Diğer") {
          results.push({
            id: needsLlm[p.index].id,
            cleanName: p.cleanName,
            category: p.category,
            isMonthlySubscription: p.isMonthlySubscription,
          });
        }
      }
    } catch (err) {
      console.error("❌ Re-categorization LLM error:", err);
    }
  }

  return results;
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

// ============================================================
// Prediction Schema — structured output for next-month forecast
// ============================================================
const predictionSchema = {
  type: SchemaType.OBJECT,
  properties: {
    totalPredicted: {
      type: SchemaType.NUMBER,
      description: "Predicted total spending for next month in TRY",
    },
    percentageChange: {
      type: SchemaType.NUMBER,
      description:
        "Percentage change compared to last month (positive = more spending, negative = less)",
    },
    trend: {
      type: SchemaType.STRING,
      description: "One of: up, down, stable",
    },
    categories: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          category: {
            type: SchemaType.STRING,
            description: "Category name in Turkish",
          },
          predictedAmount: {
            type: SchemaType.NUMBER,
            description: "Predicted amount for this category",
          },
          percentageChange: {
            type: SchemaType.NUMBER,
            description: "Percentage change vs last month for this category",
          },
          trend: {
            type: SchemaType.STRING,
            description: "One of: up, down, stable",
          },
        },
        required: ["category", "predictedAmount", "percentageChange", "trend"],
      },
    },
    advice: {
      type: SchemaType.STRING,
      description:
        "A brief, practical Turkish financial advice based on spending patterns (max 2 sentences)",
    },
  },
  required: [
    "totalPredicted",
    "percentageChange",
    "trend",
    "categories",
    "advice",
  ],
};

// ============================================================
// Prediction prompt — optimized for minimal token usage
// ============================================================
const PREDICTION_SYSTEM_PROMPT = `Sen bir kişisel finans analisti ve tahmin uzmanısın.
Kullanıcının harcama geçmişi sana özetlenmiş (kompakt) formatta verilecek.
Bu verileri analiz ederek gelecek ay harcama tahmini yap.

Kurallar:
- Aylık abonelikleri otomatik olarak gelecek aya ekle
- Taksitli ödemeleri (devam edenleri) dahil et
- Mevsimsel trendleri göz önüne al
- Pratik ve kısa bir Türkçe tavsiye ver (max 2 cümle)
- Trend: geçen aya göre %5'ten az fark → "stable", artış → "up", azalış → "down"`;

/**
 * Compresses transaction data into a token-efficient summary for the LLM.
 *
 * Instead of sending N raw transactions (~30 tokens each),
 * we aggregate into monthly-category buckets (~5 tokens each).
 *
 * Example output:
 *   M:2025-03|Market:4200,Fatura:1200,Abonelik:450|T:5850
 *   M:2025-04|Market:3800,Yemek:900,Abonelik:450|T:5150
 *   SUB:Netflix:49.99,Spotify:29.99,iCloud:6.99|ST:86.97
 *   INST:3/12:Laptop:500
 */
function compressTransactionData(
  transactions: Array<{
    transactionDate: string;
    transactionType: string;
    category: string | null;
    cleanName: string | null;
    amount: number;
    isMonthlySubscription: number;
    installmentCurrent: number | null;
    installmentTotal: number | null;
  }>
): string {
  const expenses = transactions.filter(
    (t) => t.transactionType === "EXPENSE"
  );

  // 1) Monthly totals per category
  const monthBuckets = new Map<string, Map<string, number>>();
  for (const t of expenses) {
    const month = t.transactionDate.slice(0, 7); // "YYYY-MM"
    const cat = t.category || "Diğer";
    if (!monthBuckets.has(month)) monthBuckets.set(month, new Map());
    const catMap = monthBuckets.get(month)!;
    catMap.set(cat, (catMap.get(cat) || 0) + t.amount);
  }

  // Sort months chronologically
  const sortedMonths = [...monthBuckets.keys()].sort();
  const monthLines = sortedMonths.map((m) => {
    const cats = monthBuckets.get(m)!;
    const total = [...cats.values()].reduce((a, b) => a + b, 0);
    const catStr = [...cats.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c, v]) => `${c}:${Math.round(v)}`)
      .join(",");
    return `M:${m}|${catStr}|T:${Math.round(total)}`;
  });

  // 2) Subscriptions (recurring)
  const subs = expenses.filter((t) => t.isMonthlySubscription === 1);
  const subMap = new Map<string, number>();
  for (const s of subs) {
    const name = s.cleanName || s.category || "Bilinmeyen";
    // Take the max amount for each subscription (handles multiple months)
    subMap.set(name, Math.max(subMap.get(name) || 0, s.amount));
  }
  const subLine =
    subMap.size > 0
      ? `SUB:${[...subMap.entries()].map(([n, v]) => `${n}:${v.toFixed(0)}`).join(",")}|ST:${Math.round([...subMap.values()].reduce((a, b) => a + b, 0))}`
      : "";

  // 3) Active installments
  const installments = expenses.filter(
    (t) =>
      t.installmentCurrent != null &&
      t.installmentTotal != null &&
      t.installmentCurrent < t.installmentTotal
  );
  const instLines = installments.map(
    (t) =>
      `INST:${t.installmentCurrent}/${t.installmentTotal}:${t.cleanName || t.category || "?"}:${Math.round(t.amount)}`
  );

  return [
    ...monthLines,
    subLine,
    ...instLines,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Predict next month's spending using Gemini AI.
 *
 * Token optimization strategy:
 * - Aggregate raw transactions into monthly-category summaries
 * - Only send expense transactions
 * - Use compact notation (M:YYYY-MM|cat:amount,cat:amount|T:total)
 * - This reduces ~100 transactions (~3000 tokens) to ~10 lines (~200 tokens)
 */
export async function predictNextMonth(
  transactions: Array<{
    transactionDate: string;
    transactionType: string;
    category: string | null;
    cleanName: string | null;
    rawDescription: string;
    amount: number;
    isMonthlySubscription: number;
    installmentCurrent: number | null;
    installmentTotal: number | null;
  }>
): Promise<{
  totalPredicted: number;
  percentageChange: number;
  trend: string;
  categories: Array<{
    category: string;
    predictedAmount: number;
    percentageChange: number;
    trend: string;
  }>;
  advice: string;
}> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");

  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const compressed = compressTransactionData(transactions);

  if (!compressed.trim()) {
    throw new Error("No expense data available for prediction");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const userPrompt = `Aşağıdaki kompakt harcama geçmişini analiz et ve gelecek ay tahmini yap:

${compressed}

Not: M = Ay, SUB = Abonelikler, ST = Abonelik Toplamı, INST = Devam eden taksitler (mevcut/toplam:isim:tutar), T = Ay toplamı`;

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: PREDICTION_SYSTEM_PROMPT + "\n\n" + userPrompt }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: predictionSchema,
    },
  });

  const responseText = result.response.text();
  return JSON.parse(responseText);
}

