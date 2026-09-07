<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import PostCard from "../components/PostCard.vue";
import PostModal from "../components/PostModal.vue";
import { useInfiniteScroll } from "../composables/viewport.ts";
import { type CachedPost, feed, getPost, loadMore } from "../stores/posts.ts";

const route = useRoute();
const router = useRouter();
const sentinel = ref<HTMLElement | null>(null);

const posts = computed(() =>
  feed.ids.map((id) => getPost(id)).filter((post): post is CachedPost => post !== undefined),
);

/** /posts/:id resolves to this same route, so opening a post never unmounts the feed. */
const openId = computed(() => (route.params.id ? Number(route.params.id) : null));

useInfiniteScroll(sentinel, loadMore);
onMounted(() => {
  if (feed.ids.length === 0) loadMore();
});
</script>

<template>
  <main>
    <h1 class="visually-hidden">Feed</h1>

    <PostCard
      v-for="post in posts"
      :key="post.id"
      :post="post"
      @open="router.push(`/posts/${post.id}`)"
      :style="{ paddingBottom: 'var(--space-6)' }"
    />

    <div v-if="!feed.done" ref="sentinel" class="status">
      {{ feed.loading ? "Loading…" : "" }}
    </div>
    <p v-else-if="posts.length === 0" class="status">Nothing here yet — add the first post.</p>
    <p v-else class="status">That's everything.</p>

    <p v-if="feed.error" class="status error">
      {{ feed.error }}
      <button class="button" type="button" @click="loadMore">Retry</button>
    </p>

    <PostModal v-if="openId" :key="openId" :post-id="openId" @close="router.push('/posts')" />
  </main>
</template>

