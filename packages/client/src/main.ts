import { registerSW } from "virtual:pwa-register";
import { createApp } from "vue";
import App from "./App.vue";
import { trackKeyboardInset } from "./keyboard.ts";
import { router } from "./router.ts";
import "./style.css";

trackKeyboardInset();

// An installed PWA is restored from a frozen state instead of navigating, so the
// browser's own update check (navigation-triggered, 24h-throttled) almost never
// fires on mobile. Ask explicitly whenever the app comes back to the foreground;
// registerType: "autoUpdate" handles the reload once an update is found.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") registration?.update();
    });
  },
});

createApp(App).use(router).mount("#app");
