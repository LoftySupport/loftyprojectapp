// ReportDocument.jsx — renders a report model as a printable document, plus
// the full-screen overlay that carries the export actions.
//
// One block renderer serves every surface: the builder's live preview, the
// document overlay, a public share page, print and PDF. That is deliberate.
// A second renderer would drift, and an author would discover the difference
// only after sending the report to a client.
//
// Portable: this file knows the block types in core/blocks.js and nothing about
// any application's domain. Anything domain-shaped (an accent colour, a
// diagram's geometry) arrives inside the block itself.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { reportToMarkdown } from '../core/markdown.js';
import { watermarkBackground, watermarkLayerCss } from '../core/watermark.js';
import { reportToHtml } from '../core/html.js';
import QRCode from 'react-qr-code';
import { QR_LEVEL, QR_QUIET_ZONE, qrMatrix } from '../core/qr.js';
import { sanitizeHtml } from './RichTextEditor.jsx';

/** On-screen sizes for a QR block, in px. Print and Word use the same three. */
const QR_SIZES = { small: 90, medium: 140, large: 200 };
import {
  BUILT_IN_THEMES, DEFAULT_THEME_KEY, resolveTheme, themeToCssVars, logoForSurface, isDarkColour,
} from '../core/theme.js';

// Status-chip tones — same colour families as the editor's Tools table
// (TOOL_STATUS_COLOURS), inline hex so they survive printing.
const CHIP_TONES = {
  green:  { bg: '#dcfce7', text: '#15803d' },
  amber:  { bg: '#fef3c7', text: '#b45309' },
  blue:   { bg: '#dbeafe', text: '#1d4ed8' },
  orange: { bg: '#ffedd5', text: '#c2410c' },
  red:    { bg: '#fee2e2', text: '#dc2626' },
  grey:   { bg: '#f4f4f5', text: '#4b4c4e' },
};

function Chip({ text, tone }) {
  const t = CHIP_TONES[tone] || CHIP_TONES.grey;
  return (
    <span
      className="inline-block text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap align-middle"
      style={{ background: t.bg, color: t.text, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    >
      {text}
    </span>
  );
}

// Interaction hooks for blocks rendered inside the report builder: onRepick
// makes stale-reference callouts clickable (select the block + open settings).
// Null everywhere else (document overlay, share preview) — callouts render plain.
const ReportInteractCtx = React.createContext({ onRepick: null });

// ─── Style presets ───────────────────────────────────────────────────
// A small set of visual treatments for the same report model. Threaded via
// context so the block renderer stays prop-free at call sites.

// Presentation derived from the theme. A theme states colours, fonts and a
// header treatment; these turn that into the handful of classes the document
// needs. Colours themselves travel as CSS custom properties (themeToCssVars),
// which is what stopped this file accumulating thirty-five hard-coded hexes.
export function themePresentation(theme) {
  const t = resolveTheme(theme);
  const header = t.header?.style || 'rule';
  return {
    theme: t,
    titleRule: header === 'minimal' ? 'border-b border-[var(--rb-line)]'
      : header === 'band' ? ''
      : 'border-b-2 border-[var(--rb-ink)]',
    // `house` is an integration addition, not the module's: Lofty's document template
    // puts a 2pt accent rule under every section heading (the brand kit calls it Level
    // 2), and the app's own PDF and Word writers have drawn it that way since 0026.
    // Scoped to the style rather than applied to every theme, so the module's own four
    // still look the way the module intends. Note the HTML serialiser already draws a
    // 2px accent rule here for EVERY theme — that disagreement is the module's and is
    // left alone; under `house` all three now agree.
    sectionRule: header === 'minimal' ? ''
      : header === 'house' ? 'border-b-2 border-[var(--rb-accent)]'
      : 'border-b border-[var(--rb-line)]',
    tableHeadBg: 'bg-[var(--rb-surface-alt)]',
    band: header === 'band',
  };
}

// Kept so a caller written against the pre-theme releases still works: those
// took a styleKey of 'brand' | 'minimal' | 'serif'. resolveTheme maps the old
// names onto the new themes.
export const REPORT_STYLES = BUILT_IN_THEMES;

const ReportStyleCtx = React.createContext(themePresentation(DEFAULT_THEME_KEY));

// ─── Block renderers ─────────────────────────────────────────────────

// ─── Canvas sketch (pure SVG mirroring the board's stored styling) ───

// Perceived-dark check so lane labels stay readable on custom fills —
// mirrors isDarkColour in the editor.
const sketchIsDark = (hex) => {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
};

// Editor colour constants mirrored for the sketch: pain badge ramp
// (PM_PAIN_COLOURS) and tool-node status borders (TC_STATUS_COLOURS).
const SKETCH_PAIN_COLOURS = { low: '#898A8D', medium: '#ffb59f', high: '#b3261e' };
const SKETCH_TOOL_STATUS = { active: '#16a34a', considering: '#f59e0b', cancelled: '#b3261e', to_cancel: '#ea580c', alternatives_considered: '#2563eb' };

// Sketch node visual treatment per node kind (canvasSketch blocks) — defaults
// match the editor's node renderers (PmStepNode & friends), with the node's
// own style controls (fill / borderColor / borderWidth / borderDashed /
// textColor) taking precedence when set.
function sketchNodeVisual(n) {
  const bw = typeof n.borderWidth === 'number' ? n.borderWidth : null;
  const dash = n.borderDashed ? '6 4' : null;
  const custom = (fallbackStroke, fallbackWidth = 1.5) => ({
    stroke: (bw === 0) ? 'none' : (n.borderColor || fallbackStroke),
    strokeWidth: bw === 0 ? 0 : (bw ?? fallbackWidth),
    dash,
  });
  switch (n.kind) {
    case 'lane':
      return { lane: true };
    case 'group':
      return { dept: true };
    case 'startend': {
      const isEnd = n.subtype === 'end';
      return { fill: isEnd ? '#898A8D' : '#00393f', fillOpacity: 1, stroke: 'none', strokeWidth: 0, rx: n.h / 2, labelPos: 'center', labelColor: '#ffffff', bold: true };
    }
    case 'decision':
      return { fill: n.fill || '#ffffff', fillOpacity: 1, ...custom('#f59e0b', 2), rx: 6, labelPos: 'center', diamond: true };
    case 'note':
      return { fill: n.fill || '#fef9c3', fillOpacity: 1, ...custom('#d9c98f', 1), rx: 4, labelPos: 'center' };
    case 'text':
      return { fill: 'none', fillOpacity: 0, stroke: 'none', strokeWidth: 0, rx: 0, labelPos: 'center', labelColor: n.textColor || n.color || '#00393f' };
    case 'shape': {
      const shape = n.shape || 'rounded';
      return {
        fill: n.fill || '#ffffff', fillOpacity: 1, ...custom('rgba(0,0,0,0.25)', 1.5),
        rx: shape === 'rounded' ? 10 : 3,
        ellipse: shape === 'ellipse',
        diamond: shape === 'diamond',
        labelPos: 'center',
      };
    }
    case 'line':
      // Drawn as a line by the renderer, not a box — a decorative arrow shown
      // as a rectangle would read as a shape somebody forgot to label.
      return { line: true, stroke: n.borderColor || '#00393f', strokeWidth: bw ?? 2, dash, points: n.linePoints, ends: n.lineEnds };
    case 'image':
      return { fill: '#f5f5f4', fillOpacity: 1, stroke: '#d4d4d8', strokeWidth: 1.5, dash: '5 4', rx: 8, labelPos: 'center', image: true };
    case 'richtext':
      return { fill: n.fill || '#ffffff', fillOpacity: 1, ...custom('rgba(0,0,0,0.12)', 1.5), rx: 8, labelPos: 'center' };
    case 'erd': {
      // Keep the symbol family: entities/tables are boxes, Chen relationships
      // are diamonds, attributes are ovals. Drawing them all as rectangles
      // would turn an ER diagram into a different diagram.
      const k = n.erdKind || 'entity';
      const diamond = k === 'relationship' || k === 'identifyingRelationship';
      const ellipse = k === 'attribute' || k === 'keyAttribute' || k === 'multivaluedAttribute'
        || k === 'derivedAttribute' || k === 'compositeAttribute';
      return {
        fill: n.fill || '#ffffff', fillOpacity: 1,
        ...custom('rgba(0,0,0,0.45)', 1.5),
        dash: k === 'derivedAttribute' ? '6 4' : dash,
        rx: ellipse ? 0 : 3,
        ellipse, diamond,
        labelPos: 'center',
        bold: true,
      };
    }
    case 'tool':
      return { fill: '#ffffff', fillOpacity: 1, stroke: SKETCH_TOOL_STATUS[n.status] || '#d4d4d8', strokeWidth: 2, dash: null, rx: 8, labelPos: 'center' };
    case 'member':
      return { fill: '#ffffff', fillOpacity: 1, stroke: '#d4d4d8', strokeWidth: 1.5, dash: null, rx: 8, labelPos: 'center' };
    default: // step
      return { fill: n.fill || '#ffffff', fillOpacity: 1, ...custom('#d1d5db', 1.5), rx: 8, labelPos: 'center' };
  }
}

// Container nodes ('lane' and 'group'): a tinted body or a solid fill, a quiet
// border (dashed for a group), a left accent bar on a lane, and an uppercase
// label that flips to white on a dark fill.
function SketchContainer({ n, fs, truncate }) {
  const isDept = n.kind === 'group';
  const accent = n.color || '#898A8D';
  const solidFill = n.fill || null;
  const darkFill = solidFill && sketchIsDark(solidFill);
  return (
    <g>
      <rect
        x={n.x} y={n.y} width={n.w} height={n.h} rx={8}
        fill={solidFill || accent} fillOpacity={solidFill ? 1 : (isDept ? 0.06 : 0.07)}
      />
      <rect
        x={n.x} y={n.y} width={n.w} height={n.h} rx={8}
        fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="1"
        strokeDasharray={isDept ? '5 4' : undefined}
      />
      {!isDept && <rect x={n.x} y={n.y} width={8} height={n.h} rx={4} fill={accent} fillOpacity={solidFill ? 0.9 : 0.6} />}
      {n.label && (
        <text
          x={n.x + (isDept ? 12 : 18)} y={n.y + fs + 8}
          fontSize={fs * 0.85} fontWeight={700} letterSpacing="1"
          fill={darkFill ? 'rgba(255,255,255,0.92)' : '#00393f'} fillOpacity={darkFill ? 1 : 0.55}
          fontFamily="Mulish, ui-sans-serif, system-ui, sans-serif"
        >{truncate(n.label.toUpperCase(), n.w - 24)}</text>
      )}
    </g>
  );
}

function CanvasSketch({ block }) {
  const { viewBox, nodes, edges, caption } = block;
  const fs = Math.min(18, Math.max(12, viewBox.w / 70));
  const truncate = (label, w) => {
    const max = Math.max(4, Math.floor(w / (fs * 0.58)));
    return label.length > max ? `${label.slice(0, max - 1)}…` : label;
  };
  const badgeR = Math.max(6, fs * 0.45);
  return (
    <figure className="mb-4 break-inside-avoid-page">
      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className="w-full h-auto rounded-lg border border-[var(--rb-line)] bg-white"
        style={{ maxHeight: '480px' }}
        role="img"
        aria-label={caption || 'Canvas sketch'}
      >
        <defs>
          <marker id="sk-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#4b4c4e" />
          </marker>
        </defs>
        {nodes.map((n, i) => {
          const v = sketchNodeVisual(n);
          if (v.lane || v.dept) return <SketchContainer key={i} n={n} fs={fs} truncate={truncate} />;
          // A free line/arrow: endpoints are fractions of its rect, matching
          // PmLineNode, so the sketch keeps the angle the author drew.
          if (v.line) {
            const p = v.points || [0, 0.5, 1, 0.5];
            const lx1 = n.x + p[0] * n.w, ly1 = n.y + p[1] * n.h;
            const lx2 = n.x + p[2] * n.w, ly2 = n.y + p[3] * n.h;
            return (
              <line
                key={i}
                x1={lx1} y1={ly1} x2={lx2} y2={ly2}
                stroke={v.stroke} strokeWidth={v.strokeWidth} strokeLinecap="round"
                strokeDasharray={v.dash || undefined}
                markerEnd={v.ends?.end && v.ends.end !== 'none' ? 'url(#sk-arrow)' : undefined}
                markerStart={v.ends?.start && v.ends.start !== 'none' ? 'url(#sk-arrow)' : undefined}
              />
            );
          }
          const cx = n.x + n.w / 2;
          const cy = n.y + n.h / 2;
          return (
            <g key={i}>
              {v.diamond ? (
                <polygon
                  points={`${cx},${n.y} ${n.x + n.w},${cy} ${cx},${n.y + n.h} ${n.x},${cy}`}
                  fill={v.fill} fillOpacity={v.fillOpacity}
                  stroke={v.stroke} strokeWidth={v.strokeWidth} strokeDasharray={v.dash || undefined}
                />
              ) : v.ellipse ? (
                <ellipse
                  cx={cx} cy={cy} rx={n.w / 2} ry={n.h / 2}
                  fill={v.fill} fillOpacity={v.fillOpacity}
                  stroke={v.stroke} strokeWidth={v.strokeWidth} strokeDasharray={v.dash || undefined}
                />
              ) : v.fill !== 'none' || v.stroke !== 'none' ? (
                <rect
                  x={n.x} y={n.y} width={n.w} height={n.h} rx={v.rx}
                  fill={v.fill} fillOpacity={v.fillOpacity}
                  stroke={v.stroke} strokeWidth={v.strokeWidth} strokeDasharray={v.dash || undefined}
                />
              ) : null}
              {n.label && (
                <text
                  x={cx}
                  y={cy + fs * 0.35}
                  textAnchor="middle"
                  fontSize={fs}
                  fontWeight={n.bold || v.bold || n.kind === 'startend' ? 700 : 500}
                  fill={n.textColor || v.labelColor || '#00393f'}
                  fontFamily="Mulish, ui-sans-serif, system-ui, sans-serif"
                >{truncate(n.label, n.w - 12)}</text>
              )}
              {n.pain && (
                <g aria-label={`${n.pain} pain point`}>
                  <circle cx={n.x + n.w - 2} cy={n.y + 2} r={badgeR} fill={SKETCH_PAIN_COLOURS[n.pain] || SKETCH_PAIN_COLOURS.medium} />
                  <text
                    x={n.x + n.w - 2} y={n.y + 2 + badgeR * 0.55} textAnchor="middle"
                    fontSize={badgeR * 1.5} fontWeight={700} fill="#ffffff"
                    fontFamily="Mulish, ui-sans-serif, system-ui, sans-serif"
                  >!</text>
                </g>
              )}
            </g>
          );
        })}
        {edges.map((e, i) => (
          <g key={`e${i}`}>
            <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#4b4c4e" strokeWidth="1.5" markerEnd="url(#sk-arrow)" />
            {e.label && (
              <text x={(e.x1 + e.x2) / 2} y={(e.y1 + e.y2) / 2 - 4} textAnchor="middle" fontSize={fs * 0.85} fill="#4b4c4e" fontFamily="Mulish, ui-sans-serif, system-ui, sans-serif">{e.label}</text>
            )}
          </g>
        ))}
      </svg>
      {caption && <figcaption className="text-xs text-[var(--rb-muted)] mt-1">{caption}</figcaption>}
    </figure>
  );
}

// ─── Chart (pure SVG bar / pie — no external charting library, so it survives
// print/PDF exactly like canvasSketch) ─────────────────────────────────────

function polarPoint(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function pieSlicePath(cx, cy, r, startAngle, endAngle) {
  const start = polarPoint(cx, cy, r, endAngle);
  const end = polarPoint(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

function BarChart({ series, unit }) {
  const rowH = 30;
  const barH = 16;
  const labelW = 150;
  const valueW = 70;
  const chartW = 420;
  const w = labelW + chartW + valueW;
  const h = series.length * rowH + 8;
  const max = Math.max(...series.map(s => s.value), 1);
  const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Bar chart">
      {series.map((s, i) => {
        const y = i * rowH + 4;
        const barW = Math.max(2, (s.value / max) * chartW);
        return (
          <g key={i}>
            <text x={labelW - 8} y={y + barH * 0.72} textAnchor="end" fontSize={11} fontWeight={600} fill="#00393f" fontFamily="Mulish, ui-sans-serif, system-ui, sans-serif">
              {truncate(s.label, 22)}
            </text>
            <rect x={labelW} y={y} width={chartW} height={barH} rx={4} fill="#f5f6f8" />
            <rect x={labelW} y={y} width={barW} height={barH} rx={4} fill={s.color || '#005058'} style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }} />
            <text x={labelW + barW + 6} y={y + barH * 0.72} fontSize={11} fontWeight={700} fill="#00393f" fontFamily="Mulish, ui-sans-serif, system-ui, sans-serif">
              {unit || ''}{s.value.toLocaleString()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function PieChart({ series, unit }) {
  const total = series.reduce((s, x) => s + x.value, 0) || 1;
  const cx = 90, cy = 90, r = 78;
  let angle = 0;
  const slices = series.map(s => {
    const start = angle;
    const sweep = (s.value / total) * 360;
    angle += sweep;
    return { ...s, start, end: angle, pct: Math.round((s.value / total) * 100) };
  });
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 180 180" className="w-[180px] h-[180px] shrink-0" role="img" aria-label="Pie chart">
        {slices.map((s, i) => (
          <path
            key={i}
            d={pieSlicePath(cx, cy, r, s.start, s.end)}
            fill={s.color || '#005058'}
            stroke="#ffffff"
            strokeWidth={2}
            style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
          />
        ))}
      </svg>
      <ul className="text-xs space-y-1.5 min-w-[160px]">
        {slices.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color || '#005058', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }} aria-hidden="true" />
            <span className="text-[var(--rb-ink)] font-medium truncate">{s.label}</span>
            <span className="text-[var(--rb-muted)] ml-auto shrink-0">{unit || ''}{s.value.toLocaleString()} · {s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartBlock({ block }) {
  return (
    <figure className="mb-4 break-inside-avoid-page">
      {block.chartType === 'pie'
        ? <PieChart series={block.series} unit={block.unit} />
        : <BarChart series={block.series} unit={block.unit} />}
      {block.caption && <figcaption className="text-xs text-[var(--rb-muted)] mt-1.5">{block.caption}</figcaption>}
    </figure>
  );
}

function Block({ block }) {
  const style = React.useContext(ReportStyleCtx);
  const { onRepick } = React.useContext(ReportInteractCtx);
  switch (block.type) {
    case 'paragraph':
      return <p className="text-sm text-[var(--rb-ink)] leading-relaxed mb-3 whitespace-pre-wrap">{block.text}</p>;
    case 'subheading':
      return (
        <h3 className="text-sm font-bold text-[var(--rb-ink)] mt-5 mb-2 break-after-avoid-page">
          {block.color && <span className="w-2 h-2 rounded-full inline-block mr-1.5 align-baseline" style={{ background: block.color, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }} aria-hidden="true" />}
          {block.text}
        </h3>
      );
    case 'keyValues':
      return (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 mb-3 break-inside-avoid-page">
          {block.items.map((i, idx) => (
            <React.Fragment key={idx}>
              <dt className="text-xs font-semibold text-[var(--rb-muted)] uppercase tracking-wide pt-0.5">{i.label}</dt>
              <dd className="text-sm text-[var(--rb-ink)]">{i.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      );
    case 'list': {
      // INTEGRATION EDIT — `ordered` added for the table of contents block, where a
      // numbered list is what a contents page is. Absent it behaves exactly as before.
      const ListTag = block.ordered ? 'ol' : 'ul';
      return (
        <ListTag className={`${block.ordered ? 'list-decimal' : 'list-disc'} pl-5 mb-3 space-y-1`}>
          {block.items.map((i, idx) => <li key={idx} className="text-sm text-[var(--rb-ink)] leading-snug">{i}</li>)}
        </ListTag>
      );
    }
    case 'qr': {
      // INTEGRATION EDIT — the QR block (adapters/lofty/widgets.js).
      //
      // `react-qr-code` on screen, `core/qr.js` for Word and the HTML download. Both read
      // `qrcode-generator`, so it is one encoding drawn twice, not two encodings — see the
      // note at the top of core/qr.js.
      //
      // `level` is passed rather than left alone. The component's own default is 'L' and
      // ours is 'M'; letting it default would put a DIFFERENT code on screen from the one
      // in the exported document, and both would scan, so nothing would ever report it.
      //
      // The white padding is the quiet zone. `react-qr-code` draws the modules and stops
      // at their edge, and a QR butted up against a coloured background — a themed
      // section, a callout, a dark print — is a QR that phones refuse.
      //
      // Measured in MODULES, not pixels. A fixed 9px looked like a quiet zone and was
      // under two modules on a dense code and over six on a sparse one, because the
      // module size depends on how much text is in it. Encoding twice to find out how
      // many modules there are is the cost of getting it right, and it is a few hundred
      // microseconds on a string.
      const px = QR_SIZES[block.size] || QR_SIZES.medium;
      const modules = qrMatrix(block.text).size;
      const quiet = Math.ceil((px / modules) * QR_QUIET_ZONE);
      return (
        <figure className="mb-3">
          <div
            className="inline-block bg-white"
            style={{ padding: quiet }}
          >
            <QRCode
              value={block.text}
              level={QR_LEVEL}
              size={px}
              style={{ display: 'block', height: px, width: px }}
              title={block.caption || `QR code for ${block.text}`}
            />
          </div>
          {block.caption && (
            <figcaption className="text-xs text-[var(--rb-muted)] mt-1.5">{block.caption}</figcaption>
          )}
        </figure>
      );
    }
    case 'callout': {
      const tones = {
        danger: 'border-[#b3261e] bg-[#b3261e]/10',
        warn: 'border-[#ffb59f] bg-[#ffb59f]/10',
        info: 'border-[var(--rb-line)] bg-[var(--rb-surface-alt)]',
      };
      // Stale-reference warnings become clickable inside the builder — click
      // selects the block and opens its settings so the ref can be re-picked.
      const repickable = block.repick && onRepick;
      const label = block.repick ? ''
        : block.severity
          ? `${block.severity.charAt(0).toUpperCase() + block.severity.slice(1)} pain point: `
          : block.tone === 'warn' || block.tone === 'danger' ? 'Pain point: ' : 'Note: ';
      const inner = (
        <p className="text-sm text-[var(--rb-ink)]">
          {label && <span className="font-bold">{label}</span>}
          {block.text}
          {repickable && <span className="block text-xs font-bold mt-1 underline underline-offset-2">Open block settings →</span>}
        </p>
      );
      if (repickable) {
        return (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRepick(); }}
            className={`w-full text-left border-l-4 rounded-r px-3 py-2 mb-2 cursor-pointer hover:brightness-95 transition-[filter] ${tones[block.tone] || tones.info}`}
          >
            {inner}
          </button>
        );
      }
      return (
        <div className={`border-l-4 rounded-r px-3 py-2 mb-2 break-inside-avoid-page ${tones[block.tone] || tones.info}`}>
          {inner}
        </div>
      );
    }
    case 'image':
      return (
        <figure className="mb-4 break-inside-avoid-page">
          <img src={block.src} alt={block.caption || 'Canvas snapshot'} className="w-full rounded-lg border border-[var(--rb-line)]" />
          {block.caption && <figcaption className="text-xs text-[var(--rb-muted)] mt-1">{block.caption}</figcaption>}
        </figure>
      );
    case 'flow': {
      // Stage chips take the pipeline type's accent colour — the same
      // The chip accent travels on the block. An adapter that has a natural
      // colour for a flow (a pipeline type, a status) puts it there; without
      // one the chips fall back to the document ink.
      const accent = block.accent || { border: '#00393f' };
      return (
        <div className="mb-4 break-inside-avoid-page">
          {block.name && (
            <p className="text-xs font-semibold text-[var(--rb-muted)] uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: accent, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }} aria-hidden="true" />
              {block.name}
              {block.pipelineType && <span className="normal-case tracking-normal font-medium text-[var(--rb-muted)]">· {block.pipelineType}</span>}
            </p>
          )}
          <div className="flex items-center flex-wrap gap-y-2">
            {block.stages.map((s, i) => (
              <React.Fragment key={i}>
                <span
                  className="px-3 py-1.5 rounded-md border-2 text-xs font-semibold text-[var(--rb-ink)] bg-white whitespace-nowrap"
                  style={{ borderColor: accent, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
                >{s.name}</span>
                {i < block.stages.length - 1 && (
                  <svg width="18" height="12" viewBox="0 0 18 12" className="shrink-0 mx-0.5 text-[var(--rb-muted)]" aria-hidden="true">
                    <path d="M1 6h14M11 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      );
    }
    case 'sketch':
      return <CanvasSketch block={block} />;
    case 'chart':
      return <ChartBlock block={block} />;
    case 'button':
      return (
        <div className="mb-4 break-inside-avoid-page">
          <a
            href={block.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm font-bold px-4 py-2 rounded-lg bg-[var(--rb-ink)] text-[var(--rb-surface)] hover:bg-[var(--rb-heading)] transition-colors no-underline"
            style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
          >
            {block.text || block.url}
          </a>
        </div>
      );
    case 'embed':
      return (
        <figure className="mb-4 break-inside-avoid-page">
          <div className="print:hidden rounded-lg border border-[var(--rb-line)] overflow-hidden bg-[var(--rb-surface-alt)]" style={{ aspectRatio: '16 / 9' }}>
            <iframe
              src={block.url}
              title={block.caption || 'Embedded content'}
              className="w-full h-full"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            />
          </div>
          <p className="hidden print:block text-sm text-[var(--rb-ink)]">
            Embedded content: <a href={block.url} className="underline">{block.url}</a>
          </p>
          {block.caption && <figcaption className="text-xs text-[var(--rb-muted)] mt-1">{block.caption}</figcaption>}
        </figure>
      );
    case 'richText':
      // Custom-report text widget. Authored via RichTextEditor (sanitised on
      // input); sanitised again here so a stored payload can't inject markup.
      //
      // keepTokenMarks, because by this point fillTokens has run and the placeholders
      // carry rb-token / rb-token-blank / rb-token-unknown. Stripping `class` here — the
      // behaviour until 10 September — silently threw all three away, so a field nobody
      // had recorded printed as a bare em dash and a mistyped one as ordinary text.
      return (
        <div
          className="notes-editor text-sm text-[var(--rb-ink)] leading-relaxed mb-3 break-words"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.html || '', { keepTokenMarks: true }) }}
        />
      );
    case 'board': {
      // "Fit to page" (block.compact, set via the widget's settings panel)
      // narrows columns and wraps them on screen too — not just print — for
      // boards with more columns than a page can comfortably hold.
      const compact = !!block.compact;
      return (
        <figure className="mb-4">
          <div className={compact ? '' : 'overflow-x-auto print:overflow-visible'}>
            <div className={`flex gap-2 items-start pb-1 print:flex-wrap print:min-w-0 ${compact ? 'flex-wrap min-w-0' : 'min-w-max'}`}>
              {(block.columns || []).map((col, i) => (
                <div
                  key={i}
                  className={`${compact ? 'w-36' : 'w-52'} shrink-0 rounded-lg border border-[var(--rb-line)] bg-[var(--rb-surface-alt)] p-2 break-inside-avoid-page`}
                  // Column accent: department colour / status accent, like the
                  // editor's kanban boards.
                  style={col.color ? { borderTop: `3px solid ${col.color}`, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' } : undefined}
                >
                  <p className={`font-bold text-[var(--rb-ink)] mb-2 flex items-center gap-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>
                    {col.color && <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: col.color, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }} aria-hidden="true" />}
                    <span className="truncate">{col.title}</span>
                    <span className="text-[var(--rb-muted)] font-semibold">({(col.cards || []).length})</span>
                  </p>
                  <div className="space-y-1.5">
                    {(col.cards || []).map((card, j) => (
                      <div key={j} className={`bg-white border border-[var(--rb-line)] rounded-md ${compact ? 'px-1.5 py-1' : 'px-2 py-1.5'}`}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          {card.icon && <img src={card.icon} alt="" className="w-3.5 h-3.5 object-contain shrink-0" onError={e => { e.target.style.display = 'none'; }} />}
                          <p className={`font-semibold text-[var(--rb-ink)] leading-snug truncate flex-1 ${compact ? 'text-[10px]' : 'text-xs'}`}>{card.title}</p>
                          {!compact && card.chip && <Chip text={card.chip.text} tone={card.chip.tone} />}
                        </div>
                        {card.sub && !compact && <p className="text-[10px] text-[var(--rb-muted)] mt-0.5">{card.sub}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {block.caption && <figcaption className="text-xs text-[var(--rb-muted)] mt-1">{block.caption}</figcaption>}
        </figure>
      );
    }
    case 'divider':
      return block.pageBreak
        ? <div className="my-6 border-t border-dashed border-[var(--rb-line)] break-after-page print:border-0 print:my-0" aria-hidden="true" />
        : <hr className="my-6 border-t border-[var(--rb-line)]" />;
    case 'table': {
      // "Fit to page": smaller type + tighter padding + no forced min-width,
      // so a wide table shrinks to the page instead of scrolling/clipping.
      const compact = !!block.compact;
      return (
        <div className={compact ? 'mb-4' : 'overflow-x-auto mb-4 print:overflow-visible'}>
          <table className={`w-full border-collapse print:min-w-0 ${compact ? 'text-[10px] min-w-0' : `text-sm ${block.headers.length > 6 ? 'min-w-[860px]' : 'min-w-[560px]'}`}`}>
            <thead>
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i} className={`text-left font-bold text-[var(--rb-ink)] uppercase tracking-wide ${style.tableHeadBg} border border-[var(--rb-line)] ${compact ? 'text-[9px] px-1.5 py-1' : 'text-xs px-2.5 py-1.5'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, ri) => (
                <tr key={ri} className="break-inside-avoid">
                  {r.map((c, ci) => (
                    <td key={ci} className={`border border-[var(--rb-line)] text-[var(--rb-ink)] align-top whitespace-pre-wrap ${compact ? 'px-1.5 py-1' : 'px-2.5 py-1.5'}`}>
                      {c && typeof c === 'object' && c.chip ? <Chip text={c.text} tone={c.chip} /> : c && typeof c === 'object' ? c.text : c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    default:
      return null;
  }
}

// Renders a bare block list with a style preset — the custom report builder
// uses this to draw each widget's live preview through the exact renderer the
// final document uses. onRepick (builder only) makes stale-reference warning
// callouts clickable — click selects the block and opens its settings.
export function ReportBlocks({ blocks = [], theme = null, styleKey = null, onRepick = null }) {
  const style = useMemo(() => themePresentation(theme || styleKey || DEFAULT_THEME_KEY), [theme, styleKey]);
  const vars = useMemo(() => themeToCssVars(style.theme), [style.theme]);
  const interact = useMemo(() => ({ onRepick }), [onRepick]);
  return (
    <div style={{ ...vars, fontFamily: 'var(--rb-font-body)' }}>
    <ReportStyleCtx.Provider value={style}>
      <ReportInteractCtx.Provider value={interact}>
        {blocks.map((b, i) => <Block key={i} block={b} />)}
      </ReportInteractCtx.Provider>
    </ReportStyleCtx.Provider>
    </div>
  );
}

// The document itself — reusable in the editor overlay and the share preview.
// `wide` widens the column for landscape page setups so extra page width
// doesn't just sit as empty margin around a portrait-width column.
export function ReportDocument({ report, theme = null, styleKey = null, wide = false, branding = '' }) {
  const style = useMemo(() => themePresentation(theme || styleKey || DEFAULT_THEME_KEY), [theme, styleKey]);
  const t = style.theme;
  const vars = useMemo(() => themeToCssVars(t), [t]);

  // A banded header is drawn on the theme's inverse colour, so the logo has to
  // be the variant made for a dark surface. Deciding that from the colour
  // rather than from a flag means a theme only states its palette once.
  const onDark = style.band && isDarkColour(t.colors.inverse);
  const logo = logoForSurface(t, onDark ? 'dark' : 'light');

  const header = (
    <>
      {logo && (
        <img
          src={logo.src}
          alt={logo.alt || branding || ''}
          style={{ height: logo.height, width: 'auto', marginBottom: 14, objectFit: 'contain' }}
          // A missing logo must not leave a broken-image icon in a document
          // someone is about to send to a client.
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      )}
      <h1
        className="text-2xl leading-tight"
        style={{
          fontFamily: 'var(--rb-font-heading)',
          fontWeight: 'var(--rb-heading-weight)',
          color: onDark ? t.colors.onInverse : t.colors.ink,
        }}
      >{report.title}</h1>
      {report.subtitle && (
        <p className="text-sm mt-1" style={{ color: onDark ? t.colors.onInverse : t.colors.muted, opacity: onDark ? 0.75 : 1 }}>
          {report.subtitle}
        </p>
      )}
    </>
  );

  return (
    <ReportStyleCtx.Provider value={style}>
      <article
        className={`${wide ? 'max-w-5xl' : 'max-w-3xl'} mx-auto`}
        style={{ ...vars, fontFamily: 'var(--rb-font-body)', color: 'var(--rb-ink)', background: 'var(--rb-surface)' }}
      >
        {style.band ? (
          // The band bleeds to the edges of the page, so it sits outside the
          // body padding rather than inside it.
          <header
            className="px-6 py-6 mb-6"
            style={{ background: t.colors.inverse, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
          >{header}</header>
        ) : (
          <header className={`${style.titleRule} pb-4 mb-6 mx-6 mt-8`}>{header}</header>
        )}

        <div className="px-6 pb-8">
          {/* Long sections must be free to flow across pages. Page-break
              hygiene lives at the block level (tables, figures and boards
              avoid splitting) and headings keep with what follows, rather
              than forcing whole sections onto one page. */}
          {(report.sections || []).map(section => (
            <section key={section.id} className="mb-7">
              {/* A report can open with an untitled lead-in section. */}
              {section.title && (
                <h2
                  className={`text-lg mb-3 pb-1 break-after-avoid-page ${style.sectionRule}`}
                  style={{ fontFamily: 'var(--rb-font-heading)', fontWeight: 'var(--rb-heading-weight)', color: t.colors.heading }}
                >{section.title}</h2>
              )}
              {section.blocks.map((b, i) => <Block key={i} block={b} />)}
            </section>
          ))}
          <footer className="mt-10 pt-3 border-t border-[var(--rb-line)] text-xs text-[var(--rb-muted)]">
            {[`Generated ${String(report.meta?.generatedAt || '').slice(0, 10)}`, branding, report.meta?.preparedBy]
              .filter(Boolean).join(' · ')}
          </footer>
        </div>
      </article>
    </ReportStyleCtx.Provider>
  );
}

// ─── Full-screen overlay (editor entry point) ────────────────────────

// Page setup — drives the print/PDF @page rule, the docx export page size,
// and how wide the on-screen document renders (landscape gets a wider column
// so extra page width isn't wasted as margin).
export const PAGE_SIZES = {
  a4: { label: 'A4', cssName: 'A4' },
  letter: { label: 'Letter', cssName: 'letter' },
};

export function reportFilename(title) {
  const safe = String(title || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${safe || 'report'}.md`;
}

function downloadMarkdown(report, branding) {
  const md = reportToMarkdown(report, { branding });
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = reportFilename(report.title);
  a.click();
  URL.revokeObjectURL(url);
}

function downloadHtml(report, branding, theme, watermark) {
  const html = reportToHtml(report, { branding, theme, watermark });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = reportFilename(report.title).replace('.md', '.html');
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadDocx(report, setDocxState, docxOpts) {
  setDocxState('loading');
  try {
    // Imported here rather than at the top of the file, and that is a deliberate
    // integration change: `docx` is ~1.5 MB and every other export in this overlay
    // needs none of it. A static import puts it in the main bundle for everybody who
    // opens the app; this one puts it in a chunk fetched when somebody clicks Word.
    // The button already renders an "Export failed" state, so a chunk that cannot be
    // fetched reports itself rather than doing nothing.
    const { reportToDocxBlob } = await import('../core/docx.js');
    const blob = await reportToDocxBlob(report, docxOpts);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = reportFilename(report.title).replace('.md', '.docx');
    a.click();
    URL.revokeObjectURL(url);
    setDocxState('idle');
  } catch (e) {
    console.error('DOCX export failed', e);
    setDocxState('failed');
    setTimeout(() => setDocxState('idle'), 3000);
  }
}

async function copyMarkdown(report, setCopied, branding) {
  try {
    await navigator.clipboard.writeText(reportToMarkdown(report, { branding }));
    setCopied('copied');
  } catch {
    setCopied('failed');
  }
  setTimeout(() => setCopied(null), 2200);
}

export default function ReportOverlay({
  report, onClose, initialExcluded = [],
  initialPageSize = 'a4', initialOrientation = 'portrait', onPageChange = null,
  branding = '',
  // The themes this app offers, and which one this report uses. `themes`
  // defaults to the built-ins; a host app passes its own set (usually the
  // built-ins plus one built from its brand file).
  themes = BUILT_IN_THEMES, initialTheme = null, onThemeChange = null,
  // The word a document wears until it is published — 'DRAFT', or nothing (0104).
  // Threaded rather than derived: this module has no idea what a job or a publication
  // is, and the host that does passes the answer in.
  watermark = '',
}) {
  const [copied, setCopied] = React.useState(null); // null | 'copied' | 'failed'
  const [docxState, setDocxState] = React.useState('idle'); // 'idle' | 'loading' | 'failed'
  const closeBtnRef = useRef(null);
  // Section config: authors choose what the report includes. Defaults follow
  // the editor's hiddenSections (via defaultReportExclusions at the call site).
  const [excluded, setExcluded] = useState(() => new Set(initialExcluded));
  const [showSections, setShowSections] = useState(false);
  const sectionsRef = useRef(null);
  const [themeKey, setThemeKeyState] = useState(() => {
    const key = typeof initialTheme === 'string' ? initialTheme : initialTheme?.key;
    return key && (themes[key] || BUILT_IN_THEMES[key]) ? key : DEFAULT_THEME_KEY;
  });
  const setThemeKey = (v) => { setThemeKeyState(v); onThemeChange?.(v); };
  const activeTheme = useMemo(() => resolveTheme(themeKey, themes), [themeKey, themes]);
  // Page setup (size + orientation) — drives @page print CSS, the .docx page
  // size, and the on-screen column width. Persisted by the caller via
  // onPageChange (custom reports keep it on the saved report; generated
  // reports leave onPageChange unset and the choice is just session-local).
  const [pageSize, setPageSizeState] = useState(PAGE_SIZES[initialPageSize] ? initialPageSize : 'a4');
  const [orientation, setOrientationState] = useState(initialOrientation === 'landscape' ? 'landscape' : 'portrait');
  const setPageSize = (v) => { setPageSizeState(v); onPageChange?.({ pageSize: v, orientation }); };
  const setOrientation = (v) => { setOrientationState(v); onPageChange?.({ pageSize, orientation: v }); };
  // Edit mode: authors can tweak the document text before printing. While
  // editing (and while edits are kept) the document renders from an HTML
  // snapshot via dangerouslySetInnerHTML, NOT from the React block tree —
  // browser edits mutate the DOM, and letting React reconcile nodes the user
  // has split/merged/deleted throws NotFoundError and blanks the overlay.
  // Section/style controls are locked while edits exist ("Reset edits"
  // unlocks); Print / Save-PDF captures the edited DOM; Copy / Download .md
  // always serialise the generated model.
  const [editing, setEditing] = useState(false);
  const [editedHtml, setEditedHtml] = useState(null); // null = pristine model render
  const pristineHtmlRef = useRef(null);
  const docRef = useRef(null);

  const startEditing = () => {
    const html = docRef.current?.innerHTML;
    if (html == null) return;
    if (editedHtml === null) {
      pristineHtmlRef.current = html;
      setEditedHtml(html);
    }
    setEditing(true);
  };
  const stopEditing = () => {
    const html = docRef.current?.innerHTML;
    setEditing(false);
    if (html != null) setEditedHtml(html === pristineHtmlRef.current ? null : html);
  };
  const resetEdits = () => { setEditing(false); setEditedHtml(null); };
  const hasEdits = editedHtml !== null;

  const filteredReport = useMemo(
    () => ({ ...report, sections: report.sections.filter(s => !excluded.has(s.id)) }),
    [report, excluded]
  );

  // Null when there is no watermark, so a published document renders no layer at all
  // rather than an invisible one waiting to be made visible by a later change.
  const watermarkLayer = useMemo(() => {
    const bg = watermarkBackground(watermark);
    return bg ? watermarkLayerCss(bg) : null;
  }, [watermark]);

  const toggleSection = (id) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (!showSections) return;
    const close = (e) => { if (sectionsRef.current && !sectionsRef.current.contains(e.target)) setShowSections(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showSections]);

  // Print isolation: while the report is open, printing shows only the report.
  // The overlay is portalled to <body>, so hiding #root removes the app behind it.
  useEffect(() => {
    document.body.classList.add('ss-report-open');
    closeBtnRef.current?.focus();
    return () => document.body.classList.remove('ss-report-open');
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !editing) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, editing]);

  const printStyles = useMemo(() => `
    @page { size: ${PAGE_SIZES[pageSize]?.cssName || 'A4'} ${orientation}; margin: 14mm; }
    @media print {
      body.ss-report-open #root { display: none !important; }
      .ss-report-overlay { position: static !important; overflow: visible !important; }
      .ss-report-toolbar { display: none !important; }
      .ss-report-doc[contenteditable] { outline: none !important; }
      /* Pagination hygiene: keep table rows whole, headings with their
         content, and repeat table headers on each printed page. Categorical
         colours (chips, accents, lane tints) must survive printing. */
      .ss-report-doc tr { break-inside: avoid; page-break-inside: avoid; }
      .ss-report-doc thead { display: table-header-group; }
      .ss-report-doc h2, .ss-report-doc h3 { break-after: avoid-page; page-break-after: avoid; }
      .ss-report-doc * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  `, [pageSize, orientation]);

  return createPortal(
    // `nokey`: React Flow's global Backspace/Delete handler skips events from
    // inside a .nokey element — without it, deleting text in the report would
    // silently delete the still-selected canvas node behind the overlay.
    <div className="ss-report-overlay nokey fixed inset-0 z-[130] bg-white overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-label={`Report — ${report.title}`}>
      <style>{printStyles}</style>
      {/* Toolbar */}
      <div className="ss-report-toolbar sticky top-0 z-10 bg-[#00393f] text-white px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span className="text-sm font-semibold truncate">Report — {report.title}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <label className="flex items-center gap-1 text-xs">
            <span className="text-white/50 hidden sm:inline">Theme</span>
            <select
              value={themeKey}
              onChange={e => setThemeKey(e.target.value)}
              disabled={hasEdits}
              className="text-xs bg-white/15 border border-white/20 rounded-lg px-2 py-1.5 text-white focus:outline-none [&>option]:text-[#00393f] disabled:opacity-40"
              title={hasEdits ? 'Locked while text edits exist. Reset edits to change the theme.' : themes[themeKey]?.description || 'Report theme'}
            >
              {Object.entries(themes).map(([k, th]) => <option key={k} value={k}>{th.label || k}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs">
            <span className="text-white/50 hidden sm:inline">Page</span>
            <select
              value={pageSize}
              onChange={e => setPageSize(e.target.value)}
              className="text-xs bg-white/15 border border-white/20 rounded-lg px-2 py-1.5 text-white focus:outline-none [&>option]:text-[#00393f]"
              title="Paper size for print / Save PDF / Word"
            >
              {Object.entries(PAGE_SIZES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
            <select
              value={orientation}
              onChange={e => setOrientation(e.target.value)}
              className="text-xs bg-white/15 border border-white/20 rounded-lg px-2 py-1.5 text-white focus:outline-none [&>option]:text-[#00393f]"
              title="Page orientation for print / Save PDF / Word"
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <button
            onClick={() => (editing ? stopEditing() : startEditing())}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors font-semibold ${editing ? 'bg-[#f47e63] text-[#00393f] border-[#f47e63]' : 'bg-white/15 border-white/20 hover:bg-white/25'}`}
            title="Edit the report text before printing. Edits are kept for Print / Save PDF; the Markdown download stays the generated version."
            aria-pressed={editing}
          >
            {editing ? 'Done editing' : 'Edit text'}
          </button>
          {hasEdits && !editing && (
            <button
              onClick={resetEdits}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-white/15 border border-white/20 hover:bg-white/25 transition-colors font-semibold"
              title="Discard text edits and return to the generated document"
            >
              Reset edits
            </button>
          )}
          <div className="relative" ref={sectionsRef}>
            <button
              onClick={() => setShowSections(v => !v)}
              disabled={hasEdits}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors font-semibold disabled:opacity-40 ${showSections ? 'bg-white text-[#00393f] border-white' : 'bg-white/15 border-white/20 hover:bg-white/25'}`}
              title={hasEdits ? 'Locked while text edits exist — Reset edits to change sections' : 'Choose which sections this report includes'}
            >
              Sections{excluded.size > 0 ? ` (${report.sections.length - excluded.size}/${report.sections.length})` : ''}
            </button>
            {showSections && (
              <div className="absolute top-full right-0 mt-1.5 w-64 max-h-80 overflow-y-auto bg-white border border-neutral-200 rounded-xl shadow-xl py-1.5 z-20">
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Include in report</p>
                {report.sections.map(s => (
                  <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#00393f] hover:bg-neutral-50 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!excluded.has(s.id)}
                      onChange={() => toggleSection(s.id)}
                      className="accent-[#00393f]"
                    />
                    <span className="truncate">{s.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => copyMarkdown(filteredReport, setCopied, branding)}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-white/15 border border-white/20 hover:bg-white/25 transition-colors font-semibold"
          >
            {copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Copy failed — use Download .md' : 'Copy Markdown'}
          </button>
          <button
            onClick={() => downloadMarkdown(filteredReport, branding)}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-white/15 border border-white/20 hover:bg-white/25 transition-colors font-semibold"
          >
            Download .md
          </button>
          <button
            onClick={() => downloadHtml(filteredReport, branding, activeTheme, watermark)}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-white/15 border border-white/20 hover:bg-white/25 transition-colors font-semibold"
          >
            Download .html
          </button>
          <button
            onClick={() => downloadDocx(filteredReport, setDocxState, { pageSize, orientation, theme: activeTheme, branding, watermark })}
            disabled={docxState === 'loading'}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-white/15 border border-white/20 hover:bg-white/25 transition-colors font-semibold disabled:opacity-50"
          >
            {docxState === 'loading' ? 'Exporting…' : docxState === 'failed' ? 'Export failed' : 'Download .docx'}
          </button>
          <button
            onClick={() => window.print()}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-white/15 border border-white/20 hover:bg-white/25 transition-colors font-bold"
          >
            Print / Save PDF
          </button>
          <button ref={closeBtnRef} onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15 transition-colors" title="Close (Esc)" aria-label="Close report">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      {watermark && (
        // The mark says WHAT it is; this says what to do about it. Hidden in print,
        // because the printed copy carries the watermark itself and a banner explaining
        // the app would be nonsense on paper.
        <p className="text-xs font-semibold text-[#f47e63] bg-[#00393f] px-4 py-1.5 print:hidden">
          This is a draft. Every copy you download or print carries the {String(watermark).toUpperCase()} mark
          until it is published to SharePoint.
        </p>
      )}
      {editing && (
        <p className="text-xs font-semibold text-[#f47e63] bg-[#00393f] px-4 py-1.5 print:hidden">
          Editing the document text — click anywhere in the report to change wording. Edits are kept for Print / Save PDF; the Markdown download stays the generated version. Section and style controls unlock again via Reset edits.
        </p>
      )}
      {/* Over the document, not behind it: the report paints an opaque surface, so a
          background on any ancestor is covered. Fixed, so Chromium repeats it on every
          printed page — see core/watermark.js for what Firefox does instead. */}
      {watermarkLayer && <div style={watermarkLayer} aria-hidden="true" />}
      {hasEdits ? (
        <div
          ref={docRef}
          key={editing ? 'editing' : 'edited'}
          className={`ss-report-doc ${editing ? 'outline outline-2 outline-dashed outline-[#898A8D] outline-offset-[-2px]' : ''}`}
          contentEditable={editing}
          suppressContentEditableWarning
          spellCheck={editing}
          // Snapshot HTML — React owns only this wrapper, so user edits never
          // collide with reconciliation of the block tree.
          dangerouslySetInnerHTML={{ __html: editedHtml }}
        />
      ) : (
        <div ref={docRef} className="ss-report-doc">
          <ReportDocument report={filteredReport} theme={activeTheme} wide={orientation === 'landscape'} branding={branding} />
        </div>
      )}
    </div>,
    document.body
  );
}
