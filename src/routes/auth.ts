import { Hono } from "@hono/hono";
import { sign } from "jsr:@hono/hono/jwt";
import { eq } from "npm:drizzle-orm";
import { db } from "../db/client.ts";
import { users } from "../db/schema.ts";
import { authMiddleware } from "../middleware/auth.ts";
import { z } from "zod";

// Deno-native bcrypt via deno.land/x
import * as bcrypt from "bcrypt";

const auth = new Hono();

// ============================================================
// Validation schemas
// ============================================================
const registerSchema = z.object({
  email: z.string().email("Geçerli bir email adresi giriniz"),
  password: z.string().min(6, "Şifre en az 6 karakter olmalıdır"),
  name: z.string().min(2, "İsim en az 2 karakter olmalıdır"),
});

const loginSchema = z.object({
  email: z.string().email("Geçerli bir email adresi giriniz"),
  password: z.string().min(1, "Şifre gereklidir"),
});

// ============================================================
// POST /api/auth/register
// ============================================================
auth.post("/register", async (c) => {
  const body = await c.req.json();

  // Validate input
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Doğrulama hatası", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  const { email, password, name } = parsed.data;

  // Check if user already exists
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: "Bu email adresi zaten kayıtlı" }, 409);
  }

  // Hash password
  const passwordHash = bcrypt.hashSync(password);

  // Insert user
  const result = await db
    .insert(users)
    .values({ email, passwordHash, name })
    .returning();

  const user = result[0];

  // Generate JWT
  const secret = Deno.env.get("JWT_SECRET") || "hackathon-secret";
  const token = await sign(
    {
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
    },
    secret,
    "HS256"
  );

  return c.json(
    {
      message: "Kayıt başarılı",
      token,
      user: { id: user.id, email: user.email, name: user.name },
    },
    201
  );
});

// ============================================================
// POST /api/auth/login
// ============================================================
auth.post("/login", async (c) => {
  const body = await c.req.json();

  // Validate input
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Doğrulama hatası", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  const { email, password } = parsed.data;

  // Find user
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "Email veya şifre hatalı" }, 401);
  }

  const user = result[0];

  // Verify password
  const valid = bcrypt.compareSync(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: "Email veya şifre hatalı" }, 401);
  }

  // Generate JWT
  const secret = Deno.env.get("JWT_SECRET") || "hackathon-secret";
  const token = await sign(
    {
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    },
    secret,
    "HS256"
  );

  return c.json({
    message: "Giriş başarılı",
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

// ============================================================
// GET /api/auth/me — protected route
// ============================================================
auth.get("/me", authMiddleware, async (c) => {
  const userId = c.get("userId");

  const result = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "Kullanıcı bulunamadı" }, 404);
  }

  return c.json({ user: result[0] });
});

export default auth;
