// widgets.js — the Lofty blocks the report builder offers.
//
// This is the file the module's own docs call "the judgement call the package
// cannot make for you": which of Lofty's entities are worth reporting on, and
// what a block of each one looks like. Everything else in `features/reports`
// is the module as it ships.
//
// THE ONE RULE, and it is worth restating because breaking it is silent:
// `resolve` reads live data out of `ctx` every time it runs. Options hold the
// QUESTION ("group the jobs by stage"), never the ANSWER. A template built in
// September and used in March renders March's jobs — that is the whole point
// of a template builder, and a resolver that closed over fetched rows instead
// would quietly produce a fossil that still looks current.
//
// `ctx` is built once by the Template Builder screen (`ToolsPage`) out of the
// same hooks the boards use, so a report cannot disagree with the board it was
// taken from. Its shape:
//
//   { projects, jobs, teams, stageNames, people, processes }
//
// Nothing here invents a value. A job with no assignee renders an em dash, a
// project with no target date renders an em dash, and a table with no rows
// renders a callout that says so — never a zero, never a plausible-looking
// default. That rule is in CLAUDE.md and it is the reason the app's Reports
// page had to have "45% on track" taken out of it.

import { helpers } from '../../core/registry.js';
import {
  PROCESS_RUN_HEALTH_LABELS,
  PROJECT_TYPE_LABELS,
  RECORD_STATUS_LABELS
} from '../../../../data/types';

/** Palette order. Core's text blocks land in 'Text & layout'. */
export const LOFTY_GROUPS = ['Text & layout', 'Portfolio', 'Jobs', 'Projects', 'People'];

// ─── Reading the context ─────────────────────────────────────────────

const jobsOf = (ctx) => ctx.jobs || [];
const projectsOf = (ctx) => ctx.projects || [];
const teamsOf = (ctx) => ctx.teams || [];
const peopleOf = (ctx) => ctx.people || [];
const stagesOf = (ctx) => ctx.stageNames || [];

/** Active teams only, in display order — the same set every picker in the app offers. */
const activeTeams = (ctx) => teamsOf(ctx).filter(t => t.isActive).sort((a, b) => a.position - b.position);
const teamName = (ctx, id) => teamsOf(ctx).find(t => t.id === id)?.name || null;

/** An unset value is an em dash. Never a zero, never "Unassigned" invented as a team. */
const DASH = '—';
const or = (v) => (v == null || v === '' ? DASH : v);

const statusLabel = (s) => RECORD_STATUS_LABELS[s] || DASH;

/**
 * Status to chip tone. Every status is mapped: an unmapped one would fall back
 * to grey and read as "on hold", which is a different fact.
 */
const STATUS_TONES = {
  on_track: 'green',
  at_risk: 'amber',
  behind_schedule: 'red',
  on_hold: 'grey',
  completed: 'blue',
  cancelled: 'grey',
  archived: 'grey'
};
const statusCell = (s) => (s ? { text: statusLabel(s), chip: STATUS_TONES[s] || 'grey' } : DASH);

const HEALTH_TONES = {
  not_started: 'grey',
  no_expectation: 'grey',
  on_track: 'green',
  at_risk: 'amber',
  overdue: 'red',
  complete: 'blue',
  not_applicable: 'grey'
};

/**
 * The categorical range for charts.
 *
 * Deliberately not the brand palette: Lofty's brand is one teal and one orange,
 * and a chart of twelve teams needs twelve distinguishable colours. The first
 * two are the brand's, so a two-series chart still reads as Lofty's.
 */
const SERIES_COLOURS = [
  '#005058', '#f47e63', '#4db3bd', '#b8482a', '#7a9e9f', '#c98b6b',
  '#00393f', '#e0a17f', '#3d7a80', '#8c5b45', '#a8c5c6', '#d9c98f'
];

const groupBy = (rows, keyFn) => {
  const out = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(r);
  }
  return out;
};

/** Jobs in the stage order the pipeline declares, with anything unknown last. */
const byStageOrder = (ctx) => {
  const order = stagesOf(ctx);
  return (a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
  };
};

/** The address a job is at, falling back to its project's. Never a placeholder. */
const jobAddress = (j) => j.currentAddress || j.projectAddress || null;

const notFinished = (r) => !['completed', 'cancelled', 'archived'].includes(r.status);

// ─── Headline numbers ────────────────────────────────────────────────
//
// Every one of these is counted from rows the reader may see, which is the
// only honest definition available: RLS decides what came back, so a figure is
// "of what you can see" and the block says so in its hint.

const STATS = [
  { key: 'projects', label: 'Projects', value: (ctx) => String(projectsOf(ctx).length) },
  { key: 'jobs', label: 'Jobs', value: (ctx) => String(jobsOf(ctx).length) },
  {
    key: 'liveJobs', label: 'Jobs in progress',
    value: (ctx) => String(jobsOf(ctx).filter(notFinished).length)
  },
  {
    key: 'onTrack', label: 'On track',
    value: (ctx) => String(jobsOf(ctx).filter(j => j.status === 'on_track').length)
  },
  {
    key: 'atRisk', label: 'At risk',
    value: (ctx) => String(jobsOf(ctx).filter(j => j.status === 'at_risk').length)
  },
  {
    key: 'behind', label: 'Behind schedule',
    value: (ctx) => String(jobsOf(ctx).filter(j => j.status === 'behind_schedule').length)
  },
  {
    key: 'onHold', label: 'On hold',
    value: (ctx) => String(jobsOf(ctx).filter(j => j.status === 'on_hold').length)
  },
  {
    key: 'completed', label: 'Completed',
    value: (ctx) => String(jobsOf(ctx).filter(j => j.status === 'completed').length)
  },
  {
    // An average over no jobs is not zero days — it is no answer, and an em
    // dash says so. The old Reports page printing "0" here is exactly the
    // failure CLAUDE.md names.
    key: 'avgDays', label: 'Average days in stage',
    value: (ctx) => {
      const live = jobsOf(ctx).filter(notFinished);
      if (!live.length) return DASH;
      return String(Math.round(live.reduce((n, j) => n + (j.daysInStage || 0), 0) / live.length));
    }
  },
  { key: 'teams', label: 'Active teams', value: (ctx) => String(activeTeams(ctx).length) },
  { key: 'people', label: 'People', value: (ctx) => String(peopleOf(ctx).length) }
];

const CHART_METRICS = [
  { key: 'jobsByStage', label: 'Jobs by stage' },
  { key: 'jobsByTeam', label: 'Jobs by owning team' },
  { key: 'jobsByStatus', label: 'Jobs by status' },
  { key: 'projectsByType', label: 'Projects by type' },
  { key: 'jobsByProject', label: 'Jobs per project' }
];

// ─── The widgets ─────────────────────────────────────────────────────

export const LOFTY_WIDGETS = {
  headlineNumbers: {
    label: 'Headline numbers',
    group: 'Portfolio',
    hint: 'Counts across everything you can see: projects, jobs, status, days in stage',
    defaults: () => ({ stats: ['projects', 'jobs', 'atRisk', 'behind'] }),
    settings: [{
      key: 'stats', type: 'multiselect', label: 'Which numbers', reorderable: true,
      hint: 'The order you set here is the order they appear in.',
      options: () => STATS.map(s => ({ value: s.key, label: s.label }))
    }],
    resolve: (o, ctx) => {
      const items = (o.stats || [])
        .map(k => STATS.find(s => s.key === k))
        .filter(Boolean)
        .map(s => ({ label: s.label, value: s.value(ctx) }));
      if (!items.length) return [helpers.info('Pick at least one number in this block’s settings.')];
      return [{ type: 'keyValues', items }];
    }
  },

  portfolioChart: {
    label: 'Chart',
    group: 'Portfolio',
    hint: 'Bar or pie, drawn from the same rows the boards read',
    defaults: () => ({ metric: 'jobsByStage', chartType: 'bar', caption: '' }),
    settings: [
      {
        key: 'metric', type: 'select', label: 'Measure', allowEmpty: false,
        options: CHART_METRICS.map(m => ({ value: m.key, label: m.label }))
      },
      {
        key: 'chartType', type: 'select', label: 'Draw as', allowEmpty: false,
        options: [{ value: 'bar', label: 'Bar' }, { value: 'pie', label: 'Pie' }]
      },
      { key: 'caption', type: 'text', label: 'Caption' }
    ],
    resolve: (o, ctx) => {
      const jobs = jobsOf(ctx);
      let series = [];

      switch (o.metric) {
        case 'jobsByStage':
          series = stagesOf(ctx)
            .map(s => ({ label: s, value: jobs.filter(j => j.stage === s).length }));
          break;
        case 'jobsByTeam':
          series = [...groupBy(jobs, j => j.team || DASH)].map(([label, rows]) => ({ label, value: rows.length }));
          break;
        case 'jobsByStatus':
          series = [...groupBy(jobs, j => statusLabel(j.status))].map(([label, rows]) => ({ label, value: rows.length }));
          break;
        case 'projectsByType':
          series = [...groupBy(projectsOf(ctx), p => (p.projectType ? PROJECT_TYPE_LABELS[p.projectType] : 'Type not set'))]
            .map(([label, rows]) => ({ label, value: rows.length }));
          break;
        case 'jobsByProject':
          series = projectsOf(ctx).map(p => ({ label: p.projectNumber, value: (p.jobs || []).length }));
          break;
        default:
          return [helpers.warn(`Unknown measure “${o.metric}”.`)];
      }

      series = series
        .filter(s => s.value)
        // Stage order is the pipeline's, not the count's: a stage chart that
        // reorders itself by size stops reading as a pipeline.
        .sort((a, b) => (o.metric === 'jobsByStage' ? 0 : b.value - a.value))
        .slice(0, 12)
        .map((s, i) => ({ ...s, color: SERIES_COLOURS[i % SERIES_COLOURS.length] }));

      if (!series.length) return [helpers.info('Nothing to chart yet for this measure.')];
      return [{ type: 'chart', chartType: o.chartType || 'bar', series, caption: o.caption || '' }];
    }
  },

  jobsTable: {
    label: 'Jobs table',
    group: 'Jobs',
    hint: 'Every job you can see, flat or grouped by stage, team or status',
    defaults: () => ({ groupBy: 'none', includeFinished: false, columns: ['address', 'stage', 'team', 'status', 'days'] }),
    compactable: true,
    settings: [
      {
        key: 'groupBy', type: 'select', label: 'Group by', allowEmpty: false,
        options: [
          { value: 'none', label: 'No grouping' },
          { value: 'stage', label: 'Stage' },
          { value: 'team', label: 'Owning team' },
          { value: 'status', label: 'Status' },
          { value: 'project', label: 'Project' }
        ]
      },
      {
        key: 'columns', type: 'multiselect', label: 'Columns', reorderable: true,
        hint: 'The job number is always the first column.',
        options: () => [
          { value: 'address', label: 'Address' },
          { value: 'stage', label: 'Stage' },
          { value: 'team', label: 'Owning team' },
          { value: 'status', label: 'Status' },
          { value: 'days', label: 'Days in stage' },
          { value: 'assignee', label: 'Assigned to' },
          { value: 'project', label: 'Project' },
          { value: 'oldNumber', label: 'Old job number' }
        ]
      },
      {
        key: 'includeFinished', type: 'checkbox',
        label: 'Include completed, cancelled and archived jobs'
      }
    ],
    resolve: (o, ctx) => {
      let rows = jobsOf(ctx);
      if (!o.includeFinished) rows = rows.filter(notFinished);
      if (!rows.length) {
        return [helpers.info(
          jobsOf(ctx).length
            ? 'Every job you can see is completed, cancelled or archived. Tick "Include completed…" to show them.'
            : 'No jobs to show yet.'
        )];
      }

      const COLUMNS = {
        address: { header: 'Address', cell: (j) => or(jobAddress(j)) },
        stage: { header: 'Stage', cell: (j) => or(j.stage) },
        team: { header: 'Owning team', cell: (j) => or(j.team) },
        status: { header: 'Status', cell: (j) => statusCell(j.status) },
        days: { header: 'Days in stage', cell: (j) => String(j.daysInStage ?? 0) },
        assignee: { header: 'Assigned to', cell: (j) => or(j.assigneeName) },
        project: { header: 'Project', cell: (j) => or(j.projectNumber) },
        oldNumber: { header: 'Old job number', cell: (j) => or(j.jobNumberOld) }
      };
      const chosen = (o.columns || []).filter(k => COLUMNS[k]);
      const headers = ['Job', ...chosen.map(k => COLUMNS[k].header)];
      const toRow = (j) => [j.jobNumber, ...chosen.map(k => COLUMNS[k].cell(j))];

      if (o.groupBy === 'none') return [{ type: 'table', headers, rows: rows.map(toRow) }];

      const key = {
        stage: (j) => or(j.stage),
        team: (j) => or(j.team),
        status: (j) => statusLabel(j.status),
        project: (j) => or(j.projectNumber)
      }[o.groupBy];
      if (!key) return [{ type: 'table', headers, rows: rows.map(toRow) }];

      const groups = [...groupBy(rows, key)];
      if (o.groupBy === 'stage') {
        const order = byStageOrder(ctx);
        groups.sort((a, b) => order(a[0], b[0]));
      } else {
        groups.sort((a, b) => a[0].localeCompare(b[0]));
      }

      const blocks = [];
      for (const [group, groupRows] of groups) {
        blocks.push({ type: 'subheading', text: `${group} (${groupRows.length})` });
        blocks.push({ type: 'table', headers, rows: groupRows.map(toRow) });
      }
      return blocks;
    }
  },

  jobsBoard: {
    label: 'Jobs board',
    group: 'Jobs',
    hint: 'The board as columns: jobs by stage, or by the team that owns them',
    defaults: () => ({ groupBy: 'stage', teamIds: [], includeFinished: false }),
    compactable: true,
    settings: [
      {
        key: 'groupBy', type: 'select', label: 'Columns are', allowEmpty: false,
        options: [{ value: 'stage', label: 'Stage' }, { value: 'team', label: 'Owning team' }]
      },
      {
        key: 'teamIds', type: 'multiselect', label: 'Teams to include', emptyMeansAll: true,
        hint: 'Leave empty to include every active team.',
        visible: (o) => o.groupBy === 'team',
        options: (ctx) => activeTeams(ctx).map(t => ({ value: t.id, label: t.name }))
      },
      { key: 'includeFinished', type: 'checkbox', label: 'Include completed, cancelled and archived jobs' }
    ],
    resolve: (o, ctx) => {
      let rows = jobsOf(ctx);
      if (!o.includeFinished) rows = rows.filter(notFinished);
      if (!rows.length) return [helpers.info('No jobs to show on a board yet.')];

      const card = (j) => ({
        title: j.jobNumber,
        sub: jobAddress(j) || undefined,
        chip: j.status ? { text: statusLabel(j.status), tone: STATUS_TONES[j.status] || 'grey' } : null
      });

      if (o.groupBy === 'team') {
        const shown = o.teamIds?.length
          ? activeTeams(ctx).filter(t => o.teamIds.includes(t.id))
          : activeTeams(ctx);
        const columns = shown.map(t => ({
          title: t.name,
          color: null,
          cards: rows.filter(j => j.teamId === t.id).map(card)
        }));
        if (!columns.length) return [helpers.info('No teams selected for this board.')];
        return [{ type: 'board', caption: 'Jobs by owning team', columns }];
      }

      // Every declared stage, in pipeline order, including the empty ones: a
      // board that drops its empty columns misrepresents the pipeline as
      // shorter than it is.
      const columns = stagesOf(ctx).map(s => ({
        title: s,
        color: null,
        cards: rows.filter(j => j.stage === s).map(card)
      }));
      if (!columns.length) return [helpers.info('The pipeline has no stages to draw columns from.')];
      return [{ type: 'board', caption: 'Jobs by stage', columns }];
    }
  },

  jobsNeedingAttention: {
    label: 'Needs attention',
    group: 'Jobs',
    hint: 'Jobs that are not on track, longest in stage first',
    defaults: () => ({ limit: 10 }),
    compactable: true,
    settings: [
      {
        key: 'limit', type: 'number', label: 'How many to list',
        hint: 'Leave blank for all of them.'
      }
    ],
    resolve: (o, ctx) => {
      const rows = jobsOf(ctx)
        .filter(notFinished)
        .filter(j => j.status !== 'on_track')
        .sort((a, b) => (b.daysInStage || 0) - (a.daysInStage || 0));

      if (!rows.length) {
        // Not "0 jobs need attention" dressed as a table — the table would be
        // an empty grid and read as a rendering fault.
        return [helpers.info('Nothing is at risk, behind schedule or on hold right now.')];
      }
      const limit = Number.isFinite(o.limit) && o.limit > 0 ? o.limit : rows.length;
      const shown = rows.slice(0, limit);
      const blocks = [{
        type: 'table',
        headers: ['Job', 'Address', 'Stage', 'Owning team', 'Status', 'Days in stage'],
        rows: shown.map(j => [
          j.jobNumber, or(jobAddress(j)), or(j.stage), or(j.team),
          statusCell(j.status), String(j.daysInStage ?? 0)
        ])
      }];
      if (shown.length < rows.length) {
        blocks.push({ type: 'paragraph', text: `Showing ${shown.length} of ${rows.length}.` });
      }
      return blocks;
    }
  },

  projectsTable: {
    label: 'Projects table',
    group: 'Projects',
    hint: 'Every project you can see, with its address, type and job count',
    defaults: () => ({ includeFinished: false }),
    compactable: true,
    settings: [
      { key: 'includeFinished', type: 'checkbox', label: 'Include completed, cancelled and archived projects' }
    ],
    resolve: (o, ctx) => {
      let rows = projectsOf(ctx);
      if (!o.includeFinished) rows = rows.filter(notFinished);
      if (!rows.length) return [helpers.info('No projects to show yet.')];

      return [{
        type: 'table',
        headers: ['Project', 'Address', 'Suburb', 'Type', 'Stage', 'Status', 'Jobs', 'Target completion'],
        rows: rows.map(p => [
          p.projectNumber,
          or(p.currentAddress),
          or(p.suburb),
          p.projectType ? PROJECT_TYPE_LABELS[p.projectType] : DASH,
          or(p.stage),
          statusCell(p.status),
          String((p.jobs || []).length),
          or(p.targetCompletion)
        ])
      }];
    }
  },

  // The reference-holding block. `scopedOptions` is what makes a saved template
  // re-pick its project when somebody uses it somewhere else, instead of
  // rendering a stale-reference warning at whoever opened it.
  projectDetail: {
    label: 'One project',
    group: 'Projects',
    hint: 'A named project: its details, and every job on it',
    defaults: (ctx) => ({ projectNumber: projectsOf(ctx)[0]?.projectNumber || null, showJobs: true }),
    scopedOptions: ['projectNumber'],
    settings: [
      {
        key: 'projectNumber', type: 'select', label: 'Which project',
        emptyHint: 'There are no projects to choose from yet.',
        options: (ctx) => projectsOf(ctx).map(p => ({
          value: p.projectNumber,
          label: p.currentAddress ? `${p.projectNumber} — ${p.currentAddress}` : p.projectNumber
        }))
      },
      { key: 'showJobs', type: 'checkbox', label: 'List the jobs on it' }
    ],
    resolve: (o, ctx, h) => {
      if (!o.projectNumber) {
        // Silent in an exported document: an instruction to the author must
        // never reach a reader.
        return h.forExport ? [] : [helpers.info('Choose a project in this block’s settings.')];
      }
      const p = projectsOf(ctx).find(x => x.projectNumber === o.projectNumber);
      if (!p) return [helpers.staleRef(`Project ${o.projectNumber} is not in view any more. Pick another one.`)];

      const blocks = [{
        type: 'keyValues',
        items: [
          { label: 'Project', value: p.projectNumber },
          { label: 'Address', value: or(p.currentAddress) },
          { label: 'Suburb', value: or(p.suburb) },
          { label: 'Council', value: or(p.council) },
          { label: 'Type', value: p.projectType ? PROJECT_TYPE_LABELS[p.projectType] : DASH },
          { label: 'Stage', value: or(p.stage) },
          { label: 'Status', value: statusLabel(p.status) },
          { label: 'Owning team', value: or(teamName(ctx, p.owningTeam)) },
          { label: 'Proposed dwellings', value: p.proposedDwellings == null ? DASH : String(p.proposedDwellings) },
          { label: 'Target completion', value: or(p.targetCompletion) }
        ]
      }];

      if (o.showJobs) {
        const jobs = jobsOf(ctx).filter(j => j.projectNumber === p.projectNumber);
        if (!jobs.length) {
          blocks.push(helpers.info(`No jobs have been created on ${p.projectNumber} yet.`));
        } else {
          const order = byStageOrder(ctx);
          blocks.push({
            type: 'table',
            headers: ['Job', 'Address', 'Stage', 'Owning team', 'Status', 'Days in stage'],
            rows: [...jobs]
              .sort((a, b) => order(a.stage, b.stage) || a.jobNumber.localeCompare(b.jobNumber))
              .map(j => [
                j.jobNumber, or(jobAddress(j)), or(j.stage), or(j.team),
                statusCell(j.status), String(j.daysInStage ?? 0)
              ])
          });
        }
      }
      return blocks;
    }
  },

  teamWorkload: {
    label: 'Team workload',
    group: 'People',
    hint: 'How many jobs each team owns, and how they are going',
    defaults: () => ({ includeEmpty: false }),
    compactable: true,
    settings: [
      { key: 'includeEmpty', type: 'checkbox', label: 'Include teams with no jobs' }
    ],
    resolve: (o, ctx) => {
      const live = jobsOf(ctx).filter(notFinished);
      const teams = activeTeams(ctx);
      if (!teams.length) return [helpers.info('No active teams to report on.')];

      const rows = teams
        .map(t => {
          const mine = live.filter(j => j.teamId === t.id);
          return {
            name: t.name,
            total: mine.length,
            onTrack: mine.filter(j => j.status === 'on_track').length,
            atRisk: mine.filter(j => j.status === 'at_risk').length,
            behind: mine.filter(j => j.status === 'behind_schedule').length,
            onHold: mine.filter(j => j.status === 'on_hold').length
          };
        })
        .filter(r => o.includeEmpty || r.total > 0);

      if (!rows.length) return [helpers.info('No team currently owns a job in progress.')];

      return [{
        type: 'table',
        headers: ['Team', 'Jobs in progress', 'On track', 'At risk', 'Behind schedule', 'On hold'],
        rows: rows.map(r => [
          r.name, String(r.total), String(r.onTrack),
          String(r.atRisk), String(r.behind), String(r.onHold)
        ])
      }];
    }
  },

  peopleTable: {
    label: 'People',
    group: 'People',
    hint: 'Who is at Lofty, their title and their teams',
    defaults: () => ({ groupBy: 'none', includeInactive: false }),
    compactable: true,
    settings: [
      {
        key: 'groupBy', type: 'select', label: 'Group by', allowEmpty: false,
        options: [{ value: 'none', label: 'No grouping' }, { value: 'team', label: 'Team' }]
      },
      { key: 'includeInactive', type: 'checkbox', label: 'Include deactivated people' }
    ],
    resolve: (o, ctx) => {
      let rows = peopleOf(ctx);
      if (!o.includeInactive) rows = rows.filter(p => p.isActive !== false);
      if (!rows.length) return [helpers.info('No people to list.')];

      const named = (p) => or(p.jobTitle);
      const teamsFor = (p) => (p.teams || []).map(id => teamName(ctx, id) || id);

      if (o.groupBy !== 'team') {
        return [{
          type: 'table',
          headers: ['Name', 'Job title', 'Teams'],
          rows: [...rows]
            .sort((a, b) => a.fullName.localeCompare(b.fullName))
            .map(p => [p.fullName, named(p), teamsFor(p).join(', ') || DASH])
        }];
      }

      const blocks = [];
      for (const t of activeTeams(ctx)) {
        const members = rows.filter(p => (p.teams || []).includes(t.id));
        if (!members.length) continue;
        blocks.push({ type: 'subheading', text: `${t.name} (${members.length})` });
        blocks.push({
          type: 'table',
          headers: ['Name', 'Job title'],
          rows: [...members].sort((a, b) => a.fullName.localeCompare(b.fullName)).map(p => [p.fullName, named(p)])
        });
      }
      // Somebody in no team is a real state — a staff record created before
      // anyone said which team they sit in — so it is a section, not a silence.
      const loose = rows.filter(p => !(p.teams || []).length);
      if (loose.length) {
        blocks.push({ type: 'subheading', text: `No team recorded (${loose.length})` });
        blocks.push({
          type: 'table',
          headers: ['Name', 'Job title'],
          rows: [...loose].sort((a, b) => a.fullName.localeCompare(b.fullName)).map(p => [p.fullName, named(p)])
        });
      }
      if (!blocks.length) return [helpers.info('Nobody is recorded against a team yet.')];
      return blocks;
    }
  },

  processHealth: {
    label: 'Process health',
    group: 'Jobs',
    hint: 'How the latest run of each process is going, across the jobs in view',
    defaults: () => ({ stage: null }),
    compactable: true,
    settings: [{
      key: 'stage', type: 'select', label: 'Limit to one stage',
      hint: 'Leave empty for every stage.',
      options: (ctx) => stagesOf(ctx).map(s => ({ value: s, label: s }))
    }],
    resolve: (o, ctx) => {
      const processes = ctx.processes || [];
      if (!processes.length) return [helpers.info('No processes are defined yet — Setup → Processes.')];

      const scoped = o.stage ? processes.filter(p => p.stageName === o.stage) : processes;
      if (!scoped.length) return [helpers.info(`No processes are defined for “${o.stage}”.`)];

      const runsByKey = new Map();
      for (const j of jobsOf(ctx)) {
        for (const r of j.processRuns || []) {
          if (!runsByKey.has(r.processKey)) runsByKey.set(r.processKey, []);
          runsByKey.get(r.processKey).push(r);
        }
      }
      if (!runsByKey.size) {
        return [helpers.info('No process has been run on a job in view yet, so there is nothing to score.')];
      }

      const order = byStageOrder(ctx);
      const rows = [...scoped]
        .sort((a, b) => order(a.stageName, b.stageName) || a.position - b.position)
        .map(p => {
          const runs = runsByKey.get(p.key) || [];
          const worst = ['overdue', 'at_risk', 'on_track', 'complete', 'not_started', 'no_expectation', 'not_applicable']
            .find(h => runs.some(r => r.health === h));
          return [
            p.name,
            or(p.stageName),
            // No runs is not "on track" — it is no answer.
            runs.length ? String(runs.length) : DASH,
            worst
              ? { text: PROCESS_RUN_HEALTH_LABELS[worst] || worst, chip: HEALTH_TONES[worst] || 'grey' }
              : DASH
          ];
        })
        // A process nobody has run adds a row of dashes to every report; the
        // ones that have been run are the question this block answers.
        .filter(r => r[2] !== DASH);

      if (!rows.length) return [helpers.info('None of these processes has been run on a job in view.')];
      return [{ type: 'table', headers: ['Process', 'Stage', 'Runs in view', 'Worst health'], rows }];
    }
  }
};

// ─── Seeds ───────────────────────────────────────────────────────────
//
// A seed is a starting draft, not a saved report: it emits widget descriptors,
// so a seeded template is exactly as live as a hand-built one.

export const LOFTY_SEEDS = [
  {
    key: 'portfolio',
    label: 'Portfolio overview',
    hint: 'Headline numbers, jobs by stage, and the full job table',
    build: () => [
      { kind: 'heading', options: { text: 'Where the portfolio stands' } },
      { kind: 'headlineNumbers', options: { stats: ['projects', 'jobs', 'liveJobs', 'avgDays'] } },
      { kind: 'text', options: { html: '<p>Write the story behind these numbers here.</p>' } },
      { kind: 'heading', options: { text: 'Jobs by stage' } },
      { kind: 'portfolioChart', options: { metric: 'jobsByStage', chartType: 'bar' } },
      { kind: 'jobsTable', options: { groupBy: 'stage' } }
    ]
  },
  {
    key: 'leadership',
    label: 'Leadership summary',
    hint: 'The short one: status counts, what needs attention, team workload',
    build: () => [
      { kind: 'heading', options: { text: 'Summary' } },
      { kind: 'headlineNumbers', options: { stats: ['liveJobs', 'onTrack', 'atRisk', 'behind'] } },
      { kind: 'heading', options: { text: 'Needs attention' } },
      { kind: 'jobsNeedingAttention', options: { limit: 10 } },
      { kind: 'heading', options: { text: 'Team workload' } },
      { kind: 'teamWorkload', options: {} },
      { kind: 'heading', options: { text: 'Recommended actions' } },
      { kind: 'text', options: { html: '<ul><li>First action</li><li>Second action</li></ul>' } }
    ]
  },
  {
    key: 'project',
    label: 'Single project report',
    hint: 'One project, its jobs, and room for a note to the client',
    build: () => [
      { kind: 'heading', options: { text: 'Project' } },
      { kind: 'projectDetail', options: { showJobs: true } },
      { kind: 'heading', options: { text: 'Where things are up to' } },
      { kind: 'text', options: { html: '<p>Write the update for this project here.</p>' } }
    ]
  }
];
