/**
 * The four starter tables.
 *
 * Deliberately minimal: keys and relationships only. Every table has a `// + fields`
 * marker where the rest of the columns go as they are decided — add them here, add
 * them to the migration, regenerate, done.
 *
 * Relational, so identity is a uuid primary key and everything joins on it. The Lofty
 * numbers are *business keys*: unique, human-quotable, and what people say out loud.
 * They are not the join key — renumbering a project should never orphan its jobs.
 */

export type Uuid = string;
export type IsoDate = string;      // 'YYYY-MM-DD'
export type IsoDateTime = string;  // timestamptz

/**
 * The audit quartet — on every table, no exceptions.
 *
 * The one table without it is the one someone asks about when a value turns out to be
 * wrong. `createdBy` and `updatedBy` are nullable because a row can legitimately have
 * no author: a seeded lookup, an import, the very first profile. Nullable and honest
 * beats not-null filled with a placeholder nobody can trace.
 *
 * `updatedAt` is maintained by a Postgres trigger, not by the app — a default only
 * fires on insert, and a column that silently equals `createdAt` forever is worse than
 * no column, because people trust it.
 */
export interface Audited {
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

// ---------------------------------------------------------------- projects

export const AU_STATES = ["SA", "NSW", "VIC", "QLD", "WA", "NT", "TAS", "ACT"] as const;
export type AuState = (typeof AU_STATES)[number];

/**
 * An address is a record, not a string on another record.
 *
 * They get corrected and they get changed — a lot renumbered by council, a street
 * renamed, a typo found at handover — and everything pointing at one should follow
 * without being edited individually. So projects and jobs hold an id, not text.
 *
 * Lot and street numbers are strings: "12A", "5-7", "Lot 3" are as common as 12.
 */
export interface Address {
  id: Uuid;
  lotNumber: string | null;
  streetNumber: string | null;
  street1: string;
  street2: string | null;
  suburb: string;
  state: AuState;
  /**
   * Four digits, as a string. Australian postcodes are not numbers — 0800 is Darwin,
   * and an integer would silently make it 800. The database checks the shape.
   */
  postcode: string;
  country: "AU";
  /**
   * An enum value since 0003, not an id — "City of Burnside" reads straight off the
   * row. Only an SA address may carry one; the database enforces that with a CHECK.
   *
   * Required in practice: a South Australian address must name its council, and every
   * address is South Australian today. Expressed as a conditional CHECK rather than a
   * flat NOT NULL so an interstate address stays enterable — the enum is SA-only, so
   * there would be no valid value to give it.
   */
  council: SaCouncil | null;
  /** Generated in Postgres. Read-only: never write to it. */
  consolidatedAddress: string;
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

/**
 * The 68 South Australian councils, as the LGA lists them and in that order — so a
 * picker rendering this array in sequence is already alphabetical the way the LGA reads
 * it ("District Council of Ceduna" under C, not D).
 *
 * This mirrors the `sa_council` Postgres enum from migration 0003 exactly. It replaced
 * the `council_regions` table, which is why there is no `CouncilRegion` interface any
 * more: a council is a value on the address now, not a row it points at.
 *
 * Source: https://www.lga.sa.gov.au/sa-councils/councils-listing
 */
export const SA_COUNCILS = [
  "City of Adelaide", "Adelaide Hills Council", "Adelaide Plains Council",
  "Alexandrina Council", "The Barossa Council", "Barunga West Council",
  "Berri Barmera Council", "City of Burnside", "Campbelltown City Council",
  "District Council of Ceduna", "City of Charles Sturt",
  "Clare and Gilbert Valleys Council", "District Council of Cleve",
  "District Council of Coober Pedy", "Coorong District Council",
  "Copper Coast Council", "District Council of Elliston",
  "The Flinders Ranges Council", "District Council of Franklin Harbour",
  "Town of Gawler", "Regional Council of Goyder", "City of Holdfast Bay",
  "Kangaroo Island Council", "District Council of Karoonda East Murray",
  "District Council of Kimba", "Kingston District Council", "Light Regional Council",
  "Lower Eyre Council", "District Council of Loxton Waikerie", "City of Marion",
  "Mid Murray Council", "City of Mitcham", "Mount Barker District Council",
  "City of Mount Gambier", "District Council of Mount Remarkable",
  "Rural City of Murray Bridge", "Naracoorte Lucindale Council",
  "Northern Areas Council", "City of Norwood Payneham & St Peters",
  "City of Onkaparinga", "District Council of Orroroo Carrieton",
  "District Council of Peterborough", "City of Playford",
  "City of Port Adelaide Enfield", "Port Augusta City Council",
  "City of Port Lincoln", "Port Pirie Regional Council", "City of Prospect",
  "Renmark Paringa Council", "District Council of Robe",
  "Municipal Council of Roxby Downs", "City of Salisbury",
  "Southern Limestone Coast Council", "Southern Mallee District Council",
  "District Council of Streaky Bay", "Tatiara District Council",
  "City of Tea Tree Gully", "District Council of Tumby Bay", "City of Unley",
  "City of Victor Harbor", "Wakefield Regional Council", "Town of Walkerville",
  "Wattle Range Council", "City of West Torrens", "City of Whyalla",
  "Wudinna District Council", "District Council of Yankalilla",
  "Yorke Peninsula Council"
] as const;
export type SaCouncil = (typeof SA_COUNCILS)[number];

/**
 * An address a project or job used to have, and the period it applied for.
 *
 * Superseded assignments only — the current and original addresses live in columns on
 * the record itself, so no fact is stored twice. And it holds the *link*, never a copy
 * of the address text: that lives once, in `addresses`.
 *
 * Why the two columns are not enough on their own: when a project's current address
 * repoints from "20 Corner Street" to "20A Corner Street", the 20 Corner Street row is
 * orphaned. It still exists and search still finds the text, but nothing can say whose
 * it was. This is what makes "12 Test Street" still find project 1042 years after it
 * became "20 Corner Street".
 *
 * Exactly one of `projectId` / `jobId` is set — two real foreign keys rather than a
 * subject-type discriminator, so the reference is enforced and the delete cascades.
 */
export interface AddressHistory {
  /** bigint identity. Nothing references this table, so a sequential key is enough. */
  id: number;
  /** Still uuids: projects and jobs move to natural keys in a later batch. */
  projectId: Uuid | null;
  jobId: Uuid | null;
  addressId: Uuid;
  role: "original" | "current";
  validFrom: IsoDateTime;
  /** A row only exists once superseded, so this is never null. */
  validTo: IsoDateTime;
  changedBy: Uuid | null;
  createdAt: IsoDateTime;
}

/**
 * Two addresses, not one. `original` is where the project started and never moves —
 * it is what contracts and old paperwork refer to. `current` is what every card, board
 * and search shows. They are the same until something changes, and a blank `current`
 * falls back to `original` in the database rather than in every caller.
 */
export const PROJECT_TYPES = ["residential", "commercial", "development"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  residential: "Residential",
  commercial: "Commercial",
  development: "Development"
};

/**
 * One status, on both projects and jobs — a record is in exactly one of these at a time.
 *
 * This is NOT health. Health is a separate, calculated thing (on schedule? over budget?
 * an issue raised?) assembled from inputs still to be decided, and it is deliberately
 * absent from the schema until they are known. Status is what someone sets; health is
 * what the system works out.
 *
 * Snake_case because these are codes, not copy — `RECORD_STATUS_LABELS` holds what a
 * person reads, so a rename is not a data migration.
 */
export const RECORD_STATUSES = [
  "on_track", "at_risk", "behind_schedule", "on_hold",
  "completed", "cancelled", "archived"
] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const RECORD_STATUS_LABELS: Record<RecordStatus, string> = {
  on_track: "On track",
  at_risk: "At risk",
  behind_schedule: "Behind schedule",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived"
};

/** Not finished and not abandoned. Mirrors the is_current() function in Postgres. */
export const isCurrent = (s: RecordStatus): boolean =>
  s !== "completed" && s !== "cancelled" && s !== "archived";

export interface Project {
  /**
   * The 4-digit number itself — 1042 — not a uuid with the number beside it.
   *
   * Sequential from 1000, and settable by hand so the import can assign numbers. There
   * is no separate `projectNo` any more: there was never a reason for a project to have
   * two identities, and having two meant every child row carried both.
   */
  id: number;
  /** Optional. Most projects are known by their address, not by a name. */
  name: string | null;
  originalAddressId: Uuid | null;
  currentAddressId: Uuid;
  /**
   * The current address as text, resolved on the read.
   *
   * The id alone is what every project screen had, which is why they all rendered
   * {{project_display.current_address}} over an address the database was holding.
   */
  currentAddress: string | null;
  /** The original address as text — null until the project has been renamed away from it. */
  originalAddress: string | null;
  /** The current address's suburb and council, read through the same embed. */
  suburb: string | null;
  council: string | null;
  /** Who is primarily accountable. A `teams.team_id` slug. */
  owningTeam: TeamId | null;
  assigneeId: Uuid | null;
  /**
   * What was intended at creation — a different fact from how many jobs exist, which is
   * counted, never stored. "We planned four lots and got three" needs both.
   */
  proposedDwellings: number | null;
  projectType: ProjectType | null;
  status: RecordStatus;
  /**
   * Where the project sits in the five-phase lifecycle — the same five words a job uses.
   *
   * Its jobs may legitimately be at different phases; this is the project's own answer.
   * `projectStageFromJobs` on the repository computes what it WOULD be if it followed
   * the lowest job, which is offered rather than applied — see 0039 for why that is not
   * a trigger.
   */
  stage: StageName;
  /** When it entered that phase. Days-in-phase is derived on read, never stored. */
  stageEnteredAt: IsoDateTime;
  /** The project's SharePoint folder. Its jobs' folders are subfolders, held on them. */
  sharepointUrl: string | null;
  startDate: IsoDate | null;
  targetCompletion: IsoDate | null;
  /** Actual, as opposed to target. */
  endDate: IsoDate | null;
  // + fields
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

/**
 * What the record page may change on a project. Dates arrive as 'YYYY-MM-DD' or null
 * (clearing a date is a legitimate edit); the SharePoint URL must be https or null —
 * the database CHECK is the authority and its refusal is shown verbatim.
 */
export interface ProjectPatch {
  startDate?: IsoDate | null;
  targetCompletion?: IsoDate | null;
  endDate?: IsoDate | null;
  sharepointUrl?: string | null;
}

/** The joined shape the cards read — `project_display`. */
export interface ProjectDisplay {
  id: Uuid;
  projectNo: number;
  projectType: ProjectType | null;
  status: RecordStatus;
  currentAddress: string;
  originalAddress: string | null;
  suburb: string;
  councilId: Uuid | null;
}

// -------------------------------------------------------------------- jobs

export interface Job {
  /**
   * The job number itself — '1042-01'. Stamped at insert from the project number and
   * the sequence, then never regenerated: it goes on contracts.
   *
   * `jobNumber` and `projectNo` are both gone. This is the job number, and `projectId`
   * is the project number.
   */
  id: string;
  /**
   * The project number, 1042 — which is also the foreign key, because the number IS the
   * key now. There is no denormalised copy to keep in step any more, and no trigger
   * keeping one.
   */
  projectId: number;
  /**
   * The counter within the project — "01", "02". Assigned by a trigger when omitted,
   * under a lock on the parent project row, so two people creating jobs at once cannot
   * collide. Gaps are permanent: deleting 1042-02 does not slide 1042-03 up.
   */
  jobSequence: string;
  /**
   * The old Lofty number, "12345". SiteBook and Trello use the same one, so one column
   * covers all three. Nullable and unique compose correctly — nulls do not collide — so
   * jobs created in the app simply have none.
   */
  jobNumberOld: string | null;
  /** Same pair as projects, for the same reason. */
  originalAddressId: Uuid | null;
  currentAddressId: Uuid;
  /** The same set as projects. Not health — health is calculated, and not yet built. */
  status: RecordStatus;
  stage: StageName;
  stageEnteredAt: IsoDateTime;
  /** Who is primarily accountable. Drives board grouping. */
  owningTeam: TeamId;
  /**
   * Every team currently holding the job. "One team at a time" is an aspiration, not a
   * fact — a variation in construction can have Selections, Estimating and Scheduling
   * all on the same job — so permission checks ask "any team engaged", not "the owner".
   */
  engagedTeams: TeamId[];
  assigneeId: Uuid | null;
  /** This job's own SharePoint subfolder, inside its project's folder. */
  sharepointUrl: string | null;
  /**
   * The project's folder, resolved by `job_display` rather than copied — the record page
   * shows both links, and a copy would be a second place for it to be wrong the day a
   * site is moved. Same rule as `projectCurrentAddress` below.
   */
  projectSharepointUrl: string | null;
  /**
   * The project's type, resolved by `job_display` — never stored on the job.
   *
   * This said "No `projectType`" and meant it about the *column*: a commercial project
   * does not contain residential jobs, so a second stored field would only ever be a
   * chance to disagree with the first. That still holds. What the view resolves is not a
   * second fact, it is the same one read in one request instead of two — and while this
   * field was absent every job card and job table row rendered
   * {{job_display.project_type}} for a value the view was already returning.
   */
  projectType: ProjectType | null;

  /**
   * The addresses as text, resolved by `job_display` rather than by a second request.
   * A card shows the job number and the address it is at, and neither is useful alone —
   * `1001-01` identifies the job to somebody who knows the numbering, and the address is
   * what everyone else says on the phone.
   *
   * `currentAddress` is never null: `job_current_address_id` is not null and the view
   * joins it inner. `originalAddress` is null until the job has been renamed away from
   * what it was created as.
   *
   * `projectCurrentAddress` is the site the job belongs to, read through from the
   * project rather than copied — a job can show its site but never disagree with it.
   */
  currentAddress: string;
  originalAddress: string | null;
  projectCurrentAddress: string;

  // + fields
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

/** The joined shape the board reads — `job_display`. Carries the inherited type. */
export interface JobDisplay {
  id: Uuid;
  jobNumber: string;
  projectId: Uuid;
  projectNo: number;
  /** Inherited from the project, never stored on the job. */
  projectType: ProjectType | null;
  status: RecordStatus;
  /** Derived from status — not finished and not abandoned. */
  isCurrent: boolean;
  currentAddress: string;
  originalAddress: string | null;
  suburb: string;
}

// ------------------------------------------------------- project/job/stage

/**
 * `JobStage` was here — the composite table, one row per job per stage, carrying
 * entered_at and exited_at so stage history was answerable.
 *
 * Dropped in 0006. The current position moved onto the job itself in 0004 as
 * `jobs.stage` and `jobs.stage_entered_at`, which is what the board filters on and
 * what "days in stage" derives from. That left the table holding only the durations of
 * stages a job had already left, nothing wrote to it, and no screen read it.
 *
 * The cost is per-stage duration history, and it is not recoverable by re-adding the
 * table: bringing the bottleneck ranking back needs this table plus a trigger on
 * `jobs.stage`, collecting from that day forward.
 */

// ------------------------------------------------------------ user profile

/**
 * `profiles`, not `users` — `auth.users` is Supabase's table, populated by Microsoft
 * Entra. This is the row Lofty owns beside it, keyed to it: the same person, but the
 * parts the app decides. Role and team live here, not in Entra.
 */
export interface Profile {
  id: Uuid;
  /**
   * The linked Microsoft account, or null for someone created but not yet arrived.
   *
   * This is not `id`. `id` is Lofty's key, minted when the person is added to the app;
   * this is Entra's, and it appears the first time they sign in. Keeping them separate
   * is what lets the staff list exist before anyone has logged in — and null here is
   * precisely "has no access yet".
   */
  authUserId: Uuid | null;
  /** Two fields, not one — people change names, and greetings use the first. */
  firstName: string;
  lastName: string;
  /** Generated in Postgres from the two above. Read-only: never write to it. */
  fullName: string;
  email: string;
  /**
   * The address they sign in with, when it differs from `email`.
   *
   * At Lofty it usually does: the Microsoft account is `@loftybg.onmicrosoft.com` while
   * the address people actually use is `@lofty.com.au`. `email` stays the real one —
   * this is a matching key and nothing else, and no screen should display it.
   */
  loginEmail: string | null;
  jobTitle: string | null;
  /** Most recent sign-in. Null means never. */
  lastLoginAt: IsoDateTime | null;
  /**
   * The teams this person sits in, by slug. Rows in `profile_teams` again — the array
   * 0022 introduced went back to being a table when membership had to carry a role. The
   * repository flattens the join to slugs here; somebody can be in several, and
   * the admin table has to show all of them rather than picking one.
   */
  teams: TeamId[];
  /**
   * The permission ladder, in order — a comparison, not a set. `viewer` reads,
   * `user` works their own jobs, `manager` reads across teams, `admin` edits
   * definitions, `superadmin` manages teams and can delete. Maps onto Microsoft
   * Teams permission levels when that sync lands.
   */
  permission: PermissionLevel;
  // + fields
  active: boolean;
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

/** Declaration order is the ladder; Postgres compares enum values by it. */
export const PERMISSION_LEVELS = ["viewer", "user", "manager", "admin", "superadmin"] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

/** `atLeast(p, "manager")` reads the way the RLS predicate does. */
export const atLeast = (have: PermissionLevel, need: PermissionLevel): boolean =>
  PERMISSION_LEVELS.indexOf(have) >= PERMISSION_LEVELS.indexOf(need);

/**
 * Team membership is many-to-many — people sit in more than one team.
 *
 * `isPrimary` is what the screens that need a single answer use: which team the
 * dashboard watches, what the board filters to by default. At most one per person,
 * and a new joiner legitimately has none.
 */
export interface ProfileTeam extends Audited {
  profileId: Uuid;
  teamId: TeamId;
  /**
   * The attribute that justifies this being a table rather than an array on the profile.
   * 0022 folded it into an array precisely because the membership carried nothing of its
   * own; managing a team is something of its own, and somebody can be a member of four
   * teams while managing three.
   */
  role: "member" | "manager";
  isPrimary: boolean;
}

/**
 * Where somebody is in the arrival process — derived, never stored.
 *
 * "pending" is the state the staff list makes possible: created in the app, has not
 * signed in with Microsoft yet. It is not a third value of `active`; conflating them
 * would lose the difference between "has not arrived" and "no longer here", which are
 * opposite ends of someone's time at Lofty.
 */
/**
 * A team, as a row.
 *
 * It was a Postgres enum until the schema batch that added natural keys. The list has
 * changed three times — eleven, then fifteen, now twelve — which is the definition of
 * something that belongs in a row rather than in a type. An enum value can be added but
 * never removed, so retiring a team was impossible; `isActive` makes it one flag.
 */
export interface Team {
  /** The slug, and the real key: 'design', 'sales_admin'. Stable; never changes. */
  id: TeamId;
  // No parentTeamId. A team hierarchy was specified and then dropped: the permission
  // scopes are none / own / team / all, and none of them walks a tree.
  /** "Design". Renameable freely, because it is only a label. */
  name: string;
  /** Display order in pickers and on boards. */
  position: number;
  /** Retired teams leave every picker; the history that names them still resolves. */
  isActive: boolean;
}

/**
 * The team slugs, in display order.
 *
 * This is a seed and a fallback, not the source — the database is. It exists for the
 * same reason the other lookup fallbacks do: a query that has not landed yet should
 * degrade to the structure, not to an empty picker. Read `listTeams()` in preference.
 *
 * The last three are seeded inactive. They were added to the enum in 0014 and are not
 * teams: Commercial, Executive and Admin are how people described themselves, not units
 * work is assigned to. `admin` also reads close to the `admin` permission level and is
 * unrelated to it — one is which team you are in, the other is what you may do.
 */
export const TEAM_SEED: readonly Team[] = [
  { id: "acquisition_development", name: "Acquisition & Development", position:  1, isActive: true },
  { id: "sales_admin",             name: "Sales Admin",               position:  2, isActive: true },
  { id: "design",                  name: "Design",                    position:  3, isActive: true },
  { id: "pre_construction_admin",  name: "Pre-Construction Admin",    position:  4, isActive: true },
  { id: "scheduling",              name: "Scheduling",                position:  5, isActive: true },
  { id: "selections",              name: "Selections",                position:  6, isActive: true },
  { id: "estimating",              name: "Estimating",                position:  7, isActive: true },
  { id: "construction",            name: "Construction",              position:  8, isActive: true },
  { id: "construction_admin",      name: "Construction Admin",        position:  9, isActive: true },
  { id: "finance",                 name: "Finance",                   position: 10, isActive: true },
  { id: "maintenance",             name: "Maintenance",               position: 11, isActive: true },
  { id: "lofty_general",           name: "Lofty General",             position: 12, isActive: true },
  { id: "commercial",              name: "Commercial",                position: 90, isActive: false },
  { id: "executive",               name: "Executive",                 position: 91, isActive: false },
  { id: "admin",                   name: "Admin",                     position: 92, isActive: false }
] as const;

export const TEAM_IDS = [
  "acquisition_development", "sales_admin", "design", "pre_construction_admin",
  "scheduling", "selections", "estimating", "construction", "construction_admin",
  "finance", "maintenance", "lofty_general", "commercial", "executive", "admin"
] as const;
export type TeamId = (typeof TEAM_IDS)[number];

/** The label for a slug, falling back to the slug itself rather than to blank. */
export const teamName = (id: TeamId | string, from: readonly Team[] = TEAM_SEED): string =>
  from.find(t => t.id === id)?.name ?? id;

export const PROFILE_STATUSES = ["active", "pending", "inactive"] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export const profileStatus = (p: Profile): ProfileStatus =>
  !p.active ? "inactive" : p.authUserId ? "active" : "pending";

/** What a person is allowed to be created or edited as. `id` is the database's. */
export interface NewProfile {
  firstName: string;
  lastName: string;
  email: string;
  loginEmail: string | null;
  jobTitle: string | null;
  permission: PermissionLevel;
  teams: TeamId[];
}

/** One line of history. Two sources, one shape, because a reader wants one list. */
export interface ActivityEntry {
  id: string;
  kind: "audit" | "login";
  at: IsoDateTime;
  /** The auth user who did it, as recorded. Null for rows written before auth. */
  actorAuthId: string | null;
  summary: string;
}

/**
 * What goes after "Hi, ". One place, so the decision is never re-made ad hoc.
 *
 * It was `preferredName ?? firstName` until 0021 dropped that column. Kept as a function
 * rather than inlined at the two call sites: the greeting is a decision, and if Lofty
 * ever wants one again this is where it goes back.
 */
export const greetingName = (p: Profile): string => p.firstName;

// ------------------------------------------------------------------ lookup
//
// These are reference tables in Supabase, not constants. They are the business
// process — which is exactly why they must come through the repository, not be
// imported from a module: the day they are seeded, every screen already reads them
// from the right place.

/**
 * What is being done, as opposed to where the job is.
 *
 * One type for both kinds of task — a checklist item instantiated from a process
 * template and something somebody typed in — because they differ only by where they came
 * from, and two types would make "what am I working on" a union forever.
 *
 * Deliberately independent of the job's pipeline position. Moving a job backwards must
 * not erase what has already been finished, which is only free because completion lives
 * here and position lives there.
 */
export interface Task {
  id: Uuid;
  /** Exactly one of these is set. Most work hangs off a job; some belongs to the site. */
  jobId: string | null;
  projectId: number | null;
  name: string;
  description: string | null;
  /** Sub-tasks, for the steps that are really several. */
  parentTaskId: Uuid | null;
  position: number;
  owningTeam: TeamId | null;
  assigneeId: Uuid | null;
  status: TaskStatus;
  dueDate: IsoDate | null;
  /** The single source of truth for "is it done". There is no boolean beside it. */
  completedAt: IsoDateTime | null;
  completedBy: Uuid | null;
  /**
   * Council, the EER consultant, SA Water. Kept out of team SLA reporting, because
   * council's statutory 28 days are not Design running late.
   */
  isExternal: boolean;
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

export const TASK_STATUSES = ["open", "in_progress", "blocked", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * What has to happen before what.
 *
 * A relationship rather than a column, because 21 of the 57 preconstruction steps have
 * two or more predecessors and one has five. The lag sits on the edge because Lofty's
 * process map puts its SLAs on the arrows — "Within 14 Days" labels a transition between
 * two steps, not either step itself.
 */
export interface TaskDependency {
  taskId: Uuid;
  dependsOnTaskId: Uuid;
  lagDays: number;
}

/**
 * A change to a job — a record, not a state.
 *
 * Three teams raising conflicting changes to one job is the problem this exists for, and
 * a flag cannot represent three of anything. Each change is its own row with its own
 * owner, cost, approval and team, so Selections, Estimating and Design can all be
 * holding the same job without anything having to lie about it.
 *
 * Always against a job, never a project. A project-level change is an ordinary edit, and
 * project properties are read through by their jobs rather than copied — so "push it to
 * all the jobs" needs no push.
 */
export interface Variation {
  id: Uuid;
  jobId: string;
  /** Per-job. The third variation on 1042-01 is V3 whatever is happening elsewhere. */
  sequence: number;
  /** '1042-01-V3'. What goes in an email to a client, so it never silently changes. */
  number: string;
  title: string;
  /** Why. Captured when the request is raised, not reconstructed six months later. */
  reason: string | null;
  /** Who asked. A client request and a Lofty-caused rework decide who pays. */
  origin: VariationOrigin;
  status: VariationStatus;
  /** The board reads "With us — Estimating". Not the job's team; the variation's. */
  currentTeam: TeamId | null;
  assigneeId: Uuid | null;
  /** A decimal string, not a number — money that does not add up exactly is argued about. */
  cost: string | null;
  daysImpact: number | null;
  raisedAt: IsoDateTime;
  raisedBy: Uuid | null;
  approvedAt: IsoDateTime | null;
  /** May be null with a date set: imported history knows when, not always by whom. */
  approvedBy: Uuid | null;
  cancelledReason: string | null;
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

export const VARIATION_STATUSES = [
  "new", "with_us", "waiting_on_external", "waiting_on_client",
  "on_hold", "completed", "cancelled"
] as const;
export type VariationStatus = (typeof VARIATION_STATUSES)[number];

export const VARIATION_ORIGINS = [
  "client", "lofty", "consultant", "authority", "supplier"
] as const;
export type VariationOrigin = (typeof VARIATION_ORIGINS)[number];

/**
 * A task a variation sent back, and whether it was already finished when it did.
 *
 * The number that makes a process argument settleable — "this change cost us eleven
 * completed tasks". It cannot be reconstructed later: a reopened-and-refinished task
 * just looks slow. The snapshot is taken by the database at the moment it is recorded,
 * so it stays true even after the task is finished again.
 */
export interface VariationReopenedTask {
  variationId: Uuid;
  taskId: Uuid;
  wasComplete: boolean;
  completedAt: IsoDateTime | null;
  reopenedAt: IsoDateTime;
  reopenedBy: Uuid | null;
}

/**
 * Anything that can carry a document, a comment, a tag or an activity entry.
 *
 * Exactly one of these is set on each attachment row. Two real foreign-key columns per
 * parent rather than a type discriminator, so the reference is enforced and the delete
 * cascades — the same shape tasks and address history use.
 */
export interface RecordRef {
  projectId: number | null;
  jobId: string | null;
  taskId: Uuid | null;
  variationId: Uuid | null;
}

/**
 * A file, held once.
 *
 * Which records it is attached to lives in `DocumentLink`, not here, because the same
 * soil report genuinely belongs to a project AND to every job on it. Four parent columns
 * on the document itself would mean four copies of one PDF and four places for its name
 * to drift apart.
 */
export interface Doc {
  id: Uuid;
  name: string;
  description: string | null;
  /** Nullable: a row can exist for a document Lofty expects but has not received. */
  storagePath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  category: DocumentCategory;
  /**
   * Versions as a chain, not a number. A version integer cannot say WHICH document a
   * revision revises, and "show me the current drawing and what it replaced" is the
   * question people actually ask.
   */
  supersedesId: Uuid | null;
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

export const DOCUMENT_CATEGORIES = [
  "contract", "drawing", "permit", "certificate",
  "photo", "invoice", "report", "correspondence", "other"
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export interface DocumentLink extends RecordRef {
  id: Uuid;
  documentId: Uuid;
}

/**
 * What somebody wrote on a record.
 *
 * Separate from `ActivityEvent` because a comment is user-authored and mutable while an
 * event must be append-only, and one table cannot be both without the append-only half
 * becoming a convention rather than a rule.
 */
export interface Comment extends RecordRef {
  id: Uuid;
  body: string;
  parentCommentId: Uuid | null;
  /** Set when the body changes, so an edit is never silent. */
  editedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

/**
 * One entry in the readable feed — "Deanna moved this to Construction".
 *
 * Distinct from `activity_audit`, which is the forensic column-level log: admin-only,
 * whole rows as jsonb, and unreadable in a drawer. Neither can be derived from the other
 * and they answer different questions for different people.
 */
export interface ActivityEvent extends RecordRef {
  id: number;
  /** A key the app renders, not a sentence stored in the database — sentences get reworded. */
  kind: string;
  /** The nouns the sentence needs. Shape differs per kind. */
  detail: Record<string, unknown>;
  at: IsoDateTime;
  by: Uuid | null;
}

export interface Tag {
  id: string;
  name: string;
  /** Hex, checked by the database, so a palette stays one. */
  colour: string | null;
  isActive: boolean;
}

/**
 * The nine values of the `stage` Postgres enum, in order.
 *
 * This list was wrong in every part of the app until the migration that reconciled it:
 * the type in the database had been title-cased and split by hand — Handover and
 * Maintenance became two stages — and no migration was ever written for it, so the
 * TypeScript, the seed data and the saved views all still said "Sales & acquisition".
 * A job created through the UI would have been rejected by the enum.
 *
 * Due to be replaced by `pipeline_stages` rows, at which point this constant goes the
 * same way the team list just did. Until then it mirrors the database exactly, and the
 * order is board order.
 */
export const STAGE_NAMES = [
  "Acquisition & Development",
  "Pre-construction",
  "Construction",
  "Handover & Maintenance",
  "Closed"
] as const;
export type StageName = (typeof STAGE_NAMES)[number];

/** Stages are a seeded lookup, ordered — this order is the board's column order. */
export interface Stage extends Audited {
  id: number;
  name: string;
  position: number;
}

/**
 * `template_phases` — which team owns a stage, and how long it should take.
 *
 * Stated, not derived from whatever jobs happen to be loaded: a team that owns a phase
 * owns it on a quiet day too.
 */
export interface TemplatePhase {
  stageId: number;
  stageName: string;
  owningTeamNames: string[];
  /**
   * Null when nobody has set one, which is currently all nine.
   *
   * It was a plain number and the app filled it with 10, 14, 12, 90 — invented, and then
   * drawn as Gantt bars against an equally invented day count. `pipeline_stage_expected_days`
   * is nullable for exactly this reason: an unset SLA is a real state, and it is not zero.
   */
  expectedDays: number | null;
}

/** `template_checkpoints` — what a phase expects done before it hands over. */
export interface TemplateCheckpoint {
  stageId: number;
  stageName: string;
  label: string;
  position: number;
}

// -------------------------------------------------------------- properties

export type PropertyScope = "project" | "job";

export type PropertyFormat =
  | "text" | "number" | "currency" | "date" | "checkbox"
  | "file" | "single select" | "multi select" | "person" | "link";

/**
 * `property_defs`. A property IS a field — the two words mean the same thing.
 *
 * Every one lives at project or job level and carries two pieces of context: which
 * stage captures it, and which team captures it. Stage is deliberately not a third
 * level — a pour date is a property of a *job* that happens to be filled in at
 * Scheduling & Estimating.
 *
 * These are rows, not columns, which is why nothing in this app has `field_1`. The
 * count is data.
 */
export interface PropertyDef {
  key: string;
  label: string;
  scope: PropertyScope;
  stageName: string;
  teamName: string;
  format: PropertyFormat;
  /** Required to *leave* its stage, not required to create the record. */
  required: boolean;
  automation?: string;
}

// ------------------------------------------------------------------ creating

/**
 * What a person actually types to create something.
 *
 * These are deliberately not `Partial<Project>`. Most of a project is not the caller's
 * to supply: `projectNo` comes from a sequence, `jobNumber` from a generated column,
 * `stage` and `stageEnteredAt` from defaults, and the audit quartet from triggers. A
 * create type that accepted them would invite writing values the database is going to
 * overwrite — or worse, succeed in overwriting them.
 *
 * The address is nested rather than an id because the person creating a project has an
 * address in their hand, not a row in `addresses`. Making them create the address first
 * would be the app leaking its own schema into a form.
 */
export interface NewAddress {
  lotNumber?: string | null;
  streetNumber?: string | null;
  /**
   * Optional since `0037`, and that is the whole point of it.
   *
   * Lofty, 23 August: a project is never created without an address, *"but only the
   * suburb and postcode and state will be known for sure"* — land is bought before it
   * has a frontage. An address with no street is a **locality**, which is enough for a
   * project and never enough for a job. `addresses.address_precision` says which one
   * this is, generated from this field, and a trigger keeps jobs on the street kind.
   *
   * Blank and absent mean the same thing here; the repository normalises before insert,
   * because `""` would be a street named nothing.
   */
  street1?: string | null;
  street2?: string | null;
  suburb: string;
  state?: AuState;
  /** Required. There is no sensible default for a postcode. */
  postcode: string;
  council?: SaCouncil | null;
}

export interface NewProject {
  address: NewAddress;
  /**
   * What people call it — "Mt Gambier division". Optional, because most projects are
   * known by their address and a name would only repeat it; useful precisely when the
   * address is a locality and "Mount Gambier SA 5290" is not what anyone says out loud.
   */
  name?: string | null;
  /** Required. A project without a type cannot be reported on, grouped or filtered. */
  projectType: ProjectType;
  /**
   * How many dwellings are intended, captured at creation.
   *
   * Deliberately not the same fact as how many jobs exist, which is counted and never
   * stored — "we planned four lots and got three" needs both numbers. It is also what
   * the Create jobs action offers as its default count, which is the only reason the
   * form asks for it at creation rather than later.
   */
  proposedDwellings?: number | null;
  status?: RecordStatus;
  startDate?: IsoDate | null;
  targetCompletion?: IsoDate | null;
}

/**
 * Splitting a project into its lots, in one go.
 *
 * The alternative is the New job dialog n times, which is how it works today and is
 * wrong in a way that matters beyond tedium: each of those jobs points at the *project's*
 * address row, so none of them carries its own lot number, and "Lot 3, Corner Street"
 * has nowhere to live.
 *
 * A split gives every job an address of its own — a copy of the project's current
 * address taken at that moment, with the lot number set. That copy is what makes the
 * original address meaningful: a later change to the project's address does not rewrite
 * what the jobs were originally called.
 */
/**
 * The most jobs one split will create.
 *
 * Not a database limit — a typo guard. Lofty's biggest sites are tens of dwellings, so a
 * mistyped "400" is a mistake every time, and 400 rows of junk on a real project is
 * tedious to undo one Remove button at a time.
 *
 * Here rather than in the repository so the form and the write share one number without
 * a component importing the module that holds the Supabase client.
 */
export const MAX_SPLIT = 60;

/**
 * One job in a split, as the person entering it described it.
 *
 * Lofty, 25 August: creating jobs from a project needs "space to add in details such as
 * job address (if known) such as 2a launceston ave might now be lot 1, 2a launceston,
 * lot 2b, 2a launceston etc and also the old job number as well from the old system."
 *
 * So a lot is not always "1, 2, 3": `2B` is a real lot number, which is why this is text
 * rather than a number and why the batch is a list rather than a count and a start.
 */
export interface SplitLot {
  /** As it appears on the plan of division — "1", "2B", "14A". */
  lotNumber: string;
  /**
   * The number this job has in SiteBook or Trello, when it is a job that already exists
   * there. Unique across `jobs`, and nullable — jobs created here have none.
   */
  jobNumberOld?: string | null;
}

export interface JobSplit {
  projectId: number;
  /** How many jobs to create. Ignored when `lots` is given, which says both. */
  count: number;
  /**
   * The lots themselves, when the person named them.
   *
   * Present, this is the batch — its length is the count and its order is the order.
   * Absent, `count` and `startLot` generate "1, 2, 3…" as they always did, which is
   * still what the inline row and the create-then-split flow want.
   */
  lots?: SplitLot[];
  /**
   * Required, and not defaulted — the same reason `NewJob.owningTeam` is not. One team
   * for the batch: at a split every lot is with whoever is starting the site, and they
   * diverge later.
   */
  owningTeam: TeamId;
  /**
   * The lot number the first job carries; the rest count up from it. Defaults to 1.
   *
   * Settable because a second split on the same project is adding lots 5 and 6, not
   * repeating 1 and 2 — the job sequence continues from its high-water mark, and the lot
   * numbering has to be able to as well.
   */
  startLot?: number;
  /** Stage and status for every job in the batch. Both default as a single job does. */
  stage?: StageName;
  status?: RecordStatus;
}

/**
 * A job belongs to a project and inherits its address unless given its own — which is
 * the common case, so `address` is optional and the database's default_current_address
 * trigger fills it in.
 *
 * `jobSequence` is absent on purpose: a trigger assigns it under a lock on the parent
 * project, which is the only way two people creating jobs at once do not collide.
 */
export interface NewJob {
  projectId: number;
  /**
   * Required, and deliberately not defaulted anywhere.
   *
   * This is what the permission ladder reads to decide whose work a job is. A default
   * would file every job created without a team under one team, and nobody would ever
   * see the prompt that would have made them choose.
   */
  owningTeam: TeamId;
  address?: NewAddress;
  stage?: StageName;
  status?: RecordStatus;
}
