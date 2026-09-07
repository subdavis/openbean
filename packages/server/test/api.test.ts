import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { SignJWT } from "jose";
import { app } from "../src/app.ts";
import { sqlite } from "../src/db-node.ts";
import type { Bindings, User } from "../src/types.ts";

const env = {
  APP_ORIGIN: "http://localhost",
  // Read the directory rather than listing files, so a new migration is covered by
  // the suite the moment it lands instead of silently sitting out.
  db: sqlite(
    ":memory:",
    readdirSync("migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => join("migrations", f)),
  ),
  JWT_SECRET: "test-secret",
  S3_ACCESS_KEY_ID: "key",
  S3_BUCKET: "bucket",
  S3_ENDPOINT: "https://s3.example.com",
  S3_REGION: "auto",
  S3_SECRET_ACCESS_KEY: "secret",
} as unknown as Bindings;

const users: Record<string, User> = {};
const cookies: Record<string, string> = {};

async function seed(name: string, role: "admin" | "member", priv = 0) {
  const { id } = await env.db.run(
    `INSERT INTO users (google_sub, name, email, role, has_private_feed_access, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    name,
    name,
    `${name}@example.com`,
    role,
    priv,
    new Date().toISOString(),
  );
  users[name] = (await env.db.first<User>("SELECT * FROM users WHERE id = ?", id)) as User;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(id))
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(env.JWT_SECRET));
  cookies[name] = `session=${token}`;
}

const call = (as: string | null, path: string, init: RequestInit = {}) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(as ? { cookie: cookies[as] } : {}),
        ...(init.headers ?? {}),
      },
    }),
    env,
  );

// biome-ignore lint/suspicious/noExplicitAny: test assertions poke at loosely typed JSON
const json = async (res: Response): Promise<any> => res.json();

// Photo uploads hit the bucket; the test only cares that we mint a signed URL.
const realFetch = globalThis.fetch;
before(async () => {
  globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;
  await seed("ada", "admin");
  await seed("bob", "member");
  await seed("cid", "member", 1);
});
after(() => {
  globalThis.fetch = realFetch;
});

test("unauthenticated requests are rejected", async () => {
  assert.equal((await call(null, "/api/posts")).status, 401);
});

test("draft is hidden until published, then appears in the feed", async () => {
  const post = await json(
    await call("bob", "/api/posts", {
      body: JSON.stringify({ body: "hello", post_date: "2026-09-01" }),
      method: "POST",
    }),
  );
  assert.equal(post.published_at, null);
  assert.equal((await json(await call("ada", "/api/posts"))).posts.length, 0);

  // The author can still read their own draft.
  assert.equal((await call("bob", `/api/posts/${post.id}`)).status, 200);
  assert.equal((await call("cid", `/api/posts/${post.id}`)).status, 404);

  await call("bob", `/api/posts/${post.id}/publish`, { method: "POST" });
  assert.equal((await json(await call("ada", "/api/posts"))).posts.length, 1);
});

test("private posts are hidden from members without access, but not from their author", async () => {
  const post = await json(
    await call("bob", "/api/posts", {
      body: JSON.stringify({ is_private: true, post_date: "2026-09-02" }),
      method: "POST",
    }),
  );
  await call("bob", `/api/posts/${post.id}/publish`, { method: "POST" });

  const seenBy = async (who: string) =>
    (await json(await call(who, "/api/posts"))).posts.map((p: { id: number }) => p.id);
  assert.ok((await seenBy("bob")).includes(post.id), "author sees own private post");
  assert.ok((await seenBy("cid")).includes(post.id), "granted member sees it");
  assert.ok((await seenBy("ada")).includes(post.id), "admin sees it");

  await seed("dee", "member");
  assert.ok(!(await seenBy("dee")).includes(post.id), "plain member does not");
});

test("members cannot edit others' posts; admins can", async () => {
  const post = await json(
    await call("bob", "/api/posts", { body: JSON.stringify({ body: "mine" }), method: "POST" }),
  );
  assert.equal(
    (
      await call("cid", `/api/posts/${post.id}`, {
        body: JSON.stringify({ body: "yours" }),
        method: "PATCH",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call("ada", `/api/posts/${post.id}`, {
        body: JSON.stringify({ body: "ours" }),
        method: "PATCH",
      })
    ).status,
    200,
  );
});

test("comment and like counters stay in step", async () => {
  const post = await json(
    await call("bob", "/api/posts", { body: JSON.stringify({ body: "counted" }), method: "POST" }),
  );
  await call("bob", `/api/posts/${post.id}/publish`, { method: "POST" });

  const comment = await json(
    await call("cid", `/api/posts/${post.id}/comments`, {
      body: JSON.stringify({ body: "nice" }),
      method: "POST",
    }),
  );
  await call("ada", `/api/posts/${post.id}/like`, { method: "POST" });
  await call("ada", `/api/posts/${post.id}/like`, { method: "POST" }); // idempotent
  await call("ada", `/api/comments/${comment.id}/like`, { method: "POST" });

  let detail = await json(await call("ada", `/api/posts/${post.id}`));
  assert.equal(detail.like_count, 1);
  assert.equal(detail.comment_count, 1);
  assert.equal(detail.liked_by_me, true);
  assert.equal(detail.comments[0].like_count, 1);
  assert.equal(detail.comments[0].liked_by_me, true);

  await call("ada", `/api/posts/${post.id}/like`, { method: "DELETE" });
  await call("cid", `/api/comments/${comment.id}`, { method: "DELETE" });
  detail = await json(await call("ada", `/api/posts/${post.id}`));
  assert.equal(detail.like_count, 0);
  assert.equal(detail.comment_count, 0);
  assert.equal(detail.comments.length, 0);
});

test("photos get presigned upload URLs and delete cleanly", async () => {
  const post = await json(
    await call("bob", "/api/posts", { body: JSON.stringify({ body: "pics" }), method: "POST" }),
  );
  const { photos } = await json(
    await call("bob", `/api/posts/${post.id}/photos`, {
      body: JSON.stringify([{ contentType: "image/jpeg", height: 3000, thumb: true, width: 4000 }]),
      method: "POST",
    }),
  );
  assert.match(photos[0].uploadUrl, /X-Amz-Signature=[0-9a-f]{64}/);
  assert.match(photos[0].thumbUploadUrl, /thumb\.webp\?.*X-Amz-Signature=/);

  for (const contentType of ["application/pdf", "image/heic", "image/heif"]) {
    assert.equal(
      (
        await call("bob", `/api/posts/${post.id}/photos`, {
          body: JSON.stringify([{ contentType }]),
          method: "POST",
        })
      ).status,
      400,
      `${contentType} must be rejected`,
    );
  }

  // No thumbnail requested: the row stores none and the view reports null.
  const { photos: plain } = await json(
    await call("bob", `/api/posts/${post.id}/photos`, {
      body: JSON.stringify([{ contentType: "image/png" }]),
      method: "POST",
    }),
  );
  assert.equal(plain[0].thumbUploadUrl, null);

  await call("bob", `/api/posts/${post.id}/publish`, { method: "POST" });
  let detail = await json(await call("bob", `/api/posts/${post.id}`));
  assert.match(detail.photos[0].url, /X-Amz-Signature=/);
  assert.match(detail.photos[0].thumb_url, /X-Amz-Signature=/);
  assert.deepEqual([detail.photos[0].width, detail.photos[0].height], [4000, 3000]);
  assert.equal(detail.photos[1].thumb_url, null);

  await call("bob", `/api/posts/${post.id}/photos/${plain[0].id}`, { method: "DELETE" });

  await call("bob", `/api/posts/${post.id}/photos/${photos[0].id}`, { method: "DELETE" });
  detail = await json(await call("bob", `/api/posts/${post.id}`));
  assert.equal(detail.photos.length, 0);
});

test("only admins manage invites and users", async () => {
  assert.equal((await call("bob", "/api/invites", { method: "POST" })).status, 403);
  const invite = await json(await call("ada", "/api/invites", { method: "POST" }));
  assert.match(invite.url, /\?invite=[0-9a-f]{16}$/);
  assert.equal(
    (
      await call("bob", `/api/users/${users.cid.id}`, {
        body: JSON.stringify({ role: "admin" }),
        method: "PATCH",
      })
    ).status,
    403,
  );
  const updated = await json(
    await call("ada", `/api/users/${users.cid.id}`, {
      body: JSON.stringify({ role: "admin" }),
      method: "PATCH",
    }),
  );
  assert.equal(updated.role, "admin");
});

test("deleting a user cleans up their content and invite rows", async () => {
  await seed("eve", "member");
  const eve = users.eve;
  // Simulate eve having joined via an invite; the FK rows must not block deletion.
  await env.db.run(
    "INSERT INTO invites (code, created_by, redeemed_by, redeemed_at, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    "evecode",
    users.ada.id,
    eve.id,
    new Date().toISOString(),
    new Date().toISOString(),
    new Date().toISOString(),
  );
  await call("eve", "/api/posts", { body: JSON.stringify({ body: "bye" }), method: "POST" });
  assert.equal((await call("ada", `/api/users/${eve.id}`, { method: "DELETE" })).status, 200);
  assert.equal(await env.db.first("SELECT id FROM users WHERE id = ?", eve.id), null);
  assert.equal(await env.db.first("SELECT id FROM invites WHERE redeemed_by = ?", eve.id), null);
});

test("feed pages by cursor", async () => {
  const first = await json(await call("ada", "/api/posts?limit=1"));
  assert.equal(first.posts.length, 1);
  const next = await json(
    await call("ada", `/api/posts?limit=1&cursor=${encodeURIComponent(first.cursor)}`),
  );
  assert.notEqual(next.posts[0].id, first.posts[0].id);
});
