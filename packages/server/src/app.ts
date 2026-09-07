import { Hono } from "hono";
import { session } from "./auth.ts";
import { authRoutes } from "./routes/auth.ts";
import { commentRoutes } from "./routes/comments.ts";
import { inviteRoutes } from "./routes/invites.ts";
import { likeRoutes } from "./routes/likes.ts";
import { postRoutes } from "./routes/posts.ts";
import { userRoutes } from "./routes/users.ts";
import type { AppEnv } from "./types.ts";

/**
 * Everything lives under /api so the SPA can own /posts, /calendar and friends.
 * `session` 401s any /api route outside /api/auth/.
 */
export const app = new Hono<AppEnv>();

app.use("/api/*", session);

authRoutes(app);
inviteRoutes(app);
userRoutes(app);
postRoutes(app);
commentRoutes(app);
likeRoutes(app);

app.onError((err, c) => {
  if (err instanceof SyntaxError) return c.json({ error: "Invalid JSON body" }, 400);
  console.error(err);
  return c.json({ error: "Internal error" }, 500);
});
