import type { Context, Hono } from "hono";
import { deletePost } from "../content.ts";
import type { Db } from "../db.ts";
import { canEdit, canSee, feedWhere, visiblePost } from "../perms.ts";
import { type S3, s3 } from "../s3.ts";
import type { AppEnv, Comment, Photo, Post, User } from "../types.ts";
import { isDate, now, text } from "../util.ts";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const BODY_MAX = 10_000;
const DEFAULT_MAX_PHOTOS = 20;

/**
 * Upload formats, and the extension each one gets. Deriving the extension here rather
 * than from the client's filename is what keeps a transcoded .heic from landing in the
 * bucket under its original name — and the lookup doubles as the format check, so
 * image/heic (which no desktop browser paints) is rejected instead of stored.
 */
const EXT: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const dim = (v: unknown) => (typeof v === "number" && v > 0 && v < 1e6 ? Math.round(v) : null);

type PostRow = Post & { author_name: string; author_avatar: string | null };

const marks = (xs: unknown[]) => xs.map(() => "?").join(",");
const today = () => new Date().toISOString().slice(0, 10);
const cursorOf = (p: Post) => `${p.post_date}|${p.id}`;

const author = (row: { author_id: number; author_name: string; author_avatar: string | null }) => ({
  avatar_url: row.author_avatar,
  id: row.author_id,
  name: row.author_name,
});

const AUTHOR_COLS = "u.name AS author_name, u.avatar_url AS author_avatar";

/** Attach author, photo read-URLs and liked-by-me to a page of post rows. */
async function hydrate(db: Db, storage: S3, rows: PostRow[], user: User) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [photos, likes] = await Promise.all([
    db.all<Photo>(
      `SELECT * FROM post_photos WHERE post_id IN (${marks(ids)}) ORDER BY sort_order, id`,
      ...ids,
    ),
    db.all<{ likeable_id: number }>(
      `SELECT likeable_id FROM likes
       WHERE user_id = ? AND likeable_type = 'post' AND likeable_id IN (${marks(ids)})`,
      user.id,
      ...ids,
    ),
  ]);
  const liked = new Set(likes.map((l) => l.likeable_id));
  const urls = new Map(
    await Promise.all(
      photos.map(
        async (p) =>
          [
            p.id,
            {
              thumb_url: p.thumb_key ? await storage.readUrl(p.thumb_key) : null,
              url: await storage.readUrl(p.storage_key),
            },
          ] as const,
      ),
    ),
  );

  return rows.map(({ author_name, author_avatar, ...post }) => ({
    ...post,
    author: author({ author_avatar, author_id: post.author_id, author_name }),
    liked_by_me: liked.has(post.id),
    photos: photos
      .filter((p) => p.post_id === post.id)
      .map((p) => ({
        height: p.height,
        id: p.id,
        sort_order: p.sort_order,
        width: p.width,
        ...urls.get(p.id),
      })),
  }));
}

export function postRoutes(app: Hono<AppEnv>) {
  // Feed (cursor) and calendar (from/to) share one query — same filters, different window.
  app.get("/api/posts", async (c) => {
    const user = c.get("user");
    const [visible, params] = feedWhere(user);
    const where = ["p.published_at IS NOT NULL", visible];
    const visibleParams = [...params];
    const from = c.req.query("from");
    const to = c.req.query("to");
    const cursor = c.req.query("cursor");

    if (from || to) {
      if (!isDate(from) || !isDate(to)) return c.json({ error: "Invalid date range" }, 400);
      where.push("p.post_date >= ?", "p.post_date <= ?");
      params.push(from, to);
    } else if (cursor) {
      const [date, id] = cursor.split("|");
      if (!isDate(date) || !Number.isInteger(Number(id))) {
        return c.json({ error: "Invalid cursor" }, 400);
      }
      where.push("(p.post_date < ? OR (p.post_date = ? AND p.id < ?))");
      params.push(date, date, Number(id));
    }

    // Clamp: a negative LIMIT means "no limit" to SQLite.
    const limit = Math.min(
      Math.max(Math.floor(Number(c.req.query("limit"))) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const rows = await c.env.db.all<PostRow>(
      `SELECT p.*, ${AUTHOR_COLS} FROM posts p JOIN users u ON u.id = p.author_id
       WHERE ${where.join(" AND ")} ORDER BY p.post_date DESC, p.id DESC LIMIT ?`,
      ...params,
      limit,
    );
    const last = rows.at(-1);
    return c.json({
      cursor: last && rows.length === limit ? cursorOf(last) : null,
      // The calendar pages backwards a month at a time and has no cursor to run out
      // of, so it gets the floor instead: the oldest date it could ever reach.
      oldest:
        (
          await c.env.db.first<{ d: string | null }>(
            `SELECT MIN(p.post_date) AS d FROM posts p WHERE ${["p.published_at IS NOT NULL", visible].join(" AND ")}`,
            ...visibleParams,
          )
        )?.d ?? null,
      posts: await hydrate(c.env.db, s3(c.env), rows, user),
    });
  });

  // Always creates a draft. Photos are added afterwards, so composing and editing
  // a post run through exactly the same endpoints.
  app.post("/api/posts", async (c) => {
    const body = await c.req.json<{ body?: string; post_date?: string; is_private?: boolean }>();
    const post_date = body.post_date ?? today();
    if (!isDate(post_date)) return c.json({ error: "Invalid post_date" }, 400);
    const { id } = await c.env.db.run(
      "INSERT INTO posts (author_id, body, post_date, is_private, created_at) VALUES (?, ?, ?, ?, ?)",
      c.get("user").id,
      text(body.body, BODY_MAX),
      post_date,
      !!body.is_private,
      now(),
    );
    return c.json(await c.env.db.first<Post>("SELECT * FROM posts WHERE id = ?", id), 201);
  });

  app.get("/api/posts/:id", async (c) => {
    const user = c.get("user");
    const row = await c.env.db.first<PostRow>(
      `SELECT p.*, ${AUTHOR_COLS} FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?`,
      c.req.param("id"),
    );
    if (!row || !canSee(row, user)) return c.json({ error: "Not found" }, 404);
    const [post] = await hydrate(c.env.db, s3(c.env), [row], user);
    const [comments, prev, next] = await Promise.all([
      listComments(c.env.db, row.id, user),
      sibling(c.env.db, row, user, "older"),
      sibling(c.env.db, row, user, "newer"),
    ]);
    return c.json({ ...post, comments, next_id: next, prev_id: prev });
  });

  app.patch("/api/posts/:id", async (c) => {
    const post = await editablePost(c);
    if (!post) return c.json({ error: "Not found" }, 404);
    const body = await c.req.json<{ body?: string; post_date?: string; is_private?: boolean }>();
    if (body.post_date !== undefined && !isDate(body.post_date)) {
      return c.json({ error: "Invalid post_date" }, 400);
    }
    await c.env.db.run(
      "UPDATE posts SET body = ?, post_date = ?, is_private = ?, updated_at = ? WHERE id = ?",
      body.body === undefined ? post.body : text(body.body, BODY_MAX),
      body.post_date ?? post.post_date,
      body.is_private === undefined ? post.is_private : !!body.is_private,
      now(),
      post.id,
    );
    return c.json(await c.env.db.first<Post>("SELECT * FROM posts WHERE id = ?", post.id));
  });

  app.delete("/api/posts/:id", async (c) => {
    const post = await editablePost(c);
    if (!post) return c.json({ error: "Not found" }, 404);
    await deletePost(c.env.db, s3(c.env), post.id);
    return c.json({ ok: true });
  });

  app.post("/api/posts/:id/publish", async (c) => {
    const post = await editablePost(c);
    if (!post) return c.json({ error: "Not found" }, 404);
    if (!post.published_at) {
      await c.env.db.run("UPDATE posts SET published_at = ? WHERE id = ?", now(), post.id);
    }
    return c.json(await c.env.db.first<Post>("SELECT * FROM posts WHERE id = ?", post.id));
  });

  // Hands back one presigned PUT per photo; the client uploads bytes straight to the bucket.
  app.post("/api/posts/:id/photos", async (c) => {
    const post = await editablePost(c);
    if (!post) return c.json({ error: "Not found" }, 404);
    const items =
      await c.req.json<
        { contentType?: string; thumb?: boolean; width?: number; height?: number }[]
      >();
    if (!Array.isArray(items) || items.length === 0) return c.json({ error: "Empty request" }, 400);
    if (items.some((i) => !i.contentType || !EXT[i.contentType])) {
      return c.json({ error: "Unsupported image format" }, 400);
    }

    const max = Number(c.env.MAX_PHOTOS_PER_POST) || DEFAULT_MAX_PHOTOS;
    const existing = await c.env.db.first<{ n: number; max_order: number | null }>(
      "SELECT COUNT(*) AS n, MAX(sort_order) AS max_order FROM post_photos WHERE post_id = ?",
      post.id,
    );
    if ((existing?.n ?? 0) + items.length > max) {
      return c.json({ error: `At most ${max} photos per post` }, 400);
    }

    const storage = s3(c.env);
    let order = (existing?.max_order ?? -1) + 1;
    const photos = [];
    for (const item of items) {
      // Both objects share a UUID so a bucket listing shows the pair together.
      const base = `posts/${post.id}/${crypto.randomUUID()}`;
      const key = `${base}.${EXT[item.contentType as string]}`;
      const thumbKey = item.thumb ? `${base}.thumb.webp` : null;
      const { id } = await c.env.db.run(
        "INSERT INTO post_photos (post_id, storage_key, thumb_key, sort_order, width, height) VALUES (?, ?, ?, ?, ?, ?)",
        post.id,
        key,
        thumbKey,
        order++,
        dim(item.width),
        dim(item.height),
      );
      photos.push({
        id,
        thumbUploadUrl: thumbKey ? await storage.uploadUrl(thumbKey) : null,
        uploadUrl: await storage.uploadUrl(key),
      });
    }
    return c.json({ photos }, 201);
  });

  // Also the client's recovery path when a direct PUT fails.
  app.delete("/api/posts/:id/photos/:photoId", async (c) => {
    const post = await editablePost(c);
    if (!post) return c.json({ error: "Not found" }, 404);
    const photo = await c.env.db.first<Photo>(
      "SELECT * FROM post_photos WHERE id = ? AND post_id = ?",
      c.req.param("photoId"),
      post.id,
    );
    if (!photo) return c.json({ error: "Not found" }, 404);
    const storage = s3(c.env);
    await storage.delete(photo.storage_key);
    if (photo.thumb_key) await storage.delete(photo.thumb_key);
    await c.env.db.run("DELETE FROM post_photos WHERE id = ?", photo.id);
    return c.json({ ok: true });
  });
}

/**
 * The published post one step older or newer than `post`, in the same order the feed
 * uses — so paging through the modal walks the feed without holes.
 */
async function sibling(db: Db, post: Post, user: User, dir: "older" | "newer") {
  const [cmp, order] = dir === "older" ? ["<", "DESC"] : [">", "ASC"];
  const [visible, params] = feedWhere(user);
  const row = await db.first<{ id: number }>(
    `SELECT p.id FROM posts p
     WHERE p.published_at IS NOT NULL AND ${visible}
       AND (p.post_date ${cmp} ? OR (p.post_date = ? AND p.id ${cmp} ?))
     ORDER BY p.post_date ${order}, p.id ${order} LIMIT 1`,
    ...params,
    post.post_date,
    post.post_date,
    post.id,
  );
  return row?.id ?? null;
}

/** 404 (not 403) for posts the caller can't see, so the two are indistinguishable. */
async function editablePost(c: Context<AppEnv>) {
  const post = await visiblePost(c.env.db, c.req.param("id"), c.get("user"));
  return post && canEdit(post, c.get("user")) ? post : null;
}

export async function listComments(db: Db, postId: number, user: User) {
  const rows = await db.all<Comment & { author_name: string; author_avatar: string | null }>(
    `SELECT c.*, ${AUTHOR_COLS} FROM comments c JOIN users u ON u.id = c.author_id
     WHERE c.post_id = ? ORDER BY c.id`,
    postId,
  );
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const likes = await db.all<{ likeable_id: number }>(
    `SELECT likeable_id FROM likes
     WHERE user_id = ? AND likeable_type = 'comment' AND likeable_id IN (${marks(ids)})`,
    user.id,
    ...ids,
  );
  const liked = new Set(likes.map((l) => l.likeable_id));
  return rows.map(({ author_name, author_avatar, ...comment }) => ({
    ...comment,
    author: author({ author_avatar, author_id: comment.author_id, author_name }),
    liked_by_me: liked.has(comment.id),
  }));
}
