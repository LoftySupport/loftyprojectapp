/**
 * `npm run check:orphan-properties` — does every job and project field belong to a process?
 *
 * Amber, 12 September: *"All properties should belong to a process if it is job or project
 * and if they don't they should be flagged as orphaned in the properties setting unless
 * they are the primary key. This should have all properties including properties not on
 * the properties table eg address."* And, clarifying: *"a system property such as a
 * primary key, a user property or contact property or task or maintenance property don't
 * need to belong to a process but may belong to an automation."*
 *
 * WHAT THIS GUARDS, AND WHY IT IS NOT A BROWSER CHECK
 *
 *   `fieldsByCollection` is a pure function over the property definitions and the data
 *   dictionary, so the thing that can go wrong is a classification, not a render. Node
 *   imports the app's own TypeScript through `register-ts.mjs`, which means this runs the
 *   shipping code rather than a copy of it kept in step by hand.
 *
 * THE ONE THAT IS EASY TO GET WRONG
 *
 *   The first version of the classifier read the dictionary's prose for "assigned by",
 *   "maintained by", "bumped by". It agreed with itself on most columns and then split
 *   the siblings: `jobs.job_stage_entered_at` says *maintained by the trigger* and
 *   `projects.project_stage_entered_at` says *moved by a trigger*, so one was exempt and
 *   one was not. Widening the pattern to catch both swept in `job_stage` and
 *   `project_stage` — which a person sets, from the Move control on the record.
 *
 *   So the exemptions are a written-out list, and the assertions below are about the two
 *   ends of that mistake: the stage is NOT exempt, and both stage-entered stamps ARE.
 */
import { DICTIONARY } from "../src/data/dictionary.ts";
import { fieldsByCollection, isGap, orphanCount } from "../src/data/orphanProperties.ts";

let failures = 0;
const ok = (name, condition, detail = "") => {
  if (condition) console.log(`  ok   ${name}`);
  else { failures += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

console.log("\n  Orphaned properties\n");

const rows = fieldsByCollection([], new Map());
const at = (id) => rows.find((r) => r.id === id);
const verdict = (id) => at(id)?.verdict;

// ---- the scope of the rule ----------------------------------------------------
ok("only jobs and projects are swept",
  rows.every((r) => r.scope === "job" || r.scope === "project"));
const swept = new Set(rows.filter((r) => r.source === "column").map((r) => r.id.split(".")[0]));
ok("no other table is reported on", [...swept].every((t) => t === "jobs" || t === "projects"),
  [...swept].join(", "));
for (const table of ["contacts", "tasks", "profiles", "maintenance_requests"]) {
  const anyInDictionary = DICTIONARY.some((e) => e.table === table);
  const anyReported = rows.some((r) => r.id.startsWith(`${table}.`));
  ok(`${table} is out of scope`, !anyReported,
    anyInDictionary ? "" : "(not in the dictionary either, so this proves little)");
}

// ---- the fields Amber named ---------------------------------------------------
ok("the job's current address is reported as not-a-property",
  verdict("jobs.job_current_address_id") === "unattachable", verdict("jobs.job_current_address_id"));
ok("so is the project's", verdict("projects.project_current_address_id") === "unattachable");
for (const id of ["jobs.job_owning_team", "jobs.job_assignee_id", "jobs.job_title_type",
                  "jobs.job_sharepoint_url", "jobs.job_target_completion", "jobs.job_status"]) {
  ok(`${id} is reported`, isGap(verdict(id)), verdict(id));
}

// ---- the exemptions -----------------------------------------------------------
ok("the job number is exempt", verdict("jobs.job_id") === "system");
ok("the project number is exempt", verdict("projects.project_id") === "system");
for (const id of ["jobs.job_created_at", "jobs.job_created_by", "jobs.job_updated_at",
                  "jobs.job_updated_by", "projects.project_updated_at"]) {
  ok(`${id} is exempt`, verdict(id) === "system", verdict(id));
}

// The pair that split the prose test, and the pair the widened test wrongly swept in.
ok("both stage-entered stamps are exempt, not one of them",
  verdict("jobs.job_stage_entered_at") === "system"
  && verdict("projects.project_stage_entered_at") === "system",
  `${verdict("jobs.job_stage_entered_at")} / ${verdict("projects.project_stage_entered_at")}`);
ok("the stage itself is NOT exempt — a person sets it from the record",
  isGap(verdict("jobs.job_stage")) && isGap(verdict("projects.project_stage")),
  `${verdict("jobs.job_stage")} / ${verdict("projects.project_stage")}`);

// ---- merged columns are not reported as gaps ----------------------------------
ok("a column merged away is not a gap", verdict("jobs.id") === "gone" && !isGap("gone"));

// ---- a property definition with and without a process -------------------------
const def = (key, scope) => ({
  key, scope, label: key, stageName: "Construction", teamId: null, teamName: null,
  format: "text", required: false, position: 1, restricted: false,
  createLevel: "user", readLevel: "user", updateLevel: "user", deleteLevel: "user",
  slaDays: null, isActive: true, description: null, importRef: null
});
const withDefs = fieldsByCollection(
  [def("site_fenced", "job"), def("developer", "project"), def("survey_done", "job")],
  new Map([["survey_done", [{ processId: "p1", propertyKey: "survey_done", position: 1, required: false }]]])
);
const v = (id) => withDefs.find((r) => r.id === id)?.verdict;
ok("a property no process collects is orphaned", v("site_fenced") === "orphaned", v("site_fenced"));
ok("on a project too", v("developer") === "orphaned", v("developer"));
ok("a property a process collects is not", v("survey_done") === "collected", v("survey_done"));
ok("the count matches", orphanCount(withDefs).orphaned === 2,
  String(orphanCount(withDefs).orphaned));

// A process-scoped property is already a process's own and is never reported.
const processScoped = fieldsByCollection([def("slab_poured", "process")], new Map());
ok("a process-scoped property is not swept",
  !processScoped.some((r) => r.id === "slab_poured"));

console.log(failures ? `\n${failures} failed\n` : "\nok — every job and project field is accounted for\n");
process.exit(failures ? 1 : 0);
