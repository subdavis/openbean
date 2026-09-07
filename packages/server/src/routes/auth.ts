import type { Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { decodeJwt } from "jose";
import { clearSession, issueSession } from "../auth.ts";
import type { AppEnv, User } from "../types.ts";
import { now } from "../util.ts";

const STATE_COOKIE = "oauth_state";
const redirectUri = (origin: string) => `${origin}/api/auth/google/callback`;

type Claims = { sub: string; email: string; name?: string; picture?: string };

export function authRoutes(app: Hono<AppEnv>) {
  app.get("/api/auth/google/login", (c) => {
    const nonce = crypto.randomUUID();
    setCookie(c, STATE_COOKIE, nonce, {
      httpOnly: true,
      maxAge: 600,
      path: "/",
      sameSite: "Lax",
      secure: c.env.APP_ORIGIN.startsWith("https"),
    });
    const state = btoa(JSON.stringify({ invite: c.req.query("invite") ?? null, nonce }));
    const params = new URLSearchParams({
      access_type: "online",
      client_id: c.env.GOOGLE_OAUTH_CLIENT_ID,
      prompt: "select_account",
      redirect_uri: redirectUri(c.env.APP_ORIGIN),
      response_type: "code",
      scope: "openid email profile",
      state,
    });
    return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  app.get("/api/auth/google/callback", async (c) => {
    const code = c.req.query("code");
    if (!code) return c.json({ error: "Missing code" }, 400);

    // CSRF: the state nonce must match the cookie set when this flow started.
    let state: { nonce?: string; invite?: string | null } = {};
    try {
      state = JSON.parse(atob(c.req.query("state") ?? ""));
    } catch {
      return c.json({ error: "Bad state" }, 400);
    }
    if (!state.nonce || state.nonce !== getCookie(c, STATE_COOKIE)) {
      return c.json({ error: "Bad state" }, 400);
    }
    deleteCookie(c, STATE_COOKIE, { path: "/" });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      body: new URLSearchParams({
        client_id: c.env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: c.env.GOOGLE_OAUTH_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri(c.env.APP_ORIGIN),
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    if (!tokenRes.ok) return c.json({ error: "Token exchange failed" }, 502);

    // Straight from Google's token endpoint over TLS, so the id_token needs no re-verification.
    const { id_token } = (await tokenRes.json()) as { id_token: string };
    const claims = decodeJwt(id_token) as Claims;

    const db = c.env.db;
    const existing = await db.first<User>("SELECT * FROM users WHERE google_sub = ?", claims.sub);
    const user = existing ?? (await createUser(c, claims, state.invite ?? null));
    if (!user) return c.redirect("/?error=invite_required");

    await issueSession(c, user.id);
    return c.redirect("/");
  });

  app.post("/api/auth/logout", (c) => {
    clearSession(c);
    return c.json({ ok: true });
  });

  app.get("/api/auth/me", (c) => {
    const user = c.get("user");
    return user ? c.json(user) : c.json({ error: "Unauthorized" }, 401);
  });
}

/** Account creation is gated on a live invite, or on being the bootstrap admin. */
async function createUser(
  c: Context<AppEnv>,
  claims: Claims,
  inviteCode: string | null,
): Promise<User | null> {
  const db = c.env.db;
  const invite = inviteCode
    ? await db.first<{ id: number }>(
        "SELECT id FROM invites WHERE code = ? AND redeemed_by IS NULL AND expires_at > ?",
        inviteCode,
        now(),
      )
    : null;

  const isBootstrap =
    !invite && !!c.env.BOOTSTRAP_ADMIN_EMAIL && claims.email === c.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!invite && !isBootstrap) return null;

  const { id } = await db.run(
    `INSERT INTO users (google_sub, name, email, avatar_url, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    claims.sub,
    claims.name ?? claims.email,
    claims.email,
    claims.picture ?? null,
    isBootstrap ? "admin" : "member",
    now(),
  );
  if (invite) {
    await db.run(
      "UPDATE invites SET redeemed_by = ?, redeemed_at = ? WHERE id = ? AND redeemed_by IS NULL",
      id,
      now(),
      invite.id,
    );
  }
  return db.first<User>("SELECT * FROM users WHERE id = ?", id);
}
