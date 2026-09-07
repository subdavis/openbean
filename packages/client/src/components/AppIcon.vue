<script setup lang="ts">
import { computed } from "vue";
import { ICONS, type IconName } from "../icons.ts";

const props = withDefaults(defineProps<{ name: IconName; filled?: boolean; size?: number }>(), {
  filled: false,
  size: 24,
});

const paths = computed(() => ICONS[props.name]);
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
    <path v-for="d in paths" :key="d" :d="d" />
  </svg>
</template>
