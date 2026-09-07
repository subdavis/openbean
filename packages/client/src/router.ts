import { createRouter, createWebHistory } from "vue-router";
import { currentUser, sessionReady } from "./stores/session.ts";
import CalendarView from "./views/CalendarView.vue";
import FeedView from "./views/FeedView.vue";
import LoginView from "./views/LoginView.vue";
import PostFormView from "./views/PostFormView.vue";
import SettingsView from "./views/SettingsView.vue";

declare module "vue-router" {
  interface RouteMeta {
    /** Reachable without a session. */
    public?: boolean;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/posts" },
    { component: LoginView, meta: { public: true }, name: "login", path: "/login" },
    // Static segments outrank dynamic ones in the matcher, so this wins over /posts/:id.
    { component: PostFormView, name: "new-post", path: "/posts/new" },
    // :id is optional so /posts and /posts/:id resolve to the same route record —
    // opening or closing the detail modal never unmounts the feed, and scroll sticks.
    { component: FeedView, name: "feed", path: "/posts/:id?" },
    // :id optional for the same reason as the feed — the modal opens over the grid.
    { component: CalendarView, name: "calendar", path: "/calendar/:id?" },
    { component: SettingsView, name: "settings", path: "/settings" },
    { path: "/:pathMatch(.*)*", redirect: "/posts" },
  ],
  // Vue Router takes scroll restoration off the browser as soon as this exists, so it
  // has to answer for every case the browser used to.
  scrollBehavior(to, from, saved) {
    // Opening or closing a post only swaps :id on the route the list already owns —
    // the list never unmounts, and scrolling it would lose the reader's place.
    if (to.name === from.name) return false;
    // `saved` is only ever set on a back/forward, which is exactly when it should win.
    return saved ?? { left: 0, top: 0 };
  },
});

router.beforeEach(async (to) => {
  await sessionReady;
  if (!to.meta.public && !currentUser.value) return { name: "login", query: to.query };
  if (to.meta.public && currentUser.value) return { name: "feed" };
});
