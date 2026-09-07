<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import PostModal from "../components/PostModal.vue";
import { useInfiniteScroll } from "../composables/viewport.ts";
import { monthLabel } from "../format.ts";
import { calendar, getPost, loadMonth } from "../stores/posts.ts";

const route = useRoute();
const router = useRouter();
const sentinel = ref<HTMLElement | null>(null);

/** /calendar/:id resolves to this same route, so opening a post never unmounts the grid. */
const openId = computed(() => (route.params.id ? Number(route.params.id) : null));

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** The squares of one "YYYY-MM". */
function cells(month: string) {
  const first = new Date(`${month}-01T00:00:00`);
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    const id = calendar.byDate.get(date);
    const photo = id === undefined ? undefined : getPost(id)?.photos[0];
    return {
      date,
      id,
      n: i + 1,
      // Only the 1st is placed; it carries the month's weekday offset and the rest flow after.
      start: i === 0 ? first.getDay() + 1 : undefined,
      url: photo ? (photo.thumb_url ?? photo.url) : null,
    };
  });
}

/** Keep loading until a full screen of months sits below the view. The observer only
 *  fires when the sentinel *changes* state, so one wake-up has to cover the whole gap. */
async function fill() {
  const before = calendar.months.length;
  await loadMonth();
  if (calendar.months.length === before) return;
  await nextTick();
  const mark = sentinel.value;
  if (!mark) return;
  // How much loaded content sits below the fold; stop once that's a screenful.
  const below = mark.getBoundingClientRect().top - window.innerHeight;
  if (below < window.innerHeight) fill();
}

useInfiniteScroll(sentinel, fill);
onMounted(() => {
  if (calendar.months.length === 0) fill();
});
</script>

<template>
  <main>
    <section v-for="month in calendar.months" :key="month" class="month">
      <header class="month__head">
        <h2 class="month__name">{{ monthLabel(month) }}</h2>
        <div class="month__weekdays" aria-hidden="true">
          <span v-for="(w, i) in WEEKDAYS" :key="i">{{ w }}</span>
        </div>
      </header>
      <div class="month__grid">
        <button
          v-for="cell in cells(month)"
          :key="cell.date"
          type="button"
          class="day"
          :class="{ 'day--post': cell.id !== undefined }"
          :style="{
            backgroundImage: cell.url ? `url(${cell.url})` : undefined,
            gridColumnStart: cell.start,
          }"
          :disabled="cell.id === undefined"
          @click="router.push(`/calendar/${cell.id}`)"
        >
          <span class="day__n">{{ cell.n }}</span>
          <!-- Nothing to cover the square with, so say why it's filled in. -->
          <AppIcon
            v-if="cell.id !== undefined && !cell.url"
            name="quote"
            filled
            :size="20"
            class="day__quote"
          />
        </button>
      </div>
    </section>

    <p v-if="calendar.error" class="status error">
      {{ calendar.error }}
      <button class="button" type="button" @click="fill">Retry</button>
    </p>
    <!-- Scrolling down past this loads the next month back. -->
    <div v-else-if="!calendar.done" ref="sentinel" class="status">
      {{ calendar.loading ? "Loading…" : "" }}
    </div>
    <p v-else class="status">That's everything.</p>

    <PostModal v-if="openId" :key="openId" :post-id="openId" @close="router.push('/calendar')" />
  </main>
</template>

<style scoped>
.month {
  padding-bottom: var(--space-5);
}

/* Sticky rather than fixed: same pinned label, but each month hands off to the next
   on its own as it scrolls past, with no scroll listener to track which is in view. */
.month__head {
  position: sticky;
  /* Zero in a tab; in the installed app the status bar is over the page, and a header
     pinned to 0 would slide underneath it. */
  top: var(--safe-top);
  z-index: 1;
  background: var(--color-bg);
  padding: var(--space-3) var(--space-2) var(--space-2);
}

.month__name {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-lg);
}

.month__weekdays,
.month__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.month__weekdays {
  color: var(--color-muted);
  font-size: var(--font-size-sm);
  text-align: center;
}

.month__grid {
  padding: 0 var(--space-2);
}

.day {
  position: relative;
  aspect-ratio: 1;
  display: flex;
  border: 0;
  border-radius: var(--radius);
  background: var(--color-surface) center / cover no-repeat;
  padding: var(--space-1);
  color: var(--color-muted);
  font-size: var(--font-size-sm);
}

.day:disabled {
  cursor: default;
}

/* The grid gap is thinner than the focus ring, so lift the ring over its neighbours. */
.day:focus-visible {
  z-index: 1;
}

/* A post with no photo still covers its square. */
.day--post {
  background-color: var(--color-accent);
  color: var(--color-bg);
}

.day--post .day__n {
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.6);
}

.day__quote {
  position: absolute;
  inset: 0;
  margin: auto;
  opacity: 0.65;
}
</style>
