#!/usr/bin/env node
/**
 * Turn `public/lofty_logo_orange.png` into `src/data/export/logo.ts` — the one place the
 * document writers get the Lofty wordmark, decoded here so neither writer needs a PNG
 * decoder or an image library at runtime.
 *
 * WHY A BUILD STEP AND NOT `import logo.png`. Vite would inline the PNG as a data URL, but
 * the PDF writer cannot use a PNG at all — a PDF has no PNG filter, and the hand-rolled
 * writer has no zlib to Flate-encode one. So the PDF needs raw, already-decoded samples,
 * and decoding a PNG is exactly the work a runtime image library would do. Node has
 * `zlib` built in, so the decode happens here, once, against a checked-in source image,
 * and ships as plain base64 both writers read without decoding anything.
 *
 * WHAT IT EMITS. Two representations, because the two formats embed images differently:
 *   - `LOGO_RGB` — the logo flattened onto white (its transparent ground, and the colour
 *     it sits on in the running header) and halved, as raw RGB samples. The PDF image
 *     XObject carries these uncompressed, so smaller is lighter; half size is ~280px wide,
 *     which is still crisp at the ~1in the header draws it.
 *   - `LOGO_PNG_BASE64` — the original PNG bytes, for the Word document's media part, which
 *     Word composites (transparency and all) itself.
 *
 * Run it with `node scripts/build-logo.mjs` after the source logo changes; it rewrites
 * logo.ts in place and prints a one-line summary.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "public", "lofty_logo_orange.png");
const OUT = join(HERE, "..", "src", "data", "export", "logo.ts");

/** Parse a PNG into { width, height, colorType, idat } — only what this one image needs. */
function readPng(bytes) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error("not a PNG");
  let at = 8;
  let ihdr = null;
  const idatParts = [];
  while (at < bytes.length) {
    const len = bytes.readUInt32BE(at);
    const type = bytes.toString("latin1", at + 4, at + 8);
    const data = bytes.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9]
      };
    } else if (type === "IDAT") {
      idatParts.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    at += 12 + len; // length + type + data + CRC
  }
  if (!ihdr) throw new Error("no IHDR");
  if (ihdr.bitDepth !== 8 || (ihdr.colorType !== 6 && ihdr.colorType !== 2)) {
    throw new Error(`unsupported PNG: bitDepth ${ihdr.bitDepth}, colorType ${ihdr.colorType} (want 8-bit RGB or RGBA)`);
  }
  return { ...ihdr, idat: Buffer.concat(idatParts) };
}

/** Undo PNG scanline filters (None/Sub/Up/Average/Paeth) — the standard reconstruction. */
function unfilter(raw, width, height, channels) {
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    for (let x = 0; x < stride; x++) {
      const value = raw[src++];
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let recon;
      switch (filter) {
        case 0: recon = value; break;
        case 1: recon = value + a; break;
        case 2: recon = value + b; break;
        case 3: recon = value + ((a + b) >> 1); break;
        case 4: recon = value + paeth(a, b, c); break;
        default: throw new Error(`bad filter ${filter} on row ${y}`);
      }
      out[y * stride + x] = recon & 0xff;
    }
  }
  return out;
}

const png = readFileSync(SRC);
const { width, height, colorType } = readPng(png);
const channels = colorType === 6 ? 4 : 3;
const pixels = unfilter(inflateSync(readPng(png).idat), width, height, channels);

// Composite onto white and halve with a 2×2 box average, in one pass.
const ow = width >> 1;
const oh = height >> 1;
const rgb = Buffer.alloc(ow * oh * 3);
const onWhite = (v, a) => Math.round((v * a) / 255 + 255 * (1 - a / 255));
for (let y = 0; y < oh; y++) {
  for (let x = 0; x < ow; x++) {
    let rs = 0, gs = 0, bs = 0;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const o = ((y * 2 + dy) * width + (x * 2 + dx)) * channels;
        const a = channels === 4 ? pixels[o + 3] : 255;
        rs += onWhite(pixels[o], a);
        gs += onWhite(pixels[o + 1], a);
        bs += onWhite(pixels[o + 2], a);
      }
    }
    const p = (y * ow + x) * 3;
    rgb[p] = rs >> 2;
    rgb[p + 1] = gs >> 2;
    rgb[p + 2] = bs >> 2;
  }
}

const module = `/**
 * The Lofty wordmark, prepared for both document writers — the same
 * \`public/lofty_logo_orange.png\` the app ships, decoded so neither writer needs a PNG
 * decoder or an image library at runtime.
 *
 * GENERATED by \`node scripts/build-logo.mjs\` — do not edit the base64 by hand; a logo one
 * byte short is a file every reader calls corrupt. Two representations, because the two
 * formats embed images differently: \`LOGO_RGB\` is the logo flattened onto white and halved
 * to raw samples for the PDF's uncompressed image XObject; \`LOGO_PNG_BASE64\` is the
 * original PNG for the Word document's media part, which Word composites itself.
 */

/** Flattened-on-white RGB samples for the PDF image XObject — row-major, 3 bytes per px. */
export const LOGO_RGB = { width: ${ow}, height: ${oh}, base64: "${rgb.toString("base64")}" };

/** The original PNG bytes for the Word document's media part (${width}×${height}). */
export const LOGO_PNG_BASE64 = "${png.toString("base64")}";

/** The logo's aspect ratio (width / height), for sizing it in either document. */
export const LOGO_ASPECT = ${Math.round((width / height) * 10000) / 10000};
`;

writeFileSync(OUT, module);
console.log(`logo.ts: ${width}×${height} PNG → ${ow}×${oh} RGB (${rgb.length} bytes), module ${module.length} chars`);
