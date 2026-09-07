<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { exifDate } from "../exif.ts";
import { today } from "../format.ts";
import type { CachedPost } from "../stores/posts.ts";
import { createPost, savePost } from "../stores/posts.ts";
import AppIcon from "./AppIcon.vue";
import PhotoCarousel from "./PhotoCarousel.vue";

/** With a post it edits in place; without one it composes a new one. */
const props = defineProps<{ post?: CachedPost }>();
const emit = defineEmits<{ saved: [id: number]; cancel: [] }>();

/** One list for both kinds of photo: already uploaded (`photoId`) or just picked (`file`). */
type Item = {
  id: string;
  url: string;
  file?: File;
  photoId?: number;
  thumbUrl?: string | null;
  width?: number | null;
  height?: number | null;
};

const picker = ref<HTMLInputElement | null>(null);
const camera = ref<HTMLInputElement | null>(null);
const items = ref<Item[]>([]);
/** Photos dropped from an existing post — deleted server-side on save, not before. */
const removed = ref<number[]>([]);
const index = ref(0);

const body = ref("");
const postDate = ref(today());
const isPrivate = ref(false);

const submitting = ref(false);
const error = ref("");
const notice = ref("");

const current = computed(() => items.value[index.value]);

function revokePicked() {
  for (const item of items.value) if (item.file) URL.revokeObjectURL(item.url);
}

/** (Re)fills the form from the post being edited, or empties it for a new one. */
function reset() {
  revokePicked();
  items.value =
    props.post?.photos.map((photo) => ({
      height: photo.height,
      id: `photo-${photo.id}`,
      photoId: photo.id,
      thumbUrl: photo.thumb_url,
      url: photo.url,
      width: photo.width,
    })) ?? [];
  removed.value = [];
  index.value = 0;
  body.value = props.post?.body ?? "";
  postDate.value = props.post?.post_date ?? today();
  isPrivate.value = !!props.post?.is_private;
}

watch(() => props.post?.id, reset, { immediate: true });

function add(event: Event) {
  const input = event.target as HTMLInputElement;
  for (const file of input.files ?? []) {
    items.value.push({
      file,
      id: crypto.randomUUID(),
      url: URL.createObjectURL(file),
    });
  }
  // Reset so picking the same file twice in a row still fires a change event.
  input.value = "";
}

function remove(at: number) {
  const [gone] = items.value.splice(at, 1);
  if (!gone) return;
  if (gone.file) URL.revokeObjectURL(gone.url);
  if (gone.photoId) removed.value.push(gone.photoId);
}

async function useMetadataDate() {
  const file = current.value?.file;
  if (!file) return;
  const date = await exifDate(file);
  if (date) {
    postDate.value = date;
    error.value = "";
  } else {
    error.value = "That photo has no date in its metadata.";
  }
}

async function submit() {
  if (submitting.value) return;
  submitting.value = true;
  error.value = "";
  notice.value = "";
  try {
    const draft = {
      body: body.value.trim(),
      is_private: isPrivate.value,
      post_date: postDate.value,
    };
    const files = items.value
      .map((item) => item.file)
      .filter((file) => file !== undefined);
    const { failed, id } = props.post
      ? await savePost(props.post, draft, files, removed.value)
      : await createPost(draft, files);
    // Either way the form no longer matches the server: an edit is now the fetched
    // post, a new post is a blank slate.
    reset();
    if (failed > 0) {
      notice.value = `Saved, but ${failed} photo${failed > 1 ? "s" : ""} failed to upload.`;
    } else {
      emit("saved", id);
    }
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    submitting.value = false;
  }
}

onBeforeUnmount(revokePicked);
</script>

<template>
  <div class="compose container">
    <h1 class="compose__title">{{ post ? "Edit post" : "New post" }}</h1>

    <input
      ref="picker"
      class="compose__picker"
      type="file"
      accept="image/*"
      multiple
      @change="add"
    />
    <input
      ref="camera"
      class="compose__picker"
      type="file"
      accept="image/*"
      capture="environment"
      @change="add"
    />

    <div v-if="items.length === 0" class="compose__empty-choices">
      <button
        class="button compose__empty"
        type="button"
        @click="camera?.click()"
      >
        <AppIcon name="camera" :size="28" />
        Take photo
      </button>
      <button
        class="button compose__empty"
        type="button"
        @click="picker?.click()"
      >
        <AppIcon name="image" :size="28" />
        Choose from library
      </button>
    </div>

    <template v-else>
      <PhotoCarousel v-model:index="index" :images="items">
        <template #overlay="{ index: slide }">
          <button
            class="compose__remove button"
            type="button"
            @click="remove(slide)"
          >
            Remove
          </button>
        </template>
      </PhotoCarousel>

      <ul class="thumbs">
        <li v-for="(item, i) in items" :key="item.id">
          <button
            class="thumbs__item"
            type="button"
            :class="{ 'thumbs__item--active': i === index }"
            :aria-label="`Show photo ${i + 1}`"
            @click="index = i"
          >
            <img :src="item.thumbUrl ?? item.url" alt="" />
          </button>
        </li>
        <li>
          <button
            class="thumbs__item thumbs__add"
            type="button"
            aria-label="Add more photos"
            @click="picker?.click()"
          >
            <AppIcon name="plus" :size="22" />
          </button>
        </li>
      </ul>
    </template>

    <form class="compose__form" @submit.prevent="submit">
      <label class="field">
        <span class="muted">Description</span>
        <textarea
          v-model="body"
          rows="3"
          placeholder="Say something (optional)"
          autocapitalize="sentences"
          enterkeyhint="enter"
        />
      </label>

      <div class="field field--row">
        <label class="compose__date">
          <span class="muted">Date</span>
          <div  class="compose__date--row">
            <input v-model="postDate" type="date" required />
            <button
              class="button"
              type="button"
              :disabled="!current?.file"
              @click="useMetadataDate"
            >
              Use photo date
            </button>
          </div>
        </label>
      </div>

      <label class="switch">
        <input v-model="isPrivate" type="checkbox" />
        <span class="switch__track" aria-hidden="true"></span>
        <span>Private post</span>
      </label>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="notice" class="muted">{{ notice }}</p>

      <div class="compose__buttons">
        <button
          v-if="post"
          class="button"
          type="button"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          class="button button-primary compose__submit"
          type="submit"
          :disabled="submitting || (items.length === 0 && !body.trim())"
        >
          {{ submitting ? "Saving…" : post ? "Save" : "Post" }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.compose__picker {
  display: none;
}

.compose__empty-choices {
  display: flex;
  gap: var(--space-3);
  margin: var(--space-5) 0;
}

.compose__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  padding: var(--space-5) var(--space-2);
  text-align: center;
}

.compose__remove {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  background: rgb(255 255 255 / 0.85);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
}

.thumbs {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  margin: 0;
  padding: var(--space-5) 0;
  list-style: none;
  /* Running out of thumbnails shouldn't hand the flick to Safari's back gesture. */
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.thumbs::-webkit-scrollbar {
  display: none;
}

.thumbs__item {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  padding: 0;
  border: var(--border);
  border-radius: var(--radius);
  background: var(--color-surface);
  overflow: hidden;
}

.thumbs__item--active {
  border-color: var(--color-accent);
}

.thumbs__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.compose__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.field textarea,
.compose__date input {
  width: 100%;
  padding: var(--space-2);
  border: var(--border);
  border-radius: var(--radius);
  background: var(--color-bg);
}

.compose__date {
  width: 100%;
}

.compose__date--row {
  width: 100%;
  display: flex;
  gap: var(--space-3);
}

.field--row {
  display: flex;
  gap: var(--space-3);
  align-items: end;
}

.switch {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  /* The form is a column flex container, so a label stretches to the full row and makes
     the whole width a click target. Shrink it back to its content. */
  align-self: start;
}

.switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.switch__track {
  position: relative;
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: var(--color-border);
  transition: background 0.15s;
}

.switch__track::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-bg);
  transition: transform 0.15s;
}

.switch input:checked + .switch__track {
  background: var(--color-accent);
}

.switch input:checked + .switch__track::after {
  transform: translateX(18px);
}

/* The checkbox is visually hidden, so the ring has to go on the track it drives.
   Pointer-and-keyboard only, matching the global rule in style.css. */
@media (hover: hover) and (pointer: fine) {
  .switch input:focus-visible + .switch__track {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

.compose__buttons {
  display: flex;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}

.compose__submit {
  flex: 1;
  padding: var(--space-3);
}
</style>
