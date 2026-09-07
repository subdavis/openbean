# openbean

Private family photo feed — a Vue PWA on a Hono API, deployable to Cloudflare Workers
**or** a Docker container from the same source.

## Layout

Yarn workspaces, three packages:

| Package           | What it is                                                     |
| ----------------- | -------------------------------------------------------------- |
| `packages/shared` | Row/response types used by both sides.                         |
| `packages/server` | Hono API + the two runtime entry points. Serves the built SPA. |
| `packages/client` | Vue 3 SPA + PWA. Builds into `packages/server/public`.         |

The client and server never import each other — only `@openbean/shared`.

## Running it

```sh
mise install
corepack enable          # yarn 4, pinned in package.json
yarn install
cp packages/server/.env.example packages/server/.env   # Google OAuth + S3 credentials

yarn start               # API + built SPA on :8787 (node + sqlite)
yarn dev                 # Vite dev server on :5173, proxying /api to :8787
yarn dev:server          # API with --watch, for use alongside `yarn dev`
yarn dev:worker          # wrangler dev + D1 instead of node + sqlite

yarn build               # client → packages/server/public
yarn test                # every workspace's tests (API + client units)
yarn typecheck           # tsc for the server, vue-tsc for the client
yarn validate            # biome across all packages
```

For day-to-day frontend work run `yarn dev:server` and `yarn dev` together and use
:5173 — you get HMR, and the proxy keeps the session cookie same-origin. Everything
else (PWA service worker included) is only exercised by `yarn build && yarn start`.

## Shipping it

See [DEPLOY.md](./DEPLOY.md) — Cloudflare Workers or Docker, plus the bucket and
OAuth setup both need.
