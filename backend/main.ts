import { Hono } from "@hono/hono";
import { cors } from "jsr:@hono/hono/cors";
import { logger } from "jsr:@hono/hono/logger";
import { initializeDatabase } from "./src/db/client.ts";
import authRoutes from "./src/routes/auth.ts";
import statementsRoutes from "./src/routes/statements.ts";
import predictionsRoutes from "./src/routes/predictions.ts";

// Initialize the app
const app = new Hono();

// ---- Global Middleware ----
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:4200", "http://localhost:3000"], // Angular dev + self
    credentials: true,
  })
);

// ---- Routes ----
app.route("/api/auth", authRoutes);
app.route("/api/statements", statementsRoutes);
app.route("/api/predictions", predictionsRoutes);

// ---- Health check ----
app.get("/api/", (c) => {
  return c.json({
    name: "Kredi Harcamalarım API",
    version: "1.0.0",
    status: "running",
    endpoints: {
      auth: {
        register: "POST /api/auth/register",
        login: "POST /api/auth/login",
        me: "GET /api/auth/me",
      },
      statements: {
        upload: "POST /api/statements/upload",
        list: "GET /api/statements",
        detail: "GET /api/statements/:id",
        transactions: "GET /api/statements/transactions",
        recategorize: "POST /api/statements/recategorize",
        preview: "POST /api/statements/preview",
      },
      predictions: {
        predict: "GET /api/predictions",
      },
    },
  });
});

// ---- Start server ----
await initializeDatabase();

Deno.serve({ port: 3005 }, app.fetch);
console.log("🔥 Kredi Harcamalarım API running on http://localhost:3000");
