/**
 * Publishes how much of the layout viewport the software keyboard is covering, as
 * `--keyboard-inset` on <html> plus a `data-keyboard` flag for anything that just wants
 * to get out of the way.
 *
 * iOS lays `position: fixed` out against the *layout* viewport, and the keyboard doesn't
 * shrink that — so a full-height fixed panel keeps its bottom half underneath the
 * keyboard, taking whatever you are typing into down there with it. The visual viewport
 * is the only thing that reports the covered strip, so read it and let CSS subtract it.
 *
 * Started once from main.ts; it lives as long as the document does.
 */

/** Input types that focus without raising a keyboard. Anything else (date and its
 *  friends included — the wheel picker covers the screen just the same) counts. */
const NO_KEYBOARD = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

function typing() {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") return !NO_KEYBOARD.has((el as HTMLInputElement).type);
  return el.isContentEditable;
}

export function trackKeyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport) return;

  const update = () => {
    // offsetTop is how far the visual viewport has been scrolled *within* the layout one,
    // which iOS does on focus; without it the covered strip is over-reported mid-scroll.
    const covered = window.innerHeight - viewport.height - viewport.offsetTop;
    // Requiring a focused field as well as a shrunken viewport is what keeps Safari's
    // collapsing toolbars — which move the visual viewport by a similar amount — from
    // reading as a keyboard.
    const inset = typing() && covered > 24 ? Math.round(covered) : 0;

    const root = document.documentElement;
    root.style.setProperty("--keyboard-inset", `${inset}px`);
    root.toggleAttribute("data-keyboard", inset > 0);
  };

  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  // The viewport settles a frame or two after focus moves, so re-check on both.
  document.addEventListener("focusin", update);
  document.addEventListener("focusout", update);
  update();
}
