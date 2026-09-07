<script setup lang="ts">
import { computed, ref } from "vue";
import { ago, day } from "../format.ts";
import type { CachedPost } from "../stores/posts.ts";
import { toggleLike } from "../stores/posts.ts";
import AppIcon from "./AppIcon.vue";
import PhotoCarousel from "./PhotoCarousel.vue";

/** `detail` is the modal's copy: it carries the like/comment row and isn't itself a
 *  click target, since there is nowhere left to open. */
const props = defineProps<{
  post: CachedPost;
  detail?: boolean;
  showEdit?: boolean;
}>();
const emit = defineEmits<{ open: []; edit: [] }>();

/** In the feed the whole card opens the post. Bound as a group so the modal's copy
 *  gets none of it — no role, no tab stop, no handlers. */
const cardAttrs = computed(() =>
  props.detail
    ? {}
    : {
        onClick: () => emit("open"),
        onKeydown: (event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            emit("open");
          }
        },
        role: "button",
        tabindex: 0,
      },
);

const images = computed(() =>
  props.post.photos.map((photo) => ({
    alt: `Photo from ${props.post.author.name}`,
    height: photo.height,
    id: photo.id,
    thumbUrl: photo.thumb_url,
    url: photo.url,
    width: photo.width,
  })),
);

/** post_date is the day the photo is *about*; show it only when it isn't the day it went up. */
const postedOn = computed(() => props.post.published_at?.slice(0, 10));
const showDate = computed(() => props.post.post_date !== postedOn.value);
</script>

<template>
  <article
    class="post"
    :class="{ 'post--clickable': !detail }"
    v-bind="cardAttrs"
  >
    <header class="post__header">
      <img
        v-if="post.author.avatar_url"
        class="post__avatar"
        :src="post.author.avatar_url"
        alt=""
        width="36"
        height="36"
      />
      <span v-else class="post__avatar post__avatar--blank" aria-hidden="true">
        {{ post.author.name.slice(0, 1) }}
      </span>
      <div>
        <p class="post__author">{{ post.author.name }}</p>
        <p class="muted">
          <time v-if="post.published_at" :datetime="post.published_at">
            {{ ago(post.published_at) }}
          </time>
          <template v-if="showDate"> · {{ day(post.post_date) }}</template>
          <template v-if="post.is_private"> · private</template>
        </p>
      </div>
    </header>

    <p v-if="post.body" class="post__body">{{ post.body }}</p>

    <PhotoCarousel v-if="images.length" :images="images" />

    <footer v-if="detail" class="post__actions">
      <button
        class="button-bare post__action"
        type="button"
        :class="{ 'post__action--liked': post.liked_by_me }"
        :aria-pressed="post.liked_by_me"
        :aria-label="post.liked_by_me ? 'Unlike this post' : 'Like this post'"
        @click="toggleLike(post).catch(() => {})"
      >
        <AppIcon name="heart" :filled="post.liked_by_me" :size="26" />
        <span v-if="post.like_count">{{ post.like_count }}</span>
      </button>

      <span class="post__action">
        <AppIcon name="comment" :size="26" />
        <span v-if="post.comment_count">{{ post.comment_count }}</span>
      </span>

      <button
        v-if="showEdit"
        class="button-bare modal__edit"
        type="button"
        @click="emit('edit')"
      >
        <AppIcon name="pencil" :size="20" />
        Edit
      </button>
    </footer>
  </article>
</template>

<style scoped>
.post {
  /* Skip style/layout/paint for cards that are offscreen. `auto` in the intrinsic size
     means "reuse the height you last measured", so the scrollbar stays honest. */
  content-visibility: auto;
  contain-intrinsic-size: auto 400px;
  border-radius: var(--radius);
}

.post__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-4);
}

.post__header p {
  margin: 0;
}

.post__avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}

.post__avatar--blank {
  display: grid;
  place-items: center;
  background: var(--color-surface);
  border: var(--border);
  text-transform: uppercase;
}

.post__author {
  font-weight: 600;
}

.post--clickable {
  cursor: pointer;
}

.post__body {
  margin: 0;
  margin: var(--space-4);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 1.25rem;
}

.post__actions {
  display: flex;
  gap: var(--space-5);
  padding: var(--space-3) var(--space-4);
}

.post__action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.post__action--liked {
  color: var(--color-like);
}
</style>
