#!/usr/bin/env node
/**
 * Turn Montserrat into `src/data/export/montserrat.ts` — the typeface the PDF writer
 * embeds and measures with, cut down to the characters it can actually write.
 *
 * WHY MONTSERRAT, AND WHY EMBEDDED. Until 9 September the exports set Helvetica, one of
 * the fourteen faces every PDF viewer supplies, so the files carried no font programme and
 * weighed a few kilobytes. Amber's decision that day: *"exported documents in Montserrat
 * unless it has fonts embedded in it for print then it will be brand font"* — the brand's
 * own print substitute for Fieldwork, and the face every Lofty title already uses on
 * screen. Montserrat is not one of the fourteen, so a PDF that names it has to carry it,
 * which is what this script prepares: a subset small enough to ship in the bundle and
 * write into every download.
 *
 * WHY A BUILD STEP. The PDF writer measures every cell before it draws — that is how a
 * column is sized and a long address truncated to fit — so it needs the advance width of
 * every glyph it can emit, in 1/1000 em, indexed by WinAnsi code. Reading those out of a
 * TrueType file at runtime means a font parser in the bundle; reading them here, once,
 * means a table of 224 integers. The subset is made here for the same reason: the full
 * Regular is 180 kB and 1,527 glyphs, of which the writer can address 218 — WinAnsi is
 * the whole of its alphabet, because `typeface.ts` encodes one byte per character.
 *
 * WHAT IT EMITS. For Regular (400) and SemiBold (600): the subset TrueType as base64, the
 * width table, and the descriptor numbers the PDF's FontDescriptor wants (ascent, descent,
 * cap height, bounding box). SemiBold rather than Bold because 600 is the title weight the
 * design system uses everywhere, and the weight Fieldwork Demibold — the face Montserrat
 * stands in for — actually has.
 *
 * HOW TO RUN. `node scripts/build-montserrat.mjs` fetches the two faces from Google Fonts
 * (Montserrat is under the SIL Open Font License, which permits both embedding and
 * redistribution) and rewrites montserrat.ts in place. Pass two file paths to build from
 * local copies instead. Either way it prints what it kept and what it dropped.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";
import * as fontkit from "fontkit";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "src", "data", "export", "montserrat.ts");

const FACES = [
  { key: "REGULAR", weight: 400, psName: "Montserrat-Regular" },
  { key: "SEMIBOLD", weight: 600, psName: "Montserrat-SemiBold" }
];

/**
 * WinAnsi (PDF's name for CP1252), code → Unicode, for 0x20–0xFF. The five holes in
 * 0x80–0x9F are what CP1252 leaves undefined; DEL is not a character. Two codes take the
 * glyph a viewer will actually draw for them rather than their own: PDF's WinAnsiEncoding
 * maps 0xA0 to `space` and 0xAD to `hyphen`, so the width the layout reserves for a
 * no-break space or a soft hyphen must be the width of the glyph that gets drawn.
 */
const HIGH = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020,
  0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152,
  0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178
};
function unicodeFor(code) {
  if (code === 0x7f) return null;
  if (code < 0x80) return code;
  if (code < 0xa0) return HIGH[code] ?? null;
  if (code === 0xa0) return 0x20;
  if (code === 0xad) return 0x2d;
  return code;
}
const CODES = Array.from({ length: 224 }, (_v, i) => i + 32);
const REPERTOIRE = [...new Set(CODES.map(unicodeFor).filter(u => u !== null))];

/** The TTF URL Google Fonts serves for one weight, asked for as a browser without woff2. */
async function fetchFace(weight) {
  const css = await (
    await fetch(`https://fonts.googleapis.com/css2?family=Montserrat:wght@${weight}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" }
    })
  ).text();
  const m = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/.exec(css);
  if (!m) throw new Error(`no TrueType URL in the Google Fonts CSS for weight ${weight}`);
  return Buffer.from(await (await fetch(m[1])).arrayBuffer());
}

async function build(face, bytes) {
  const full = fontkit.create(bytes);
  if (!/^Montserrat/.test(full.postscriptName)) {
    throw new Error(`${face.psName}: expected Montserrat, got ${full.postscriptName}`);
  }
  const text = REPERTOIRE.map(u => String.fromCodePoint(u)).join("");
  const subset = await subsetFont(bytes, text, { targetFormat: "truetype" });
  const font = fontkit.create(subset);
  const scale = 1000 / font.unitsPerEm;
  const missing = [];
  const widths = CODES.map(code => {
    const u = unicodeFor(code);
    if (u === null) return 0;
    if (!font.hasGlyphForCodePoint(u)) {
      missing.push(`U+${u.toString(16).toUpperCase().padStart(4, "0")}`);
      return 0;
    }
    return Math.round(font.glyphForCodePoint(u).advanceWidth * scale);
  });
  const r = n => Math.round(n * scale);
  return {
    ...face,
    fullGlyphs: full.numGlyphs,
    fullBytes: bytes.length,
    glyphs: font.numGlyphs,
    bytes: subset.length,
    base64: Buffer.from(subset).toString("base64"),
    widths,
    missing,
    ascent: r(font.ascent),
    descent: r(font.descent),
    capHeight: r(font.capHeight),
    xHeight: r(font.xHeight),
    bbox: [r(font.bbox.minX), r(font.bbox.minY), r(font.bbox.maxX), r(font.bbox.maxY)]
  };
}

function rows(nums, per = 18) {
  const out = [];
  for (let i = 0; i < nums.length; i += per) out.push("  " + nums.slice(i, i + per).join(", "));
  return out.join(",\n");
}

function emit(faces) {
  const face = f => `/**
 * Montserrat ${f.weight === 400 ? "Regular" : "SemiBold"} — ${f.glyphs} glyphs of the full face's ${f.fullGlyphs}, ${(f.bytes / 1024).toFixed(1)} kB of ${(f.fullBytes / 1024).toFixed(0)}.
 */
export const ${f.key}: EmbeddedFace = {
  name: "${f.psName}",
  ascent: ${f.ascent},
  descent: ${f.descent},
  capHeight: ${f.capHeight},
  xHeight: ${f.xHeight},
  bbox: [${f.bbox.join(", ")}],
  /** Advance widths by WinAnsi code from 32, in 1/1000 em. A zero is a code with no glyph. */
  widths: [
${rows(f.widths)}
  ],
  base64:
    "${f.base64}"
};
`;
  return `/**
 * GENERATED by \`node scripts/build-montserrat.mjs\` — do not edit; edit the script.
 *
 * Montserrat, subset to the WinAnsi repertoire and measured, for the PDF writer. The
 * script's header says why Montserrat and why a subset; \`typeface.ts\` is what reads the
 * width tables, and \`pdf.ts\` is what embeds the bytes.
 *
 * Montserrat is © The Montserrat Project Authors, under the SIL Open Font License 1.1 —
 * embedding in documents and redistribution are both permitted; the Reserved Font Name is
 * kept.
 */

export interface EmbeddedFace {
  /** The PostScript name — what the PDF's /BaseFont and /FontName say. */
  name: string;
  ascent: number;
  descent: number;
  capHeight: number;
  xHeight: number;
  /** [xMin, yMin, xMax, yMax] in 1/1000 em. */
  bbox: [number, number, number, number];
  widths: number[];
  /** The subset TrueType programme, standard base64 without line breaks. */
  base64: string;
}

${faces.map(face).join("\n")}`;
}

const [regularPath, semiboldPath] = process.argv.slice(2);
const sources = regularPath && semiboldPath
  ? [readFileSync(regularPath), readFileSync(semiboldPath)]
  : await Promise.all(FACES.map(f => fetchFace(f.weight)));

const built = [];
for (let i = 0; i < FACES.length; i++) built.push(await build(FACES[i], sources[i]));
writeFileSync(OUT, emit(built));

for (const f of built) {
  console.log(
    `${f.psName}: ${f.glyphs} glyphs (${f.fullGlyphs} in the full face), ${(f.bytes / 1024).toFixed(1)} kB` +
      ` (${(f.fullBytes / 1024).toFixed(0)} kB full)` +
      (f.missing.length ? ` — no glyph for ${f.missing.join(" ")}` : " — every WinAnsi character has a glyph")
  );
}
console.log(`wrote ${OUT}`);
