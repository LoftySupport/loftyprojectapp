// html.js — report model to a standalone HTML document.
//
// Self-contained: all styling is inlined, so the output can be emailed as an
// attachment, opened from disk, or served as a share page with no assets.
// Accent and surface colours are parameters so the document carries the host
// application's brand without this file being edited.

import { cellText } from './blocks.js';
import { resolveTheme, logoForSurface, isDarkColour } from './theme.js';

// ─── HTML serialiser ─────────────────────────────────────────────────
// Generates a standalone, self-contained HTML document from the report model.
// Suitable for opening in a browser, emailing as an attachment, or embedding.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TONE_STYLES = {
  warn:   { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  danger: { bg: '#fee2e2', border: '#ef4444', text: '#7f1d1d' },
  info:   { bg: '#f0f9ff', border: '#38bdf8', text: '#0c4a6e' },
};

export function blockToHtml(b) {
  switch (b.type) {
    case 'paragraph': return `<p>${esc(b.text)}</p>`;
    case 'subheading': return `<h3>${esc(b.text)}</h3>`;
    case 'keyValues':
      return `<dl>${(b.items || []).map(i => `<dt>${esc(i.label)}</dt><dd>${esc(i.value)}</dd>`).join('')}</dl>`;
    case 'list':
      return `<ul>${(b.items || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
    case 'callout': {
      const tone = TONE_STYLES[b.tone] || TONE_STYLES.info;
      return `<div class="callout" style="background:${tone.bg};border-left:4px solid ${tone.border};color:${tone.text}">${esc(b.text)}</div>`;
    }
    case 'image':
      return b.src
        ? `<figure><img src="${esc(b.src)}" alt="${esc(b.caption)}" />${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>`
        : '';
    case 'richText': return `<div class="rich-text">${b.html || ''}</div>`;
    case 'divider': return b.pageBreak ? '<hr class="page-break" />' : '<hr />';
    case 'flow': {
      const chips = (b.stages || []).map(s => `<span class="stage-chip">${esc(s.name)}</span>`).join('<span class="arrow">→</span>');
      return `<div class="pipeline-flow">${b.name ? `<strong>${esc(b.name)}:</strong> ` : ''}${chips}</div>`;
    }
    case 'sketch': return ''; // SVG only renders in the live document
    case 'chart': {
      const total = (b.series || []).reduce((s, x) => s + x.value, 0) || 1;
      const max = Math.max(...(b.series || []).map(s => s.value), 1);
      const rows = (b.series || []).map(s => {
        const pct = Math.round((s.value / total) * 100);
        const barPct = Math.round((s.value / max) * 100);
        return `<div class="chart-row"><span class="chart-label">${esc(s.label)}</span><div class="chart-bar-track"><div class="chart-bar" style="width:${barPct}%;background:${esc(s.color || '#0B4650')}"></div></div><span class="chart-value">${esc(b.unit || '')}${s.value.toLocaleString()}${b.chartType === 'pie' ? ` (${pct}%)` : ''}</span></div>`;
      }).join('');
      return `<div class="chart">${b.caption ? `<p class="caption">${esc(b.caption)}</p>` : ''}${rows}</div>`;
    }
    case 'button':
      return `<p><a class="report-btn" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">${esc(b.text || b.url)}</a></p>`;
    case 'embed':
      return `<div class="embed"><iframe src="${esc(b.url)}" loading="lazy" title="${esc(b.caption || 'Embedded content')}"></iframe><p class="embed-fallback">Can't see the embed? <a href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">Open it directly</a>.</p>${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</div>`;
    case 'table': {
      const head = `<thead><tr>${(b.headers || []).map(h => `<th>${esc(cellText(h))}</th>`).join('')}</tr></thead>`;
      const body = `<tbody>${(b.rows || []).map(r =>
        `<tr>${r.map(c => `<td>${esc(cellText(c))}</td>`).join('')}</tr>`).join('')}</tbody>`;
      return `<table>${head}${body}</table>`;
    }
    case 'board': {
      const cols = (b.columns || []).map(col => {
        const cards = (col.cards || []).map(card =>
          `<div class="board-card"><strong>${esc(card.title)}</strong>${card.sub ? `<br/><small>${esc(card.sub)}</small>` : ''}${card.chip ? ` <em>[${esc(card.chip.text)}]</em>` : ''}</div>`
        ).join('');
        return `<div class="board-col"><div class="board-col-title">${esc(col.title)}</div>${cards}</div>`;
      }).join('');
      return `<div class="board">${b.caption ? `<p class="caption">${esc(b.caption)}</p>` : ''}${cols}</div>`;
    }
    default: return '';
  }
}

/**
 * Serialise a report model to a standalone, self-contained HTML document.
 *
 * @param {object} report
 * @param {object} [options]
 * @param {string|object} [options.theme]  a theme key or theme object. The same
 *   one the on-screen document uses, so an emailed HTML file and the app agree.
 * @param {string} [options.branding]
 * @param {string} [options.brandingUrl]
 * @param {string} [options.accent]  legacy override, applied over the theme
 * @param {string} [options.dark]    legacy override, applied over the theme
 */
export function reportToHtml(report, { theme = null, branding = '', brandingUrl = '', accent = null, dark = null } = {}) {
  const t = resolveTheme(theme);
  const c = t.colors;
  // The two loose parameters this function used to take still work, so a
  // caller written before theming keeps its colours.
  const accentColor = accent || c.accent;
  const darkColor = dark || c.inverse;
  const fontBody = t.fonts?.body || "ui-sans-serif, system-ui, sans-serif";
  const fontHeading = t.fonts?.heading || fontBody;
  const headingWeight = t.fonts?.headingWeight || 700;
  const bandLogo = logoForSurface(t, isDarkColour(darkColor) ? 'dark' : 'light');
  const logoHtml = bandLogo
    ? `<img class="report-logo" src="${esc(bandLogo.src)}" alt="${esc(bandLogo.alt || branding)}" style="height:${bandLogo.height}px" />`
    : '';
  const title = esc(report.title || 'Report');
  const subtitle = report.subtitle ? `<p class="subtitle">${esc(report.subtitle)}</p>` : '';
  const meta = report.meta || {};
  const date = meta.generatedAt ? meta.generatedAt.slice(0, 10) : '';
  const sections = (report.sections || []).map(s => {
    const heading = s.title ? `<h2>${esc(s.title)}</h2>` : '';
    const blocks = (s.blocks || []).map(blockToHtml).join('\n');
    return `<section>\n${heading}\n${blocks}\n</section>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  body{font-family:${fontBody};font-size:14px;line-height:1.6;color:${c.ink};background:${c.surfaceAlt};margin:0;padding:0}
  .report-header{background:${darkColor};color:${c.onInverse};padding:2rem 3rem;border-bottom:4px solid ${accentColor}}
  .report-header h1{margin:0 0 .25rem;font-size:2rem;font-family:${fontHeading};font-weight:${headingWeight}}
  .report-logo{display:block;width:auto;margin-bottom:.9rem}
  .subtitle{color:${c.onInverse};opacity:.72;margin:.5rem 0 0;font-size:.9rem}
  .report-body{max-width:860px;margin:0 auto;padding:2rem 3rem;background:${c.surface}}
  section{margin-bottom:2.5rem}
  h2{font-size:1.3rem;font-family:${fontHeading};font-weight:${headingWeight};color:${c.heading};border-bottom:2px solid ${accentColor};padding-bottom:.25rem;margin-top:2rem}
  h3{font-size:1rem;font-weight:600;color:#0B4650;margin-top:1.5rem}
  p{margin:.5rem 0}
  dl{display:grid;grid-template-columns:max-content 1fr;gap:.15rem .75rem;margin:.5rem 0}
  dt{font-weight:600;white-space:nowrap}
  dd{margin:0;color:${c.muted}}
  ul{margin:.5rem 0;padding-left:1.5rem}
  li{margin:.2rem 0}
  table{width:100%;border-collapse:collapse;margin:.75rem 0;font-size:.85rem}
  th{background:${c.surfaceAlt};color:${c.ink};text-align:left;padding:.4rem .6rem;white-space:nowrap;border:1px solid ${c.line}}
  td{padding:.35rem .6rem;border-bottom:1px solid ${c.line}}
  tr:nth-child(even) td{background:${c.surfaceAlt}}
  .callout{padding:.6rem 1rem;margin:.75rem 0;border-radius:.25rem;font-size:.875rem}
  .pipeline-flow{display:flex;flex-wrap:wrap;align-items:center;gap:.25rem;margin:.5rem 0}
  .stage-chip{background:${c.surfaceAlt};color:${c.ink};border:1px solid ${c.line};border-radius:.25rem;padding:.2rem .55rem;font-size:.78rem;font-weight:600;white-space:nowrap}
  .arrow{color:${c.muted};padding:0 .1rem}
  figure{margin:.75rem 0}
  figure img{max-width:100%;border-radius:.5rem;border:1px solid #e5e7eb}
  figcaption{font-size:.8rem;color:${c.muted};margin-top:.3rem}
  .rich-text{margin:.5rem 0}
  hr{border:none;border-top:1px solid ${c.line};margin:1.5rem 0}
  hr.page-break{border-top:2px dashed ${accentColor}}
  .board{display:flex;gap:1rem;overflow-x:auto;margin:.75rem 0;padding-bottom:.5rem}
  .board-col{min-width:180px;flex:1;background:${c.surface};border:1px solid ${c.line};border-radius:.5rem;padding:.75rem}
  .board-col-title{font-weight:700;font-size:.8rem;border-bottom:2px solid ${c.ink};margin-bottom:.5rem;padding-bottom:.3rem}
  .board-card{padding:.3rem 0;border-bottom:1px solid ${c.line};font-size:.8rem}
  .report-footer{text-align:center;color:${c.muted};font-size:.75rem;padding:1.5rem;margin-top:2rem;border-top:1px solid ${c.line}}
  .chart{margin:.75rem 0}
  .chart-row{display:flex;align-items:center;gap:.5rem;margin:.3rem 0;font-size:.8rem}
  .chart-label{width:150px;flex-shrink:0;text-align:right;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .chart-bar-track{flex:1;background:${c.surfaceAlt};border-radius:.25rem;overflow:hidden}
  .chart-bar{height:14px;border-radius:.25rem}
  .chart-value{width:90px;flex-shrink:0;font-weight:700}
  .report-btn{display:inline-block;background:${c.ink};color:${c.surface};padding:.5rem 1.1rem;border-radius:.5rem;text-decoration:none;font-weight:700;font-size:.85rem}
  .embed{margin:.75rem 0}
  .embed iframe{width:100%;aspect-ratio:16/9;border:1px solid ${c.line};border-radius:.5rem}
  .embed-fallback{font-size:.75rem;color:${c.muted};margin-top:.3rem}
  @media print{
    body{background:#fff}
    .report-header{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    hr.page-break{page-break-after:always;border:none}
    table{page-break-inside:avoid}
    section{page-break-inside:avoid}
  }
</style>
</head>
<body>
<div class="report-header">
  ${logoHtml}
  <h1>${title}</h1>
  ${subtitle}
</div>
<div class="report-body">
${sections}
</div>
<div class="report-footer">Generated ${esc(date)}${branding ? ` &middot; ${esc(branding)}` : ''}${brandingUrl ? ` &middot; <a href="${esc(brandingUrl)}">${esc(brandingUrl)}</a>` : ''}</div>
</body>
</html>`;
}
