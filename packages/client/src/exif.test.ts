import assert from "node:assert/strict";
import test from "node:test";
import { exifDate } from "./exif.ts";

/** Minimal JPEG: SOI + an APP1 holding one IFD0 pointer to an ExifIFD with DateTimeOriginal. */
function jpegWithDate(value: string) {
  const tiff = new DataView(new ArrayBuffer(64));
  const write = (at: number, bytes: string) => {
    for (let i = 0; i < bytes.length; i++) tiff.setUint8(at + i, bytes.charCodeAt(i));
  };
  write(0, "II");
  tiff.setUint16(2, 0x2a, true);
  tiff.setUint32(4, 8, true); // IFD0 at 8
  tiff.setUint16(8, 1, true); // one entry
  tiff.setUint16(10, 0x8769, true); // ExifIFDPointer
  tiff.setUint16(12, 4, true); // LONG
  tiff.setUint32(14, 1, true);
  tiff.setUint32(18, 26, true); // ExifIFD at 26
  tiff.setUint16(26, 1, true);
  tiff.setUint16(28, 0x9003, true); // DateTimeOriginal
  tiff.setUint16(30, 2, true); // ASCII
  tiff.setUint32(32, 20, true);
  tiff.setUint32(36, 44, true); // string at 44
  write(44, `${value}\0`);

  const header = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 72, 0x45, 0x78, 0x69, 0x66, 0, 0]);
  return new Blob([header, tiff.buffer]);
}

test("reads DateTimeOriginal as an ISO date", async () => {
  assert.equal(await exifDate(jpegWithDate("2023:07:04 12:30:00")), "2023-07-04");
});

test("returns null when there is no EXIF to read", async () => {
  assert.equal(await exifDate(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2])])), null);
  assert.equal(await exifDate(new Blob([new Uint8Array([1, 2, 3, 4])])), null);
});
