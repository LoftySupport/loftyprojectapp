import { useCallback, useMemo } from "react";
import { useQuery } from "./DataProvider";
import { teamName } from "./types";
import type { PropertyDef, PropertyScope, TeamId, TemplateMilestone } from "./types";

/**
 * The lookups, read through the seam.
 *
 * These replace what used to be `lookups.ts` — a module of exported constants that nine
 * files imported directly. They read like configuration, but every one is a real
 * Supabase table (`stages`, `teams`, `template_phases`, `template_milestones`,
 * `property_defs`). The day they were seeded, all nine files would have had to change:
 * the exact rewrite the repository seam exists to prevent.
 *
 * Now they come from the repository, so seeding them changes one method and nothing
 * else. The cost is that they are async — hence hooks rather than constants, and a
 * sensible empty fallback so a page renders its chrome while they load.
 */

export function useStages() {
  const { data, loading } = useQuery(r => r.listStages(), []);
  const names = useMemo(() => data.map(s => s.name), [data]);
  return { stages: data, stageNames: names, loading };
}

/**
 * `teams` is every team; `teamNames` is only the ones still in use.
 *
 * The two are different questions and both get asked. A picker must not offer Commercial,
 * Executive or Admin — retired by 0026, which is what `team_is_active` is for — but a job
 * still owned by one of them has to render its name rather than its slug, so the full list
 * has to come back from the query and be narrowed here.
 */
export function useTeams() {
  const { data, loading, error } = useQuery(r => r.listTeams(), []);
  const names = useMemo(() => data.filter(t => t.isActive).map(t => t.name), [data]);
  return { teams: data, teamNames: names, loading, error };
}

/**
 * Which teams own each phase, and how long it should take.
 *
 * Returned as lookups by stage name because that is how every screen asks — the board
 * column, the template card and the property definition all know the stage they are
 * rendering, not its id.
 */
export function useTemplatePhases() {
  const { data, loading } = useQuery(r => r.listTemplatePhases(), []);

  const teamsByStage = useMemo(() => {
    const out: Record<string, string[]> = {};
    data.forEach(p => { out[p.stageName] = p.owningTeamNames; });
    return out;
  }, [data]);

  /**
   * Only the stages that actually have an expectation.
   *
   * A stage with no expected days is absent from the map rather than present as 0 —
   * `expectedDaysByStage[stage]` then reads `undefined`, which a caller has to handle,
   * where a 0 would quietly render "Expected 0 days" and divide a Gantt bar by nothing.
   */
  const expectedDaysByStage = useMemo(() => {
    const out: Record<string, number> = {};
    data.forEach(p => { if (p.expectedDays != null) out[p.stageName] = p.expectedDays; });
    return out;
  }, [data]);

  return { phases: data, teamsByStage, expectedDaysByStage, loading };
}

export function useMilestones() {
  const { data, loading } = useQuery(r => r.listTemplateMilestones(), []);

  const byStage = useMemo(() => {
    const out: Record<string, TemplateMilestone[]> = {};
    data.forEach(c => { (out[c.stageName] ??= []).push(c); });
    return out;
  }, [data]);

  return { milestones: data, byStage, loading };
}

/**
 * Definitions that already have a column of their own on `projects` / `jobs`, so they
 * render in their own section rather than in the generic slot list. Everything else is
 * a `property_values` row.
 */
const COLUMN_BACKED_KEYS = ["address", "type", "contract", "deposit", "drawings"];

export function usePropertyDefs(reloadKey: number = 0) {
  const { data, loading } = useQuery(r => r.listPropertyDefs(), [], [reloadKey]);

  /** The slots that render on a record — those without a column of their own. */
  const slotsFor = useMemo(
    () => (scope: PropertyScope) =>
      data.filter(d => d.scope === scope && !COLUMN_BACKED_KEYS.includes(d.key)),
    [data]
  );

  return { propertyDefs: data, slotsFor, loading };
}

/** Group definitions by the stage that captures them, in pipeline order. */
export function groupByStage(
  defs: PropertyDef[],
  stageNames: string[]
): { stage: string; defs: PropertyDef[] }[] {
  return stageNames
    .map(stage => ({ stage, defs: defs.filter(d => d.stageName === stage) }))
    .filter(g => g.defs.length > 0);
}

/**
 * Team ids turned into the names people use.
 *
 * `profiles.teams` is a list of slugs — `lofty_general`, `pre_construction_admin` —
 * because that is what the foreign key holds, and three screens were rendering it
 * straight: the dashboard greeted you with "lofty_general", Settings showed it under
 * "Teams", and the Admin table listed it in the Teams column.
 *
 * WHY `labels` RETURNS NULL RATHER THAN THE SLUG
 *
 *   Resolving through `teamName()` alone was not enough, and the first fix shipped with
 *   this hole in it. `teamName(id, [])` falls back to the id — deliberately, so a job
 *   owned by a retired team is not blank — which means every caller renders a raw
 *   foreign key for as long as the lookup has not answered. On the dashboard that window
 *   is wide open: the page's loading gate waits on `listJobs()`, and somebody with no
 *   jobs gets an instant empty answer there while the teams read is still in flight. So
 *   "lofty_general" was painted as though it were the name, exactly as before.
 *
 *   `boardModel` already had the answer — it puts the teams query into its own loading
 *   gate, "without them every owning team renders as its slug". This does the same thing
 *   one level down: until the lookup can answer, there is no answer, and a caller has to
 *   say so rather than being handed something that looks like one. It is the house rule
 *   about never filling a gap with a plausible value, and a slug is a plausible value.
 *
 * Retired teams are still resolved, once the lookup is there. A picker must not *offer*
 * Commercial, but a person recorded in it has to render as "Commercial" — which is the
 * distinction `useTeams` draws between `teams` and `teamNames`.
 */
export function useTeamLabels() {
  const { teams, loading, error } = useTeams();

  /** True once the lookup can actually answer. Empty-and-loaded is not resolved: an
   *  empty `teams` table means "not seeded", which is a gap, not a set of no teams. */
  const resolved = !loading && !error && teams.length > 0;

  const label = useCallback(
    (id: TeamId | string): string | null => (resolved ? teamName(id, teams) : null),
    [teams, resolved]
  );

  /** Names for a set of ids, or null while the lookup cannot answer. */
  const labels = useCallback(
    (ids: readonly (TeamId | string)[]): string[] | null =>
      resolved ? ids.map(id => teamName(id, teams)) : null,
    [teams, resolved]
  );

  // `teams` is passed straight through so a screen that both resolves names and offers
  // a picker does not have to call two hooks and run the query twice.
  return { teams, label, labels, resolved, loading, error };
}
