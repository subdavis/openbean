import type { User } from "@openbean/shared";
import { computed, ref } from "vue";
import { api } from "../api.ts";

/** null = signed out. Views assign to it directly after PATCH /users/me. */
export const currentUser = ref<User | null>(null);
export const isAdmin = computed(() => currentUser.value?.role === "admin");

/** Started at import time; the router guard awaits it, otherwise the first
 *  navigation is decided before we know whether anyone is signed in. */
export const sessionReady = api
  .get<User>("/auth/me")
  .then((user) => {
    currentUser.value = user;
  })
  .catch(() => {
    currentUser.value = null;
  });

export async function logout() {
  await api.post("/auth/logout");
  currentUser.value = null;
}
