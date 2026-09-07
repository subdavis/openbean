<script setup lang="ts">
import { useRoute } from "vue-router";
import type { IconName } from "../icons.ts";
import AppIcon from "./AppIcon.vue";

const route = useRoute();

// Matched by route name, so /posts/:id (the detail modal) still lights up Home
// and /posts/new lights up Create instead.
const items: { icon: IconName; label: string; name: string; to: string }[] = [
  { icon: "home", label: "Home", name: "feed", to: "/posts" },
  { icon: "calendar", label: "Calendar", name: "calendar", to: "/calendar" },
  { icon: "plus", label: "Create", name: "new-post", to: "/posts/new" },
  { icon: "settings", label: "Settings", name: "settings", to: "/settings" },
];
</script>

<template>
  <nav class="nav" aria-label="Main">
    <RouterLink
      v-for="item in items"
      :key="item.name"
      class="nav__item"
      :class="{ 'nav__item--active': route.name === item.name }"
      :to="item.to"
      :aria-current="route.name === item.name ? 'page' : undefined"
    >
      <AppIcon :name="item.icon" :size="26" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.nav {
  position: fixed;
  inset: auto 0 0;
  z-index: 2;
  display: flex;
  max-width: var(--content-width);
  margin: 0 auto;
  border-top: var(--border);
  background: var(--color-bg);
  padding-bottom: env(safe-area-inset-bottom);
}

.nav__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  height: var(--nav-height);
  justify-content: center;
  color: var(--color-muted);
  font-size: var(--font-size-sm);
  text-decoration: none;
}

.nav__item--active {
  color: var(--color-accent);
}

/* Desktop: a plain stack of links in the left margin. No bar, no background — it
   scrolls with the page until it reaches the top, then stays put. `justify-self: end`
   keeps it against the feed rather than stranded at the far edge of a wide margin.
   Keep this breakpoint in step with the grid in style.css. */
@media (min-width: 960px) {
  .nav {
    position: sticky;
    inset: auto;
    top: var(--space-6);
    align-self: start;
    justify-self: end;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-1);
    max-width: none;
    margin: 0;
    border-top: 0;
    background: none;
    padding-bottom: 0;
  }

  .nav__item {
    flex: none;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-3);
    height: auto;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius);
    font-size: var(--font-size);
    white-space: nowrap;
  }

  .nav__item:hover {
    color: var(--color-text);
  }
}
</style>
