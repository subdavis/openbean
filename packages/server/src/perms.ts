import type { Db } from "./db.ts";
import type { Post, User } from "./types.ts";

export const isAdmin = (u: User) => u.role === "admin";

/** Admins see everything; members need the grant. Own private posts are always visible. */
export const seesPrivateFeed = (u: User) => isAdmin(u) || !!u.has_private_feed_access;

export const canSee = (p: Post, u: User) =>
  (p.published_at !== null || p.author_id === u.id || isAdmin(u)) &&
  (!p.is_private || p.author_id === u.id || seesPrivateFeed(u));

/** Author-or-admin, for posts, photos and comments alike. */
export const canEdit = (row: { author_id: number }, u: User) =>
  isAdmin(u) || row.author_id === u.id;

/** WHERE fragment for feed/calendar listing, on alias `p`. Drafts are excluded separately. */
export const feedWhere = (u: User): [sql: string, params: unknown[]] =>
  seesPrivateFeed(u) ? ["1 = 1", []] : ["(p.is_private = 0 OR p.author_id = ?)", [u.id]];

/** Load a post only if this user is allowed to see it. */
export async function visiblePost(
  db: Db,
  id: number | string | undefined,
  u: User,
): Promise<Post | null> {
  const post = await db.first<Post>("SELECT * FROM posts WHERE id = ?", id);
  return post && canSee(post, u) ? post : null;
}
