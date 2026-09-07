import type { Context, Hono } from "hono";
import { deleteComment } from "../content.ts";
import { canEdit, visiblePost } from "../perms.ts";
import type { AppEnv, Comment } from "../types.ts";
import { now, text } from "../util.ts";

const BODY_MAX = 4_000;

export function commentRoutes(app: Hono<AppEnv>) {
  app.post("/api/posts/:id/comments", async (c) => {
    const user = c.get("user");
    const post = await visiblePost(c.env.db, c.req.param("id"), user);
    if (!post) return c.json({ error: "Not found" }, 404);
    const body = text((await c.req.json<{ body?: string }>()).body, BODY_MAX);
    if (!body) return c.json({ error: "Comment body required" }, 400);

    const { id } = await c.env.db.run(
      "INSERT INTO comments (post_id, author_id, body, created_at) VALUES (?, ?, ?, ?)",
      post.id,
      user.id,
      body,
      now(),
    );
    await c.env.db.run("UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?", post.id);
    return c.json(await c.env.db.first<Comment>("SELECT * FROM comments WHERE id = ?", id), 201);
  });

  app.delete("/api/comments/:id", async (c) => {
    const comment = await editable(c);
    if (!comment) return c.json({ error: "Not found" }, 404);
    await deleteComment(c.env.db, comment);
    return c.json({ ok: true });
  });
}

/** A comment is deletable if its post is visible and the caller is its author or an admin. */
async function editable(c: Context<AppEnv>) {
  const user = c.get("user");
  const comment = await c.env.db.first<Comment>(
    "SELECT * FROM comments WHERE id = ?",
    c.req.param("id"),
  );
  if (!comment || !canEdit(comment, user)) return null;
  return (await visiblePost(c.env.db, comment.post_id, user)) ? comment : null;
}
