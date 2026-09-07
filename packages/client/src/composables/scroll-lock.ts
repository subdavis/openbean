import { onBeforeUnmount, onMounted } from "vue";

/**
 * Freezes the page behind a modal for as long as the calling component is mounted.
 *
 * On the root element, not <body>: `overflow: hidden` on the body alone leaves the
 * document itself scrollable, which is the whole reason the "pin the body with
 * position: fixed" trick exists. That trick is worse here — taking the body out of flow
 * collapses the document to viewport height, and the scroll offset can no longer be
 * restored on the way out because for a frame there is nothing left to scroll.
 *
 * Hiding the root's overflow keeps the document its real height and keeps the scroll
 * position, so there is nothing to save and hand back. It needs a modern iOS to hold on
 * touch, but the modal is a <dialog> sized in dvh, so this app already asks for 15.4+.
 */
export function useScrollLock() {
  const targets = () => [document.documentElement, document.body];

  onMounted(() => {
    for (const el of targets()) el.style.overflow = "hidden";
  });

  onBeforeUnmount(() => {
    for (const el of targets()) el.style.overflow = "";
  });
}
