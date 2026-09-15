/**
 * The database has every migration this code needs.
 *
 * 10 September: two pull requests merged, Vercel deployed the code, and the migrations
 * they needed were never applied — nothing runs them, and nothing checked. The app asked
 * for columns that did not exist and Documents stopped working for everybody. Amber:
 * *"it is borkne i can't use documents now"*.
 *
 * The database was fixed in minutes. The point of this file is that nobody should have to
 * notice again: a deploy whose migrations have not run is a broken deploy, and this is
 * where that gets said before it ships rather than after.
 *
 * WHAT IT COMPARES
 *
 *   Every `NNNN_*.sql` in `app/supabase/migrations/` against the versions recorded in
 *   `supabase_migrations.schema_migrations` on the live project. Supabase records a
 *   migration by a timestamp and a NAME, and this repository numbers its files — so the
 *   name is what the two have in common, and it is matched after stripping the number,
 *   because `apply_migration` has recorded some with the prefix and some without.
 *
 * WHAT IT NEEDS, AND WHAT IT DOES WITHOUT IT
 *
 *   `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`. With both, it asks the Management
 *   API what is applied. With neither it **skips, loudly, and exits 0** — a check that
 *   fails the build on every fork and every contributor without a token is a check that
 *   gets deleted. It says "NOT CHECKED" rather than printing a tick, because those two
 *   must never look the same: a green line that means "I did not look" is the failure this
 *   whole file is about.
 *
 *   No new dependency: Node 22 has fetch, and the Management API takes SQL directly.
 *
 *   node scripts/check-migrations.mjs
 */
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "app", "supabase", "migrations");

/** `0103_a_document_can_be_a_url.sql` → { number: "0103", name: "a_document_can_be_a_url" } */
function parse(file) {
  const m = file.match(/^(\d{4})_(.+)\.sql$/);
  return m ? { file, number: m[1], name: m[2] } : null;
}

/**
 * The comparison itself, as a pure function so it can be proved without a database.
 *
 * Matched on the NAME with any leading number stripped, because Supabase's record carries
 * the prefix for some migrations and not others — `0102_a_tasks_board…` and
 * `images_a_document_carries` are both really in there. Comparing the raw strings would
 * report half the schema as missing, which is the sort of false alarm that gets a check
 * switched off.
 */
export function missingMigrations(repoMigrations, appliedRows) {
  const appliedNames = new Set(
    appliedRows.map((row) => String(row?.name ?? "").replace(/^\d{4}_/, ""))
  );
  return repoMigrations.filter((m) => !appliedNames.has(m.name));
}

/**
 * Prove the comparison, with no credentials and no network.
 *
 * Runs in CI on every push, because the credentialed half cannot: a check that only ever
 * skips is a check nobody would notice had rotted. The fixtures use the real recorded
 * shapes from the live project rather than invented ones — the mixed prefixing is the only
 * thing here that is genuinely easy to get wrong.
 */
function selfTest() {
  const applied = [
    { name: "0102_a_tasks_board_that_crosses_every_job_and_project" },
    { name: "images_a_document_carries" },
    { name: "0103_a_document_can_be_a_url" },
    { name: "sharepoint_folders" }
  ];
  const check = (label, got, want) => {
    if (got !== want) {
      console.error(`FAIL: ${label} — got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
      process.exitCode = 1;
    } else console.log(`ok  ${label}`);
  };

  check("a record carrying its number is matched",
    missingMigrations([{ number: "0102", name: "a_tasks_board_that_crosses_every_job_and_project" }], applied).length, 0);
  check("a record recorded without one is matched too",
    missingMigrations([{ number: "0100", name: "images_a_document_carries" }], applied).length, 0);
  check("a migration the database has not got is reported",
    missingMigrations([{ number: "0105", name: "not_applied_anywhere" }], applied).length, 1);
  check("the one reported is the one missing, not another",
    missingMigrations(
      [{ number: "0103", name: "a_document_can_be_a_url" }, { number: "0105", name: "not_applied_anywhere" }],
      applied)[0].name, "not_applied_anywhere");
  // The negative control. Without this, a `missingMigrations` that always returned []
  // would pass every check above.
  check("an empty database reports everything",
    missingMigrations([{ number: "0001", name: "core" }, { number: "0002", name: "x" }], []).length, 2);
  check("a row with no name at all is not silently treated as a match",
    missingMigrations([{ number: "0001", name: "core" }], [{ name: null }]).length, 1);

  if (!process.exitCode) console.log("\nmigration check: 6 assertions, all passing");
}

const repo = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .map(parse)
  .filter(Boolean)
  .sort((a, b) => a.number.localeCompare(b.number));

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(process.exitCode ?? 0);
}

if (!repo.length) {
  console.error("No migrations found — is the path right?");
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;

if (!token || !ref) {
  console.log(
    "migrations: NOT CHECKED — set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF to compare\n" +
    `            the ${repo.length} migrations in this repo against the live database.\n` +
    "            This is a skip, not a pass: nothing here has been verified."
  );
  process.exit(0);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({
    query: "select version, name from supabase_migrations.schema_migrations order by version;"
  })
});

if (!res.ok) {
  console.error(`Could not read the applied migrations: HTTP ${res.status} ${await res.text()}`);
  process.exit(1);
}

const missing = missingMigrations(repo, await res.json());

if (missing.length) {
  console.error(
    `\nTHE DATABASE IS BEHIND THIS CODE — ${missing.length} migration${missing.length === 1 ? "" : "s"} not applied:\n`
  );
  for (const m of missing) console.error(`  ${m.number}  ${m.file}`);
  console.error(
    "\nDeploying now ships code that asks for columns the database has not got, which is\n" +
    "how Documents broke on 10 September. Apply them, then run this again.\n"
  );
  process.exit(1);
}

console.log(`migrations: all ${repo.length} applied to ${ref}`);
