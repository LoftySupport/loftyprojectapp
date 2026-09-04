// markdown.js — report model to GitHub-flavoured Markdown.
//
// Portable: knows only the block types in blocks.js. Blocks that cannot be
// represented as text (sketches, embeds, images) degrade to a labelled
// placeholder rather than disappearing, so a reader can tell something was
// there and where to find it.

import { cellText, stripHtml } from './blocks.js';

const mdEscapeCell = (s) => String(cellText(s) ?? '').replace(/\|/g, '\\|').replace(/\n+/g, '; ');

export function blockToMarkdown(b) {
  switch (b.type) {
    case 'paragraph': return b.text + '\n';
    case 'subheading': return `### ${b.text}\n`;
    case 'keyValues': return b.items.map(i => `- **${i.label}:** ${i.value}`).join('\n') + '\n';
    case 'list': return b.items.map((i, n) => `${b.ordered ? `${n + 1}.` : '-'} ${i}`).join('\n') + '\n';
    case 'callout': {
      // `label` lets an adapter name what a callout means in its own domain
      // ("High risk", "Pain point"); it falls back to the tone.
      const label = b.label
        || (b.tone === 'warn' ? 'Warning' : b.tone === 'danger' ? 'Important' : 'Note');
      return `> **${label}:** ${b.text}\n`;
    }
    case 'image': return b.caption ? `*[${b.caption}: see the attached image or shared link]*\n` : '';
    case 'richText': return stripHtml(b.html) + '\n';
    case 'board': {
      const lines = b.caption ? [`*${b.caption}*`, ''] : [];
      for (const col of b.columns || []) {
        lines.push(`**${col.title} (${(col.cards || []).length})**`);
        for (const card of col.cards || []) {
          const chip = card.chip?.text ? ` [${card.chip.text}]` : '';
          lines.push(`- ${card.title}${chip}${card.sub ? ` — ${card.sub}` : ''}`);
        }
        lines.push('');
      }
      return lines.join('\n');
    }
    case 'divider': return '---\n';
    case 'flow': return `${b.name ? `**${b.name}:** ` : ''}${(b.stages || []).map(s => s.name).join(' → ')}\n`;
    case 'sketch': return b.caption ? `*[${b.caption}: diagram, see the printed or PDF version]*\n` : '';
    case 'chart': {
      const lines = b.caption ? [`*${b.caption}*`, ''] : [];
      const total = (b.series || []).reduce((s, x) => s + x.value, 0) || 1;
      for (const s of b.series || []) {
        const pct = b.chartType === 'pie' ? ` (${Math.round((s.value / total) * 100)}%)` : '';
        lines.push(`- ${s.label}: ${b.unit || ''}${s.value.toLocaleString()}${pct}`);
      }
      return lines.join('\n') + '\n';
    }
    case 'button': return `[${b.text || b.url}](${b.url})\n`;
    case 'embed': return `[${b.caption || 'Embedded content'}](${b.url})\n`;
    case 'table': {
      const head = `| ${b.headers.map(mdEscapeCell).join(' | ')} |`;
      const sep = `| ${b.headers.map(() => '---').join(' | ')} |`;
      const rows = b.rows.map(r => `| ${r.map(mdEscapeCell).join(' | ')} |`);
      return [head, sep, ...rows].join('\n') + '\n';
    }
    default: return '';
  }
}

/**
 * Serialise a report model to GitHub-flavoured Markdown.
 * @param {object} report
 * @param {{ branding?: string }} [options] appended to the footer; pass your
 *   product name, or omit for an unbranded document.
 */
export function reportToMarkdown(report, { branding = '' } = {}) {
  const lines = [`# ${report.title}`, ''];
  if (report.subtitle) lines.push(`_${report.subtitle}_`, '');
  for (const section of (report.sections || [])) {
    if (section.title) lines.push(`## ${section.title}`, '');
    for (const b of (section.blocks || [])) lines.push(blockToMarkdown(b));
  }
  const date = report.meta?.generatedAt ? String(report.meta.generatedAt).slice(0, 10) : '';
  lines.push('---', `Generated ${date}${branding ? ` · ${branding}` : ''}`);
  return lines.join('\n');
}
