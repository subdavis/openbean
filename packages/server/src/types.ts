import type { Comment, Photo, Post, User } from "@openbean/shared";
import type { Db } from "./db.ts";

export type { Comment, Photo, Post, User };

export type Bindings = {
  db: Db;
  APP_ORIGIN: string;
  JWT_SECRET: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  BOOTSTRAP_ADMIN_EMAIL?: string;
  S3_ENDPOINT: string;
  S3_BUCKET: string;
  S3_REGION?: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  MAX_PHOTOS_PER_POST?: string;
};

/** `user` is set by the session middleware, which 401s every non-/api/auth route without one. */
export type AppEnv = { Bindings: Bindings; Variables: { user: User } };
