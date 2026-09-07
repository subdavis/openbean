import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { jwtVerify, SignJWT } from "jose";
import type { AppEnv, User } from "./types.ts";

const COOKIE = "session";
const SESSION_DAYS = 30;

const secret = (c: Context<AppEnv>) => new TextEncoder().encode(c.env.JWT_SECRET);

export async function issueSession(c: Context<AppEnv>, userId: number) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret(c));
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    maxAge: SESSION_DAYS * 86400,
    path: "/",
    sameSite: "Lax",
    secure: c.env.APP_ORIGIN.startsWith("https"),
  });
}

export function clearSession(c: Context<AppEnv>) {
  setCookie(c, COOKIE, "", { httpOnly: true, maxAge: 0, path: "/", sameSite: "Lax" });
}

/**
 * Resolves the session cookie to a live user row on every request, so role and
 * private-feed changes take effect without re-issuing the (unrevocable) JWT.
 * Everything outside /api/auth/ requires one.
 */
export const session: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, COOKIE);
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret(c));
      const user = await c.env.db.first<User>("SELECT * FROM users WHERE id = ?", payload.sub);
      if (user) c.set("user", user);
    } catch {
      // expired or tampered — treated as signed out
    }
  }
  if (!c.get("user") && !c.req.path.startsWith("/api/auth/")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) =>
  c.get("user")?.role === "admin" ? next() : c.json({ error: "Forbidden" }, 403);
