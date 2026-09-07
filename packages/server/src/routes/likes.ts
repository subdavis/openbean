import type { Context, Hono } from "hono";
import { visiblePost } from "../perms.ts";
import type { AppEnv, Comment } from "../types.ts";
import { now } from "../util.ts";

/**
 * Posts and comments like identically, so both are registered from one definition.
 * Visibility is resolved back to the owning post in either case.
 */
export function likeRoutes(app: Hono<AppEnv>) {
  const targets = [
    { path: "/api/posts/:id/like", table: "posts", type: "post" },
    { path: "/api/comments/:id/like", table: "comments", type: "comment" },
  ] as const;

  for (const { path, table, type } of targets) {
    const resolve = async (c: Context<AppEnv>) => {
      const user = c.get("user");
      if (type === "post")
        return (await visiblePost(c.env.db, c.req.param("id"), user))?.id ?? null;
      const comment = await c.env.db.first<Comment>(
        "SELECT * FROM comments WHERE id = ?",
        c.req.param("id"),
      );
      if (!comment) return null;
      return (await visiblePost(c.env.db, comment.post_id, user)) ? comment.id : null;
    };

    app.post(path, async (c) => {
      const id = await resolve(c);
      if (!id) return c.json({ error: "Not found" }, 404);
      // Unique constraint makes this idempotent; only a fresh row moves the counter.
      const { changes } = await c.env.db.run(
        `INSERT OR IGNORE INTO likes (user_id, likeable_type, likeable_id, created_at)
         VALUES (?, ?, ?, ?)`,
        c.get("user").id,
        type,
        id,
        now(),
      );
      if (changes) {
        await c.env.db.run(`UPDATE ${table} SET like_count = like_count + 1 WHERE id = ?`, id);
      }
      return c.json({ liked: true });
    });

    app.delete(path, async (c) => {
      const id = await resolve(c);
      if (!id) return c.json({ error: "Not found" }, 404);
      const { changes } = await c.env.db.run(
        "DELETE FROM likes WHERE user_id = ? AND likeable_type = ? AND likeable_id = ?",
        c.get("user").id,
        type,
        id,
      );
      if (changes) {
        await c.env.db.run(
          `UPDATE ${table} SET like_count = MAX(like_count - 1, 0) WHERE id = ?`,
          id,
        );
      }
      return c.json({ liked: false });
    });
  }
}
