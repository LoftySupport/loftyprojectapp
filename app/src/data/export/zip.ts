/**
 * A ZIP container, because an .xlsx is one.
 *
 * WHY THIS IS HERE AND NOT `npm install`ed: the file this has to produce is a fixed set
 * of six small XML parts, and every library that writes one brings a general-purpose
 * spreadsheet model — a reader, a formula engine, a cell type system — none of which is
 * wanted here. What is genuinely hard about writing xlsx is the OOXML, not the archive,
 * and the archive is ninety lines.
 *
 * ENTRIES ARE STORED, NOT DEFLATED (method 0). A deflate needs either a dependency or
 * `CompressionStream`, which is async and would make every caller async for a saving
 * that does not matter at this size: the largest table in this app is a few hundred
 * jobs, and its sheet XML is well under a megabyte. If an export ever gets big enough
 * to notice, `CompressionStream("deflate-raw")` is the change — set the method to 8 and
 * keep the CRC and the uncompressed size, which are already computed here.
 *
 * Excel opens stored entries without comment; so do Numbers, LibreOffice and Sheets.
 */

const crcTable = /* @__PURE__ */ (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** Forward slashes, no leading slash — the path as it appears inside the archive. */
  path: string;
  body: string;
}

/**
 * MS-DOS date and time, which is what a ZIP header carries: two-second resolution and
 * an epoch of 1980. A date before 1980 cannot be represented at all, so it is clamped
 * rather than allowed to wrap into 2043 — a system clock set wrong should not produce a
 * file that some unzip implementations refuse.
 */
function dosStamp(at: Date): { date: number; time: number } {
  const year = Math.max(1980, at.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1)
  };
}

class Buf {
  private parts: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array) {
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  u16(n: number) {
    this.push(new Uint8Array([n & 0xff, (n >>> 8) & 0xff]));
  }

  u32(n: number) {
    this.push(new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]));
  }

  done(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const p of this.parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
}

/**
 * `binaryPaths` names the entries whose body is not text but raw bytes carried as a string
 * of code points 0–255 — the .docx logo image. Those are written byte-for-byte rather than
 * UTF-8-encoded, because `TextEncoder` would turn every byte above 0x7f into two and the
 * PNG would arrive corrupt. XML parts (the default) stay UTF-8, so an accented sheet name
 * survives.
 */
export function zip(entries: ZipEntry[], at: Date, binaryPaths: string[] = []): Uint8Array {
  const encoder = new TextEncoder();
  const binary = new Set(binaryPaths);
  const latin1 = (s: string) => {
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
    return b;
  };
  const { date, time } = dosStamp(at);
  const out = new Buf();
  const central: { entry: ZipEntry; name: Uint8Array; body: Uint8Array; crc: number; offset: number }[] = [];

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const body = binary.has(entry.path) ? latin1(entry.body) : encoder.encode(entry.body);
    const crc = crc32(body);
    const offset = out.length;

    out.u32(0x04034b50); // local file header
    out.u16(20);         // version needed — 2.0, which is what "stored, no encryption" is
    // Bit 11 says the name is UTF-8. Every path here is ASCII, so it changes nothing
    // today; it is set because the alternative is CP437, and a sheet name is one rename
    // away from carrying an accent.
    out.u16(1 << 11);
    out.u16(0);          // stored
    out.u16(time);
    out.u16(date);
    out.u32(crc);
    out.u32(body.length); // compressed size — the same, stored
    out.u32(body.length);
    out.u16(name.length);
    out.u16(0);          // no extra field
    out.push(name);
    out.push(body);

    central.push({ entry, name, body, crc, offset });
  }

  const centralAt = out.length;
  for (const e of central) {
    out.u32(0x02014b50); // central directory header
    out.u16(20);         // made by
    out.u16(20);         // version needed
    out.u16(1 << 11);
    out.u16(0);
    out.u16(time);
    out.u16(date);
    out.u32(e.crc);
    out.u32(e.body.length);
    out.u32(e.body.length);
    out.u16(e.name.length);
    out.u16(0);          // extra
    out.u16(0);          // comment
    out.u16(0);          // disk number
    out.u16(0);          // internal attributes
    out.u32(0);          // external attributes
    out.u32(e.offset);
    out.push(e.name);
  }

  const centralSize = out.length - centralAt;
  out.u32(0x06054b50);   // end of central directory
  out.u16(0);
  out.u16(0);
  out.u16(central.length);
  out.u16(central.length);
  out.u32(centralSize);
  out.u32(centralAt);
  out.u16(0);            // no archive comment

  return out.done();
}
