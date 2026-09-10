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
 * The suffix a party token carries, and the whole of its syntax: `{{purchaser_name}}`.
 *
 * A token PER ROLE rather than one `{{owner_name}}`, and that is the design decision.
 * Amber, 10 September, writing a letter: *"dear [Owner Name] your property [property
 * address] has just received planning approval on [planning approval date]"* — and there
 * is no `owner` role. The roles are the ten in `party_roles`: certifier, consultant,
 * contractor, council, engineer, purchaser, real estate agent, supplier, surveyor, other.
 *
 * Guessing which one a letter opens to would have been exactly the invented default
 * CLAUDE.md forbids. Offering one token per role asks nobody to guess: the person filing
 * the party chose the role, and the person writing the letter picks the same word off the
 * menu. A role added to `party_roles` later gets its token with no code change.
 */
const PARTY_SUFFIX = '_name';

/** `Real estate agent` → `real_estate_agent_name`. The id is already snake_case; this is
 * belt and braces for a role somebody adds by hand. */
const partyTokenKey = (roleId) =>
  String(roleId).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + PARTY_SUFFIX;

function partyTokensFor(ctx) {
  const roles = ctx?.partyRoles || [];
  // A property definition whose key ends `_name` would collide silently and the property
  // would win by arriving later in the list. Nothing in the schema does today; the check
  // in report-widgets-check.mjs asserts it, so the day one does is the day it reports.
  return [...roles]
    .filter(r => r?.id)
    .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)))
    .map(r => ({
      value: partyTokenKey(r.id),
      label: `${r.name || r.id} — name`,
      group: 'Who is on the record'
    }));
}

/**
 * Every CURRENT party in one role, as the letter would say them.
 *
 * JOINED WITH "and", not just the primary one, and that is the reading that is right in
 * both cases rather than a preference. One purchaser gives one name — the common case.
 * Two purchasers on one house give "John Ashby and Mary Ashby", which is what the letter
 * has to say; taking only the row marked primary would address a letter about somebody's
 * house to one of the two people who own it.
 *
 * PRIMARY FIRST all the same, so where somebody has marked one the letter leads with it.
 *
 * A party is current when it has not ended. A purchaser who pulled out in March is not
 * who the September letter is addressed to, and `record_party_ended_on` is the column
 * that already says so.
 *
 * A company where there is no contact — the council, a supplier — because a party is one
 * or the other and the letter wants whichever it is.
 */
function partyNamesFor(parties, roleId, today) {
  const now = today || new Date().toISOString().slice(0, 10);
  const named = (parties || [])
    .filter(p => p?.roleId === roleId)
    .filter(p => !p.endedOn || p.endedOn >= now)
    .map(p => ({ primary: !!p.isPrimary, name: (p.contactName || p.companyName || '').trim() }))
    .filter(p => p.name);

  named.sort((a, b) =>
    (a.primary === b.primary ? 0 : a.primary ? -1 : 1) || a.name.localeCompare(b.name));

  const names = [...new Set(named.map(p => p.name))];
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

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
    ...partyTokensFor(ctx),
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

  // Who is on the record, by role. Read from the parties the app already loads for this
  // subject; nothing is fetched here, exactly as nothing is fetched for a property value.
  const parties = ctx?.parties || [];
  const roleByToken = new Map(
    (ctx?.partyRoles || []).filter(r => r?.id).map(r => [partyTokenKey(r.id), r.id])
  );

  return (key) => {
    if (key === 'job_number') return job?.jobNumber || (jobId || '');
    if (key === 'project_number') return String(project?.projectNumber ?? ownProject ?? '');
    if (key === 'address') return job?.currentAddress || project?.currentAddress || '';

    // A role token resolves to a name or to a BLANK — never to null. Null means "no such
    // field", which renders the token standing as a typo; a role that exists and has
    // nobody in it is an em dash, the same as a property nobody has filled in. The two
    // are different facts and the letter says so.
    const roleId = roleByToken.get(key);
    if (roleId) return partyNamesFor(parties, roleId);

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
/**
 * The same placeholders, filled into PLAIN TEXT rather than html (table cells).
 *
 * Amber, 10 September: *"how do i add a single property … in rich text dropin or in a
 * table or when creating a snippet"*. Rich text and snippets were already answered by
 * `makeFillTokens` above — a snippet IS a text widget, so tokens inside one fill when it
 * is dropped into a document. Table cells were not, and this is why they need their own
 * function rather than the one above with a flag:
 *
 *   A cell is rendered as TEXT, not markup. `makeFillTokens` escapes its values, because
 *   its output goes through `dangerouslySetInnerHTML` — and an address containing "Smith
 *   & Sons" would arrive in a cell as the literal characters `Smith &amp; Sons`. It also
 *   wraps values in a span, which a cell would print verbatim.
 *
 * So: no escaping, no markup, and the same three outcomes as prose — the value, an em
 * dash where nobody has recorded one, and the token left standing where it names no
 * field. A cell that quietly emptied itself is a table nobody can tell is wrong.
 */
export function makeFillTextTokens(ctx) {
  const lookup = valuesFor(ctx);
  return (text) => {
    if (!text || String(text).indexOf('{{') === -1) return text;
    return String(text).replace(TOKEN, (whole, key) => {
      const v = lookup ? lookup(key) : null;
      if (v == null) return whole;   // no record, or no such field — left visible
      if (v === '') return '—';      // nobody has recorded it
      return v;
    });
  };
}

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
