<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useLoadNear } from "../composables/viewport.ts";
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
const emit = defineEmits<{ open: []; edit: []; delete: [] }>();

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

/** The modal is the only thing on screen — no viewport to be far from. */
const card = ref<HTMLElement | null>(null);
const nearViewport = useLoadNear(card);
const load = computed(() => props.detail || nearViewport.value);

/** post_date is the day the photo is *about*; show it only when it isn't the day it went up. */
const postedOn = computed(() => props.post.published_at?.slice(0, 10));
const showDate = computed(() => props.post.post_date !== postedOn.value);

const menu = ref<HTMLDetailsElement | null>(null);
function closeMenuOutside(event: MouseEvent) {
  if (menu.value?.open && !menu.value.contains(event.target as Node)) menu.value.open = false;
}
onMounted(() => document.addEventListener("click", closeMenuOutside));
onBeforeUnmount(() => document.removeEventListener("click", closeMenuOutside));
</script>

<template>
  <article
    ref="card"
    class="post"
    :class="{ 'post--clickable': !detail, 'post--detail': detail }"
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

    <p v-if="post.body" class="post__body selectable">{{ post.body }}</p>

    <PhotoCarousel v-if="images.length" :images="images" :load="load" />

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

      <div style="flex: 1" />

      <details v-if="showEdit" ref="menu" class="post__menu">
        <summary class="button-bare post__action clickable" aria-label="Post options">
          More
          <AppIcon name="moreVertical" :size="20" />
        </summary>
        <div class="post__menu-panel">
          <button class="button-bare post__menu-item" type="button" @click="emit('edit')">
            <AppIcon name="pencil" :size="18" />
            Edit
          </button>
          <button class="button-bare post__menu-item" type="button" @click="emit('delete')">
            <AppIcon name="trash" :size="18" />
            Delete
          </button>
        </div>
      </details>
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

/* The modal only ever shows one post, so there's nothing to skip rendering for —
   and the containment that skip needs also traps the post menu's dropdown behind
   whatever comes after it (comments, composer). */
.post--detail {
  content-visibility: visible;
  contain: none;
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
  font-size: var(--font-size-lg);
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
  line-height: 1;
}

.post__action--liked {
  color: var(--color-like);
}

.post__menu {
  position: relative;
}

.post__menu > summary {
  list-style: none;
}

.post__menu > summary::-webkit-details-marker {
  display: none;
}

.post__menu-panel {
  position: absolute;
  right: 0;
  top: calc(100% + var(--space-2));
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-width: 9em;
  padding: var(--space-2);
  border: var(--border);
  border-radius: var(--radius);
  background: var(--color-bg);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.15);
}

.post__menu-item {
  justify-content: flex-start;
  padding: var(--space-2);
}
</style>
