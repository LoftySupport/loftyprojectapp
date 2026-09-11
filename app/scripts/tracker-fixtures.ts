import { createStubRepository as createEmptyRepository } from "../src/data/stubRepository";
import type { Repository } from "../src/data/repository";
import type {
  FeedbackItem, Job, Notification, Process, ProcessRun, Profile, Project, PropertyDef,
  RoadmapPhase, TaskEntry, TaskStatus
} from "../src/data/types";

/**
 * The tracker, with something in it — for the responsive sweep only.
 *
 * ============================================================================
 * WHY THIS EXISTS, AND WHY IT IS NOT IN `stubRepository`
 *
 *   `stubRepository` is deliberately "structure, no data", and its own header explains
 *   why: building against it first means the empty states are designed rather than
 *   discovered. That decision is right and this does not touch it.
 *
 *   But it meant `responsive-check.mjs` measured the tracker's table, gantt and calendar
 *   **with nothing in them** — six URLs that each rendered one line of "nothing to place
 *   yet". The sweep reported 95 green combinations while never drawing a wide table, a
 *   multi-month timeline or a populated month grid: exactly the layouts the routes were
 *   added to cover, and the ones most able to push the page sideways.
 *
 *   A check that passes by not testing is the shape this repo distrusts most, so the
 *   harness gets fixtures of its own. They are visible only to the responsive build,
 *   which already swaps `AuthProvider` for a signed-in stub by the same mechanism.
 * ============================================================================
 *
 * These are FIXTURES, not seed data, and the difference matters: nobody sees them, they
 * never reach a screen a person uses, and they exist to be measured rather than read. The
 * house rule against inventing values is about what gets shown to somebody and quoted
 * back — it is not a rule against test data, which is why the names below are obviously
 * synthetic rather than plausible Lofty requests.
 *
 * Chosen to stress the layout rather than to look realistic:
 *   * a title far longer than any column can hold, because that is what sets a table's
 *     intrinsic width and pushes the page sideways;
 *   * phases spanning eight months, so the timeline draws many columns and must scroll
 *     inside itself rather than moving the page;
 *   * one phase with a start and no end, exercising the marker branch;
 *   * one phase with no dates at all, exercising the unscheduled list;
 *   * requests in every stage, so the board renders all five columns at once;
 *   * several requests on ONE day, so the calendar's "+N more" overflow is drawn.
 */

const ISO = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d)).toISOString();

/** A date-only column, n days from today in LOCAL time — see FIXTURE_PROJECT. */
const DAYS_FROM_TODAY = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const PHASES: RoadmapPhase[] = [
  {
    id: "fixture-phase-1",
    name: "FIXTURE Phase one — a deliberately long phase name to stretch the left column",
    summary: "Measured, not read.",
    startsOn: "2026-06-01",
    endsOn: "2026-09-30",
    position: 1,
    status: "in_progress"
  },
  {
    id: "fixture-phase-2",
    name: "FIXTURE Phase two",
    summary: "",
    startsOn: "2026-10-01",
    endsOn: "2027-01-31",
    position: 2,
    status: "planned"
  },
  {
    // A start and no end: the timeline must draw a marker, never a bar of invented length.
    id: "fixture-phase-3",
    name: "FIXTURE Phase three — start only",
    summary: "",
    startsOn: "2027-02-01",
    endsOn: null,
    position: 3,
    status: "planned"
  },
  {
    // No dates at all: it belongs in the unscheduled list under the chart.
    id: "fixture-phase-4",
    name: "FIXTURE Phase four — unscheduled",
    summary: "",
    startsOn: null,
    endsOn: null,
    position: 4,
    status: "planned"
  }
];

const STAGES = ["requested", "in_review", "planned", "in_development", "shipped", "declined"] as const;

const REQUESTS: FeedbackItem[] = STAGES.flatMap((stage, si) =>
  [0, 1].map((n): FeedbackItem => ({
    id: `fixture-request-${si}-${n}`,
    kind: n === 0 ? "bug" : "idea",
    title:
      n === 0
        ? `FIXTURE ${stage} — a request whose title is long enough to set a table column's intrinsic width and find out whether the page scrolls`
        : `FIXTURE ${stage} short`,
    detail: "Measured, not read.",
    page: "/jobs",
    errorText: null,
    stage,
    // Several share one day on purpose, so the calendar draws its "+N more" overflow.
    stageEnteredAt: ISO(2026, 8, 12 + (si % 3)),
    fromName: n === 0 ? "Fixture Person" : null,
    addedByName: n === 1 ? "Fixture Admin" : null,
    createdAt: ISO(2026, 8, 3 + (si % 4)),
    voteCount: (si * 3 + n) % 7,
    votedByMe: n === 0,
    // Two-thirds planned into a phase, one third left unplanned — so the gantt draws
    // both the bars and the "not on the chart" list beneath them.
    roadmapPhaseId: n === 0 ? PHASES[si % 3].id : null,
    attachments: [],
    mergedIntoId: null,
    mergedIntoTitle: null,
    duplicateCount: 0,
    commentCount: si,
    followedByMe: false,
    moveUnseen: false
  }))
);

/**
 * A stage's worth of processes, and a few jobs standing in them.
 *
 * Same reason as the tracker fixtures above, for two routes at once. `/setup/processes`
 * rendered one line of "No processes defined yet" and `/jobs` rendered "No jobs yet", so
 * the pipeline editor, the board's columns, its cards and its drag affordances were never
 * laid out by the check that exists to lay things out. Amber reported faults in both.
 *
 * One list, not two: the processes below stress the SETUP layout (a name long enough to
 * set a row's intrinsic width, a retired row, a milestone, an external, one with no team
 * and no duration) and the jobs hang off the same rows so the BOARD has real columns to
 * draw. Two parallel fixture sets would drift, and the drift would be invisible.
 *
 * The jobs are spread on purpose — one with nothing recorded, one mid-stage, one with
 * work running ahead of an unfinished earlier process — because those are the three the
 * board draws differently.
 */
const FIXTURE_STAGE = "Pre-construction";
const PROCESSES: Process[] = [
  ["fixture_survey", "FIXTURE Site survey and a name long enough to set the row's intrinsic width", "Stage 1", 1],
  ["fixture_concept", "FIXTURE Concept plan", "Stage 1", 2],
  ["fixture_pwa", "FIXTURE PWA", "Stage 1", 3],
  ["fixture_drawings", "FIXTURE Working drawings", "Stage 2", 4],
  ["fixture_eer", "FIXTURE Preliminary EER", "Stage 2", 5],
  ["fixture_contract", "FIXTURE Contract issued", "Stage 2", 6],
  ["fixture_retired", "FIXTURE A retired process", null, 7],
  // In a stage the fixture jobs have already left — Amber's 3 September screenshot, where
  // PWA sat under Acquisition & Development while every job was in Pre-construction.
  ["fixture_acq", "FIXTURE Land acquisition", "Stage 1", 1, "Acquisition & Development"]
].map(([key, name, group, position, stage], i) => ({
  id: `fixture-process-${i + 1}`,
  key: key as string,
  name: name as string,
  stageName: (stage as string | undefined) ?? FIXTURE_STAGE,
  stageGroup: group as string | null,
  scope: "job",
  owningTeam: i === 2 ? null : "design",
  expectedDays: i === 2 ? null : (i + 1) * 3,
  atRiskLeadDays: null,
  isMilestone: i === 3,
  isExternal: i === 4,
  position: position as number,
  isActive: i !== 6,
  description: null,
  automation: null,
  sharepointFolder: null,
  importRef: null,
  updatedAt: ISO(2026, 9, 1),
  // Main's set stamped an editor on the first row so Setup → Processes measures a real
  // "last updated by" cell rather than the em dash every other row draws.
  updatedBy: i === 0 ? "Fixture Person" : null
}));

const FIXTURE_PROJECT: Project = {
  id: 9001,
  name: "FIXTURE Corner Street",
  type: null,
  // Dated, so the projects gantt draws a bar and the projects calendar places its
  // chips. Without these both views render their "nothing has dates yet" branch and the
  // sweep measures a sentence — the same trap the tasks fixtures were added to close.
  //
  // RELATIVE TO TODAY, unlike the fixed dates above, and deliberately. The calendar
  // opens on the current month: fixed dates put both chips in a month nobody is looking
  // at within weeks, and the sweep would go back to measuring an empty grid without one
  // line of this file changing. A week either side keeps both inside the same month.
  startDate: DAYS_FROM_TODAY(-7),
  targetCompletion: DAYS_FROM_TODAY(7),
  endDate: null,
  stage: FIXTURE_STAGE,
  status: "active",
  owningTeam: "design",
  jobCount: 3,
  createdAt: ISO(2026, 8, 1),
  createdBy: null,
  updatedAt: ISO(2026, 9, 1),
  updatedBy: null
} as unknown as Project;

const JOB_STAGES = [FIXTURE_STAGE, FIXTURE_STAGE, "Construction"];
const FIXTURE_JOBS: Job[] = ["9001-01", "9001-02", "9001-03"].map((id, i) => ({
  id,
  jobNumberOld: null,
  titleType: null,
  projectId: 9001,
  stage: JOB_STAGES[i],
  owningTeam: "design",
  /**
   * A REAL status, one of each health, and this was wrong.
   *
   * It read `status: "active"`, which is not a `RecordStatus` at all — the valid set is
   * on_track / at_risk / behind_schedule / on_hold / completed / cancelled / archived.
   * The cast to `Job` at the bottom of this object is what let it through, and the fault
   * only became visible when the job record drew its health pill as a coloured dot with
   * no label in it. Three different ones now, so a screenshot exercises all three colours
   * rather than proving one.
   */
  status: (["on_track", "at_risk", "behind_schedule"] as const)[i],
  currentAddress: `${28 + i} FIXTURE Corner Street, Adelaide SA 5000`,
  originalAddress: null,
  projectCurrentAddress: "FIXTURE Corner Street, Adelaide SA 5000",
  // Left null rather than given a plausible LGA: a fixture that names a real council
  // is a fixture somebody quotes back. Null is what the drawer shows as "—".
  council: null,
  stageEnteredAt: ISO(2026, 8, 20 + i),
  // One with a target and none finished: the two states the Completion date row has to
  // draw, which an all-null fixture would never exercise.
  targetCompletion: i === 0 ? "2026-11-14" : null,
  endDate: null,
  createdAt: ISO(2026, 8, 1),
  createdBy: null,
  updatedAt: ISO(2026, 9, 1),
  updatedBy: null
} as unknown as Job));

/** -01 has nothing recorded, -02 is mid-stage, -03 has work ahead of an open process. */
const FIXTURE_RUNS: ProcessRun[] = [
  ["9001-02", 0, "complete"],
  ["9001-02", 1, "in_progress"],
  ["9001-03", 0, "in_progress"],
  ["9001-03", 3, "in_progress"]
].map(([jobId, pi, status], i) => {
  const p = PROCESSES[pi as number];
  return {
    id: `fixture-run-${i + 1}`,
    processId: p.id,
    processKey: p.key,
    processName: p.name,
    stageName: p.stageName,
    stageGroup: p.stageGroup,
    scope: "job",
    owningTeam: p.owningTeam,
    isMilestone: p.isMilestone,
    isExternal: false,
    expectedDays: p.expectedDays,
    atRiskLeadDays: null,
    position: p.position,
    jobId: jobId as string,
    projectId: null,
    recordProjectId: 9001,
    attempt: 1,
    status,
    waitingOn: null,
    startedAt: ISO(2026, 8, 25),
    completedAt: status === "complete" ? ISO(2026, 8, 28) : null,
    completedById: null,
    note: null,
    dueDate: null,
    atRiskDate: null,
    health: "on_track",
    daysTaken: null
  } as unknown as ProcessRun;
});

/**
 * Two people, so the tasks board has assignees to group into columns and the person
 * pickers have something to draw. Synthetic on purpose — see the note at the top.
 */
const FIXTURE_PEOPLE: Profile[] = [
  ["fixture-person-1", "Fixture", "Person"],
  ["fixture-person-2", "Fixture", "Colleague-With-A-Long-Surname"]
].map(([id, firstName, lastName]) => ({
  id,
  authUserId: null,
  firstName,
  lastName,
  fullName: `${firstName} ${lastName}`,
  email: `${id}@example.invalid`,
  loginEmail: null,
  jobTitle: null,
  teams: ["design"],
  isActive: true
} as unknown as Profile));

/**
 * Tasks, for the four views the tasks board grew on 10 September.
 *
 * Same reason as everything above it: `/tasks` rendered "Nothing is assigned to you" and
 * the sweep measured a heading. The board, the Gantt and the month grid are the layouts
 * most able to push a page sideways and none of them had ever been drawn.
 *
 * Shaped to stress each view rather than to look realistic — one task per status so the
 * kanban draws every column, a name longer than any column can hold, two on one day so
 * the calendar overflows, one started weeks ago and overdue so the Gantt draws a long
 * red bar, and one with no dates at all so both timeline empty-branches run.
 */
const TASK_SHAPES: [TaskStatus, string, string | null, string | null, number][] = [
  // status, name, dueDate, startedAtDay, expectedDays
  ["open", "FIXTURE A task whose name is long enough to set the column's intrinsic width and find out whether the page scrolls sideways", "2026-09-18", null, 5],
  ["open", "FIXTURE Nothing dated", null, null, 0],
  ["in_progress", "FIXTURE Under way", "2026-09-18", "2026-09-02", 12],
  ["in_progress", "FIXTURE Overdue and running", "2026-08-28", "2026-08-10", 14],
  ["blocked", "FIXTURE Waiting on council", "2026-10-06", "2026-09-01", 30],
  ["done", "FIXTURE Finished last week", "2026-09-04", "2026-08-30", 5],
  ["cancelled", "FIXTURE Called off", "2026-09-30", null, 0]
];

const FIXTURE_TASKS: TaskEntry[] = TASK_SHAPES.map(([status, name, dueDate, startedOn, expectedDays], i) => {
  const health =
    status === "done" ? "done"
    : status === "cancelled" ? "cancelled"
    : dueDate == null ? "no_due_date"
    : dueDate < "2026-09-10" ? "overdue"
    : dueDate < "2026-09-20" ? "at_risk"
    : "on_track";
  return {
    id: `fixture-task-${i + 1}`,
    jobId: FIXTURE_JOBS[i % FIXTURE_JOBS.length].id,
    projectId: null,
    name,
    description: i % 2 === 0 ? "Measured, not read." : null,
    parentTaskId: null,
    position: i + 1,
    owningTeam: "design",
    assigneeId: i % 3 === 2 ? null : FIXTURE_PEOPLE[i % 2].id,
    status,
    dueDate,
    scheduledDate: i % 3 === 0 ? "2026-09-15" : null,
    completedAt: status === "done" ? ISO(2026, 9, 4) : null,
    completedBy: null,
    isExternal: status === "blocked",
    processRunId: i % 2 === 0 ? FIXTURE_RUNS[0].id : null,
    processTaskId: null,
    startedAt: startedOn ? `${startedOn}T08:00:00.000Z` : null,
    expectedDays: expectedDays || null,
    atRiskLeadDays: null,
    createdAt: ISO(2026, 8, 20),
    createdBy: FIXTURE_PEOPLE[0].id,
    updatedAt: ISO(2026, 9, 1),
    updatedBy: null,
    assigneeName: i % 3 === 2 ? null : FIXTURE_PEOPLE[i % 2].fullName,
    completedByName: null,
    dueEffective: dueDate,
    atRiskDate: null,
    health,
    checklistTotal: i % 3 === 0 ? 4 : 0,
    checklistDone: i % 3 === 0 ? 2 : 0,
    subtaskTotal: 0,
    subtaskDone: 0,
    createdByName: FIXTURE_PEOPLE[0].fullName,
    processId: i % 2 === 0 ? PROCESSES[0].id : null,
    processName: i % 2 === 0 ? PROCESSES[0].name : null,
    recordName: `${28 + (i % 3)} FIXTURE Corner Street, Adelaide SA 5000`,
    recordStage: JOB_STAGES[i % JOB_STAGES.length]
  } as unknown as TaskEntry;
});

/**
 * Three unread and one already read — so the sweep photographs the Inbox badge and the
 * bell carrying the same number, which is the whole point of `InboxProvider`.
 *
 * Unread is `readAt: null` and nothing else, exactly as the real rows work. The fourth
 * row is read on purpose: a list where every line is bold proves nothing about the two
 * styles the panel actually has.
 */
const FIXTURE_NOTIFICATIONS: Notification[] = [
  {
    id: 1, typeId: "task_assigned", projectId: 9001, jobId: "9001-01", taskId: null,
    processRunId: null, commentId: null,
    title: "FIXTURE task assigned to you",
    body: "Slab inspection booking — 28 FIXTURE Corner Street",
    href: "/jobs/9001-01", createdAt: ISO(2026, 9, 10), readAt: null
  },
  {
    id: 2, typeId: "mentioned", projectId: 9001, jobId: "9001-02", taskId: null,
    processRunId: null, commentId: null,
    title: "FIXTURE mention",
    body: "…can you confirm the council lodgement date on this one?",
    href: "/jobs/9001-02", createdAt: ISO(2026, 9, 9), readAt: null
  },
  {
    id: 3, typeId: "stage_moved", projectId: 9001, jobId: "9001-03", taskId: null,
    processRunId: null, commentId: null,
    title: "FIXTURE job moved to Construction",
    body: null,
    href: "/jobs/9001-03", createdAt: ISO(2026, 9, 8), readAt: null
  },
  {
    id: 4, typeId: "task_overdue", projectId: 9001, jobId: "9001-01", taskId: null,
    processRunId: null, commentId: null,
    title: "FIXTURE task overdue",
    body: "Working drawings sign-off",
    href: "/jobs/9001-01", createdAt: ISO(2026, 9, 4), readAt: ISO(2026, 9, 5)
  }
];

export function createStubRepository(): Repository {
  const empty = createEmptyRepository();
  return {
    ...empty,
    async listProfiles() { return FIXTURE_PEOPLE; },
    async listTasks() { return FIXTURE_TASKS; },
    async listProcesses() { return PROCESSES; },
    async listProjects() { return [FIXTURE_PROJECT]; },
    async listJobs() { return FIXTURE_JOBS; },
    /**
     * The rail's three counts, derived from the fixtures above rather than typed.
     *
     * Derived on purpose: a hand-written `{ jobs: 128 }` beside three fixture jobs would
     * put a number in the picture that disagrees with the board behind it, which is
     * exactly the class of defect the screenshots exist to catch. The real
     * implementation counts rows under RLS; this counts the rows it has.
     */
    /**
     * Five pinned pages, one of each kind the rail draws an icon for.
     *
     * Chosen to exercise `pinKind()` rather than to look plausible: a job, a project, a
     * filtered board, a report and a settings screen are the five branches, and a
     * screenshot with five bookmarks all pointing at boards would prove one of them.
     */
    /**
     * A stage history, so 6b's readouts draw at all.
     *
     * Without it `listJobStageHistory` answers empty, every readout is omitted as a fact
     * the record does not hold, and a screenshot of the page track proves only that the
     * omission works. Two stays and a current one is the smallest history that exercises
     * "Job started", "Days in stage", "Started on" and "Total days" together.
     */
    /**
     * Property definitions, so the column picker actually draws its property groups.
     *
     * `stubRepository` answers empty by design — the eleven it once carried were
     * "plausible fiction" and were rightly removed. But empty means the picker's
     * **Job properties** and **Project properties** headings never render, and a
     * screenshot of it proves only that the eleven real columns group. Amber, 11
     * September: *"in the columns you should be able to add any property job or project
     * to the column view"* — this is what lets that be looked at rather than asserted.
     *
     * Four, deliberately: two scopes and three formats, which is the smallest set that
     * exercises both headings, the "(project)" label on an inherited one, and a numeric
     * column's right alignment. Every one is named FIXTURE so it cannot be mistaken for
     * a property Lofty defined.
     */
    /**
     * …and read access to them, or the picker offers none of them.
     *
     * `myPropertyAccess()` answers empty in the stub and `usePropertyAccess` defaults an
     * unknown key to `canRead: false`, which is the right fail-closed behaviour and is
     * why the four definitions above were invisible on the first run. Worth having found
     * that way round: the picker genuinely filters by what the reader may see, rather
     * than listing every definition and letting RLS empty the column later.
     */
    async myPropertyAccess() {
      return ["fixture_client", "fixture_pour_date", "fixture_contract_sum", "fixture_developer"]
        .map(propertyKey => ({
          propertyKey, canCreate: true, canRead: true, canUpdate: true, canDelete: false
        }));
    },
    async listPropertyDefs() {
      const base = {
        stageName: "Pre-construction", teamId: null, teamName: null, required: false,
        restricted: false, createLevel: "user", readLevel: "viewer",
        updateLevel: "user", deleteLevel: "manager", slaDays: null, isActive: true,
        description: null, importRef: null
      } as const;
      return [
        { ...base, key: "fixture_client", label: "FIXTURE Client", scope: "job", format: "text", position: 1 },
        { ...base, key: "fixture_pour_date", label: "FIXTURE Pour date", scope: "job", format: "date", position: 2 },
        { ...base, key: "fixture_contract_sum", label: "FIXTURE Contract sum", scope: "job", format: "currency", position: 3 },
        { ...base, key: "fixture_developer", label: "FIXTURE Developer", scope: "project", format: "text", position: 4 }
      ] as unknown as PropertyDef[];
    },
    async listJobStageHistory(jobId: string) {
      if (!FIXTURE_JOBS.some(j => j.id === jobId)) return [];
      return [
        { stage: "Acquisition & Development", from: ISO(2026, 6, 2), to: ISO(2026, 8, 20), days: 79 },
        { stage: "Pre-construction", from: ISO(2026, 8, 20), to: null, days: 22 }
      ];
    },
    async listMyNotifications() { return FIXTURE_NOTIFICATIONS.map(n => ({ ...n })); },
    /**
     * The one fixture that WRITES, and it earns the exception.
     *
     * The Inbox badge and the bell are one piece of state (`InboxProvider`) precisely so
     * that Mark all read clears both. A fixture that ignored the write would make that
     * impossible to watch happen — the badge would sit at 3 forever and the check would
     * be "it looks right", which is the kind of evidence this repo does not accept.
     */
    async markNotificationsRead(ids?: number[]) {
      const now = new Date().toISOString();
      let marked = 0;
      for (const n of FIXTURE_NOTIFICATIONS) {
        if (n.readAt !== null) continue;
        if (ids && !ids.includes(n.id)) continue;
        n.readAt = now;
        marked += 1;
      }
      return marked;
    },
    async listMyPins() {
      return [
        { id: "pin-1", label: "FIXTURE job 9001-01", url: "/jobs/9001-01", position: 1 },
        { id: "pin-2", label: "FIXTURE project 9001", url: "/projects/9001", position: 2 },
        { id: "pin-3", label: "FIXTURE live jobs board", url: "/jobs?saved=live", position: 3 },
        { id: "pin-4", label: "FIXTURE reports", url: "/reports", position: 4 },
        { id: "pin-5", label: "FIXTURE processes setup", url: "/setup/processes", position: 5 }
      ];
    },
    async railCounts() {
      return {
        projects: 1,
        jobs: FIXTURE_JOBS.filter(j => j.stage !== "Closed").length,
        maintenance: 0,
        // Derived from the fixture tasks the same way, and with the same filter the real
        // query uses: every status but done and cancelled. The fixtures are all assigned
        // to the first fixture person, who is also the signed-in stub.
        myOpenTasks: FIXTURE_TASKS.filter(t => t.status !== "done" && t.status !== "cancelled").length
      };
    },
    async listProcessRuns() { return FIXTURE_RUNS; },
    async listFeedback(kind?: "bug" | "idea") {
      return kind ? REQUESTS.filter(r => r.kind === kind) : REQUESTS;
    },
    async listRoadmapPhases() {
      return PHASES;
    }
  };
}
