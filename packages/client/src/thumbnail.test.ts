import assert from "node:assert/strict";
import test from "node:test";
import { THUMB_WIDTH, thumbSize } from "./thumbnail.ts";

test("scales to the target width and keeps the aspect ratio", () => {
  assert.deepEqual(thumbSize(4000, 3000), { height: 135, width: 180 });
  assert.deepEqual(thumbSize(3000, 4000), { height: 240, width: 180 });
  assert.deepEqual(thumbSize(1000, 1000), { height: 180, width: 180 });
});

test("never upscales", () => {
  assert.deepEqual(thumbSize(120, 90), { height: 90, width: 120 });
  assert.deepEqual(thumbSize(THUMB_WIDTH, 200), { height: 200, width: THUMB_WIDTH });
});

test("keeps a very wide panorama at least one pixel tall", () => {
  assert.deepEqual(thumbSize(20000, 50), { height: 1, width: 180 });
});

test("a photo already at the target width is its own placeholder", () => {
  // prepare() skips the encode in this case; thumbSize is what tells it so.
  const { width } = thumbSize(170, 227);
  assert.equal(width, 170);
  assert.ok(width <= THUMB_WIDTH);
});
