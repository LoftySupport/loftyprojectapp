// docx.js — report model to a Word .docx document, via the `docx` package.
// Runs in the browser and returns a Blob suitable for a direct download.
//
// Only covers the block types with natural Word equivalents. `sketch` (SVG) is
// skipped; `richText` is stripped to plain text. Colours come from the style
// preset derived from the shared theme, so a .docx cannot come out in
// different colours from the document its author approved on screen.

import { cellText, stripHtml } from './blocks.js';
import { resolveTheme, hexForDocx, logoForSurface } from './theme.js';
import {
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  PageOrientation,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

// Page sizes in twips (1/20 pt), portrait dimensions — swapped for landscape.
const DOCX_PAGE_SIZES = {
  a4: { width: 11906, height: 16838 },
  letter: { width: 12240, height: 15840 },
};

// Word wants one font family name, not a CSS stack.
const firstFamily = (stack, fallback = 'Calibri') => {
  const first = String(stack || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
  return first || fallback;
};

/**
 * Turn a theme into the values the Word writer needs. This is the whole of the
 * .docx look: there is no second palette to keep in step.
 */
export function docxPresetFromTheme(theme) {
  const t = resolveTheme(theme);
  const ink = hexForDocx(t.colors.ink, '021012');
  const line = hexForDocx(t.colors.line, 'C9CACB');
  const style = t.header?.style || 'rule';
  const minimal = style === 'minimal';
  // See the note in ReportDocument.jsx: `house` is Lofty's, and it is the brand kit's
  // Level 2 rule — 2pt (16 eighths, which is what Word counts in) in the accent.
  const house = style === 'house';
  return {
    theme: t,
    ink,
    muted: hexForDocx(t.colors.muted, '898A8D'),
    heading: hexForDocx(t.colors.heading, ink),
    line,
    font: firstFamily(t.fonts?.body),
    headingFont: firstFamily(t.fonts?.heading, firstFamily(t.fonts?.body)),
    titleBorder: { style: BorderStyle.SINGLE, size: minimal ? 4 : 12, color: minimal ? line : ink },
    sectionBorder: minimal
      ? null
      : house
        ? { style: BorderStyle.SINGLE, size: 16, color: hexForDocx(t.colors.accent, line) }
        : { style: BorderStyle.SINGLE, size: 4, color: line },
    tableHeadFill: hexForDocx(t.colors.surfaceAlt, 'F9F7F2'),
  };
}



// ─── Block → docx elements ────────────────────────────────────────────

function para(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text: String(text ?? ''), ...opts })],
  });
}

function heading1(text) {
  return new Paragraph({
    text: String(text ?? ''),
    heading: HeadingLevel.HEADING_1,
  });
}

function heading2(text) {
  return new Paragraph({
    text: String(text ?? ''),
    heading: HeadingLevel.HEADING_2,
  });
}

function heading3(text) {
  return new Paragraph({
    text: String(text ?? ''),
    heading: HeadingLevel.HEADING_3,
  });
}

function keyValuesBlock(items) {
  return (items || []).flatMap(i => [
    new Paragraph({
      children: [
        new TextRun({ text: `${i.label}: `, bold: true }),
        new TextRun({ text: String(i.value ?? '') }),
      ],
    }),
  ]);
}

function listBlock(items, ordered = false) {
  // Word's real numbering needs a numbering definition on the document, which this
  // writer deliberately does not carry — so an ordered list is numbered in the text.
  // It prints identically and survives a copy-paste out of Word, which the automatic
  // kind does not always do.
  return (items || []).map((item, n) =>
    new Paragraph({
      ...(ordered ? {} : { bullet: { level: 0 } }),
      ...(ordered ? { indent: { left: 360 } } : {}),
      children: [new TextRun({ text: ordered ? `${n + 1}. ${String(item ?? '')}` : String(item ?? '') })],
    })
  );
}

function calloutBlock(b) {
  return [new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: b.tone === 'danger' ? 'FEE2E2' : b.tone === 'warn' ? 'FEF3C7' : 'F0F9FF' },
    children: [
      new TextRun({ text: b.tone === 'danger' || b.tone === 'warn' ? 'Note: ' : 'Info: ', bold: true }),
      new TextRun({ text: String(b.text ?? '') }),
    ],
  })];
}

function tableBlock(b, preset) {
  const numCols = (b.headers || []).length;
  if (!numCols) return [];
  const headerRow = new TableRow({
    tableHeader: true,
    children: (b.headers || []).map(h =>
      new TableCell({
        shading: { type: ShadingType.CLEAR, fill: preset.tableHeadFill },
        children: [new Paragraph({
          children: [new TextRun({ text: String(cellText(h) ?? ''), bold: true, color: preset.ink })],
        })],
        width: { size: Math.floor(9000 / numCols), type: WidthType.DXA },
      })
    ),
  });
  const dataRows = (b.rows || []).map((row, ri) =>
    new TableRow({
      children: (b.headers || []).map((_, ci) =>
        new TableCell({
          shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: 'F3F4F6' } : undefined,
          children: [new Paragraph({
            children: [new TextRun({ text: String(cellText(row[ci]) ?? '') })],
          })],
          width: { size: Math.floor(9000 / numCols), type: WidthType.DXA },
        })
      ),
    })
  );
  return [new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows: [headerRow, ...dataRows],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
      insideH: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
      insideV: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
    },
  }), new Paragraph('')];
}

function flowBlock(b) {
  const stageNames = (b.stages || []).map(s => s.name).join(' → ');
  return [new Paragraph({
    children: [
      b.name ? new TextRun({ text: `${b.name}: `, bold: true }) : null,
      new TextRun({ text: stageNames }),
    ].filter(Boolean),
  })];
}

function boardBlock(b) {
  const elements = [];
  if (b.caption) elements.push(para(b.caption, { italics: true }));
  for (const col of b.columns || []) {
    elements.push(heading3(col.title));
    for (const card of col.cards || []) {
      const sub = card.sub ? ` — ${card.sub}` : '';
      const chip = card.chip?.text ? ` [${card.chip.text}]` : '';
      elements.push(new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: `${card.title}${chip}${sub}` })],
      }));
    }
  }
  return elements;
}

function hyperlinkParagraph(text, url, opts = {}) {
  return new Paragraph({
    children: [new ExternalHyperlink({
      link: url,
      children: [new TextRun({ text: String(text || url || ''), color: '0B4650', underline: {}, bold: !!opts.bold })],
    })],
  });
}

function chartBlock(b) {
  const elements = [];
  if (b.caption) elements.push(para(b.caption, { italics: true }));
  const total = (b.series || []).reduce((s, x) => s + x.value, 0) || 1;
  for (const s of b.series || []) {
    const pct = b.chartType === 'pie' ? ` (${Math.round((s.value / total) * 100)}%)` : '';
    elements.push(new Paragraph({
      bullet: { level: 0 },
      children: [
        new TextRun({ text: `${s.label}: `, bold: true }),
        new TextRun({ text: `${b.unit || ''}${s.value.toLocaleString()}${pct}` }),
      ],
    }));
  }
  return elements;
}

function blockToDocx(b, preset) {
  switch (b.type) {
    case 'paragraph':   return [para(b.text)];
    case 'subheading':  return [heading3(b.text)];
    case 'keyValues':   return keyValuesBlock(b.items);
    case 'list':        return listBlock(b.items, b.ordered);
    case 'callout':     return calloutBlock(b);
    case 'table':       return tableBlock(b, preset);
    case 'richText':    return [para(stripHtml(b.html))];
    case 'divider':     return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: preset.muted } } })];
    case 'flow': return flowBlock(b);
    case 'board':       return boardBlock(b);
    case 'image':       return b.caption ? [para(`[Image: ${b.caption}]`, { italics: true })] : [];
    case 'sketch': return b.caption ? [para(`[Diagram: ${b.caption} — see PDF version]`, { italics: true })] : [];
    case 'chart':        return chartBlock(b);
    case 'button':        return b.url ? [hyperlinkParagraph(b.text || b.url, b.url, { bold: true })] : [];
    case 'embed':         return b.url ? [para('Embedded content:', { italics: true }), hyperlinkParagraph(b.url, b.url)] : [];
    default:            return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Read an image into the bytes Word needs.
 *
 * Handles a data URI directly, and fetches an http(s) URL. SVG is deliberately
 * NOT supported: Word cannot embed it, and silently producing a broken image
 * is worse than leaving the logo out. Supply a PNG for the Word export if your
 * brand's artwork is SVG.
 */
async function imageBytes(src) {
  const url = String(src || '');
  const typeOf = (mime) => {
    if (/png/i.test(mime)) return 'png';
    if (/jpe?g/i.test(mime)) return 'jpg';
    if (/gif/i.test(mime)) return 'gif';
    return null;
  };

  if (url.startsWith('data:')) {
    const m = /^data:([^;,]+)[^,]*,(.*)$/s.exec(url);
    if (!m) return null;
    const type = typeOf(m[1]);
    if (!type) return null;
    const binary = atob(m[2]);
    const data = Uint8Array.from(binary, c => c.charCodeAt(0));
    return { data, type };
  }

  if (/^https?:/i.test(url) || url.startsWith('/')) {
    if (/\.svg(\?|$)/i.test(url)) return null; // Word cannot embed SVG
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = typeOf(res.headers.get('content-type') || url);
    if (!type) return null;
    return { data: new Uint8Array(await res.arrayBuffer()), type };
  }
  return null;
}

/**
 * Render a report model as a Word document.
 *
 * @param {object} report
 * @param {object} [options]
 * @param {'portrait'|'landscape'} [options.orientation]
 * @param {'a4'|'letter'} [options.pageSize]
 * @param {string|object} [options.theme]     the shared theme
 * @param {string} [options.styleKey]         legacy alias for theme
 * @param {string} [options.branding]         footer text and document author
 * @returns {Promise<Blob>}
 */
export async function reportToDocxBlob(report, {
  orientation = 'portrait', pageSize = 'a4', theme = null, styleKey = null, branding = '',
} = {}) {
  const preset = docxPresetFromTheme(theme || styleKey);

  const children = [];

  // The logo, when the theme carries one and it can be turned into bytes.
  // Word embeds images rather than linking them, so a logo that cannot be
  // fetched is skipped: a report missing its logo still opens, whereas one
  // that throws mid-export gives the author nothing at all.
  const logo = logoForSurface(preset.theme, 'light');
  if (logo) {
    try {
      const bytes = await imageBytes(logo.src);
      if (bytes) {
        children.push(new Paragraph({
          children: [new ImageRun({
            data: bytes.data,
            type: bytes.type,
            transformation: { width: Math.round(logo.height * (bytes.ratio || 3)), height: logo.height },
          })],
          spacing: { after: 200 },
        }));
      }
    } catch (e) {
      console.warn('Report logo could not be embedded in the .docx:', e?.message || e);
    }
  }

  children.push(
    heading1(report.title || 'Report'),
    ...(report.subtitle ? [para(report.subtitle, { italics: true, color: preset.muted })] : []),
    new Paragraph(''),
  );

  for (const section of report.sections || []) {
    if (section.title) children.push(heading2(section.title));
    for (const b of section.blocks || []) {
      children.push(...blockToDocx(b, preset));
    }
    children.push(new Paragraph(''));
  }

  const meta = report.meta || {};
  const date = meta.generatedAt ? String(meta.generatedAt).slice(0, 10) : '';
  children.push(
    new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 4, color: preset.muted } } }),
    para([`Generated ${date}`, branding].filter(Boolean).join(' · '), { color: preset.muted, size: 18 })
  );

  const isLandscape = orientation === 'landscape';
  const base = DOCX_PAGE_SIZES[pageSize] || DOCX_PAGE_SIZES.a4;
  const pageDims = isLandscape ? { width: base.height, height: base.width } : base;

  const doc = new Document({
    creator: branding || 'Report builder',
    description: report.subtitle || report.title || 'Report',
    title: report.title || 'Report',
    sections: [{
      properties: {
        page: {
          size: { ...pageDims, orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
        },
      },
      children,
    }],
    styles: {
      default: {
        document: {
          run: { font: preset.font, size: 22 },
          paragraph: { spacing: { after: 120 } },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: preset.headingFont, size: 44, bold: true, color: preset.ink },
          paragraph: {
            spacing: { after: 240 },
            ...(preset.titleBorder ? { border: { bottom: preset.titleBorder } } : {}),
          },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: preset.headingFont, size: 32, bold: true, color: preset.heading },
          paragraph: {
            spacing: { before: 360, after: 160 },
            ...(preset.sectionBorder ? { border: { bottom: preset.sectionBorder } } : {}),
          },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: preset.headingFont, size: 24, bold: true, color: preset.heading },
          paragraph: { spacing: { before: 240, after: 80 } },
        },
      ],
    },
  });

  return Packer.toBlob(doc);
}
