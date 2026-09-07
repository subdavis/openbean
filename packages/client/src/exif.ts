/**
 * Reads DateTimeOriginal out of a JPEG's EXIF block and returns it as YYYY-MM-DD.
 *
 * ponytail: ~50 lines instead of exif-js, which is unmaintained and parses tags we
 * never look at. Only the date matters here; if we ever need orientation or GPS,
 * swap in a real library rather than growing this.
 */
export async function exifDate(file: File | Blob): Promise<string | null> {
  try {
    // EXIF lives in the first APP1 segment, always near the start of the file.
    const view = new DataView(await file.slice(0, 128 * 1024).arrayBuffer());
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) return null;
      const marker = view.getUint8(offset + 1);
      const length = view.getUint16(offset + 2);
      // APP1 whose payload starts with "Exif"
      if (marker === 0xe1 && view.getUint32(offset + 4) === 0x45786966) {
        return readTiff(view, offset + 10);
      }
      if (marker === 0xda) return null; // start of scan: no EXIF
      offset += 2 + length;
    }
    return null;
  } catch {
    return null; // truncated or malformed — the user can still pick a date by hand
  }
}

function readTiff(view: DataView, base: number): string | null {
  const little = view.getUint16(base) === 0x4949;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  if (u16(base + 2) !== 0x2a) return null;

  /** Offset of the 12-byte directory entry for `tag`, or 0. */
  const entry = (ifd: number, tag: number) => {
    for (let i = 0, n = u16(ifd); i < n; i++) {
      const at = ifd + 2 + i * 12;
      if (u16(at) === tag) return at;
    }
    return 0;
  };

  const ascii = (at: number) => {
    if (!at) return null;
    const count = u32(at + 4);
    // Values longer than the 4-byte inline slot are stored elsewhere in the block.
    const start = count > 4 ? base + u32(at + 8) : at + 8;
    let out = "";
    for (let i = 0; i < count - 1 && start + i < view.byteLength; i++) {
      out += String.fromCharCode(view.getUint8(start + i));
    }
    return out;
  };

  const ifd0 = base + u32(base + 4);
  const pointer = entry(ifd0, 0x8769); // ExifIFDPointer
  const exifIfd = pointer ? base + u32(pointer + 8) : 0;
  const raw = (exifIfd && ascii(entry(exifIfd, 0x9003))) || ascii(entry(ifd0, 0x0132));

  const match = raw?.match(/^(\d{4}):(\d{2}):(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}
