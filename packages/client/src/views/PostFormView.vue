<script setup lang="ts">
import { useRouter } from "vue-router";
import PostEditor from "../components/PostEditor.vue";

const router = useRouter();
</script>

<template>
  <main>
    <PostEditor @saved="router.push('/posts')" />
  </main>
</template>
