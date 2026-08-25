import { PERMISSION_LEVELS, type PermissionLevel } from "./types";

/**
 * What each rung of the ladder may do, transcribed from the policies themselves.
 *
 * WHY THIS FILE EXISTS AT ALL
 *
 *   The Permissions tab used to render a five-by-five grid of {{permission_grants.action}}
 *   over five invented objects — Project, Job, Checklist, Comment, Report. `permission_grants`
 *   is not a table, three of those objects are not things the schema has, and the page said
 *   nothing true. It was the most convincing wrong screen in the app, because a matrix looks
 *   like a specification.
 *
 * WHAT IT IS INSTEAD
 *
 *   A transcription of `pg_policy` as it stood at migration 0038, read out of the database
 *   rather than remembered. Every row names the rule Postgres actually evaluates, so it can
 *   be checked against the database instead of believed.
 *
 * IT CAN STILL DRIFT, AND THAT IS THE HONEST CAVEAT
 *
 *   A copy of the policies is a second source, and two sources disagree eventually. This one
 *   carries the migration it was read at, and `app/supabase/verify/rls.sql` is what proves
 *   the claims — the page says both, rather than presenting itself as authoritative.
 */

export const PERMISSION_LADDER: readonly PermissionLevel[] = PERMISSION_LEVELS;

/** Read at migration 0038. Shown on the page so a stale transcription is visible. */
export const PERMISSIONS_READ_AT = "0038";

export interface PermissionRule {
  /** What a person would call the thing. */
  object: string;
  action: string;
  /** The lowest rung that clears it. Null means nobody through the app. */
  needs: PermissionLevel | null;
  /** The policy or trigger Postgres evaluates, so the claim is checkable. */
  enforcedBy: string;
  note?: string;
}

export const PERMISSION_RULES: readonly PermissionRule[] = [
  // Reading. One rule, everywhere: an active, linked profile.
  { object: "Everything", action: "Read it", needs: "viewer",
    enforcedBy: "is_active_user() on every table's SELECT policy",
    note: "Not a rung so much as a gate: no linked profile, no rows at all." },

  { object: "Projects", action: "Create and edit", needs: "user", enforcedBy: "projects INSERT/UPDATE ≥ user" },
  { object: "Projects", action: "Delete", needs: "admin", enforcedBy: "projects DELETE ≥ admin" },

  { object: "Jobs", action: "Create and edit", needs: "user", enforcedBy: "jobs INSERT/UPDATE ≥ user" },
  { object: "Jobs", action: "Move between lifecycle phases", needs: "manager",
    enforcedBy: "guard_job_stage_change() trigger, 0038",
    note: "Lofty, 25 August. A column rule, so a trigger rather than a policy — RLS decides rows, not columns." },
  { object: "Jobs", action: "Move within a team's own pipeline", needs: "user",
    enforcedBy: "job_pipeline_positions UPDATE ≥ user",
    note: "Deliberately lower than a lifecycle move, and no confirmation either: a team moving a card on its own board is not asking anyone." },
  { object: "Jobs", action: "Delete", needs: "admin", enforcedBy: "jobs DELETE ≥ admin" },

  { object: "People", action: "Add or edit anyone", needs: "admin",
    enforcedBy: "profiles INSERT/UPDATE ≥ admin, plus guard_privileged_profile_columns()" },
  { object: "People", action: "Delete", needs: null,
    enforcedBy: "no DELETE policy on profiles",
    note: "Nobody, by design. A name sits on years of activity; deactivating is the operation." },
  { object: "People", action: "Read the activity log", needs: "admin", enforcedBy: "activity_audit SELECT ≥ admin" },

  { object: "Teams", action: "Add or rename", needs: "admin", enforcedBy: "teams INSERT/UPDATE ≥ admin" },

  { object: "The lifecycle", action: "Change what the phases are", needs: "superadmin",
    enforcedBy: "pipeline_stages ALL ≥ superadmin",
    note: "The line a manager's move does not cross: moving a job and renaming the lifecycle for the whole company are different acts." },
  { object: "The lifecycle", action: "Set how long a phase should take", needs: "superadmin",
    enforcedBy: "pipeline_stages ALL ≥ superadmin" },

  { object: "Comments", action: "Write one", needs: "user", enforcedBy: "comments INSERT ≥ user" },
  { object: "Comments", action: "Edit or delete one", needs: "user",
    enforcedBy: "comments UPDATE/DELETE: your own, or ≥ admin",
    note: "Your own at any rung; anybody else's needs admin." },

  { object: "Documents", action: "Upload and edit", needs: "user", enforcedBy: "documents INSERT/UPDATE ≥ user" },
  { object: "Documents", action: "Delete", needs: "admin", enforcedBy: "documents DELETE ≥ admin" }
];

/** `viewer` is on the ladder but not in use — parked 23 August, and the page says so. */
export const PARKED: readonly PermissionLevel[] = ["viewer"];

/** Does this rung clear the rule? Null needs nobody, so nothing clears it. */
export const clears = (level: PermissionLevel, rule: PermissionRule): boolean =>
  rule.needs !== null && PERMISSION_LEVELS.indexOf(level) >= PERMISSION_LEVELS.indexOf(rule.needs);
