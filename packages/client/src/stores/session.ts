import type { User } from "@openbean/shared";
import { computed, reactive } from "vue";
import { api } from "../api.ts";

/** `undefined` = still checking, `null` = signed out. */
const state = reactive<{ user: User | null | undefined }>({ user: undefined });

export const currentUser = computed(() => state.user ?? null);
export const isAdmin = computed(() => state.user?.role === "admin");

/** Started at import time; the router guard awaits it, otherwise the first
 *  navigation is decided before we know whether anyone is signed in. */
export const sessionReady = api
  .get<User>("/auth/me")
  .then((user) => {
    state.user = user;
  })
  .catch(() => {
    state.user = null;
  });

export async function logout() {
  await api.post("/auth/logout");
  state.user = null;
}

/** After PATCH /users/me, so the nav and anything else reading the session catch up. */
export function setUser(user: User) {
  state.user = user;
}
