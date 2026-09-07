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
