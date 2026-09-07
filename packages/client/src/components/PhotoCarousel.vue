<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppIcon from "./AppIcon.vue";

/** The API's PhotoView shape, loosened so the editor can feed it freshly picked files too. */
export type CarouselImage = {
  id: number | string;
  url: string;
  /** 180px copy, painted under the photo as a placeholder until the full one arrives. */
  thumb_url?: string | null;
  width?: number | null;
  height?: number | null;
};

const props = withDefaults(
  defineProps<{ images: CarouselImage[]; alt?: string; load?: boolean }>(),
  { alt: "", load: true },
);
/** Two-way so a thumbnail strip (or anything else) can drive the carousel. */
const index = defineModel<number>("index", { default: 0 });

const track = ref<HTMLElement | null>(null);
const multiple = computed(() => props.images.length > 1);

const slideAt = (el: HTMLElement) => Math.round(el.scrollLeft / el.clientWidth);

/**
 * One ratio for the whole carousel, taken from the first photo. Slides are flex children
 * and stretch to the tallest of them, so a per-slide ratio only fights its siblings — a
 * landscape photo next to a portrait one ends up in a portrait box. Photos that don't
 * match the first letterbox inside it via object-fit, which is what a carousel wants
 * anyway: a stable frame that doesn't resize as you swipe.
 */
const ratio = computed(() => {
  const first = props.images[0];
  if (!first?.width || !first?.height) return undefined;
  // Clamped so a panorama can't collapse the card to a few pixels tall.
  return String(Math.min(Math.max(first.width / first.height, 0.5), 2.5));
});

/**
 * The thumbnail is the slide's background rather than a second <img>: it needs no load
 * or error handling (a thumb that 404s simply never paints), it survives the src being
 * dropped offscreen, and the photo covers it as soon as it decodes.
 */
const slideStyle = (image: CarouselImage) => ({
  backgroundImage: image.thumb_url ? `url("${image.thumb_url}")` : undefined,
});

function onScroll() {
  if (track.value) index.value = slideAt(track.value);
}

// Scroll only when something other than the scroll handler moved the index,
// otherwise the two fight each other mid-gesture.
watch(index, (to) => {
  const el = track.value;
  if (el && slideAt(el) !== to) el.scrollTo({ behavior: "smooth", left: to * el.clientWidth });
});

watch(
  () => props.images.length,
  (length) => {
    if (index.value > length - 1) index.value = Math.max(length - 1, 0);
  },
);
</script>

<template>
  <div class="carousel">
    <div
      ref="track"
      class="carousel__track"
      :class="{ 'carousel__track--snap': multiple }"
      :style="{ aspectRatio: ratio }"
      @scroll.passive="onScroll"
    >
      <div
        v-for="(image, i) in images"
        :key="image.id"
        class="carousel__slide"
        :style="slideStyle(image)"
      >
        <!-- No src at all (not src="") when far offscreen: an empty src resolves to
             the page URL and refetches the document. The slide keeps its box either way.
             The slide on screen loads eagerly: `load` (three viewports, from the card's
             own observer) already gates whole cards, so leaving the visible photo to
             native lazy loading stacks a second, opaque gate on top of a working one —
             and when it declines, the card sits on its placeholder forever. Offscreen
             slides of a multi-photo post stay lazy, and swiping promotes them. -->
        <img
          :src="load ? image.url : undefined"
          :alt="alt"
          :loading="i === index ? 'eager' : 'lazy'"
          decoding="async"
        />
        <slot name="overlay" :image="image" :index="i" />
      </div>
    </div>

    <template v-if="multiple">
      <button
        class="carousel__arrow carousel__arrow--prev"
        type="button"
        aria-label="Previous photo"
        :disabled="index === 0"
        @click.stop="index -= 1"
      >
        <AppIcon name="chevronLeft" :size="20" />
      </button>
      <button
        class="carousel__arrow carousel__arrow--next"
        type="button"
        aria-label="Next photo"
        :disabled="index >= images.length - 1"
        @click.stop="index += 1"
      >
        <AppIcon name="chevronRight" :size="20" />
      </button>
      <p class="carousel__count">{{ index + 1 }} / {{ images.length }}</p>
    </template>
  </div>
</template>

<style scoped>
.carousel {
  position: relative;
  background: var(--color-surface);
}

.carousel__track {
  display: flex;
  overflow-x: auto;
  /* Reserve the box before the photos arrive. Without it a lazily-loaded image pops the
     card open as it scrolls into view and scroll anchoring lurches to compensate.
     Overridden inline with the first photo's real ratio; this is the fallback for rows
     stored before width/height were captured. */
  aspect-ratio: 1;
  /* Keep a sideways flick off the browser's back gesture. */
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

/* Snap only when there is something to snap between — a single-photo card has no
   business being a snap container competing for the vertical scroll gesture. */
.carousel__track--snap {
  scroll-snap-type: x mandatory;
}

.carousel__track::-webkit-scrollbar {
  display: none;
}

.carousel__slide {
  position: relative;
  /* Height comes from the track's ratio; the slide just fills it. */
  flex: 0 0 100%;
  scroll-snap-align: center;
  /* Matches the photo's object-fit, so the placeholder sits exactly under it. */
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
}

.carousel__slide img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.carousel__arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  padding: var(--space-2);
  border: 0;
  border-radius: 50%;
  background: rgb(255 255 255 / 0.85);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
}

.carousel__arrow:disabled {
  opacity: 0;
  pointer-events: none;
}

.carousel__arrow--prev {
  left: var(--space-2);
}

.carousel__arrow--next {
  right: var(--space-2);
}

/* Swipe is the gesture on a touch screen, and the count pill already says there is more
   than one photo — so the arrows are pointer-only chrome. They stay reachable by keyboard
   there; on a phone they were only ever sitting on top of the picture.
   Placed after the rules above: same specificity, so it has to win on order. */
@media (hover: none) {
  .carousel__arrow {
    display: none;
  }
}

.carousel__count {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  margin: 0;
  padding: 2px var(--space-2);
  border-radius: 999px;
  background: rgb(0 0 0 / 0.55);
  color: #fff;
  font-size: var(--font-size-sm);
}
</style>
