import type { D1Database, ExecutionContext } from "@cloudflare/workers-types";
import { app } from "./app.ts";
import { d1 } from "./db.ts";
import type { Bindings } from "./types.ts";

type WorkerEnv = Omit<Bindings, "db"> & { DB: D1Database };

export default {
  fetch: (req: Request, env: WorkerEnv, ctx: ExecutionContext) =>
    app.fetch(req, { ...env, db: d1(env.DB) }, ctx as never),
};
