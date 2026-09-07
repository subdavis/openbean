import { createApp } from "vue";
import App from "./App.vue";
import { trackKeyboardInset } from "./keyboard.ts";
import { router } from "./router.ts";
import "./style.css";

trackKeyboardInset();

createApp(App).use(router).mount("#app");
