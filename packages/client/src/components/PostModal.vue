<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useScrollLock } from "../composables/scroll-lock.ts";
import { ago } from "../format.ts";
import { addComment, fetchPost, getPost } from "../stores/posts.ts";
import { currentUser, isAdmin as viewerIsAdmin } from "../stores/session.ts";
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
const editable = computed(
  () => viewerIsAdmin.value || post.value?.author_id === currentUser.value?.id,
);

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
          <AppIcon name="close" :size="22" />
        </button>

        <div class="modal__steps">
          <button
            class="button-bare"
            type="button"
            aria-label="Previous post"
            :disabled="!post?.prev_id"
            @click="go(post?.prev_id)"
          >
            <AppIcon name="chevronLeft" :size="22" />
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
            <AppIcon name="chevronRight" :size="22" />
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
              <strong>{{ comment.author.name }}</strong>
              <time :datetime="comment.created_at" class="muted">{{
                ago(comment.created_at)
              }}</time>
            </p>
            <p class="comment__body selectable">{{ comment.body }}</p>
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
  /* The keyboard doesn't shrink the layout viewport on iOS, so a 100dvh panel keeps its
     bottom half — the comment box included — underneath it. keyboard.ts measures the
     covered strip; taking it off the height is what lifts the composer back into view. */
  height: calc(100dvh - var(--keyboard-inset));
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

/* A sheet that comes up from the bottom edge, the way a detail view does on iOS. The
   easing is Apple's sheet curve: quick to start, long settle, no bounce.
   Entry only — a <dialog> is display:none the moment it closes, and buying an exit
   animation costs a transition on `overlay`/`display` for every browser that has one. */
.modal[open] {
  animation: modal-in 280ms cubic-bezier(0.32, 0.72, 0, 1);
}

.modal[open]::backdrop {
  animation: backdrop-in 280ms ease-out;
}

@keyframes modal-in {
  from {
    transform: translateY(100%);
  }
}

@keyframes backdrop-in {
  from {
    opacity: 0;
  }
}

.modal::backdrop {
  background: rgb(0 0 0 / 0.45);
}

/* Only ever focused as the dialog's landing spot, never by tabbing — a ring on a scroll
   container says nothing. */
.modal__panel:focus,
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

/* Icon-only controls are the ones that end up under the minimum without help. */
.modal__bar .button-bare {
  min-height: var(--tap-target);
  justify-content: center;
}

.modal__close {
  min-width: var(--tap-target);
}

.modal__edit {
  margin-left: var(--space-4);
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
}

.comment {
  padding: var(--space-2) 0;
}

.comment__meta {
  display: flex;
  gap: var(--space-2);
  align-items: baseline;
  margin: 0;
}

.comment__body {
  margin: var(--space-1) 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
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
  padding: var(--space-2);
  border: var(--border);
  border-radius: var(--radius);
  background: var(--color-bg);
  resize: vertical;
}

.modal__error {
  padding: 0 var(--space-4) var(--space-3);
}
</style>
