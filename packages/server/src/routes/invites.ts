import type { Hono } from "hono";
import { requireAdmin } from "../auth.ts";
import type { AppEnv } from "../types.ts";
import { now, randomCode } from "../util.ts";

const INVITE_DAYS = 7;

export function inviteRoutes(app: Hono<AppEnv>) {
  app.post("/api/invites", requireAdmin, async (c) => {
    const code = randomCode();
    const expires_at = new Date(Date.now() + INVITE_DAYS * 86400_000).toISOString();
    const { id } = await c.env.db.run(
      "INSERT INTO invites (code, created_by, expires_at, created_at) VALUES (?, ?, ?, ?)",
      code,
      c.get("user").id,
      expires_at,
      now(),
    );
    return c.json({ code, expires_at, id, url: `${c.env.APP_ORIGIN}/?invite=${code}` }, 201);
  });

  app.get("/api/invites", requireAdmin, async (c) =>
    c.json(
      await c.env.db.all(
        `SELECT i.*, u.name AS redeemed_by_name
         FROM invites i LEFT JOIN users u ON u.id = i.redeemed_by
         ORDER BY i.id DESC`,
      ),
    ),
  );

  app.delete("/api/invites/:id", requireAdmin, async (c) => {
    const { changes } = await c.env.db.run(
      "DELETE FROM invites WHERE id = ? AND redeemed_by IS NULL",
      c.req.param("id"),
    );
    return changes ? c.json({ ok: true }) : c.json({ error: "Not found or already redeemed" }, 404);
  });
}
