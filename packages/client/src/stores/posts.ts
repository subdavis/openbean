import type { Comment, CommentView, Post, PostDetail, PostView } from "@openbean/shared";
import { reactive } from "vue";
import { api, uploadToBucket } from "../api.ts";
import { prepare } from "../thumbnail.ts";
import { currentUser } from "./session.ts";

/** A feed row upgraded in place by the detail fetch, so the extras are optional. */
export type CachedPost = PostView & Partial<PostDetail>;

/**
 * One reactive object per post id. The feed and the detail modal both render the
 * same instance, so a like or a comment in one is immediately visible in the other.
 */
const cache = reactive(new Map<number, CachedPost>());

function cachePost(post: PostView | PostDetail): CachedPost {
  const existing = cache.get(post.id);
  if (!existing) {
    cache.set(post.id, post as CachedPost);
    return post as CachedPost;
  }
  Object.assign(existing, post);
  return existing;
}

export const getPost = (id: number) => cache.get(id);

export const feed = reactive({
  cursor: null as string | null,
  done: false,
  error: "",
  ids: [] as number[],
  loading: false,
});

export async function loadMore() {
  if (feed.loading || feed.done) return;
  feed.loading = true;
  feed.error = "";
  try {
    const query = feed.cursor ? `?cursor=${encodeURIComponent(feed.cursor)}` : "";
    const page = await api.get<{ cursor: string | null; posts: PostView[] }>(`/posts${query}`);
    for (const post of page.posts) {
      cachePost(post);
      if (!feed.ids.includes(post.id)) feed.ids.push(post.id);
    }
    feed.cursor = page.cursor;
    feed.done = page.cursor === null;
  } catch (err) {
    feed.error = (err as Error).message;
  } finally {
    feed.loading = false;
  }
}

/** Next visit to the feed refetches from the top — used after publishing. */
export function invalidateFeed() {
  feed.ids = [];
  feed.cursor = null;
  feed.done = false;
  feed.error = "";
  calendar.months = [];
  calendar.byDate.clear();
  calendar.error = "";
  calendar.done = false;
}

export const calendar = reactive({
  /** "YYYY-MM-DD" → the post shown on that square. */
  byDate: new Map<string, number>(),
  /** Reached the month of the oldest post there is — nothing older to load. */
  done: false,
  error: "",
  loading: false,
  /** Newest first, the order the calendar renders them in. */
  months: [] as string[],
});

/** Appends the month before the oldest one loaded — or the current month, first time. */
export async function loadMonth() {
  if (calendar.loading || calendar.done) return;
  const oldest = calendar.months.at(-1);
  const start = oldest
    ? new Date(Number(oldest.slice(0, 4)), Number(oldest.slice(5)) - 2, 1)
    : new Date();
  const month = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  const last = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  calendar.loading = true;
  calendar.error = "";
  try {
    // ponytail: one request per month, capped at the API's 100 — a month with more
    // posts than that loses the overflow. Paginate if that ever happens.
    const { oldest, posts } = await api.get<{ oldest: string | null; posts: PostView[] }>(
      `/posts?from=${month}-01&to=${month}-${last}&limit=100`,
    );
    // An empty feed has no floor, so the first month loaded is also the last.
    calendar.done = month <= (oldest?.slice(0, 7) ?? month);
    for (const post of posts) {
      cachePost(post);
      // Rows come back newest-first, so the first one seen for a day is the one shown.
      if (!calendar.byDate.has(post.post_date)) calendar.byDate.set(post.post_date, post.id);
    }
    calendar.months.push(month);
  } catch (err) {
    calendar.error = (err as Error).message;
  } finally {
    calendar.loading = false;
  }
}

export async function fetchPost(id: number) {
  return cachePost(await api.get<PostDetail>(`/posts/${id}`));
}

export async function deletePost(id: number) {
  await api.del(`/posts/${id}`);
  cache.delete(id);
  feed.ids = feed.ids.filter((postId) => postId !== id);
  for (const [date, postId] of calendar.byDate) {
    if (postId === id) calendar.byDate.delete(date);
  }
}

export async function toggleLike(post: CachedPost) {
  const liked = !post.liked_by_me;
  post.liked_by_me = liked;
  post.like_count += liked ? 1 : -1;
  try {
    await (liked ? api.post(`/posts/${post.id}/like`) : api.del(`/posts/${post.id}/like`));
  } catch (err) {
    post.liked_by_me = !liked;
    post.like_count += liked ? -1 : 1;
    throw err;
  }
}

export async function addComment(post: CachedPost, body: string) {
  const comment = await api.post<Comment>(`/posts/${post.id}/comments`, { body });
  const user = currentUser.value;
  post.comments ??= [];
  post.comments.push({
    ...comment,
    author: user
      ? { avatar_url: user.avatar_url, id: user.id, name: user.name }
      : { avatar_url: null, id: comment.author_id, name: "You" },
    liked_by_me: false,
  });
  post.comment_count += 1;
}

export async function deleteComment(post: CachedPost, comment: CommentView) {
  await api.del(`/comments/${comment.id}`);
  post.comments = post.comments?.filter((c) => c.id !== comment.id);
  post.comment_count -= 1;
}

export async function toggleCommentLike(comment: CommentView) {
  const liked = !comment.liked_by_me;
  comment.liked_by_me = liked;
  comment.like_count += liked ? 1 : -1;
  try {
    await (liked
      ? api.post(`/comments/${comment.id}/like`)
      : api.del(`/comments/${comment.id}/like`));
  } catch (err) {
    comment.liked_by_me = !liked;
    comment.like_count += liked ? -1 : 1;
    throw err;
  }
}

export type Draft = { body: string; post_date: string; is_private: boolean };

type UploadTarget = { id: number; uploadUrl: string; thumbUploadUrl: string | null };

/**
 * Uploads picked files as photos on a post that already exists, appended after any it
 * already has. Returns how many were lost: a photo whose direct PUT fails deletes its
 * own row, so the post is still consistent and the caller can say so.
 */
async function uploadPhotos(postId: number, files: File[]) {
  if (files.length === 0) return 0;

  // Decode, measure and thumbnail before asking for URLs: a file this browser cannot
  // read is counted as failed here rather than uploaded and shown broken to everyone.
  const prepared = (await Promise.all(files.map((f) => prepare(f).catch(() => null)))).filter(
    (p) => p !== null,
  );
  let failed = files.length - prepared.length;
  if (prepared.length === 0) return failed;

  const { photos } = await api.post<{ photos: UploadTarget[] }>(
    `/posts/${postId}/photos`,
    prepared.map((p) => ({
      contentType: p.file.type,
      height: p.height,
      thumb: p.thumb !== null,
      width: p.width,
    })),
  );
  await Promise.all(
    photos.map(async (photo, i) => {
      const item = prepared[i];
      try {
        await uploadToBucket(photo.uploadUrl, item.file);
      } catch {
        failed += 1;
        await api.del(`/posts/${postId}/photos/${photo.id}`).catch(() => {});
        return;
      }
      // The thumbnail is only the placeholder — losing it costs a blurry first
      // paint, not the photo, so it never fails the upload.
      if (photo.thumbUploadUrl && item.thumb) {
        await uploadToBucket(photo.thumbUploadUrl, item.thumb).catch(() => {});
      }
    }),
  );
  return failed;
}

/** Create → upload photos → publish, the flow the API is built around. */
export async function createPost(draft: Draft, files: File[]) {
  const post = await api.post<Post>("/posts", draft);
  const failed = await uploadPhotos(post.id, files);
  await api.post<Post>(`/posts/${post.id}/publish`);
  invalidateFeed();
  return { failed, id: post.id };
}

/** Edit: patch the fields, drop the photos the editor removed, upload the new ones. */
export async function savePost(
  post: CachedPost,
  draft: Draft,
  files: File[],
  removedPhotoIds: number[],
) {
  await api.patch<Post>(`/posts/${post.id}`, draft);
  await Promise.all(removedPhotoIds.map((id) => api.del(`/posts/${post.id}/photos/${id}`)));
  const failed = await uploadPhotos(post.id, files);
  // Feed and calendar are ordered and keyed by post_date; everything else is the same
  // reactive object they already render, so only a moved post needs them refetched.
  const moved = post.post_date !== draft.post_date;
  await fetchPost(post.id);
  if (moved) invalidateFeed();
  return { failed, id: post.id };
}
