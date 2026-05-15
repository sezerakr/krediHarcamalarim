/**
 * Statements Routes
 *
 * POST /api/statements/upload     — Upload PDF/XLSX and process
 * GET  /api/statements            — List user's statements
 * GET  /api/statements/:id        — Get statement with transactions
 * GET  /api/statements/preview    — Preview parsing pipeline (debug)
 */

import { Hono } from "@hono/hono";
import { eq, and, desc } from "npm:drizzle-orm";
import { db } from "../db/client.ts";
import { statements, transactions } from "../db/schema.ts";
import { authMiddleware } from "../middleware/auth.ts";
import { parseZiraatPdf, parseParafRows, parseCsv } from "../services/parsers.ts";
import { enrichWithGemini, describeParsingPipeline } from "../services/gemini.ts";
import type { RawParsedTransaction } from "../types.ts";

const statementsRouter = new Hono();

// All routes require authentication
statementsRouter.use("*", authMiddleware);

// ============================================================
// POST /api/statements/upload
// ============================================================
statementsRouter.post("/upload", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.parseBody();
  const file = body["file"];
  const bankName = String(body["bankName"] || "").toUpperCase();

  // Validate file
  if (!file || !(file instanceof File)) {
    return c.json({ error: "Lütfen bir dosya yükleyin" }, 400);
  }

  // Validate bank name
  if (!["ZİRAAT", "PARAF"].includes(bankName)) {
    return c.json(
      { error: "Geçersiz banka adı. 'ZİRAAT' veya 'PARAF' olmalı" },
      400
    );
  }

  // Determine file type
  const fileName = file.name.toLowerCase();
  let fileType: string;
  if (fileName.endsWith(".pdf")) fileType = "PDF";
  else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) fileType = "XLSX";
  else if (fileName.endsWith(".csv")) fileType = "CSV";
  else {
    return c.json({ error: "Desteklenmeyen dosya formatı. PDF, XLSX veya CSV yükleyin" }, 400);
  }

  // Create statement record
  const [statement] = await db
    .insert(statements)
    .values({
      userId,
      fileName: file.name,
      bankName,
      fileType,
      status: "processing",
    })
    .returning();

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    let rawTransactions: RawParsedTransaction[] = [];

    // ---- Parse based on bank + file type ----
    if (bankName === "ZİRAAT" && fileType === "PDF") {
      // Dynamic import for unpdf (heavy dependency)
      const { extractText } = await import("unpdf");
      const { text } = await extractText(buffer);
      rawTransactions = parseZiraatPdf(text);
    } else if (bankName === "PARAF" && fileType === "CSV") {
      const textDecoder = new TextDecoder("utf-8");
      const csvText = textDecoder.decode(buffer);
      const rows = parseCsv(csvText);
      rawTransactions = parseParafRows(rows);
    } else if (bankName === "PARAF" && (fileType === "XLSX" || fileType === "XLS")) {
      // Dynamic import for xlsx (heavy dependency)
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
      }) as (string | number | null)[][];
      rawTransactions = parseParafRows(rows);
    } else {
      throw new Error(`${bankName} için ${fileType} formatı desteklenmiyor`);
    }

    if (rawTransactions.length === 0) {
      await db
        .update(statements)
        .set({ status: "failed", errorMessage: "Hiç işlem bulunamadı" })
        .where(eq(statements.id, statement.id));
      return c.json({ error: "Dosyada işlem bulunamadı", statementId: statement.id }, 400);
    }

    // ---- AI Enrichment ----
    const enriched = await enrichWithGemini(rawTransactions);

    // ---- Bulk insert transactions ----
    const txValues = enriched.map((t) => ({
      statementId: statement.id,
      userId,
      bankName: t.bankName,
      transactionDate: t.transactionDate,
      rawDescription: t.rawDescription,
      cleanName: t.cleanName,
      amount: t.amount,
      currency: t.currency,
      transactionType: t.transactionType,
      isMonthlySubscription: t.isMonthlySubscription ? 1 : 0,
      installmentCurrent: t.installmentCurrent ?? null,
      installmentTotal: t.installmentTotal ?? null,
      installmentAmount: t.installmentTotal
        ? t.amount / t.installmentTotal
        : null,
      category: t.category,
    }));

    await db.insert(transactions).values(txValues);

    // Update statement status
    await db
      .update(statements)
      .set({ status: "processed" })
      .where(eq(statements.id, statement.id));

    return c.json({
      message: "Ekstre başarıyla işlendi",
      statementId: statement.id,
      transactionCount: enriched.length,
      summary: {
        totalExpense: enriched
          .filter((t) => t.transactionType === "EXPENSE")
          .reduce((sum, t) => sum + t.amount, 0),
        totalIncome: enriched
          .filter((t) => t.transactionType === "INCOME")
          .reduce((sum, t) => sum + t.amount, 0),
        subscriptions: enriched.filter((t) => t.isMonthlySubscription).length,
      },
    }, 201);
  } catch (err) {
    console.error("❌ Statement processing error:", err);
    await db
      .update(statements)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Bilinmeyen hata",
      })
      .where(eq(statements.id, statement.id));

    return c.json(
      { error: "Ekstre işlenirken hata oluştu", details: String(err) },
      500
    );
  }
});

// ============================================================
// GET /api/statements — list user's statements
// ============================================================
statementsRouter.get("/", async (c) => {
  const userId = c.get("userId");
  const result = await db
    .select()
    .from(statements)
    .where(eq(statements.userId, userId))
    .orderBy(desc(statements.uploadedAt));

  return c.json({ statements: result });
});

// ============================================================
// GET /api/statements/:id — get statement with transactions
// ============================================================
statementsRouter.get("/:id", async (c) => {
  const userId = c.get("userId");
  const statementId = parseInt(c.req.param("id"));

  const [statement] = await db
    .select()
    .from(statements)
    .where(and(eq(statements.id, statementId), eq(statements.userId, userId)))
    .limit(1);

  if (!statement) {
    return c.json({ error: "Ekstre bulunamadı" }, 404);
  }

  const txs = await db
    .select()
    .from(transactions)
    .where(eq(transactions.statementId, statementId));

  return c.json({ statement, transactions: txs });
});

// ============================================================
// POST /api/statements/preview — preview parsing pipeline
// (Useful for debugging: shows what will be sent to Gemini)
// ============================================================
statementsRouter.post("/preview", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  const bankName = String(body["bankName"] || "").toUpperCase();

  if (!file || !(file instanceof File)) {
    return c.json({ error: "Lütfen bir dosya yükleyin" }, 400);
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  let rawTransactions: RawParsedTransaction[] = [];
  const fileName = file.name.toLowerCase();

  try {
    if (bankName === "ZİRAAT" && fileName.endsWith(".pdf")) {
      const { extractText } = await import("unpdf");
      const { text } = await extractText(buffer);
      rawTransactions = parseZiraatPdf(text);
    } else if (bankName === "PARAF" && fileName.endsWith(".csv")) {
      const csvText = new TextDecoder("utf-8").decode(buffer);
      rawTransactions = parseParafRows(parseCsv(csvText));
    } else if (bankName === "PARAF" && (fileName.endsWith(".xlsx") || fileName.endsWith(".xls"))) {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as (string | number | null)[][];
      rawTransactions = parseParafRows(rows);
    }

    return c.json({
      parsedCount: rawTransactions.length,
      transactions: rawTransactions,
      pipeline: describeParsingPipeline(rawTransactions),
    });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

export default statementsRouter;
