<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
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
const go = (id: number | null | undefined) =>
  id && router.push({ params: { id } });

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

onMounted(() => {
  dialog.value?.showModal();
  // <dialog> traps focus and handles Esc for us, but the page behind still scrolls.
  document.body.style.overflow = "hidden";
});

onBeforeUnmount(() => {
  document.body.style.overflow = "";
});
</script>

<template>
  <dialog
    ref="dialog"
    class="modal"
    aria-label="Post"
    @close="emit('close')"
    @click.self="dialog?.close()"
  >
    <div class="modal__panel">
      <header class="modal__bar">
        <button
          class="button-bare"
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
            <p class="comment__body">{{ comment.body }}</p>
          </article>
        </section>

        <form class="modal__composer" @submit.prevent="send">
          <textarea
            v-model="draft"
            rows="3"
            placeholder="Add a comment…"
            aria-label="Comment"
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
}

.modal::backdrop {
  background: rgb(0 0 0 / 0.45);
}

.modal__panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
}

.modal__bar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  padding: var(--space-3) var(--space-4);
  border-bottom: var(--border);
  background: var(--color-bg);
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
