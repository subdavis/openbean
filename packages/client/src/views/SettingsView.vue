<script setup lang="ts">
import type { Invite, User } from "@openbean/shared";
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api.ts";
import AppIcon from "../components/AppIcon.vue";
import { day } from "../format.ts";
import { currentUser, isAdmin, logout, setUser } from "../stores/session.ts";

type InviteRow = Invite & { redeemed_by_name: string | null };

const router = useRouter();
const error = ref("");

const name = ref(currentUser.value?.name ?? "");
const savingName = ref(false);
const nameSaved = ref(false);

const users = ref<User[]>([]);
const invites = ref<InviteRow[]>([]);

/** Every handler here is a one-shot admin action; show the failure, keep the page. */
async function run(fn: () => Promise<void>) {
  error.value = "";
  try {
    await fn();
  } catch (err) {
    error.value = (err as Error).message;
    // A rejected role/access change leaves the control showing the value that
    // didn't stick, so re-read the rows the server actually has.
    if (isAdmin.value) load();
  }
}

const load = () =>
  run(async () => {
    [users.value, invites.value] = await Promise.all([
      api.get<User[]>("/users"),
      api.get<InviteRow[]>("/invites"),
    ]);
  });

onMounted(() => {
  if (isAdmin.value) load();
});

const saveName = () =>
  run(async () => {
    savingName.value = true;
    nameSaved.value = false;
    try {
      setUser(await api.patch<User>("/users/me", { name: name.value.trim() }));
      nameSaved.value = true;
    } finally {
      savingName.value = false;
    }
  });

const patchUser = (u: User, body: Partial<User>) =>
  run(async () => {
    const updated = await api.patch<User>(`/users/${u.id}`, body);
    Object.assign(u, updated);
  });

const removeUser = (u: User) =>
  run(async () => {
    if (!confirm(`Delete ${u.name} and all their posts? This cannot be undone.`)) return;
    await api.del(`/users/${u.id}`);
    users.value = users.value.filter((row) => row.id !== u.id);
  });

const createInvite = () =>
  run(async () => {
    invites.value.unshift(await api.post<InviteRow>("/invites"));
  });

const revokeInvite = (invite: InviteRow) =>
  run(async () => {
    await api.del(`/invites/${invite.id}`);
    invites.value = invites.value.filter((row) => row.id !== invite.id);
  });

const inviteUrl = (code: string) => `${location.origin}/?invite=${code}`;
const copy = (code: string) => navigator.clipboard?.writeText(inviteUrl(code));

const signOut = async () => {
  await logout();
  router.push("/login");
};
</script>

<template>
  <main class="container">
    <p v-if="error" class="error settings__error">{{ error }}</p>

    <section class="settings__section">
      <h1>Your profile</h1>
      <form class="settings__row" @submit.prevent="saveName">
        <label class="settings__field">
          <span class="muted">Display name</span>
          <input
            v-model="name"
            maxlength="80"
            required
            autocomplete="name"
            autocapitalize="words"
            autocorrect="off"
            enterkeyhint="done"
          />
        </label>
        <button
          class="button button-primary"
          type="submit"
          :disabled="savingName || !name.trim()"
        >
          Save
        </button>
      </form>
      <p v-if="nameSaved" class="muted">Saved.</p>
      
    </section>

    <template v-if="isAdmin">
      <section class="settings__section">
        <h1>Members</h1>
        <ul class="list">
          <li v-for="user in users" :key="user.id" class="list__item">
            <div class="list__main">
              <strong>{{ user.name }}</strong>
              <span class="muted">{{ user.email }}</span>
            </div>
            <label class="muted">
              <input
                type="checkbox"
                :checked="!!user.has_private_feed_access"
                :disabled="user.role === 'admin'"
                @change="
                  patchUser(user, {
                    has_private_feed_access: ($event.target as HTMLInputElement)
                      .checked
                      ? 1
                      : 0,
                  })
                "
              />
              Private feed
            </label>
            <select
              :value="user.role"
              aria-label="Role"
              @change="
                patchUser(user, {
                  role: ($event.target as HTMLSelectElement)
                    .value as User['role'],
                })
              "
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              v-if="user.id !== currentUser?.id"
              class="button button-danger"
              type="button"
              :aria-label="`Delete ${user.name}`"
              @click="removeUser(user)"
            >
              Remove
            </button>
          </li>
        </ul>
      </section>

      <section class="settings__section">
        <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
          <h1>Invites</h1>
          <button class="button" type="button" @click="createInvite">
            Create new invite
          </button>
        </div>
        <ul class="list">
          <li v-for="invite in invites" :key="invite.id" class="list__item">
            <div class="list__main">
              <code>{{ invite.code }}</code>
              <span class="muted">
                {{
                  invite.redeemed_by
                    ? `Used by ${invite.redeemed_by_name ?? "someone"}`
                    : `Expires ${day(invite.expires_at.slice(0, 10))}`
                }}
              </span>
            </div>
            <template v-if="!invite.redeemed_by">
              <button class="button" type="button" @click="copy(invite.code)">
                Copy link
              </button>
              <button
                class="button button-danger"
                type="button"
                :aria-label="`Revoke invite ${invite.code}`"
                @click="revokeInvite(invite)"
              >
                Remove
              </button>
            </template>
          </li>
        </ul>
      </section>

      <section class="settings_section">
        <h1>Log out</h1>
        <button class="button" type="button" @click="signOut">Log out</button>
      </section>
    </template>
  </main>
</template>

<style scoped>
.settings__title {
  margin: 0;
  padding: var(--space-4);
  font-size: var(--font-size-lg);
  border-bottom: var(--border);
}

.settings__error {
  padding: 0 var(--space-4);
}

.settings__section {
  display: flex;
  flex-direction: column;
  align-items: start;
  gap: var(--space-3);
  padding-bottom: var(--space-5);
}

.settings__section h2 {
  margin: 0;
  font-size: var(--font-size);
}

.settings__row {
  display: flex;
  align-items: end;
  gap: var(--space-3);
  width: 100%;
}

.settings__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  flex: 1;
}

.settings__field input,
select {
  padding: var(--space-2);
  border: var(--border);
  border-radius: var(--radius);
  background: var(--color-bg);
}

.list {
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}

.list__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-top: var(--border);
}

.list__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.list__main > * {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
