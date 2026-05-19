/**
 * Prediction Routes
 *
 * GET /api/predictions — Generate next-month spending prediction via LLM
 *                        Results are cached and only regenerated when tx count changes.
 */

import { Hono } from "@hono/hono";
import { eq, and, count } from "npm:drizzle-orm";
import { db } from "../db/client.ts";
import { transactions, predictions } from "../db/schema.ts";
import { authMiddleware } from "../middleware/auth.ts";
import { predictNextMonth } from "../services/gemini.ts";

const predictionsRouter = new Hono();

// All routes require authentication
predictionsRouter.use("*", authMiddleware);

// ============================================================
// GET /api/predictions — predict next month spending (cached)
// ============================================================
predictionsRouter.get("/", async (c) => {
  const userId = c.get("userId");

  try {
    // Count user's current transactions
    const [{ txCount }] = await db
      .select({ txCount: count() })
      .from(transactions)
      .where(eq(transactions.userId, userId));

    if (txCount === 0) {
      return c.json(
        { error: "Tahmin oluşturmak için yeterli veri yok. Önce bir ekstre yükleyin." },
        400
      );
    }

    // Check cache: do we have a prediction with the same tx count?
    const [cached] = await db
      .select()
      .from(predictions)
      .where(
        and(
          eq(predictions.userId, userId),
          eq(predictions.transactionCount, txCount)
        )
      )
      .limit(1);

    if (cached) {
      console.log(`📦 Prediction cache HIT (txCount=${txCount})`);
      return c.json({
        ...JSON.parse(cached.predictionData),
        generatedAt: cached.createdAt,
        cached: true,
      });
    }

    console.log(`🔮 Prediction cache MISS (txCount=${txCount}) — calling LLM...`);

    // Fetch transactions for prediction
    const userTxs = await db
      .select({
        transactionDate: transactions.transactionDate,
        transactionType: transactions.transactionType,
        category: transactions.category,
        cleanName: transactions.cleanName,
        rawDescription: transactions.rawDescription,
        amount: transactions.amount,
        isMonthlySubscription: transactions.isMonthlySubscription,
        installmentCurrent: transactions.installmentCurrent,
        installmentTotal: transactions.installmentTotal,
      })
      .from(transactions)
      .where(eq(transactions.userId, userId));

    const prediction = await predictNextMonth(userTxs);

    // Store in cache
    await db.insert(predictions).values({
      userId,
      predictionData: JSON.stringify(prediction),
      transactionCount: txCount,
    });

    return c.json({
      ...prediction,
      generatedAt: new Date().toISOString(),
      cached: false,
    });
  } catch (err) {
    console.error("❌ Prediction error:", err);

    if (err instanceof Error && err.message.includes("GEMINI_API_KEY")) {
      return c.json({ error: "Yapay zeka servisi yapılandırılmamış" }, 503);
    }

    return c.json(
      { error: "Tahmin oluşturulurken bir hata oluştu", details: String(err) },
      500
    );
  }
});

export default predictionsRouter;
