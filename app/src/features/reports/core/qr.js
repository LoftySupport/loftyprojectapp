// qr.js — one QR encoding, four renderers.
//
// A QR block emits `{ type: 'qr', text, … }` and nothing else: the resolver stays pure
// and synchronous, and every renderer turns that into its own kind of picture from the
// SAME matrix. Two encoders would eventually disagree, and a QR that disagrees with
// itself is a QR that scans to the wrong place in one of the four outputs.
//
// SVG for the screen, the HTML download and print/PDF — it stays sharp at any size and a
// QR is exactly the kind of hard-edged graphic that a raster ruins when scaled.
//
// PNG for Word, because a .docx cannot embed an SVG. The encoder below is deliberately
// dependency-free and deterministic rather than a canvas: canvas would tie the Word
// export to a browser, and the same QR would come out slightly differently depending on
// where it ran, which makes it untestable.

import qrcode from 'qrcode-generator';

// ── WHY THIS LIBRARY ──────────────────────────────────────────────────
//
// Amber, 4 September, three times and finally in capitals: *"LOOK AT THE REACT ONE!!!!"*
// — pointing at Aamir-Rafique/QRcodegenerator-react, which draws its code with
// `react-qr-code`.
//
// She is right, and the reason is not that it is React. `react-qr-code` is a thin
// component over `qrcode-generator`, and `qrcode-generator` hands out the raw grid
// (`getModuleCount()` / `isDark()`). So the component can draw the block on screen while
// this file reads the same grid for Word, HTML and print — ONE encoder, four pictures,
// which is the rule at the top of this file rather than an exception to it.
//
// Two earlier attempts did not have that property. `qrcode` works but arrives with
// `yargs`, `pngjs` and `dijkstrajs` behind it — a command-line argument parser, to turn a
// string into a grid of booleans. Project Nayuki's generator is excellent but ships TypeScript
// that `erasableSyntaxOnly` rejects (TS1294, namespaces), so it had to be compiled and
// vendored as 845 lines of someone else's code that nobody here would ever re-read.

/** The error correction level, everywhere. See the note on the block's settings. */
export const QR_LEVEL = 'M';

// `qrcode-generator` encodes a string as latin1 unless told otherwise, and `react-qr-code`
// replaces this exact function with this exact body when IT loads. Setting it here too is
// not redundant: without it, a code containing an accent, a dash Word autocorrected, or an
// emoji would encode one way in the browser (component loaded) and another in the Word
// export or the Node check (component not loaded). Same function, so load order cannot
// matter.
qrcode.stringToBytes = (s) => Array.from(new TextEncoder().encode(s));

/**
 * The black/white grid for a string.
 *
 * @returns {{ size: number, at: (x: number, y: number) => boolean }}
 */
export function qrMatrix(text) {
  const q = qrcode(0, QR_LEVEL); // 0 = pick the smallest version that fits.
  q.addData(String(text ?? ''));
  q.make();
  const size = q.getModuleCount();
  // `isDark` takes (row, col) — y before x. Getting this backwards produces a QR that
  // still looks like a QR, which is why it is spelled out rather than passed through.
  return { size, at: (x, y) => q.isDark(y, x) };
}

/**
 * An SVG string.
 *
 * One `<path>` of rectangles rather than one `<rect>` per module: a 25×25 code is 625
 * elements, and a document with a few of them becomes a document that scrolls badly.
 *
 * `shape-rendering="crispEdges"` because the browser's default antialiasing softens the
 * module edges, and a soft QR is a QR that some phones will not read.
 */
export function qrSvg(text, { margin = 2 } = {}) {
  const { size, at } = qrMatrix(text);
  const side = size + margin * 2;
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (at(x, y)) d += `M${x + margin} ${y + margin}h1v1h-1z`;
    }
  }
  return {
    side,
    // The quiet zone is white and explicit. A transparent background over a dark theme
    // inverts the code, and an inverted QR does not scan.
    body: `<rect width="${side}" height="${side}" fill="#ffffff"/><path d="${d}" fill="#000000" shape-rendering="crispEdges"/>`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${side}" height="${side}" shape-rendering="crispEdges"><rect width="${side}" height="${side}" fill="#ffffff"/><path d="${d}" fill="#000000"/></svg>`
  };
}

// ─── A PNG, with no canvas and no zlib ───────────────────────────────
//
// Deflate has a "stored" block type that is literally the bytes with a length in front,
// so a valid zlib stream can be written without compressing anything. A QR is a few
// kilobytes either way, and this removes both the browser dependency and the platform
// difference.

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const adler32 = (bytes) => {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) { a = (a + bytes[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
};

const be32 = (n) => Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

const chunk = (type, data) => {
  const name = Uint8Array.from([...type].map(c => c.charCodeAt(0)));
  const body = concat([name, data]);
  return concat([be32(data.length), body, be32(crc32(body))]);
};

/** A zlib stream of `raw`, using stored blocks — valid, and nothing to go wrong. */
function storedZlib(raw) {
  const blocks = [];
  const MAX = 65535;
  for (let i = 0; i < raw.length || i === 0; i += MAX) {
    const slice = raw.subarray(i, Math.min(i + MAX, raw.length));
    const last = i + MAX >= raw.length ? 1 : 0;
    const len = slice.length;
    blocks.push(Uint8Array.from([last, len & 255, (len >> 8) & 255, ~len & 255, (~len >> 8) & 255]));
    blocks.push(slice);
  }
  // 0x78 0x01 — deflate, 32K window, no preset dictionary, fastest.
  return concat([Uint8Array.from([0x78, 0x01]), ...blocks, be32(adler32(raw))]);
}

/**
 * A QR as PNG bytes.
 *
 * @param {number} scale pixels per module. 8 gives a code a phone reads off a printed
 *   page at the size the Word export places it.
 * @returns {Uint8Array}
 */
export function qrPng(text, { margin = 2, scale = 8 } = {}) {
  const { size, at } = qrMatrix(text);
  const side = (size + margin * 2) * scale;

  // ONE BIT PER PIXEL, greyscale — which is what a QR is. At 8 bits it was 70 kB per
  // code because the deflate blocks are stored rather than compressed; at 1 bit the same
  // code is under 9 kB, and a document with five of them stops being a problem.
  //
  // Bit 0 is black and bit 1 is white, which is colour type 0 at bit depth 1.
  const bytesPerRow = Math.ceil(side / 8);
  const raw = new Uint8Array((bytesPerRow + 1) * side);
  for (let py = 0; py < side; py++) {
    const rowStart = py * (bytesPerRow + 1);
    raw[rowStart] = 0;
    const my = Math.floor(py / scale) - margin;
    for (let px = 0; px < side; px++) {
      const mx = Math.floor(px / scale) - margin;
      const dark = my >= 0 && my < size && mx >= 0 && mx < size && at(mx, my);
      if (!dark) raw[rowStart + 1 + (px >> 3)] |= 0x80 >> (px & 7);
    }
  }

  const ihdr = concat([be32(side), be32(side), Uint8Array.from([1, 0, 0, 0, 0])]);
  return concat([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', storedZlib(raw)),
    chunk('IEND', new Uint8Array(0))
  ]);
}

/** The PNG as a data URI, for anything that wants an `<img src>`. */
export function qrPngDataUri(text, opts) {
  const bytes = qrPng(text, opts);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
  return `data:image/png;base64,${b64}`;
}
