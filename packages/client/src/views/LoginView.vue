<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const invite = computed(() => route.query.invite);
const failed = computed(() => route.query.error === "invite_required");

const loginUrl = computed(() =>
  invite.value
    ? `/api/auth/google/login?invite=${encodeURIComponent(String(invite.value))}`
    : "/api/auth/google/login",
);
</script>

<template>
  <main class="login">
    <h1>Open Album</h1>
    <p class="muted">A private photo feed for the family.</p>
    <p v-if="failed" class="error">
      That account isn't a member yet. Ask an admin for an invite link.
    </p>
    <a class="button button-primary login__button" :href="loginUrl">Sign in with Google</a>
  </main>
</template>

<style scoped>
.login {
  padding: 15vh var(--space-4) 0;
  text-align: center;
}

.login__button {
  margin-top: var(--space-5);
  text-decoration: none;
}
</style>
