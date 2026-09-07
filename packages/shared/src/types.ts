/**
 * Row shapes shared between the server (DB results) and the client (API responses).
 * No build step — both sides consume this .ts file directly (Node's native TS support,
 * wrangler's esbuild, and Vite's esbuild all strip types from source on the fly).
 */

export type Role = "admin" | "member";

export type User = {
  id: number;
  google_sub: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: Role;
  has_private_feed_access: number;
  created_at: string;
};

export type Post = {
  id: number;
  author_id: number;
  body: string | null;
  post_date: string;
  is_private: number;
  published_at: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string | null;
};

export type Photo = {
  id: number;
  post_id: number;
  storage_key: string;
  /** 180px-wide WebP copy, or null when the client could not produce one. */
  thumb_key: string | null;
  sort_order: number;
  /** Intrinsic size of the original; null for rows uploaded before it was captured. */
  width: number | null;
  height: number | null;
};

export type Comment = {
  id: number;
  post_id: number;
  author_id: number;
  body: string;
  like_count: number;
  created_at: string;
  updated_at: string | null;
};

export type Invite = {
  id: number;
  code: string;
  created_by: number;
  redeemed_by: number | null;
  redeemed_at: string | null;
  expires_at: string;
  created_at: string;
};

/** The `author` shape every API response attaches in place of a bare author_id. */
export type Author = { id: number; name: string; avatar_url: string | null };

/** A photo as returned to clients: the storage key replaced with a presigned read URL. */
export type PhotoView = {
  id: number;
  sort_order: number;
  url: string;
  thumb_url: string | null;
  width: number | null;
  height: number | null;
};

export type PostView = Post & { author: Author; liked_by_me: boolean; photos: PhotoView[] };
export type CommentView = Comment & { author: Author; liked_by_me: boolean };
/** `prev_id`/`next_id` walk the feed order: prev is older, next is newer. */
export type PostDetail = PostView & {
  comments: CommentView[];
  next_id: number | null;
  prev_id: number | null;
};
