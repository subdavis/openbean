/**
 * Decodes a picked photo once and returns everything the upload needs: its intrinsic
 * size, a 180px-wide thumbnail, and a file every browser can display.
 *
 * ponytail: the browser already ships an image decoder and a WebP encoder, so this is
 * a canvas draw instead of a WASM codec in the Worker or a Cloudflare Images bill.
 * It also puts the HEIC transcode on the only device that can read HEIC — the iPhone
 * that took the photo. Move it server-side if we ever need renditions on demand.
 */

export const THUMB_WIDTH = 180;
const THUMB_TYPE = "image/webp";

/** Formats every target browser can paint. Anything else is re-encoded to JPEG. */
const DISPLAYABLE = /^image\/(jpeg|png|webp|gif|avif)$/;

/** Fixed width, aspect preserved, never upscaled — a photo narrower than the target is its own thumb. */
export function thumbSize(width: number, height: number, target = THUMB_WIDTH) {
  if (width <= target) return { height, width };
  return { height: Math.max(1, Math.round((height / width) * target)), width: target };
}

export type Prepared = {
  /** The bytes to upload as the original — the picked file untouched, unless it needed transcoding. */
  file: File;
  /** null when the thumbnail could not be encoded; the feed then falls back to the original. */
  thumb: Blob | null;
  width: number;
  height: number;
};

async function encode(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  type: string,
  quality: number,
) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d canvas context");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.convertToBlob({ quality, type });
}

/**
 * Throws when the browser cannot decode the file at all — desktop Chrome handed a
 * .heic from the Files app, say. That is the right place to fail: the bytes would
 * have uploaded fine and then shown as a broken image to everyone.
 */
export async function prepare(file: File): Promise<Prepared> {
  const bitmap = await createImageBitmap(file);
  try {
    const { height, width } = bitmap;
    const t = thumbSize(width, height);

    // A photo already at or under the target is its own placeholder — re-encoding it
    // buys nothing and can cost more bytes than the original. A missing thumbnail costs
    // a placeholder, not the photo, so a failed encode is not fatal either.
    const thumb =
      width <= THUMB_WIDTH
        ? null
        : await encode(bitmap, t.width, t.height, THUMB_TYPE, 0.8).catch(() => null);

    const file2 = DISPLAYABLE.test(file.type)
      ? file
      : new File(
          [await encode(bitmap, width, height, "image/jpeg", 0.92)],
          `${file.name.replace(/\.[^.]+$/, "")}.jpg`,
          { type: "image/jpeg" },
        );

    return { file: file2, height, thumb, width };
  } finally {
    bitmap.close();
  }
}
