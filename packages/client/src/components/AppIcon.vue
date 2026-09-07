<script setup lang="ts">
import { ICONS, type IconName } from "../icons.ts";

withDefaults(defineProps<{ name: IconName; filled?: boolean; size?: number }>(), {
  filled: false,
  size: 24,
});
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="filled ? 'currentColor' : 'none'"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="d in ICONS[name]" :key="d" :d="d" />
  </svg>
</template>
