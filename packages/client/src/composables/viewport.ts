import { onBeforeUnmount, type Ref, ref, watch } from "vue";

/** Observe a (possibly `v-if`'d) element and report whether it is intersecting. */
function observe(
  el: Ref<HTMLElement | null>,
  rootMargin: string,
  onChange: (hit: boolean) => void,
) {
  const observer = new IntersectionObserver(
    (entries) => onChange(entries.some((entry) => entry.isIntersecting)),
    { rootMargin },
  );
  watch(
    el,
    (to, previous) => {
      if (previous) observer.unobserve(previous);
      if (to) observer.observe(to);
    },
    { immediate: true },
  );
  onBeforeUnmount(() => observer.disconnect());
}

/** Calls `onIntersect` whenever the sentinel element scrolls into view. */
export function useInfiniteScroll(sentinel: Ref<HTMLElement | null>, onIntersect: () => void) {
  observe(sentinel, "400px", (hit) => {
    if (hit) onIntersect();
  });
}

/**
 * True once `el` has come within three viewports of the visible area. Latches on first
 * hit — a photo that's already loaded has no reason to unload as it scrolls back out.
 *
 * Gates full-resolution photo loading so a long scrolled feed doesn't decode every post's
 * image at once: that's easily hundreds of MB of decoded bitmaps, which trips iOS's
 * "webpage was reloaded because it was using significant memory" tab kill in the more
 * memory-constrained standalone-PWA context.
 */
export function useLoadNear(el: Ref<HTMLElement | null>) {
  const loaded = ref(false);
  observe(el, "300% 0px", (hit) => {
    if (hit) loaded.value = true;
  });
  return loaded;
}
