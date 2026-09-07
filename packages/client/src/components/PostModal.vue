<script setup lang="ts">
import type { CommentView } from "@openbean/shared";
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useScrollLock } from "../composables/scroll-lock.ts";
import { ago } from "../format.ts";
import {
  addComment,
  deleteComment,
  deletePost,
  fetchPost,
  getPost,
  toggleCommentLike,
} from "../stores/posts.ts";
import { currentUser, isAdmin } from "../stores/session.ts";
import AppIcon from "./AppIcon.vue";
import PostCard from "./PostCard.vue";
import PostEditor from "./PostEditor.vue";

const props = defineProps<{ postId: number }>();
const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const dialog = ref<HTMLDialogElement | null>(null);
const error = ref("");
const loading = ref(false);
const draft = ref("");
const sending = ref(false);
const editing = ref(false);

const post = computed(() => getPost(props.postId));
/** The feed already has the post body/photos; only the comments need fetching. */
const commentsLoaded = computed(() => post.value?.comments !== undefined);
/** Same rule as the server's canEdit: author or admin. */
const editable = computed(() => isAdmin.value || post.value?.author_id === currentUser.value?.id);

watch(
  () => props.postId,
  async (id) => {
    editing.value = false;
    loading.value = true;
    error.value = "";
    try {
      await fetchPost(id);
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

/** The feed and the calendar both carry :id on their own route, so swapping the param
 *  keeps whichever list is underneath and just re-keys this modal. */
const go = (id: number | null | undefined) => id && router.push({ params: { id } });

async function send() {
  const body = draft.value.trim();
  if (!body || !post.value || sending.value) return;
  sending.value = true;
  error.value = "";
  try {
    await addComment(post.value, body);
    draft.value = "";
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    sending.value = false;
  }
}

async function remove() {
  if (!post.value || !window.confirm("Delete this post? This can't be undone.")) return;
  try {
    await deletePost(post.value.id);
    dialog.value?.close();
  } catch (err) {
    error.value = (err as Error).message;
  }
}

/** Same rule as the server's canEdit: author or admin. */
const commentEditable = (comment: { author_id: number }) =>
  isAdmin.value || comment.author_id === currentUser.value?.id;

async function removeComment(comment: CommentView) {
  if (!post.value || !window.confirm("Delete this comment?")) return;
  try {
    await deleteComment(post.value, comment);
  } catch (err) {
    error.value = (err as Error).message;
  }
}

// <dialog> traps focus and handles Esc for us, but the page behind still scrolls.
useScrollLock();

onMounted(() => dialog.value?.showModal());
</script>

<template>
  <dialog
    ref="dialog"
    class="modal"
    aria-label="Post"
    @close="emit('close')"
    @click.self="dialog?.close()"
  >
    <!-- showModal() focuses the first control it finds, which lights the close button's
         focus ring up every time a post is opened. Taking the initial focus onto the panel
         keeps the ring for people who actually tab to the button. -->
    <div class="modal__panel" tabindex="-1" autofocus>
      <header class="modal__bar">
        <button
          class="button-bare modal__close"
          type="button"
          aria-label="Close"
          @click="dialog?.close()"
        >
          <AppIcon name="close" :size="32" />
        </button>

        <div class="modal__steps">
          <button
            class="button-bare"
            type="button"
            aria-label="Previous post"
            :disabled="!post?.prev_id"
            @click="go(post?.prev_id)"
          >
            <AppIcon name="chevronLeft" :size="32" />
            Previous
          </button>
          <button
            class="button-bare"
            type="button"
            aria-label="Next post"
            :disabled="!post?.next_id"
            @click="go(post?.next_id)"
          >
            Next
            <AppIcon name="chevronRight" :size="32" />
          </button>
        </div>
      </header>

      <p v-if="loading && !post" class="status">Loading…</p>
      <p v-else-if="error && !post" class="status error">{{ error }}</p>

      <PostEditor
        v-if="post && editing"
        :post="post"
        @saved="editing = false"
        @cancel="editing = false"
      />

      <template v-else-if="post">
        <PostCard
          :post="post"
          detail
          :show-edit="post && editable && !editing"
          @edit="editing = true"
          @delete="remove"
        />

        <section class="modal__comments">
          <p v-if="!commentsLoaded" class="status">Loading comments…</p>
          <p v-else-if="post.comments?.length === 0" class="status">
            No comments yet.
          </p>
          <article
            v-for="comment in post.comments"
            :key="comment.id"
            class="comment"
          >
            <p class="comment__meta">
              <img
                v-if="comment.author.avatar_url"
                class="avatar comment__avatar"
                :src="comment.author.avatar_url"
                alt=""
                width="24"
                height="24"
              />
              <span v-else class="avatar avatar--blank comment__avatar" aria-hidden="true">
                {{ comment.author.name.slice(0, 1) }}
              </span>
              <strong>{{ comment.author.name }}</strong>
              <time :datetime="comment.created_at" class="muted">{{
                ago(comment.created_at)
              }}</time>
            </p>
            <p class="comment__body selectable">{{ comment.body }}</p>
            <p class="comment__actions">
              <button
                class="button-bare action"
                type="button"
                :class="{ 'action--liked': comment.liked_by_me }"
                :aria-pressed="comment.liked_by_me"
                :aria-label="comment.liked_by_me ? 'Unlike this comment' : 'Like this comment'"
                @click="toggleCommentLike(comment).catch(() => {})"
              >
                <AppIcon name="heart" :filled="comment.liked_by_me" :size="18" />
                <span v-if="comment.like_count">{{ comment.like_count }}</span>
              </button>
              <button
                v-if="commentEditable(comment)"
                class="button-bare action"
                type="button"
                aria-label="Delete comment"
                @click="removeComment(comment)"
              >
                <AppIcon name="trash" :size="18" />
              </button>
            </p>
          </article>
        </section>

        <form class="modal__composer" @submit.prevent="send">
          <textarea
            v-model="draft"
            rows="3"
            placeholder="Add a comment…"
            aria-label="Comment"
            autocapitalize="sentences"
            enterkeyhint="enter"
          />
          <button
            class="button"
            type="submit"
            :disabled="!draft.trim() || sending"
          >
            {{ sending ? "Posting…" : "Post" }}
          </button>
        </form>
        <p v-if="error" class="error modal__error">{{ error }}</p>
      </template>
    </div>
  </dialog>
</template>

<style scoped>
.modal {
  width: min(100%, var(--content-width));
  max-width: none;
  height: 100dvh;
  max-height: none;
  margin: 0 auto;
  padding: 0;
  border: 0;
  background: var(--color-bg);
  color: inherit;
  /* The dialog is in the top layer, so it clears the notch itself rather than inheriting
     the shell's insets. */
  padding-left: var(--safe-left);
  padding-right: var(--safe-right);
}

.modal::backdrop {
  background: rgb(0 0 0 / 0.45);
}

/* Only ever focused as the dialog's landing spot, never by tabbing — a ring on a scroll
   container says nothing. */
.modal__panel:focus-visible {
  outline: none;
}

.modal__panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  /* Reaching the end of the comments shouldn't hand the gesture to the feed behind. */
  overscroll-behavior: contain;
}

.modal__bar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  /* In the installed app the status bar overlaps the top of the sheet. */
  padding-top: calc(var(--space-3) + var(--safe-top));
  border-bottom: var(--border);
  background: var(--color-bg);
}

/* Icon-only, so it ends up under the minimum touch target without help. */
.modal__close {
  min-width: var(--tap-target);
  justify-content: center;
}

.modal__steps {
  display: flex;
  gap: var(--space-4);
  margin-left: auto;
}

.modal__steps button:disabled {
  opacity: 0.3;
  cursor: default;
}

.modal__comments {
  padding: var(--space-2) var(--space-4);
  border-top: var(--border);
}

.comment {
  padding: var(--space-2) 0;
}

.comment__meta {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin: 0;
}

.comment__avatar {
  width: 24px;
  height: 24px;
  font-size: var(--font-size-sm);
}

.comment__body {
  margin: var(--space-1) 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.comment__actions {
  display: flex;
  gap: var(--space-4);
  margin: var(--space-1) 0 0;
}

.modal__composer {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4) var(--space-5);
  /* Clears the home indicator, which sits over the last few points of the sheet. */
  padding-bottom: calc(var(--space-5) + var(--safe-bottom));
}

.modal__composer textarea {
  width: 100%;
}

.modal__error {
  padding: 0 var(--space-4) var(--space-3);
}
</style>
