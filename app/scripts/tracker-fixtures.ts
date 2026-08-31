import { createStubRepository as createEmptyRepository } from "../src/data/stubRepository";
import type { Repository } from "../src/data/repository";
import type { FeedbackItem, RoadmapPhase } from "../src/data/types";

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

export function createStubRepository(): Repository {
  const empty = createEmptyRepository();
  return {
    ...empty,
    async listFeedback(kind?: "bug" | "idea") {
      return kind ? REQUESTS.filter(r => r.kind === kind) : REQUESTS;
    },
    async listRoadmapPhases() {
      return PHASES;
    }
  };
}
