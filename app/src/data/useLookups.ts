import { useMemo } from "react";
import { useQuery } from "./DataProvider";
import type { PropertyDef, PropertyScope, TemplateCheckpoint } from "./types";

/**
 * The lookups, read through the seam.
 *
 * These replace what used to be `lookups.ts` — a module of exported constants that nine
 * files imported directly. They read like configuration, but every one is a real
 * Supabase table (`stages`, `teams`, `template_phases`, `template_checkpoints`,
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

export function useTeams() {
  const { data, loading } = useQuery(r => r.listTeams(), []);
  const names = useMemo(() => data.map(t => t.name), [data]);
  return { teams: data, teamNames: names, loading };
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

  const expectedDaysByStage = useMemo(() => {
    const out: Record<string, number> = {};
    data.forEach(p => { out[p.stageName] = p.expectedDays; });
    return out;
  }, [data]);

  return { phases: data, teamsByStage, expectedDaysByStage, loading };
}

export function useCheckpoints() {
  const { data, loading } = useQuery(r => r.listTemplateCheckpoints(), []);

  const byStage = useMemo(() => {
    const out: Record<string, TemplateCheckpoint[]> = {};
    data.forEach(c => { (out[c.stageName] ??= []).push(c); });
    return out;
  }, [data]);

  return { checkpoints: data, byStage, loading };
}

/**
 * Definitions that already have a column of their own on `projects` / `jobs`, so they
 * render in their own section rather than in the generic slot list. Everything else is
 * a `property_values` row.
 */
const COLUMN_BACKED_KEYS = ["address", "type", "contract", "deposit", "drawings"];

export function usePropertyDefs() {
  const { data, loading } = useQuery(r => r.listPropertyDefs(), []);

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
