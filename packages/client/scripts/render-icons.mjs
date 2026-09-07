/**
 * Renders public/icon.svg to the PNGs iOS and Android need, with no dependencies.
 *
 * iOS never rasterises an SVG for the home screen: with only the SVG in the manifest,
 * "Add to Home Screen" falls back to a screenshot of the page. So the touch icon has to
 * ship as a PNG, and the Android maskable icon has to leave room for the launcher's mask.
 *
 * The geometry below mirrors public/icon.svg — keep the two in step. It is small enough
 * (a rounded square, a circle, a polygon) that a scanline rasteriser beats a dependency.
 *
 *   node scripts/render-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const INK = [0x2a, 0x2a, 0x28];
const PAPER = [0xf7, 0xf5, 0xf0];

/** The artwork, in the SVG's 64×64 user space. Drawn back to front. */
const CIRCLE = { cx: 24, cy: 24, r: 7 };
const RIDGE = [
  [8, 50],
  [22, 34],
  [32, 45],
  [40, 37],
  [56, 50],
];

const UNITS = 64;
/** 4×4 samples per pixel — enough to keep the circle and the ridge's diagonals clean. */
const SS = 4;

const inCircle = (x, y) => (x - CIRCLE.cx) ** 2 + (y - CIRCLE.cy) ** 2 <= CIRCLE.r ** 2;

/** Even-odd ray cast; the ridge is a simple closed polygon. */
function inRidge(x, y) {
  let inside = false;
  for (let i = 0, j = RIDGE.length - 1; i < RIDGE.length; j = i++) {
    const [xi, yi] = RIDGE[i];
    const [xj, yj] = RIDGE[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A square with radius `r` corners, or the full square when `r` is 0. */
function inPlate(x, y, r) {
  if (x < 0 || y < 0 || x > UNITS || y > UNITS) return false;
  if (r <= 0) return true;
  // Only the corner quadrants can miss, so clamp to the nearest corner circle's centre.
  const cx = Math.min(Math.max(x, r), UNITS - r);
  const cy = Math.min(Math.max(y, r), UNITS - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/**
 * @param size    pixel width/height of the output
 * @param radius  corner radius in user units; 0 for a full-bleed square
 * @param scale   artwork scale about the centre, for maskable icons' safe zone
 */
function render(size, { radius = 12, scale = 1 } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const step = UNITS / (size * SS);
  const mid = UNITS / 2;

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      // Coverage of each layer, accumulated over the sub-samples.
      let plate = 0;
      let mark = 0;
      for (let sy = 0; sy < SS; sy++) {
        const y = (row * SS + sy + 0.5) * step;
        for (let sx = 0; sx < SS; sx++) {
          const x = (col * SS + sx + 0.5) * step;
          if (!inPlate(x, y, radius)) continue;
          plate++;
          // Undo the artwork scale to test against the original geometry.
          const ax = mid + (x - mid) / scale;
          const ay = mid + (y - mid) / scale;
          if (inCircle(ax, ay) || inRidge(ax, ay)) mark++;
        }
      }

      const total = SS * SS;
      const at = (row * size + col) * 4;
      if (plate === 0) continue;
      // Ink and paper are both opaque inside the plate; only the plate edge is soft.
      const t = mark / plate;
      for (let c = 0; c < 3; c++) px[at + c] = Math.round(INK[c] + (PAPER[c] - INK[c]) * t);
      px[at + 3] = Math.round((plate / total) * 255);
    }
  }
  return px;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** 8-bit RGBA, one filter byte (0 = none) per scanline. */
function png(px, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let row = 0; row < size; row++) {
    raw[row * (size * 4 + 1)] = 0;
    px.copy(raw, row * (size * 4 + 1) + 1, row * size * 4, (row + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // depth, colour type RGBA, deflate, no filter, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const icons = [
  // iOS masks the touch icon itself, so it wants a full-bleed square with no rounding.
  ["apple-touch-icon.png", 180, { radius: 0 }],
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  // Maskable: the launcher may crop to a circle, so the art sits inside the 80% safe zone.
  ["icon-maskable-512.png", 512, { radius: 0, scale: 0.6 }],
];

for (const [name, size, opts] of icons) {
  writeFileSync(join(out, name), png(render(size, opts), size));
  console.log(`${name} ${size}×${size}`);
}
