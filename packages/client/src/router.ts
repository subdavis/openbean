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
});

router.beforeEach(async (to) => {
  await sessionReady;
  if (!to.meta.public && !currentUser.value) return { name: "login", query: to.query };
  if (to.meta.public && currentUser.value) return { name: "feed" };
});
