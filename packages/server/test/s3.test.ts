import assert from "node:assert/strict";
import { test } from "node:test";
import { READ_WINDOW, s3 } from "../src/s3.ts";

const storage = s3({
  S3_ACCESS_KEY_ID: "key",
  S3_BUCKET: "bucket",
  S3_ENDPOINT: "https://storage.googleapis.com",
  S3_REGION: "auto",
  S3_SECRET_ACCESS_KEY: "secret",
});

test("read URLs are stable so the browser can cache the image", async () => {
  assert.equal(await storage.readUrl("photos/1.jpg"), await storage.readUrl("photos/1.jpg"));
});

test("expiry outlives the stability window", async () => {
  const url = new URL(await storage.readUrl("photos/1.jpg", 600));
  const signedAt = url.searchParams.get("X-Amz-Date") as string;
  const iso = signedAt.replace(/^(.{4})(..)(..)T(..)(..)(..)Z$/, "$1-$2-$3T$4:$5:$6Z");
  const age = (Date.now() - Date.parse(iso)) / 1000;
  assert.ok(age >= 0 && age <= READ_WINDOW, `signed ${age}s ago`);
  assert.ok(Number(url.searchParams.get("X-Amz-Expires")) - age >= 600);
});
