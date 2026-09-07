<script setup lang="ts">
import { RouterView } from "vue-router";
import AppNav from "./components/AppNav.vue";
import { currentUser } from "./stores/session.ts";
</script>

<template>
  <!-- Nav first so the desktop grid puts it in the left column without explicit
       placement. On mobile it is fixed, so source order costs nothing there. -->
  <div class="app" :class="{ 'app--with-nav': currentUser }">
    <AppNav v-if="currentUser" />
    <RouterView />
  </div>
</template>
