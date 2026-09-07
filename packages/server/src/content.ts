import type { Db } from "./db.ts";
import type { S3 } from "./s3.ts";

const unlike = (table: "posts" | "comments", type: "post" | "comment", subquery: string) =>
  `UPDATE ${table} SET like_count = MAX(like_count - 1, 0)
   WHERE id IN (SELECT likeable_id FROM likes WHERE likeable_type = '${type}' AND ${subquery})`;

/** Delete a post and everything hanging off it, bucket objects included. */
export async function deletePost(db: Db, storage: S3, postId: number) {
  const photos = await db.all<{ storage_key: string; thumb_key: string | null }>(
    "SELECT storage_key, thumb_key FROM post_photos WHERE post_id = ?",
    postId,
  );
  await Promise.all(
    photos.flatMap((p) => [
      storage.delete(p.storage_key),
      ...(p.thumb_key ? [storage.delete(p.thumb_key)] : []),
    ]),
  );
  await db.run(
    `DELETE FROM likes WHERE (likeable_type = 'post' AND likeable_id = ?1)
       OR (likeable_type = 'comment' AND likeable_id IN (SELECT id FROM comments WHERE post_id = ?1))`,
    postId,
  );
  await db.run("DELETE FROM comments WHERE post_id = ?", postId);
  await db.run("DELETE FROM post_photos WHERE post_id = ?", postId);
  await db.run("DELETE FROM posts WHERE id = ?", postId);
}

/** Delete a comment, its likes, and fix the post's denormalised counter. */
export async function deleteComment(db: Db, comment: { id: number; post_id: number }) {
  await db.run("DELETE FROM likes WHERE likeable_type = 'comment' AND likeable_id = ?", comment.id);
  await db.run("DELETE FROM comments WHERE id = ?", comment.id);
  await db.run(
    "UPDATE posts SET comment_count = MAX(comment_count - 1, 0) WHERE id = ?",
    comment.post_id,
  );
}

/** Remove a member along with their posts, comments and likes. */
export async function deleteUser(db: Db, storage: S3, userId: number) {
  // ponytail: one round trip per post/comment. Family-sized data, so not worth batching.
  for (const p of await db.all<{ id: number }>(
    "SELECT id FROM posts WHERE author_id = ?",
    userId,
  )) {
    await deletePost(db, storage, p.id);
  }
  for (const cm of await db.all<{ id: number; post_id: number }>(
    "SELECT id, post_id FROM comments WHERE author_id = ?",
    userId,
  )) {
    await deleteComment(db, cm);
  }
  await db.run(unlike("posts", "post", "user_id = ?"), userId);
  await db.run(unlike("comments", "comment", "user_id = ?"), userId);
  await db.run("DELETE FROM likes WHERE user_id = ?", userId);
  // Redeemed invites are spent; keeping them would leave FK references to the deleted user.
  await db.run("DELETE FROM invites WHERE created_by = ? OR redeemed_by = ?", userId, userId);
  await db.run("DELETE FROM users WHERE id = ?", userId);
}
