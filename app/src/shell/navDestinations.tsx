import { useMemo } from "react";
import { Location, Person } from "@vibe/icons";
import { useStages } from "../data/useLookups";
import { useQuery } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { JOB_VIEWS, PROJECT_VIEWS, DEFAULT_SAVED_VIEW } from "../data/savedViews";
import { Documents, Maintenance, Projects, Reports } from "../theme/railIcons";
import type { RailCounts } from "../data/types";
import type { FlyoutItem, NavDestination, NavPanel } from "./NavRail";

/**
 * What the rail points at, and what each destination's flyout lists.
 *
 * `NavRail.tsx` knows about rows and washes; this file is the only place that knows
 * Lofty. Splitting them is the whole instruction the handoff ends on — *"every rule so
 * far has been written as a behaviour, which each screen then satisfied its own way"* —
 * and a rail with the destinations baked into it would be the fourteenth hand-built
 * version of the same idea.
 *
 * EIGHT DESTINATIONS BECAME SIX PLUS A GROUP
 *
 *   Dashboard and Tasks left the list and went inside **My work** (Amber, 11 September:
 *   *"My Work has Inbox (This was previously the homepage dashboard) and task (was task
 *   pages)"*). `/dashboard` and `/tasks` are untouched — Inbox is the dashboard under a
 *   name that says what it is for, and Tasks is the same four-view board it has always
 *   been. No new table, no new feed.
 *
 *   Settings and Admin came OUT of the header and into the rail's foot, with the user
 *   menu. Search came with them. The header keeps undo/redo, Ask and the bell — see
 *   `AppShell.tsx`.
 *
 * WHERE EVERY FLYOUT ROW COMES FROM
 *
 *   Nothing here is invented. The views are `JOB_VIEWS` and `PROJECT_VIEWS`, which are
 *   the same lists the boards' own tab strips render; the stage groupings are
 *   `listStages()`, which is the `pipeline_stages` table; the maintenance queues are the
 *   five options in that page's own picker. A flyout row that named a view the board did
 *   not have would be a link to a screen that quietly showed something else.
 *
 *   **Reports has no flyout**, and that is a finding rather than an omission: its five
 *   tabs live in `useState`, not in the URL, so there is nothing to link to. Give the
 *   tab a query key and the panel writes itself.
 */

/** `?saved=all` is the default on both boards, so it is left out of the URL. */
const savedHref = (base: string, slug: string) =>
  slug === DEFAULT_SAVED_VIEW ? base : `${base}?saved=${slug}`;

/**
 * The five queues the Maintenance page offers, transcribed from its own `Select`.
 *
 * Transcribed rather than imported because that list is an inline literal in the page
 * today. If it grows a sixth, this drifts — so it is written down here that these two
 * must agree, and the honest fix when somebody touches either is to export the list from
 * the page and read it here.
 */
const MAINTENANCE_QUEUES: FlyoutItem[] = [
  { label: "All open", to: "/maintenance" },
  { label: "Needs attention", to: "/maintenance?queue=attention" },
  { label: "Mine", to: "/maintenance?queue=mine" },
  { label: "Closed", to: "/maintenance?queue=closed" },
  { label: "Everything", to: "/maintenance?queue=all" }
];

/** Tools' four lanes, each of which is already its own URL. */
const TOOL_LANES: FlyoutItem[] = [
  { label: "Document Builder", to: "/tools/document-builder" },
  { label: "Template Library", to: "/tools/template-library" },
  { label: "Section Library", to: "/tools/section-library" },
  { label: "Snippet Library", to: "/tools/snippet-library" }
];

export function useNavDestinations(): {
  destinations: NavDestination[];
  /** Zero-state aware: null while the first read is in flight, so no badge flashes 0. */
  countsLoading: boolean;
} {
  const { stages } = useStages();
  const { can } = usePermission();
  const { data: counts, loading: countsLoading } =
    useQuery<RailCounts | null>(r => r.railCounts(), null);

  return useMemo(() => {
    /** Every phase the database has, as a link that groups the board by it. */
    const stageLinks = (base: string): FlyoutItem[] =>
      stages.map(s => ({ label: s.name, to: `${base}?stage=${encodeURIComponent(s.name)}` }));

    const projectsPanel: NavPanel = {
      title: "Projects",
      // `?new=1` rather than a callback: the rail is not the Projects page and cannot
      // reach its dialog, and a link is the thing you can also send somebody.
      newLabel: can("user") ? "+ New project" : undefined,
      newTo: can("user") ? "/projects?new=1" : undefined,
      views: PROJECT_VIEWS.map(v => ({ label: v.label, to: savedHref("/projects", v.slug) })),
      groupLabel: "stage",
      groups: stageLinks("/projects")
    };

    const jobsPanel: NavPanel = {
      title: "Jobs",
      // No "+ New job", and that is the product rather than a gap: a job is created by
      // splitting a project into lots, which is the Projects board's Split control. A
      // "New job" button here would open a form that does not exist.
      views: JOB_VIEWS.map(v => ({ label: v.label, to: savedHref("/jobs", v.slug) })),
      groupLabel: "stage",
      groups: stageLinks("/jobs")
    };

    const maintenancePanel: NavPanel = {
      title: "Maintenance",
      newLabel: can("user") ? "+ New request" : undefined,
      newTo: can("user") ? "/maintenance?new=1" : undefined,
      views: MAINTENANCE_QUEUES
    };

    const contactsPanel: NavPanel = {
      title: "Contacts",
      views: [
        { label: "People", to: "/contacts" },
        { label: "Companies", to: "/contacts?tab=companies" }
      ]
    };

    const toolsPanel: NavPanel = { title: "Tools", views: TOOL_LANES };

    const destinations: NavDestination[] = [
      {
        id: "projects",
        label: "Projects",
        to: "/projects",
        icon: Projects,
        iconSize: 28,
        count: counts?.projects,
        panel: projectsPanel
      },
      {
        // Location, not the client's `Job.svg`: the handoff's own prototype uses the
        // design-system pin here, and `ICONS.md` lists Location among the glyphs the
        // system already carries. A pin marks one place, which is what a job is.
        id: "jobs",
        label: "Jobs",
        to: "/jobs",
        icon: Location,
        iconSize: 24,
        count: counts?.jobs,
        panel: jobsPanel
      },
      {
        id: "maintenance",
        label: "Maintenance",
        to: "/maintenance",
        icon: Maintenance,
        iconSize: 28,
        count: counts?.maintenance,
        panel: maintenancePanel
      },
      // No count on the last three. They are not queues — nothing waits in them — so a
      // number would be decoration, and the handoff draws them without one.
      { id: "reports", label: "Reports", to: "/reports", icon: Reports, iconSize: 28 },
      {
        id: "contacts",
        label: "Contacts",
        to: "/contacts",
        icon: Person,
        iconSize: 24,
        panel: contactsPanel
      },
      { id: "tools", label: "Tools", to: "/tools", icon: Documents, iconSize: 28, panel: toolsPanel }
    ];

    return { destinations, countsLoading };
  }, [stages, counts, countsLoading, can]);
}
