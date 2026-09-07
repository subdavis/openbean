import type { Hono } from "hono";
import { requireAdmin } from "../auth.ts";
import { deleteUser } from "../content.ts";
import { s3 } from "../s3.ts";
import type { AppEnv, User } from "../types.ts";
import { isUrl, text } from "../util.ts";

export function userRoutes(app: Hono<AppEnv>) {
  app.get("/api/users", async (c) =>
    c.json(
      await c.env.db.all(
        `SELECT id, name, email, avatar_url, role, has_private_feed_access, created_at
         FROM users ORDER BY name`,
      ),
    ),
  );

  app.patch("/api/users/me", async (c) => {
    const body = await c.req.json<{ name?: string; avatar_url?: string | null }>();
    const me = c.get("user");
    const name = body.name === undefined ? me.name : text(body.name, 80);
    if (!name) return c.json({ error: "Invalid name" }, 400);
    const avatar =
      body.avatar_url === undefined
        ? me.avatar_url
        : body.avatar_url === null || isUrl(body.avatar_url)
          ? body.avatar_url
          : undefined;
    if (avatar === undefined) return c.json({ error: "Invalid avatar_url" }, 400);

    await c.env.db.run(
      "UPDATE users SET name = ?, avatar_url = ? WHERE id = ?",
      name,
      avatar,
      me.id,
    );
    return c.json(await c.env.db.first<User>("SELECT * FROM users WHERE id = ?", me.id));
  });

  app.patch("/api/users/:id", requireAdmin, async (c) => {
    const body = await c.req.json<{ role?: string; has_private_feed_access?: boolean }>();
    const target = await c.env.db.first<User>(
      "SELECT * FROM users WHERE id = ?",
      c.req.param("id"),
    );
    if (!target) return c.json({ error: "Not found" }, 404);
    if (body.role !== undefined && body.role !== "admin" && body.role !== "member") {
      return c.json({ error: "Invalid role" }, 400);
    }
    // Don't let the last admin demote themselves out of the deployment.
    if (body.role === "member" && target.role === "admin" && (await adminCount(c)) < 2) {
      return c.json({ error: "Cannot demote the last admin" }, 400);
    }
    await c.env.db.run(
      "UPDATE users SET role = ?, has_private_feed_access = ? WHERE id = ?",
      body.role ?? target.role,
      body.has_private_feed_access === undefined
        ? target.has_private_feed_access
        : !!body.has_private_feed_access,
      target.id,
    );
    return c.json(await c.env.db.first<User>("SELECT * FROM users WHERE id = ?", target.id));
  });

  app.delete("/api/users/:id", requireAdmin, async (c) => {
    const id = Number(c.req.param("id"));
    if (id === c.get("user").id) return c.json({ error: "Cannot delete yourself" }, 400);
    const target = await c.env.db.first<User>("SELECT * FROM users WHERE id = ?", id);
    if (!target) return c.json({ error: "Not found" }, 404);
    await deleteUser(c.env.db, s3(c.env), id);
    return c.json({ ok: true });
  });
}

const adminCount = async (c: { env: AppEnv["Bindings"] }) =>
  (await c.env.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'"))
    ?.n ?? 0;
