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

/** A history stint with its address resolved to text — what the record page lists. */
export interface AddressHistoryEntry {
  id: number;
  role: "original" | "current";
  address: string | null;
  validFrom: IsoDateTime;
  validTo: IsoDateTime;
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
  /**
   * How that total splits between the two kinds of lot (0053). Null on both means the
   * split is not known — true of every project created before the columns existed, and
   * not the same statement as zero.
   */
  communityTitleLots: number | null;
  torrensTitleLots: number | null;
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
  /** Ownership and assignment — editable on projects as on jobs (Amber's Q2). */
  owningTeam?: TeamId;
  assigneeId?: Uuid | null;
}

/**
 * What may change on a job outside a lifecycle move (which is `moveJobStage`, with its
 * own rules). Ownership and assignment, per Amber's Q2: both editable in the app.
 * `assigneeId: null` un-assigns — a real edit, distinct from "not this edit".
 */
export interface JobPatch {
  owningTeam?: TeamId;
  assigneeId?: Uuid | null;
  /**
   * The old Lofty number (Amber, 27 Aug: "the old job number is what everything is
   * linked to and they will look it up"). SiteBook and Trello carry the same one, so
   * this is how a job created by the import gets matched to everything outside the
   * app. Editable from the drawer; null clears. Unique in the database — two jobs
   * claiming the same old number is the collision this exists to prevent.
   */
  jobNumberOld?: string | null;
  /**
   * Which kind of lot this job is (0054). Editable because the split's seeding is a
   * guess at which lots take which title, and a wrong one has to be fixable where it
   * shows — the drawer.
   */
  titleType?: TitleType | null;
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
  /**
   * Community or Torrens title (0054). Set at the split from the project's intended
   * mix, editable per job afterwards, and null when nobody has said — which is every
   * job that existed before the column.
   */
  titleType: TitleType | null;
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
  /**
   * Held at the door (0049, Amber 27 Aug). A demo account signs in, reaches the gate
   * screen and reads nothing — enforced by `is_active_user()`, not by this flag, which
   * only decides what the app shows. Deliberately neither deactivation ("this person is
   * gone" — wrong for somebody starting Monday) nor a permission level (that is how far
   * you reach once you are in): a real, ready account nobody can wander alone.
   */
  isDemo: boolean;
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
/**
 * A team slug. This was `(typeof TEAM_IDS)[number]` — a closed union — until teams
 * became creatable from Admin (Amber, 27 Aug: "build it next"). A union can only name
 * teams that existed at compile time, so the moment the app can add a row, the type had
 * to open. What held the union's ground moves elsewhere: `TEAM_SEED` stays the
 * backendless fallback, and `verify/seeds.sh` keeps it honest as an ordered subset of
 * the live table rather than the whole of it.
 */
export type TeamId = string;

/**
 * The team every new record opens with — Acquisition & Development, the team that owns
 * the first lifecycle stage. Not a guess standing in for a decision: Amber, 26 August,
 * "all jobs auto-assigned to Acquisition & Development on creation", projects included.
 * The create dialogs pre-select it (still a picker — a job that genuinely starts
 * elsewhere is one selection away) and `createProject` writes it outright, since the
 * project form has no team field to override it with.
 */
export const OPENING_TEAM: TeamId = "acquisition_development";

/** The label for a slug, falling back to the slug itself rather than to blank. */
export const teamName = (id: TeamId | string, from: readonly Team[] = TEAM_SEED): string =>
  from.find(t => t.id === id)?.name ?? id;

/**
 * The slug a team name gets — cut once at creation, then permanent. One function so the
 * Admin screen's preview and the repository's insert can never disagree about what
 * "Pre-Construction Admin" becomes. Empty when the name has no letter or digit to keep.
 */
export const teamSlug = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

// ------------------------------------------------------------- saved views

/** The boards that have saved views — the CHECK on `saved_views` names the same two. */
export const SAVED_VIEW_BOARDS = ["jobs", "projects"] as const;
export type SavedViewBoard = (typeof SAVED_VIEW_BOARDS)[number];

/**
 * A user-saved board state (0048, Amber's Q9 third layer): a name over the board's
 * query string, stored verbatim. The URL is already the app's serialisation of "what
 * am I looking at", so the row keeps that string and nothing else — unknown keys fall
 * back harmlessly on read, exactly as a pasted link would.
 */
export interface UserSavedView {
  id: Uuid;
  board: SavedViewBoard;
  name: string;
  /** The query string without the leading '?'. */
  query: string;
  /**
   * The team it is shared with, or null for private — the default (0051). A shared
   * view is readable by everyone in that team and editable only by whoever made it,
   * which is why the read and write policies are separate.
   */
  sharedWithTeam: TeamId | null;
  /** Whose it is, resolved — null for your own, since you know. */
  ownerName: string | null;
  /** True when it is yours: the only case where the edit controls appear. */
  isMine: boolean;
}

// ------------------------------------------------------- bugs and ideas (0052)

/**
 * The two things somebody can send from the footer. Same row, different word on it:
 * a bug is something that went wrong, an idea is something that could be better, and
 * both end up on Amber's list of what to implement.
 */
export const FEEDBACK_KINDS = ["bug", "idea"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/**
 * Where a request has got to — the queue everybody can see (0060).
 *
 * Amber, 30 Aug, named the first four: *"new ideas or requests populate a stage called
 * requested, then stages are in review, planned, in development."* `shipped` and
 * `declined` are the two endings, and both have to exist for the board to be honest —
 * without `shipped` a delivered request sits in "in development" forever, and without
 * `declined` the only way to answer "no" is to delete the request, which is how somebody
 * comes back and asks for the same thing in March.
 *
 * The order of this array IS the order of the board columns. Nothing else decides it.
 */
export const FEEDBACK_STAGES = [
  "requested",
  "in_review",
  "planned",
  "in_development",
  "shipped",
  "declined"
] as const;
export type FeedbackStage = (typeof FEEDBACK_STAGES)[number];

/**
 * The words on screen. The database stores the snake_case value; nobody reads that.
 *
 * `shipped` reads as **"Live in the app"** (Amber, 31 Aug). The stored value stays
 * `shipped` deliberately — it is a CHECK value on `feedback_stage`, and it is also the
 * vocabulary `scripts/changelog.mjs` parses out of commit trailers, so renaming it would
 * be a migration plus a rewrite of the generator to fix a word on a screen. The label is
 * the only place the word is read, so the label is the only place it changes.
 *
 * The reason the word had to change is worth keeping: "shipped" is what a developer calls
 * it, and it answers a question nobody asked. The person who filed the request wants to
 * know whether they can go and use the thing — which is what "Live in the app" says.
 */
export const FEEDBACK_STAGE_LABELS: Record<FeedbackStage, string> = {
  requested: "Requested",
  in_review: "In review",
  planned: "Planned",
  in_development: "In development",
  shipped: "Live in the app",
  declined: "Declined"
};

/**
 * What each stage promises, in the words a person checking on their own request needs.
 *
 * These are captions on a board, not decoration: the difference between "in review" and
 * "planned" is the difference between "we are thinking about it" and "it is going to
 * happen", and a board that shows only the two labels leaves everybody to guess which.
 */
export const FEEDBACK_STAGE_MEANING: Record<FeedbackStage, string> = {
  requested: "Sent in, and not looked at yet.",
  in_review: "Being weighed up — whether, and how big.",
  planned: "It is happening. A roadmap phase says roughly when.",
  in_development: "Being built right now.",
  shipped: "It is in the app now — go and use it.",
  declined: "Considered, and not going ahead."
};

/**
 * The stages the board shows as columns, in order (Amber, 31 Aug: *"change shipped to
 * Live in the app and have it as last column"*).
 *
 * `shipped` used to sit underneath with `declined`, on the argument that both are endings
 * rather than queue positions. That was right about `declined` and wrong about this one:
 * **"Live in the app" is the column everybody is trying to get to**, and a queue whose
 * destination is printed below the queue does not read as a queue. Putting it last makes
 * the board answer "did my thing actually land" by being looked at, which is the reason
 * the tracker exists.
 *
 * `declined` stays underneath. It is an ending nobody is moving towards, and a column of
 * refusals sitting at the end of the run would read as the place requests end up.
 */
export const FEEDBACK_OPEN_STAGES: readonly FeedbackStage[] = [
  "requested", "in_review", "planned", "in_development", "shipped"
];

/** One screenshot on a report (0062). The bytes are in storage; this is the row. */
export interface FeedbackAttachment {
  id: Uuid;
  /** The object path inside the bucket — what a signed URL is asked for. */
  path: string;
  name: string;
  mime: string;
  bytes: number;
}

/** One request, as the tracker board and the Setup list both read it. */
export interface FeedbackItem {
  id: Uuid;
  kind: FeedbackKind;
  title: string;
  detail: string;
  /** The app path it was sent from — captured, never typed. Null on older rows. */
  page: string | null;
  /** The error the app was showing when it was sent. Null when there was none. */
  errorText: string | null;
  stage: FeedbackStage;
  /** When it reached that stage — so "stuck since June" is answerable. */
  stageEnteredAt: IsoDateTime;
  /** Who sent it, resolved for the list. Null when the profile is gone. */
  fromName: string | null;
  /**
   * Who TYPED it, when that was not the person it is from (0070). Null on an ordinary
   * report, which is almost all of them.
   *
   * Shown beside the reporter for the reason 0067 gives about votes: an on-behalf record
   * that does not say it is on behalf is indistinguishable from one somebody made up.
   */
  addedByName: string | null;
  createdAt: string;
  /** Thumbs up, from `feedback_votes` (0061). */
  voteCount: number;
  /** Whether the signed-in person is one of them — the filled thumb. */
  votedByMe: boolean;
  /** The roadmap phase it is planned into, when it is planned at all. */
  roadmapPhaseId: Uuid | null;
  /** Screenshots. Empty rather than absent when a report has none. */
  attachments: FeedbackAttachment[];

  // ------------------------------------------------- duplicates, talk, follows (0064-0068)

  /**
   * Set when this request is a duplicate of another (0066). The row is kept rather than
   * deleted — the person who filed it must still be able to find it and see where the
   * conversation went — and its votes and followers have moved to the target.
   */
  mergedIntoId: Uuid | null;
  /** The survivor's title, resolved: "merged into 9f3c…" is not an answer to anybody. */
  mergedIntoTitle: string | null;
  /** How many duplicates point at THIS one, so a large vote count can explain itself. */
  duplicateCount: number;
  /** Comments you can actually open — the count excludes internal ones you cannot read. */
  commentCount: number;
  /** Whether you are following it. Voting and reporting both follow you automatically. */
  followedByMe: boolean;
  /** Following, and it has moved since you last looked. What the bell counts. */
  moveUnseen: boolean;
}

/**
 * One person's vote, as the voters list shows it.
 *
 * `addedByName` is the whole reason this list exists on screen: an on-behalf vote (0067)
 * is only trustworthy if the people it is counted against can see who entered it.
 */
export interface FeedbackVoter {
  profileId: Uuid;
  name: string | null;
  /** Null when they voted themselves — the ordinary case. */
  addedByName: string | null;
  at: IsoDateTime;
}

/**
 * A request you follow that has moved since you last looked — one row in the bell.
 *
 * Derived rather than stored (0065): the request's stage stamp against your seen stamp.
 * So there is no notification that can outlive, duplicate or contradict the move it
 * describes, and nothing to clean up when a request is deleted or merged away.
 */
export interface MovedRequest {
  id: Uuid;
  title: string;
  stage: FeedbackStage;
  movedAt: IsoDateTime;
  /** The note whoever moved it left, when they left one (0064). */
  note: string | null;
}

/**
 * What the report form sends.
 *
 * The sender, the page and the browser are added by the repository rather than asked
 * for — 0052's rule, and the reason the form is two fields and a radio rather than six.
 */
export interface NewFeedback {
  kind: FeedbackKind;
  title: string;
  detail: string;
  page: string;
  /** Captured from the app's own error state, when there is one. */
  errorText?: string | null;
  /** Screenshots to upload and attach. Empty is the normal case. */
  screenshots?: File[];
  /**
   * Who the request is FROM, when that is not the person typing it (0070; Amber, 31 Aug:
   * *"they may enter it on behalf of someone else"*). Admin and above only — the second
   * insert policy refuses anybody else, and a CHECK refuses it even for them when it
   * names the typist.
   *
   * Undefined is the ordinary case and means "me". It is deliberately not defaulted to
   * the signed-in person: an explicit self-value would be stored as an on-behalf report
   * somebody filed for themselves, which the database is right to refuse.
   */
  onBehalfOf?: Uuid;
}

// -------------------------------------------------- the roadmap and the changelog (0063)

/**
 * Where a phase has got to. Asserted rather than derived from its dates: a phase whose
 * end date has passed is not thereby delivered, and a derived status would tell the whole
 * company something shipped on the strength of a date somebody set in June.
 */
export const ROADMAP_PHASE_STATUSES = ["planned", "in_progress", "delivered"] as const;
export type RoadmapPhaseStatus = (typeof ROADMAP_PHASE_STATUSES)[number];

export const ROADMAP_PHASE_STATUS_LABELS: Record<RoadmapPhaseStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  delivered: "Delivered"
};

/** One phase of the build, as the roadmap draws it. */
export interface RoadmapPhase {
  id: Uuid;
  name: string;
  summary: string;
  /** Both nullable: an unscheduled phase is real, and is drawn as undated. */
  startsOn: string | null;
  endsOn: string | null;
  position: number;
  status: RoadmapPhaseStatus;
}

/** What the phase editor sends. Superadmin only, by policy. */
export interface NewRoadmapPhase {
  name: string;
  summary?: string;
  startsOn?: string | null;
  endsOn?: string | null;
  status?: RoadmapPhaseStatus;
}

/**
 * The phase we are in NOW — what a new request defaults into (Amber, 31 Aug: *"the
 * roadmap phase should default to the highest phase (e.g. now is phase 1)"*).
 *
 * "Now" is asserted, never inferred from today's date, and that is the whole point: 0063
 * made `roadmap_phase_status` an asserted column precisely so a phase whose end date has
 * passed does not silently become delivered. Reading the calendar here would reintroduce
 * exactly the derivation that column exists to prevent.
 *
 * So, in order:
 *   1. the phase somebody has marked **In progress** — the direct answer;
 *   2. failing that, the earliest phase **not yet delivered** — what "now" means when
 *      nobody has marked one, which is the state the roadmap starts in;
 *   3. failing that, null — every phase is delivered, or there are none, and a request
 *      lands unplanned rather than in a phase that is already finished.
 *
 * Position, never name: "Phase 10" sorts before "Phase 2" as text, and the order is a
 * column somebody set rather than something to re-derive from a label.
 */
export function currentRoadmapPhase(phases: RoadmapPhase[]): RoadmapPhase | null {
  const byPosition = [...phases].sort((a, b) => a.position - b.position);
  return (
    byPosition.find(p => p.status === "in_progress") ??
    byPosition.find(p => p.status !== "delivered") ??
    null
  );
}

/** Keep a Changelog's four verbs, and the vocabulary scripts/changelog.mjs parses. */
export const RELEASE_ENTRY_KINDS = ["added", "fixed", "changed", "removed"] as const;
export type ReleaseEntryKind = (typeof RELEASE_ENTRY_KINDS)[number];

export const RELEASE_ENTRY_KIND_LABELS: Record<ReleaseEntryKind, string> = {
  added: "Added",
  fixed: "Fixed",
  changed: "Changed",
  removed: "Removed"
};

/** One line under a release. */
export interface ReleaseEntry {
  id: Uuid;
  kind: ReleaseEntryKind;
  summary: string;
  /** The request this shipped, when there was one — how the loop closes. */
  feedbackId: Uuid | null;
  /** Its title, resolved, so the changelog reads as a sentence rather than a UUID. */
  feedbackTitle: string | null;
}

/** Changing a phase. Only the fields sent are written, so a rename cannot blank a date. */
export interface RoadmapPhasePatch {
  name?: string;
  summary?: string;
  startsOn?: string | null;
  endsOn?: string | null;
  status?: RoadmapPhaseStatus;
}

/**
 * Publishing a release: the version, the words, and the lines under it in one call.
 * A release with no lines is a version number nobody can read anything into.
 */
export interface NewRelease {
  version: string;
  name?: string;
  summary?: string;
  shippedOn: string;
  entries: { kind: ReleaseEntryKind; summary: string; feedbackId?: string | null }[];
}

/** One release, newest first, with its lines. */
export interface Release {
  id: Uuid;
  version: string;
  name: string;
  summary: string;
  shippedOn: string;
  entries: ReleaseEntry[];
}

/**
 * One @mention of you, as the bell reads it.
 *
 * `comment_mentions` has been built and empty since Phase A: a row per person named in
 * a comment, with a read time only that person can set. It is the one notification the
 * app can honestly deliver today — it needs no health calculation, no SLA and no
 * derivation, because a mention is a fact somebody wrote on purpose.
 *
 * The comment's body comes with it, so the panel can show what was said rather than
 * "you were mentioned" and a link.
 */
export interface MentionEntry {
  commentId: Uuid;
  body: string;
  /** Who wrote the comment. Null when their profile is not readable. */
  authorName: string | null;
  at: IsoDateTime;
  /** Null while unread — which is the whole point of the table. */
  readAt: IsoDateTime | null;
  /** Which record it was on. Exactly one, as the comments CHECK enforces. */
  jobId: string | null;
  projectId: number | null;
}

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
  /** Created straight into demo, for somebody who starts with a walkthrough. */
  isDemo?: boolean;
}

/** One line of history. Two sources, one shape, because a reader wants one list. */
export interface ActivityEntry {
  id: string;
  kind: "audit" | "login";
  at: IsoDateTime;
  /** The auth user who did it, as recorded. Null for rows written before auth. */
  actorAuthId: string | null;
  summary: string;
  /**
   * The record that was changed — "Ketan Patel", "1042-03" — and where it lives.
   *
   * An audit line used to read "Updated profiles", which names the table and not the
   * person. On a list of one admin's activity that is forty identical lines, and
   * finding which of them touched Ketan means opening every record in the app.
   */
  subject?: string;
  href?: string | null;
  /**
   * "Updated", "Created", "Deleted" — kept apart from the subject so the line can read
   * "Updated <link>Ketan Patel</link>" rather than repeating the name in a link beside
   * a sentence that already said it.
   */
  verb?: string;
  /** Named only when the list spans several people, where "who" stops being obvious. */
  actorName?: string | null;
  /** What moved on it, both sides rendered. Empty for a sign-in or a plain insert. */
  changes?: FieldChange[];
}

/**
 * One line of a record's history (0058), for the panel on a project or in a job drawer.
 *
 * Composed from `activity_audit`, which records whole-row snapshots: this is that,
 * reduced to the sentence somebody actually wants — what changed, when, and who by.
 * The changed columns are named with their friendly names from the dictionary, so a
 * feed says "Owning team" rather than `job_owning_team`.
 */
// Type-only, so this re-export costs nothing at runtime and cannot make a cycle with
// auditNarrative (which imports the label maps below).
import type { FieldChange } from "./auditNarrative";
export type { FieldChange };

export interface RecordActivity {
  id: string;
  at: IsoDateTime;
  /** '1042' or '1042-03' — what the line is about, since a project feed shows both. */
  subject: string;
  /**
   * Where that record lives, so the subject is a link and not just a label (Amber, 28
   * August: *"she changed Ketan (with link to Ketan's record)"*). Null when the record
   * has no screen of its own — an address row, say.
   */
  href: string | null;
  /** "opened", "created", "deleted" — set only when the row is not a field update. */
  summary: string;
  /**
   * What actually moved, each side already rendered: "Assigned to changed from Deanna
   * Nguyen to Ketan Patel". Empty for an insert or a delete, where `summary` carries it.
   *
   * This is the part the feed was missing. "Assigned to changed" cannot answer the
   * question somebody opens a history to ask, which is always *changed to what*.
   */
  changes: FieldChange[];
  /** Who did it, resolved. Null when the actor is not a profile we can name. */
  who: string | null;
}

/**
 * The newest comment on a job — which is what "latest update" means here.
 *
 * Amber, 28 August: *"the latest update should be the last comment placed on the job."*
 * Not a column on `jobs`: a stored copy of the newest comment disagrees with the thread
 * the first time somebody edits or deletes one. It is the `job_latest_update` view (0059),
 * which is the same comment the drawer shows at the top of its thread, by construction.
 */
export interface LatestUpdate {
  jobId: string;
  /** The comment itself. Never truncated here — the card decides how much it shows. */
  body: string;
  at: IsoDateTime;
  editedAt: IsoDateTime | null;
  /** Who wrote it. Null when the reader cannot see that person's profile. */
  author: string | null;
}

/**
 * One stretch a job spent in one stage.
 *
 * Amber, 28 August: *"on a single job i need to be able to open it as a gantt chart,
 * calendar, list."* A job has no tasks yet, so the only thing it has that happens over
 * time is its passage through the lifecycle — and that is genuinely recorded, in the
 * audit snapshots, rather than something that has to be invented to draw a chart.
 *
 * Built from two facts that are both in the row: a transition's `changed_at` is when a
 * stage ENDED, and the same row's `job_stage_entered_at` is when it BEGAN. Neither is
 * derived from the other and neither is guessed.
 */
export interface StagePeriod {
  stage: StageName | string;
  /** When the job entered this stage. Null when the row predates the column. */
  from: IsoDateTime | null;
  /** When it left. Null for the stage it is in now — that one has not ended. */
  to: IsoDateTime | null;
  /** Whole days in it, to today when it is still open. Null when `from` is unknown. */
  days: number | null;
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
  /** The process run this was instantiated for (0078) — null for a typed-in task. */
  processRunId: Uuid | null;
  /** The template line it was copied from, or null. */
  processTaskId: Uuid | null;
  /** When work began (0081) — stamped on the first move off "to do", editable after. */
  startedAt: IsoDateTime | null;
  /** How long it should take from its start; null is "no agreed duration", not zero. */
  expectedDays: number | null;
  /** Days before due that it reads at risk. Never longer than expectedDays (CHECK). */
  atRiskLeadDays: number | null;
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

export const TASK_STATUSES = ["open", "in_progress", "blocked", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * What each status is called on screen.
 *
 * "To do" rather than "Open", because open is what the database calls it and nobody
 * says it out loud about a checklist. Five states, not a tick box: "blocked" and
 * "cancelled" are the ones that explain why a job has stopped, and a list that only
 * knows done from not-done cannot tell "nobody has started this" from "the council has
 * had it for three weeks".
 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled"
};

/** Not done and not abandoned — what a checklist counts and what an overdue read means. */
export const isTaskLive = (s: TaskStatus): boolean => s !== "done" && s !== "cancelled";

/**
 * A task as a screen reads it: the row, plus the names its ids point at.
 *
 * Same shape as `CommentEntry` over `Comment`, for the same reason — resolving the
 * assignee once on the read beats every list joining profiles for itself.
 */
export interface TaskEntry extends Task {
  assigneeName: string | null;
  completedByName: string | null;
  /** Typed due date, or start + expected days when nobody typed one (task_display). */
  dueEffective: IsoDate | null;
  atRiskDate: IsoDate | null;
  health: TaskHealth;
  checklistTotal: number;
  checklistDone: number;
  subtaskTotal: number;
  subtaskDone: number;
}

/** What `task_display` derives from today against the two dates. Never stored. */
export type TaskHealth = "no_due_date" | "on_track" | "at_risk" | "overdue" | "done" | "cancelled";
export const TASK_HEALTH_LABELS: Record<TaskHealth, string> = {
  no_due_date: "No due date",
  on_track: "On track",
  at_risk: "At risk",
  overdue: "Overdue",
  done: "Done",
  cancelled: "Cancelled"
};

/** One tick box under a task (0081). */
export interface TaskChecklistItem {
  id: Uuid;
  taskId: Uuid;
  position: number;
  text: string;
  isDone: boolean;
  doneAt: IsoDateTime | null;
  doneBy: Uuid | null;
  doneByName: string | null;
}

/** One tick box on a template line, copied to every run's task (0081). */
export interface ProcessTaskChecklistItem {
  id: Uuid;
  processTaskId: Uuid;
  position: number;
  text: string;
}

/** Stage completion as the database counts it (0081): counts, never a percentage. */
export interface StageCompletion {
  jobId: string | null;
  projectId: number | null;
  stage: string;
  isCurrent: boolean;
  processesTotal: number;
  processesOpen: number;
  milestonesTotal: number;
  milestonesPassed: number;
  isComplete: boolean;
}

/**
 * What the composer sends. The name is the only thing required, because a checklist
 * people have to fill in six fields to add to is a checklist nobody adds to.
 *
 * `completedAt`, `completedBy` and `createdBy` are absent on purpose: the database
 * stamps all three. A client that can write "completed by" can write somebody else's
 * name into it.
 */
export interface NewTask {
  jobId?: string;
  projectId?: number;
  name: string;
  description?: string | null;
  owningTeam?: TeamId | null;
  assigneeId?: Uuid | null;
  dueDate?: IsoDate | null;
  isExternal?: boolean;
  parentTaskId?: Uuid | null;
  expectedDays?: number | null;
  atRiskLeadDays?: number | null;
}

/** What an edit may move. Completion rides `status` and nothing else. */
export interface TaskPatch {
  name?: string;
  description?: string | null;
  status?: TaskStatus;
  owningTeam?: TeamId | null;
  assigneeId?: Uuid | null;
  dueDate?: IsoDate | null;
  isExternal?: boolean;
  position?: number;
  startedAt?: IsoDateTime | null;
  expectedDays?: number | null;
  atRiskLeadDays?: number | null;
  parentTaskId?: Uuid | null;
}

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

/** A comment with its author's name resolved on the read — what a thread renders. */
export interface CommentEntry extends Comment {
  authorName: string | null;
  /** The tracker request it is on, when it is on one (0064's fifth parent). */
  feedbackId?: Uuid | null;
  /** The official answer, held at the top of the thread. Admin sets it. */
  isPinned?: boolean;
  /**
   * The team's own lane: admin and above only, enforced by the read policy rather than
   * by this flag. A viewer never receives one of these at all.
   */
  isInternal?: boolean;
  /**
   * Set when this comment was the note on a stage change — the stage it announced. One
   * per move rather than one per request, so what was said at each step survives.
   */
  stageAnnounced?: FeedbackStage | null;
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
 *
 * Position 4 was "Handover & Maintenance" until 0076 (Amber, 1 September): handover is
 * the last process of Construction, so the phase after it is just Maintenance.
 */
export const STAGE_NAMES = [
  "Acquisition & Development",
  "Pre-construction",
  "Construction",
  "Maintenance",
  "Completed",
  "Closed",
  "Cancelled"
] as const;
export type StageName = (typeof STAGE_NAMES)[number];

/**
 * The lifecycle grew two positions in 0045, from Amber's rule of 25 August:
 *
 *   - **Completed** (position 5) is what 0035 called "Closed" — done, won, still on
 *     the board.
 *   - **Closed** (position 6) is the archive: reached 12 months after Completed or
 *     Cancelled (a pg_cron clock), hidden by default and visible by filter — which in
 *     this app is the "Closed" saved view.
 *   - **Cancelled** (position 7) is stopped-without-completing. It sits outside the
 *     forwards-only run: any live stage may move TO it, and it is the one stage a
 *     record may leave BACKWARDS (revival). While cancelled, a record keeps its data
 *     but fires no notifications, automations or health alerts.
 *
 * The three slices below exist so nothing re-derives these rules from indexes.
 */

/** The four phases where work actually happens. Cancel is offered from these. */
export const WORKING_STAGES = STAGE_NAMES.slice(0, 4) as readonly StageName[];

/**
 * The forwards-only run, in order: the four working phases, then Completed, then the
 * archive. Cancelled is deliberately not in it — it is entered sideways and left
 * backwards, and `isForwardMove` treats it specially rather than by index.
 */
export const LINEAR_STAGES = STAGE_NAMES.slice(0, 6) as readonly StageName[];

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
  /**
   * How many days before the expected-days deadline the record starts flagging at risk
   * (0047). Null when no lead is set. The database requires an expectation and a lead
   * shorter than it — the editor shows its refusal verbatim rather than pre-empting it.
   */
  atRiskLeadDays: number | null;
}

/** `template_milestones` — what a phase expects done before it hands over. */
export interface TemplateMilestone {
  stageId: number;
  stageName: string;
  label: string;
  position: number;
}

// -------------------------------------------------------------- properties

export const PROPERTY_SCOPES = ["project", "job"] as const;
export type PropertyScope = (typeof PROPERTY_SCOPES)[number];

/**
 * Mirrors the CHECK in 0077 exactly — the picker offers only what the database takes.
 *
 * `unknown` is the workbook's own "unknown (no data)": the definition exists, the slot
 * renders, and nothing can be recorded against it until somebody picks a real format.
 * It is a format the database refuses to store a value for, on purpose.
 */
export const PROPERTY_FORMATS = [
  "text", "number", "currency", "date", "checkbox",
  "file", "single select", "multi select", "person", "link", "unknown"
] as const;
export type PropertyFormat = (typeof PROPERTY_FORMATS)[number];

/** The formats a value can actually be recorded in — everything but `unknown`. */
export const RECORDABLE_FORMATS = PROPERTY_FORMATS.filter(f => f !== "unknown") as readonly PropertyFormat[];

/**
 * `property_defs`. A property IS a field — the two words mean the same thing.
 *
 * Every one lives at project or job level and carries two pieces of context: which
 * stage captures it, and which team captures it. Stage is deliberately not a third
 * level — a pour date is a property of a *job* that happens to be filled in during
 * Construction. Which *process* collects it is a `process_properties` row, because the
 * same fact can be collected by more than one process.
 *
 * These are rows, not columns, which is why nothing in this app has `field_1`. The
 * count is data.
 *
 * THE LOCKS (0077). Four rungs, one per verb, plus `restricted`. Resolution for a verb:
 * superadmin always; below the verb's rung never; restricted — only a team or person
 * named in `property_access`; unrestricted — manager and above, or nobody named at all,
 * or named. Manager does NOT bypass restricted. The database resolves this; the app
 * reads the answer through `myPropertyAccess()` and hides controls accordingly.
 */
export interface PropertyDef {
  key: string;
  label: string;
  scope: PropertyScope;
  stageName: string;
  /** The slug, for edits; `teamName` is the display name resolved on the read. Null
   *  when the workbook named nobody — a blank, not a gap to fill. */
  teamId: TeamId | null;
  teamName: string | null;
  format: PropertyFormat;
  /** Required to *leave* its stage, not required to create the record. */
  required: boolean;
  automation?: string;
  /** Order among its stage's slots — data, not alphabet. */
  position: number;
  /** Opt-in: when true nobody but superadmin touches its values unless granted. */
  restricted: boolean;
  createLevel: PermissionLevel;
  readLevel: PermissionLevel;
  updateLevel: PermissionLevel;
  deleteLevel: PermissionLevel;
  /** The SLA sheet's number for this step, in days, as given. Null when it gave none. */
  slaDays: number | null;
  /** Retired properties stop appearing on forms and keep every value ever recorded. */
  isActive: boolean;
  description: string | null;
  /** Where it came from — "Properties!12" — so a question can go back to the sheet. */
  importRef: string | null;
}

/**
 * Defining a field. The key is the identity and the database checks it is a slug;
 * everything else can change later without the values losing their parent.
 */
export interface NewPropertyDef {
  key: string;
  label: string;
  scope: PropertyScope;
  stageName: string;
  teamId?: TeamId | null;
  format: PropertyFormat;
  required?: boolean;
  automation?: string | null;
  position?: number;
  restricted?: boolean;
  createLevel?: PermissionLevel;
  readLevel?: PermissionLevel;
  updateLevel?: PermissionLevel;
  deleteLevel?: PermissionLevel;
  slaDays?: number | null;
  isActive?: boolean;
  description?: string | null;
}

export type PropertyDefPatch = Partial<Omit<NewPropertyDef, "key">>;

/** A choice on a single- or multi-select property (`property_options`). */
export interface PropertyOption {
  propertyKey: string;
  key: string;
  label: string;
  position: number;
  isActive: boolean;
}

/**
 * One grant on one property (`property_access`): a team OR a person, and the verbs
 * they hold. On an unrestricted property these narrow access below manager; on a
 * restricted one they are the only way in.
 */
export interface PropertyAccess {
  id: Uuid;
  propertyKey: string;
  teamId: TeamId | null;
  profileId: Uuid | null;
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export interface NewPropertyAccess {
  propertyKey: string;
  teamId?: TeamId | null;
  profileId?: Uuid | null;
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

/**
 * What the signed-in person may do with each property's values — the database's own
 * answer (`my_property_access()`), so a control the screen offers is one the policies
 * will accept. A property absent from the list may not be read.
 */
export interface MyPropertyAccess {
  propertyKey: string;
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

/**
 * The answer, typed. Exactly one member is set, and which one is the format's call —
 * the database refuses a text in a date slot. `null` everywhere means "clear it".
 */
export interface PropertyValueData {
  text?: string | null;
  number?: number | null;
  date?: IsoDate | null;
  bool?: boolean | null;
  profileId?: Uuid | null;
  optionKey?: string | null;
  optionKeys?: string[] | null;
}

/**
 * `property_values` — one row per (property, record). Sparse: no row means not
 * recorded. A job may carry a row for a project-scoped property only as a pushed copy
 * (`pushProjectProperties`); the drawer marks those, and the project's own value is the
 * one read through otherwise.
 */
export interface PropertyValue {
  id: Uuid;
  propertyKey: string;
  format: PropertyFormat;
  jobId: string | null;
  projectId: number | null;
  value: PropertyValueData;
  /** When the current answer was recorded and by whom — moves only when the answer does. */
  setAt: IsoDateTime;
  setById: Uuid | null;
  setByName: string | null;
}

/** A line of `property_value_history` — what the answer was, and what it became. */
export interface PropertyValueHistoryEntry {
  id: number;
  propertyKey: string;
  jobId: string | null;
  projectId: number | null;
  oldValue: unknown;
  newValue: unknown;
  at: IsoDateTime;
  byName: string | null;
}

/** A record a value or a process run hangs off — exactly one of the two. */
export interface RecordTarget {
  jobId?: string;
  projectId?: number;
}

// -------------------------------------------------------------- processes

/**
 * `processes` (0078). What happens inside a lifecycle stage, as rows: a named piece of
 * work pinned to a stage, run on a project or a job, with a team, an expected duration
 * and the properties it collects. A process never stores a value — properties do.
 *
 * Replaces the idea of nesting pipelines inside the lifecycle: a job holds many
 * processes at once (fencing can be at "registered mail collected" while retaining is
 * unanswered), which one position never could.
 */
export interface Process {
  id: Uuid;
  key: string;
  name: string;
  stageName: string;
  /** The workbook's grouping inside a stage — "Stage 1", "Stage 2", "Stage 3", "Variation". */
  stageGroup: string | null;
  scope: PropertyScope;
  owningTeam: TeamId | null;
  /** How many days a run should take from its start. Null: no agreed duration, not zero. */
  expectedDays: number | null;
  atRiskLeadDays: number | null;
  /** A boolean, never a percentage: "4 of 7 milestones passed" is true. */
  isMilestone: boolean;
  isExternal: boolean;
  position: number;
  isActive: boolean;
  description: string | null;
  automation: string | null;
  /** The subfolder inside the record's SharePoint folder — a name, not a URL. */
  sharepointFolder: string | null;
  importRef: string | null;
  /**
   * When this process was last changed, and by whom (Amber, 3 Sep: processes "need to show
   * in processes when they were last updated and by who and what happened").
   *
   * The name, not the id, because an id is nobody's answer to "who changed this".
   *
   * Written by `processes_stamp_updated_by` (0091). Nothing had ever written an
   * `updated_by` on any table before that — the column existed and was null everywhere —
   * so this would have printed a blank for a row three people edited this morning.
   *
   * Still null in two honest cases: a row nobody has edited since it was seeded, and a
   * write made by a script or the service role, which has no person behind it. Both read
   * as "no author recorded" rather than being attributed to whoever ran the import.
   */
  updatedAt: string;
  updatedBy: string | null;
}

/**
 * One line of a process's history — what changed, when, and who did it.
 *
 * Read from `activity_audit`, which has stamped every write since 0001, so this is the
 * record rather than a reconstruction. `changes` names only the columns that actually
 * differ between the old row and the new one: an update that touched one field should read
 * as one field, not as eighteen columns rewritten.
 */
export interface ProcessHistoryEntry {
  at: string;
  by: string | null;
  operation: "INSERT" | "UPDATE" | "DELETE";
  changes: { field: string; from: string | null; to: string | null }[];
}

export interface NewProcess {
  key: string;
  name: string;
  stageName: string;
  scope: PropertyScope;
  stageGroup?: string | null;
  owningTeam?: TeamId | null;
  expectedDays?: number | null;
  atRiskLeadDays?: number | null;
  isMilestone?: boolean;
  isExternal?: boolean;
  position?: number;
  description?: string | null;
  automation?: string | null;
  sharepointFolder?: string | null;
}

export type ProcessPatch = Partial<Omit<NewProcess, "key">> & { isActive?: boolean };

/** `process_dependencies` — the process waits for `dependsOnProcessId`, plus lag. */
export interface ProcessDependency {
  processId: Uuid;
  dependsOnProcessId: Uuid;
  lagDays: number;
}

/** `process_properties` — a property this process collects, and whether it must be recorded to complete. */
export interface ProcessProperty {
  processId: Uuid;
  propertyKey: string;
  position: number;
  required: boolean;
}

/** `process_tasks` — a template line of the checklist a run instantiates. */
export interface ProcessTask {
  id: Uuid;
  processId: Uuid;
  parentId: Uuid | null;
  name: string;
  owningTeam: TeamId | null;
  expectedDays: number | null;
  isExternal: boolean;
  position: number;
  importRef: number | null;
}

export interface NewProcessTask {
  processId: Uuid;
  name: string;
  parentId?: Uuid | null;
  owningTeam?: TeamId | null;
  expectedDays?: number | null;
  isExternal?: boolean;
  position?: number;
}

export type ProcessTaskPatch = Partial<Omit<NewProcessTask, "processId">>;

/** `process_task_dependencies` — a template task waits for another, plus lag. */
export interface ProcessTaskDependency {
  taskId: Uuid;
  dependsOnTaskId: Uuid;
  lagDays: number;
}

export const PROCESS_RUN_STATUSES = [
  "not_started", "in_progress", "waiting", "complete", "not_applicable"
] as const;
export type ProcessRunStatus = (typeof PROCESS_RUN_STATUSES)[number];

export const PROCESS_RUN_STATUS_LABELS: Record<ProcessRunStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  waiting: "Waiting",
  complete: "Complete",
  not_applicable: "Not applicable"
};

/** What `process_run_display` derives from the SLA. Never stored. */
export type ProcessRunHealth =
  | "not_started" | "no_expectation" | "on_track" | "at_risk" | "overdue"
  | "complete" | "not_applicable";

export const PROCESS_RUN_HEALTH_LABELS: Record<ProcessRunHealth, string> = {
  not_started: "Not started",
  no_expectation: "No duration set",
  on_track: "On track",
  at_risk: "At risk",
  overdue: "Overdue",
  complete: "Complete",
  not_applicable: "Not applicable"
};

/** A run is still being worked while it is one of these. */
export const isRunOpen = (s: ProcessRunStatus) =>
  s === "not_started" || s === "in_progress" || s === "waiting";

/**
 * `process_run_display` — one process, on one record, one attempt, with the dates and
 * health the view derives from the process's SLA.
 */
export interface ProcessRun {
  id: Uuid;
  processId: Uuid;
  processKey: string;
  processName: string;
  stageName: string;
  stageGroup: string | null;
  scope: PropertyScope;
  owningTeam: TeamId | null;
  isMilestone: boolean;
  isExternal: boolean;
  expectedDays: number | null;
  atRiskLeadDays: number | null;
  position: number;
  jobId: string | null;
  projectId: number | null;
  /** The project the record belongs to, for a job run as well as a project run. */
  recordProjectId: number | null;
  attempt: number;
  status: ProcessRunStatus;
  waitingOn: TeamId | null;
  startedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  completedById: Uuid | null;
  note: string | null;
  dueDate: IsoDate | null;
  atRiskDate: IsoDate | null;
  health: ProcessRunHealth;
  daysTaken: number | null;
}

export interface ProcessRunPatch {
  status?: ProcessRunStatus;
  waitingOn?: TeamId | null;
  note?: string | null;
  /** Override the start the database stamped — a process that began before it was logged. */
  startedAt?: IsoDateTime | null;
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

/**
 * What a project is called: `1042 - REYNELLA, 14 Brodie Road` (Amber, 28 Aug).
 *
 * A rule rather than a field. Typed by hand it produced "14 Brodie Road, Reynella",
 * "Howard Street Windsor Gardens" and "St Clair 2007 St Clair Ave" on six projects —
 * three conventions, none of them sortable, and none of them carrying the number that
 * everything else is filed under.
 *
 * Composed here so the create form, the repository and anything that later exports a
 * folder name all read one implementation. The suburb is upper-cased because that is
 * how Lofty writes it; a locality-only project has no street, and gets the number and
 * suburb alone rather than a trailing comma.
 */
export const projectNameTail = (
  suburb: string | null | undefined,
  street: string | null | undefined
): string => {
  const place = (suburb ?? "").trim().toUpperCase();
  const road = (street ?? "").trim();
  return [place, road].filter(Boolean).join(", ");
};

export const projectDisplayName = (
  projectNumber: number,
  suburb: string | null | undefined,
  street: string | null | undefined
): string => {
  const tail = projectNameTail(suburb, street);
  return tail ? `${projectNumber} - ${tail}` : String(projectNumber);
};

/**
 * The two kinds of lot (0053/0054, Amber 28 Aug: "these are different types and the job
 * will need to carry this information through to the job").
 *
 * Different products, not a label: community title and Torrens title have different
 * titling processes, documents and timelines. A project of six lots may be three of
 * each, and until now that split had nowhere to live.
 */
export const TITLE_TYPES = ["community", "torrens"] as const;
export type TitleType = (typeof TITLE_TYPES)[number];

/** Written the way Lofty writes them: community title lowercase, Torrens a surname. */
export const TITLE_TYPE_LABELS: Record<TitleType, string> = {
  community: "Community title",
  torrens: "Torrens title"
};

/**
 * What a clone brings across (0057, Amber 28 Aug: "would be good to have the ability to
 * clone a job or a project so if we had to revive a project or job we could just copy
 * it with or without the information").
 *
 * Every flag defaults on at the call sites: the common case is "this again", and the
 * unchecked boxes are for the case where the old facts are exactly what you are trying
 * to leave behind. What is NEVER copied is not a flag, because it is not a choice:
 *
 *   - **The number.** The whole reason a cancelled record is cloned rather than revived
 *     is that it needs its own — the sequence issues it.
 *   - **The stage and status.** A clone starts at Acquisition & Development, on track.
 *     Copying "Construction, at risk" would carry over the exact staleness this exists
 *     to escape.
 *   - **The SharePoint folder.** It points at the original's documents. Two records
 *     sharing one folder is how the wrong drawings get built.
 *   - **Activity, comments and time in stage.** They happened to the original.
 */
export interface CloneOptions {
  /** The lot address, copied to a new row — so editing one never edits the other. */
  address: boolean;
  /** Owning team and assignee. Off means it opens unassigned with the starting team. */
  who: boolean;
  /** Community or Torrens title. */
  titleType: boolean;
}

export const CLONE_EVERYTHING: CloneOptions = { address: true, who: true, titleType: true };

export interface NewProject {
  address: NewAddress;
  /**
   * The "Add another address" block on the create form — for legacy imports, where the
   * address a project was bought under is already out of date. When present, the FIRST
   * address becomes the immutable original and THIS one becomes the current address.
   * Amber: "labelled 'new address' which is the new current address."
   */
  newAddress?: NewAddress | null;
  /**
   * NOT ON THE FORM ANY MORE (Amber, 28 Aug: "hide in the setup project form the
   * 'project name' field — project name is the Project number - SUBURB, street
   * address"). The name is a convention, not an opinion, so it is composed by the
   * repository from the number the sequence issues and the address already being
   * saved. Left on the type for the import, which has names of its own to carry.
   */
  name?: string | null;
  /** Required. A project without a type cannot be reported on, grouped or filtered. */
  projectType: ProjectType;
  /**
   * How many lots are intended, by kind (Amber, 28 Aug). The form asks for these two
   * and the repository writes their sum to `project_proposed_dwellings`, so the total
   * and the split cannot disagree — the database refuses a row where they do.
   *
   * Both blank is a real answer: the count is not settled. It is not zero, and it is
   * not "no community lots".
   */
  communityTitleLots?: number | null;
  torrensTitleLots?: number | null;
  /**
   * The total (Amber, 31 Aug: "add in total lots which is the number of community title
   * plus torrens title lots but can also be manually entered").
   *
   * `project_proposed_dwellings`, which the repository used to compute rather than be
   * given. Passed explicitly now because the form has a box for it, and because the one
   * case that box exists for cannot be computed: a total from the old system with no
   * split recorded against it. Omitted — not null, omitted — the repository falls back
   * to the sum, which is what the import wants.
   *
   * `project_lot_split_adds_up` refuses a total that disagrees with a KNOWN split, so
   * the two can only differ where one of them is missing.
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
  /**
   * Community or Torrens (0054). Seeded from the project's intended mix — the first
   * N rows community, the rest Torrens — and editable per row, because which lots take
   * which title is a decision, not a formula. Null when nobody has said.
   */
  titleType?: TitleType | null;
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
   * Required at the seam — a caller must always say whose work the job is, because the
   * permission ladder reads it. The dialogs pre-select OPENING_TEAM (Amber, 26 Aug:
   * every job opens with Acquisition & Development), which reversed "deliberately not
   * defaulted anywhere": the default stopped being a guess when it became her decision.
   */
  owningTeam: TeamId;
  address?: NewAddress;
  stage?: StageName;
  status?: RecordStatus;
  /**
   * The number this job has in SiteBook, when it already exists there — the same column
   * the split's per-lot rows and the drawer write (`jobs.job_number_old`). Optional and
   * blank-as-null, because a job that is new here has none.
   */
  jobNumberOld?: string | null;
}

// ---------------------------------------------------------------------------
// Parties (0082): contacts, companies, classifications, employment, roles on records
// ---------------------------------------------------------------------------

/** A lookup row shared by classifications, party roles and staff roles. */
export interface Classification {
  id: string;
  name: string;
  appliesTo: "contact" | "company" | "both";
  position: number;
  isActive: boolean;
}
export interface PartyRole {
  id: string;
  name: string;
  appliesTo: "contact" | "company" | "both";
  position: number;
  isActive: boolean;
}
export interface StaffRole {
  id: string;
  abbreviation: string;
  name: string;
  position: number;
  isActive: boolean;
}

export const PARTY_SOURCES = ["app", "import", "email", "form", "api", "sitebook"] as const;
export type PartySource = (typeof PARTY_SOURCES)[number];

/** A company as the Contacts list reads it (company_display). */
export interface Company {
  id: Uuid;
  name: string;
  tradingName: string | null;
  abn: string | null;
  addressId: Uuid | null;
  address: string | null;
  notes: string | null;
  source: PartySource;
  isActive: boolean;
  /** Null until a manager signs it off (Amber, 2 Sep). Usable meanwhile, flagged. */
  approvedAt: IsoDateTime | null;
  approvedBy: Uuid | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  classificationIds: string[];
  peopleCount: number;
  openParties: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
export interface NewCompany {
  name: string;
  tradingName?: string | null;
  abn?: string | null;
  notes?: string | null;
  classificationIds?: string[];
  email?: string | null;
  phone?: string | null;
}
export interface CompanyPatch {
  name?: string;
  tradingName?: string | null;
  abn?: string | null;
  addressId?: Uuid | null;
  notes?: string | null;
  isActive?: boolean;
}

/** A person as the Contacts list reads them (contact_display): with their company beside them. */
export interface Contact {
  id: Uuid;
  firstName: string;
  lastName: string | null;
  fullName: string;
  preferredName: string | null;
  addressId: Uuid | null;
  address: string | null;
  notes: string | null;
  /** The future login. Null for everyone today. */
  profileId: Uuid | null;
  source: PartySource;
  isActive: boolean;
  approvedAt: IsoDateTime | null;
  approvedBy: Uuid | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  /** Current employment, if any — read from company_contacts where nothing has ended. */
  companyId: Uuid | null;
  companyName: string | null;
  jobRole: string | null;
  classificationIds: string[];
  openParties: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
export interface NewContact {
  firstName: string;
  lastName?: string | null;
  preferredName?: string | null;
  notes?: string | null;
  classificationIds?: string[];
  email?: string | null;
  phone?: string | null;
  /** Put them at a company straight away, with the role they hold there. */
  companyId?: Uuid | null;
  jobRole?: string | null;
}
export interface ContactPatch {
  firstName?: string;
  lastName?: string | null;
  preferredName?: string | null;
  addressId?: Uuid | null;
  notes?: string | null;
  isActive?: boolean;
}

export const CONTACT_METHOD_KINDS = ["email", "phone", "mobile", "other"] as const;
export type ContactMethodKind = (typeof CONTACT_METHOD_KINDS)[number];
export const CONTACT_METHOD_LABELS: Record<ContactMethodKind, string> = {
  email: "Email", phone: "Phone", mobile: "Mobile", other: "Other"
};

/** One way to reach a contact or a company. Exactly one of the two ids is set. */
export interface ContactMethod {
  id: Uuid;
  contactId: Uuid | null;
  companyId: Uuid | null;
  kind: ContactMethodKind;
  value: string;
  label: string | null;
  isPrimary: boolean;
  isVerified: boolean;
}
export interface NewContactMethod {
  contactId?: Uuid | null;
  companyId?: Uuid | null;
  kind: ContactMethodKind;
  value: string;
  label?: string | null;
  isPrimary?: boolean;
}

/** A person at a company, over time, with the role they hold there. */
export interface CompanyContact {
  id: Uuid;
  companyId: Uuid;
  companyName: string;
  contactId: Uuid;
  contactName: string;
  jobRole: string | null;
  isPrimary: boolean;
  startedOn: IsoDate | null;
  endedOn: IsoDate | null;
}

/** A party on a record, names resolved (record_party_display). */
export interface RecordParty {
  id: Uuid;
  projectId: number | null;
  jobId: string | null;
  processRunId: Uuid | null;
  /** The job a run-level party is ultimately on, so a drawer can list them. */
  recordJobId: string | null;
  recordProjectId: number | null;
  contactId: Uuid | null;
  contactName: string | null;
  companyId: Uuid | null;
  companyName: string | null;
  roleId: string;
  roleName: string;
  engagedByCompanyId: Uuid | null;
  engagedByCompanyName: string | null;
  isPrimary: boolean;
  startedOn: IsoDate;
  endedOn: IsoDate | null;
  note: string | null;
  processName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}
export interface NewRecordParty {
  projectId?: number;
  jobId?: string;
  processRunId?: Uuid;
  contactId?: Uuid | null;
  companyId?: Uuid | null;
  roleId: string;
  engagedByCompanyId?: Uuid | null;
  isPrimary?: boolean;
  note?: string | null;
}

/** A Lofty person holding a SiteBook project role on a project or job. */
export interface RecordStaffRole {
  id: Uuid;
  projectId: number | null;
  jobId: string | null;
  roleId: string;
  roleAbbreviation: string;
  roleName: string;
  profileId: Uuid;
  profileName: string;
  startedOn: IsoDate;
  endedOn: IsoDate | null;
}

/** Which record a party or a role hangs off. Exactly one. */
export type PartyTarget = { projectId: number } | { jobId: string } | { processRunId: Uuid };

// ---------------------------------------------------------------------------
// Notifications (0083)
// ---------------------------------------------------------------------------
export const NOTIFICATION_CHANNELS = ["in_app", "email", "teams", "sms"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: "In-app", email: "Email", teams: "Teams", sms: "SMS"
};
export type NotificationTiming = "immediate" | "digest";

export interface NotificationType {
  id: string;
  name: string;
  description: string | null;
  defaultChannels: NotificationChannel[];
  defaultTiming: NotificationTiming;
  position: number;
  isActive: boolean;
}

export const NOTIFICATION_AUDIENCES = ["assignee", "owning_team", "engaged_teams", "watchers", "managers", "mentioned", "specific_team", "specific_person"] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];
export const NOTIFICATION_AUDIENCE_LABELS: Record<NotificationAudience, string> = {
  assignee: "The assignee",
  owning_team: "The owning team",
  engaged_teams: "The engaged teams",
  watchers: "Whoever watches the record",
  managers: "The managers",
  mentioned: "The person mentioned",
  specific_team: "A named team",
  specific_person: "A named person"
};

export interface NotificationRule {
  id: Uuid;
  typeId: string;
  audience: NotificationAudience;
  teamId: TeamId | null;
  profileId: Uuid | null;
  afterDays: number;
  isActive: boolean;
}
export interface NewNotificationRule {
  typeId: string;
  audience: NotificationAudience;
  teamId?: TeamId | null;
  profileId?: Uuid | null;
  afterDays?: number;
}

/** One person's choice for one type on one channel. Absent means the type's default. */
export interface NotificationPreference {
  typeId: string;
  channel: NotificationChannel;
  isEnabled: boolean;
  timing: NotificationTiming | null;
  digestTime: string | null;
}

export interface Notification {
  id: number;
  typeId: string;
  projectId: number | null;
  jobId: string | null;
  taskId: Uuid | null;
  processRunId: Uuid | null;
  commentId: Uuid | null;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: IsoDateTime;
  readAt: IsoDateTime | null;
}

export interface RecordWatch {
  id: Uuid;
  projectId: number | null;
  jobId: string | null;
}

/** What the outbox looks like from Setup: counts per channel and status. */
export interface DeliveryStat {
  channel: NotificationChannel;
  status: string;
  count: number;
  lastSentAt: IsoDateTime | null;
}

// ---------------------------------------------------------------------------
// Maintenance (0084)
// ---------------------------------------------------------------------------
export const MAINTENANCE_SOURCES = ["email", "phone", "form", "portal", "api", "staff"] as const;
export type MaintenanceSource = (typeof MAINTENANCE_SOURCES)[number];
export const MAINTENANCE_SOURCE_LABELS: Record<MaintenanceSource, string> = {
  email: "Email", phone: "Phone call", form: "Web form", portal: "Portal", api: "API", staff: "Logged by staff"
};
export const MAINTENANCE_STATUSES = ["new", "triaged", "in_progress", "waiting_on_contractor", "waiting_on_client", "completed", "closed", "rejected"] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];
export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  new: "New", triaged: "Triaged", in_progress: "In progress", waiting_on_contractor: "Waiting on contractor",
  waiting_on_client: "Waiting on client", completed: "Completed", closed: "Closed", rejected: "Rejected"
};
export const MAINTENANCE_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];
export const MAINTENANCE_PRIORITY_LABELS: Record<MaintenancePriority, string> = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" };
export type MaintenanceHealth = "no_sla" | "on_track" | "at_risk" | "overdue" | "complete" | "closed";
export const MAINTENANCE_HEALTH_LABELS: Record<MaintenanceHealth, string> = {
  no_sla: "No SLA", on_track: "On track", at_risk: "At risk", overdue: "Over SLA", complete: "Complete", closed: "Closed"
};
export const MAINTENANCE_ITEM_STATUSES = ["open", "assigned", "scheduled", "done", "not_applicable"] as const;
export type MaintenanceItemStatus = (typeof MAINTENANCE_ITEM_STATUSES)[number];
export const MAINTENANCE_ITEM_STATUS_LABELS: Record<MaintenanceItemStatus, string> = {
  open: "Open", assigned: "Assigned", scheduled: "Scheduled", done: "Done", not_applicable: "Not applicable"
};
export const MAINTENANCE_ASSIGNMENT_STATUSES = ["offered", "accepted", "declined", "scheduled", "done", "cancelled"] as const;
export type MaintenanceAssignmentStatus = (typeof MAINTENANCE_ASSIGNMENT_STATUSES)[number];
export const MAINTENANCE_ASSIGNMENT_STATUS_LABELS: Record<MaintenanceAssignmentStatus, string> = {
  offered: "Offered — awaiting answer", accepted: "Accepted", declined: "Declined", scheduled: "Scheduled", done: "Done", cancelled: "Cancelled"
};
export type MaintenanceMessageDirection = "in" | "out" | "note";
export type MaintenanceMessageChannel = "email" | "sms" | "phone" | "form" | "portal" | "app";
export type MaintenanceMessageStatus = "received" | "queued" | "sending" | "sent" | "failed" | "noted";

/** The one row of maintenance_settings. Managers edit; everyone reads. */
export interface MaintenanceSettings {
  warrantyMonths: number;
  offerResponseHours: number;
  reminderDaysBefore: number;
  acceptLinkDays: number;
  intakeMailbox: string | null;
  updatedAt: IsoDateTime;
}

/** A trade and its clock (0084). Empty until Amber writes them. */
export interface MaintenanceCategory {
  id: string;
  name: string;
  partyRoleId: string | null;
  teamId: TeamId | null;
  slaDays: number | null;
  atRiskLeadDays: number | null;
  position: number;
  isActive: boolean;
}

/** A request as maintenance_request_display reads it. */
export interface MaintenanceRequest {
  id: Uuid;
  jobId: string;
  projectId: number;
  number: string;
  sequence: number;
  source: MaintenanceSource;
  reportedByContactId: Uuid | null;
  reportedByName: string | null;
  reportedByEmail: string | null;
  reportedByPhone: string | null;
  reportedAt: IsoDateTime;
  summary: string;
  description: string | null;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  categoryId: string | null;
  categoryName: string | null;
  dueOn: IsoDate | null;
  atRiskOn: IsoDate | null;
  health: MaintenanceHealth;
  ownerProfileId: Uuid | null;
  ownerName: string | null;
  closedAt: IsoDateTime | null;
  closedReason: string | null;
  externalRef: string | null;
  jobAddress: string;
  jobSuburb: string | null;
  handoverAt: IsoDateTime | null;
  warrantyEndsOn: IsoDate | null;
  isWarranty: boolean;
  itemsTotal: number;
  itemsDone: number;
  offersOpen: number;
  nextVisit: IsoDateTime | null;
  messagesTotal: number;
  lastMessageAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
export interface NewMaintenanceRequest {
  jobId: string;
  summary: string;
  source: MaintenanceSource;
  description?: string | null;
  priority?: MaintenancePriority;
  reportedByContactId?: Uuid | null;
  reportedAt?: IsoDateTime | null;
  categoryId?: string | null;
  ownerProfileId?: Uuid | null;
}
export interface MaintenanceRequestPatch {
  summary?: string;
  description?: string | null;
  priority?: MaintenancePriority;
  status?: MaintenanceStatus;
  categoryId?: string | null;
  dueOn?: IsoDate | null;
  ownerProfileId?: Uuid | null;
  reportedByContactId?: Uuid | null;
  closedReason?: string | null;
  externalRef?: string | null;
}

/** An item with its current offer, as maintenance_item_display reads it. */
export interface MaintenanceItem {
  id: Uuid;
  requestId: Uuid;
  position: number;
  description: string;
  location: string | null;
  categoryId: string | null;
  categoryName: string | null;
  partyRoleId: string | null;
  status: MaintenanceItemStatus;
  isWarranty: boolean | null;
  cost: number | null;
  completedAt: IsoDateTime | null;
  completedByName: string | null;
  /** Who did this trade on the job during construction — the default repairer (Amber, answer 3). */
  originalTrade: string | null;
  assignment: MaintenanceAssignment | null;
}
export interface MaintenanceAssignment {
  id: Uuid;
  status: MaintenanceAssignmentStatus;
  companyId: Uuid | null;
  companyName: string | null;
  contactId: Uuid | null;
  contactName: string | null;
  offeredAt: IsoDateTime;
  respondedAt: IsoDateTime | null;
  scheduledFor: IsoDateTime | null;
  note: string | null;
}
export interface MaintenanceItemPatch {
  description?: string;
  location?: string | null;
  categoryId?: string | null;
  status?: MaintenanceItemStatus;
  isWarranty?: boolean | null;
  cost?: number | null;
  position?: number;
}
/** What offer_maintenance_item() hands back: the token exactly once. */
export interface MaintenanceOffer {
  assignmentId: Uuid;
  /** Shown once and never stored in the clear; the link is built from it on the spot. */
  acceptToken: string;
  sentTo: string | null;
}

export interface MaintenanceMessage {
  id: Uuid;
  requestId: Uuid;
  assignmentId: Uuid | null;
  direction: MaintenanceMessageDirection;
  channel: MaintenanceMessageChannel;
  fromContactId: Uuid | null;
  fromProfileId: Uuid | null;
  toAddress: string | null;
  subject: string | null;
  body: string;
  status: MaintenanceMessageStatus;
  attempts: number;
  error: string | null;
  at: IsoDateTime;
}

/** The warranty line on a job: handover and when the period ends. Derived, never typed. */
export interface JobWarranty {
  jobId: string;
  handoverAt: IsoDateTime | null;
  warrantyEndsOn: IsoDate | null;
  isInWarranty: boolean;
}

/** What the thread's outbox holds, per status — the Setup → Maintenance panel. */
export interface MaintenanceOutboxStat {
  status: MaintenanceMessageStatus;
  count: number;
  lastAt: IsoDateTime | null;
}

// ---------------------------------------------------------------------------
// The template library and the documents made from it (0094)
// ---------------------------------------------------------------------------

/**
 * One block in a layout.
 *
 * `kind` names a widget registered in `features/reports/adapters/lofty/widgets.js`, and
 * `options` is that widget's own settings. Neither is typed here on purpose: a block type
 * is registered in the app, not in the database, and a union listing them would have to
 * be edited every time somebody adds a block — the coupling the single jsonb column
 * exists to avoid.
 *
 * `options` holds the QUESTION ("group the jobs by stage", "the Site Start properties for
 * this job"), never the ANSWER. Nothing here ever contains a job, a project or a number:
 * those are read live whenever the layout is opened. A template that stored its rows
 * would be a fossil that still looked current.
 */
export interface ReportTemplateBlock {
  id: string;
  kind: string;
  options: Record<string, unknown>;
}

/** A builder layout, as stored in `report_template_layout` and `report_document_layout`. */
export interface ReportTemplateLayout {
  widgets: ReportTemplateBlock[];
  page?: { pageSize?: string; orientation?: string };
  /** Which theme it prints in — a key from the theme set the builder is given. */
  theme?: string;
}

/** An empty layout — what a new one starts as, and what the CHECK requires. */
export const EMPTY_REPORT_TEMPLATE_LAYOUT: ReportTemplateLayout = { widgets: [] };

/**
 * A whole template, or a reusable section dropped into one.
 *
 * Same table, same sign-off, same scope rules — the discriminator is what decides where
 * it is offered: a template starts a document, a section is inserted into one by the
 * "Library section" block.
 */
export const REPORT_TEMPLATE_KINDS = ["template", "section"] as const;
export type ReportTemplateKind = (typeof REPORT_TEMPLATE_KINDS)[number];

export const REPORT_TEMPLATE_KIND_LABELS: Record<ReportTemplateKind, string> = {
  template: "Template",
  section: "Section"
};

/**
 * Who a library entry is for — a visibility band, not an owner.
 *
 * The author is `createdBy` and never changes; this decides who else the entry is offered
 * to once a manager has signed it off.
 */
export const REPORT_TEMPLATE_SCOPES = ["global", "team", "managers"] as const;
export type ReportTemplateScope = (typeof REPORT_TEMPLATE_SCOPES)[number];

export const REPORT_TEMPLATE_SCOPE_LABELS: Record<ReportTemplateScope, string> = {
  global: "Everyone",
  team: "One team",
  managers: "Managers and above"
};

/**
 * A library entry: a template or a section.
 *
 * `approvedAt` null means it is still the author's draft — nobody else can see it, and
 * the read policy in 0094 is what makes that true rather than the screen. `approvedBy` is
 * an id rather than a name: the screens that show it already hold `listProfiles()`, and
 * an embed of `profiles` from here would be ambiguous, because the audit quartet gives
 * this table two foreign keys to it (the PGRST201 shape `verify/embeds.sh` exists to
 * catch).
 */
export interface ReportTemplate {
  id: Uuid;
  kind: ReportTemplateKind;
  name: string;
  description: string | null;
  scope: ReportTemplateScope;
  /** Set for the `team` scope and null for every other, by constraint. */
  teamId: TeamId | null;
  layout: ReportTemplateLayout;
  approvedAt: IsoDateTime | null;
  approvedBy: Uuid | null;
  /** Retired rather than deleted: documents made from it still name it. */
  isActive: boolean;
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

/** True when the entry is in the library rather than sitting in its author's drafts. */
export const isInLibrary = (t: ReportTemplate): boolean => t.approvedAt !== null && t.isActive;

export interface NewReportTemplate {
  kind: ReportTemplateKind;
  name: string;
  description?: string | null;
  scope?: ReportTemplateScope;
  teamId?: TeamId | null;
  layout?: ReportTemplateLayout;
}

export interface ReportTemplatePatch {
  name?: string;
  description?: string | null;
  scope?: ReportTemplateScope;
  teamId?: TeamId | null;
  layout?: ReportTemplateLayout;
  isActive?: boolean;
}

/**
 * One document somebody made — a progress report, a client letter, a maintenance report.
 *
 * Copied from a template and then theirs to edit. That copy is the whole point: Amber,
 * 4 September, on changing the wording of a letter for one instance — if the edit wrote
 * back to the template, the next person to use it would inherit one letter's wording.
 *
 * `jobId` / `projectId` are what the property blocks resolve against. Both null is a real
 * state: a portfolio report is about the whole book of work rather than one site.
 */
export interface ReportDocument {
  id: Uuid;
  title: string;
  layout: ReportTemplateLayout;
  /** What it started from. Null once that template is deleted, or if it never had one. */
  templateId: Uuid | null;
  jobId: string | null;
  projectId: number | null;
  /**
   * Sharing — a link a client can open with no Lofty login.
   *
   * `hasSharePassword` and never the hash: a hash returned to the browser is a hash
   * somebody can attack offline, and the browser has no use for it either way.
   *
   * The expiry is mandatory by constraint. A link nobody revokes is a link that is still
   * open in two years, so "forever" is unwritable rather than merely discouraged.
   */
  shareToken: string | null;
  shareExpiresAt: IsoDateTime | null;
  hasSharePassword: boolean;
  /**
   * Whether a snapshot exists — never the snapshot itself, which is large and which no
   * screen in the app renders. The shared page fetches it from the endpoint by token.
   */
  hasShareSnapshot: boolean;
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

export interface NewReportDocument {
  title: string;
  layout?: ReportTemplateLayout;
  templateId?: Uuid | null;
  jobId?: string | null;
  projectId?: number | null;
}

export interface ReportDocumentPatch {
  title?: string;
  layout?: ReportTemplateLayout;
  jobId?: string | null;
  projectId?: number | null;
}

/**
 * A document compiled for sending, as it was when the link was made.
 *
 * The output of the report module's own `compileReport()` — the same model the PDF, Word,
 * Markdown and HTML writers all take — plus the theme and page setup needed to paint it
 * without the app around it.
 *
 * It is a SNAPSHOT and not a live view, and that is the security design rather than a
 * simplification of it. Compiled in the author's browser under their own session, so it
 * can only contain what their own RLS let them see; served back verbatim, so the endpoint
 * has no query that could forget its filter and hand somebody the whole book of work.
 */
export interface ReportShareSnapshot {
  report: {
    title: string;
    subtitle?: string;
    meta?: Record<string, unknown>;
    sections: Array<{ id: string; title: string; blocks: unknown[] }>;
  };
  theme?: unknown;
  page?: { size?: string; orientation?: string };
}

/**
 * What creating a share link needs.
 *
 * `passwordHash` rather than a password: the browser derives it (PBKDF2-SHA256, in
 * `data/sharePassword.ts`) so a plaintext password never reaches the database or a log.
 * The endpoint re-derives from what the viewer types and compares.
 */
export interface NewReportDocumentShare {
  expiresAt: IsoDateTime;
  snapshot: ReportShareSnapshot;
  passwordHash?: string | null;
}
