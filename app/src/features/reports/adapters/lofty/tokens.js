// Placeholders in prose — `{{site_start_date}}` in a letter, the value when it renders.
//
// Amber, 5 September: *"i want to be able to add properties in rich text and save them
// so i can create a letter with proeprties as placeholders"*.
//
// WHY A TOKEN AND NOT A BLOCK
//
//   The Record properties block already puts values on a page, as a labelled list. A
//   letter does not want a list — it wants "the slab at 28 Corner Street is booked for
//   1 October", with the values inside the sentence. Nothing about the block could do
//   that, because a block is a paragraph-level thing and this is a word-level one.
//
// WHY LITERAL TEXT AND NOT MARKUP
//
//   A token is stored as the characters `{{key}}` inside the html. It survives being
//   copied between blocks, pasted from Word, edited by hand, cloned into another
//   document, and written into a .docx — none of which a `<span data-token>` reliably
//   does, because `contentEditable` rewrites markup it does not recognise and Word's
//   clipboard mangles anything it did not author.
//
//   The cost is that somebody can type `{{nonsense}}` and get a placeholder that never
//   fills. That is visible on the canvas rather than silent — see below.

import { formatValue, hasValue } from '../../../../data/propertyFormat';

/** `{{ key }}` — tolerant of spaces, because people type them. */
const TOKEN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/**
 * The tokens somebody can insert, for the editor's menu.
 *
 * Property definitions, plus a handful of facts about the record itself that are not
 * properties — the job number and the address are the two things a letter opens with,
 * and neither lives in `property_values`.
 */
export function tokensFor(ctx) {
  const defs = ctx?.propertyDefs || [];
  return [
    { value: 'job_number', label: 'Job number', group: 'The record' },
    { value: 'project_number', label: 'Project number', group: 'The record' },
    { value: 'address', label: 'Address', group: 'The record' },
    ...[...defs]
      .sort((a, b) => (a.stageName || '').localeCompare(b.stageName || '') || a.position - b.position)
      .map(d => ({
        value: d.key,
        label: d.label,
        group: d.stageName || 'Properties'
      }))
  ];
}

/**
 * What each token resolves to for the record this document is about.
 *
 * Values come through `formatValue` — the same function the job drawer uses and the
 * Record properties block uses. A date rendered one way in a letter and another in the
 * drawer beside it is the failure this whole feature is built to avoid, and it is the
 * kind that survives review because both look reasonable on their own.
 *
 * A JOB READS ITS PROJECT'S VALUES THROUGH, exactly as the Record properties block does.
 */
function valuesFor(ctx) {
  const subject = ctx?.subject || null;
  const jobId = subject?.jobId || null;
  const projectId = subject?.projectId ?? null;
  if (!jobId && projectId == null) return null;

  const jobs = ctx?.jobs || [];
  const projects = ctx?.projects || [];
  const job = jobId ? jobs.find(j => j.jobNumber === jobId) : null;
  const ownProject = jobId
    ? String(job?.projectId ?? job?.projectNumber ?? '')
    : String(projectId);
  const project = projects.find(p => String(p.projectId ?? p.projectNumber) === ownProject) || null;

  const defs = ctx?.propertyDefs || [];
  const byKey = new Map(defs.map(d => [d.key, d]));
  const options = ctx?.propertyOptions || [];
  const people = (ctx?.people || []).map(pr => ({ id: pr.id, name: pr.fullName }));

  const rows = (ctx?.propertyValues || []).filter(v => {
    if (!jobId) return String(v.projectId) === String(projectId);
    if (v.jobId === jobId) return true;
    return v.jobId == null && ownProject !== '' && String(v.projectId) === ownProject;
  });

  // Project rows first, the job's own over the top — the job's answer wins.
  const raw = new Map();
  rows.filter(v => v.jobId == null).forEach(v => raw.set(v.propertyKey, v.value));
  rows.filter(v => v.jobId != null).forEach(v => raw.set(v.propertyKey, v.value));

  return (key) => {
    if (key === 'job_number') return job?.jobNumber || (jobId || '');
    if (key === 'project_number') return String(project?.projectNumber ?? ownProject ?? '');
    if (key === 'address') return job?.currentAddress || project?.currentAddress || '';
    const def = byKey.get(key);
    if (!def) return null; // not a field at all — a typo, not a blank
    const v = raw.get(key);
    if (!v || !hasValue(def, v)) return '';
    return formatValue(def, v, options.filter(op => op.propertyKey === key), people);
  };
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Fill the placeholders in one block of html.
 *
 * THREE OUTCOMES, AND THEY ARE DELIBERATELY DIFFERENT:
 *
 * - **A value.** Escaped, because a property is user-entered text going into html — an
 *   address with an ampersand in it must not become markup.
 * - **No value yet.** An em dash. CLAUDE.md: never fill a gap with a plausible value.
 *   A blank would read as a typo in the sentence; the dash reads as "nobody has said".
 * - **No such field, or no record.** The token is left ALONE, visibly, as `{{whatever}}`.
 *   Silently deleting it would turn "booked for {{slab_dat}}" into "booked for", which
 *   is a sentence somebody sends. Left in place it is obviously unfinished, and the
 *   canvas marks it so it is caught before anybody previews.
 */
export function makeFillTokens(ctx) {
  const lookup = valuesFor(ctx);
  return (html, { forExport = false } = {}) => {
    if (!html || html.indexOf('{{') === -1) return html;
    return String(html).replace(TOKEN, (whole, key) => {
      const v = lookup ? lookup(key) : null;
      // No record on the document, or no such field: leave it standing.
      if (v == null) {
        return forExport
          ? whole
          : `<span class="rb-token rb-token-unknown" title="Nothing resolves this placeholder">${esc(whole)}</span>`;
      }
      if (v === '') {
        return forExport
          ? '—'
          : '<span class="rb-token rb-token-blank" title="Nobody has recorded this yet">—</span>';
      }
      return forExport ? esc(v) : `<span class="rb-token">${esc(v)}</span>`;
    });
  };
}
