import { readdirSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { app } from "./app.ts";
import { sqlite } from "./db-node.ts";
import type { Bindings } from "./types.ts";

const migrationsDir = process.env.MIGRATIONS_DIR ?? "migrations";
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => join(migrationsDir, f));

const env = {
  ...process.env,
  db: sqlite(process.env.SQLITE_PATH ?? "data/openbean.db", migrations),
} as unknown as Bindings;

// SPA assets; the API is mounted on /api so there is no route overlap.
app.use("/*", serveStatic({ root: process.env.STATIC_ROOT ?? "./public" }));
app.get("/*", serveStatic({ path: "./public/index.html" }));

const port = Number(process.env.PORT) || 8787;
serve({ fetch: (req: Request) => app.fetch(req, env), port });
console.log(`openbean listening on :${port}`);
