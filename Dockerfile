# Build context is the repo root — yarn needs the workspace manifests and lockfile.
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
COPY packages/shared/package.json packages/shared/
RUN yarn install --immutable
COPY . .
# Vite writes into packages/server/public, which the server serves as the SPA.
RUN yarn build

FROM node:24-alpine
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/server/package.json packages/server/
COPY packages/shared/package.json packages/shared/
# The client is a build-time dependency only; its output ships as static files.
RUN yarn workspaces focus --production @openbean/server && yarn cache clean
COPY packages/shared/src packages/shared/src
COPY packages/server/src packages/server/src
COPY packages/server/migrations packages/server/migrations
COPY --from=build /app/packages/server/public packages/server/public

WORKDIR /app/packages/server
ENV NODE_ENV=production SQLITE_PATH=/data/openbean.db
VOLUME /data
EXPOSE 8787
CMD ["node", "src/server.ts"]
