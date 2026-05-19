import { createMiddleware } from "jsr:@hono/hono/factory";
import { verify } from "jsr:@hono/hono/jwt";

/**
 * JWT authentication middleware.
 * Extracts the Bearer token from Authorization header,
 * verifies it, and sets userId + email on the context.
 */
export const authMiddleware = createMiddleware<{
  Variables: {
    userId: number;
    userEmail: string;
  };
}>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Yetkilendirme token'ı gerekli" }, 401);
  }

  const token = authHeader.split(" ")[1];
  const secret = Deno.env.get("JWT_SECRET") || "hackathon-secret";

  try {
    const payload = await verify(token, secret, "HS256");
    c.set("userId", payload.sub as number);
    c.set("userEmail", payload.email as string);
    await next();
  } catch (_err) {
    return c.json({ error: "Geçersiz veya süresi dolmuş token" }, 401);
  }
});
