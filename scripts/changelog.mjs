#!/usr/bin/env node
/**
 * Keep the changelog, the roadmap, the README and the handoff honest about what has
 * actually landed.
 *
 * Amber, 30 Aug: *"Commits and updates to repo should also update the changelog and
 * roadmap and tick off any changes completed as well as readme file and handoff."*
 *
 * ------------------------------------------------------------------ how it works
 * The commit message is the source. A commit says what it changed in a trailer, and this
 * turns the trailers into documentation:
 *
 *   Changelog: added: Ideas can be voted on, one vote each
 *   Changelog: fixed: Dropdowns inside the create panel were painted behind it
 *   Roadmap: Screenshots on a bug report
 *   Release: 0.9 — the tracker
 *
 * `Changelog:` lines become entries under Unreleased, or under the release named by the
 * most recent `Release:` trailer at or before them. `Roadmap:` ticks the matching
 * checkbox in ROADMAP.md. Both are repeatable in one commit.
 *
 * ------------------------------------------------- why the commit and not a file
 * A hand-edited CHANGELOG.md is a file somebody forgets, and it is forgotten exactly when
 * the release is busy. The commit message is written while the change is fresh, by the
 * person who made it, and it is already mandatory. So the changelog becomes a projection
 * of history rather than a second record that can disagree with it — which is the same
 * argument this repo makes about data-dictionary.md, and the reason that file also says
 * "generated" at the top.
 *
 * A commit with no `Changelog:` trailer contributes nothing and is not an error. Most
 * commits are typos, formatting and work-in-progress, and a changelog that lists every
 * commit is a git log with extra steps.
 *
 * ------------------------------------------------------------ what it will not do
 * It does not amend commits, stage files or push. It rewrites four files in the working
 * tree and tells you what changed; committing that is a decision a person makes. A hook
 * that quietly amends is how a commit somebody has already pushed grows a second parent.
 *
 * It also does not touch the DATABASE roadmap (`roadmap_phases`). ROADMAP.md is the
 * repo's delivery checklist; the app's roadmap is what Lofty reads. Rather than let two
 * sources drift, `--seed` emits an idempotent SQL upsert built from ROADMAP.md, so the
 * database can be made to follow the file. It is never run automatically: writing to the
 * live database is not a side effect of a commit.
 *
 * Usage:
 *   node scripts/changelog.mjs            rewrite the four files
 *   node scripts/changelog.mjs --check    exit 1 if they are out of date (for CI)
 *   node scripts/changelog.mjs --seed     print the SQL that makes the database match
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHANGELOG = join(ROOT, "CHANGELOG.md");
const ROADMAP = join(ROOT, "ROADMAP.md");
const README = join(ROOT, "README.md");
const HANDOFF = join(ROOT, "HANDOFF.md");

/** Keep a Changelog's four verbs — and `release_entries.release_entry_kind`'s CHECK. */
const KINDS = ["added", "fixed", "changed", "removed"];
const KIND_LABELS = { added: "Added", fixed: "Fixed", changed: "Changed", removed: "Removed" };

/** The markers a generated block sits between. Everything else in the file is yours. */
const START = (name) => `<!-- generated:${name} -->`;
const END = (name) => `<!-- /generated:${name} -->`;

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });

/**
 * Every commit, newest first, with its message.
 *
 * `%x00` between fields and `%x01` between commits, because a commit message contains
 * newlines, blank lines and — this being a repository whose commit messages quote people
 * — quotation marks and em dashes. Any single-character delimiter that could appear in
 * prose eventually does.
 */
function commits() {
  const raw = git("log", "--no-merges", "--pretty=format:%H%x00%aI%x00%s%x00%b%x01");
  return raw
    .split("\x01")
    .map(c => c.trim())
    .filter(Boolean)
    .map(c => {
      const [hash, date, subject, body = ""] = c.split("\x00");
      return { hash, date: date.slice(0, 10), subject, body };
    });
}

/** `Changelog: fixed: something` → { kind, text }. An unknown verb is reported, not eaten. */
function parseTrailers(commit) {
  const entries = [];
  const roadmap = [];
  let release = null;
  const problems = [];

  for (const line of `${commit.subject}\n${commit.body}`.split("\n")) {
    const m = /^\s*(Changelog|Roadmap|Release):\s*(.+?)\s*$/i.exec(line);
    if (!m) continue;
    const [, key, value] = m;
    if (/^changelog$/i.test(key)) {
      const parts = /^(\w+)\s*:\s*(.+)$/.exec(value);
      if (!parts || !KINDS.includes(parts[1].toLowerCase())) {
        // Named rather than dropped: a trailer somebody wrote and this could not read is
        // a change that silently never reaches the changelog, which is the one failure
        // mode that makes the whole thing untrustworthy.
        problems.push(`${commit.hash.slice(0, 8)}: "Changelog: ${value}" — expected one of ${KINDS.join(", ")}`);
        continue;
      }
      entries.push({ kind: parts[1].toLowerCase(), text: parts[2] });
    } else if (/^roadmap$/i.test(key)) {
      roadmap.push(value);
    } else {
      release = value;
    }
  }
  return { entries, roadmap, release, problems };
}

/**
 * Group the history into releases.
 *
 * Walking newest → oldest, a `Release:` trailer OPENS the release that everything older
 * belongs to, up to the next one. That is the right way round: the commit that says
 * "Release: 0.9" is the last commit in 0.9, not the first, because you know what a
 * release contains at the end of it and not at the start.
 */
function build() {
  const problems = [];
  const releases = [{ name: null, date: null, entries: [] }];
  const ticked = new Set();

  for (const commit of commits()) {
    const parsed = parseTrailers(commit);
    problems.push(...parsed.problems);
    for (const item of parsed.roadmap) ticked.add(item.toLowerCase());

    const current = releases[releases.length - 1];
    current.entries.push(...parsed.entries.map(e => ({ ...e, date: commit.date })));
    if (parsed.release) {
      current.name = parsed.release;
      current.date = commit.date;
      releases.push({ name: null, date: null, entries: [] });
    }
  }

  // The last bucket is everything before the oldest release marker. Unnamed and empty on
  // a repository that has always used them; kept only when it has something in it.
  const named = releases.filter((r, i) => i === 0 || r.name || r.entries.length > 0);
  return { releases: named, ticked, problems };
}

function renderChangelog({ releases }) {
  const lines = [];
  for (const release of releases) {
    if (release.entries.length === 0 && release.name === null) {
      lines.push("## Unreleased", "", "Nothing since the last release.", "");
      continue;
    }
    lines.push(release.name ? `## ${release.name} — ${release.date}` : "## Unreleased", "");
    for (const kind of KINDS) {
      const of = release.entries.filter(e => e.kind === kind);
      if (of.length === 0) continue;
      lines.push(`### ${KIND_LABELS[kind]}`, "");
      // Deduplicated on the text: a fix that was re-pushed after a CI failure is one
      // change, however many commits it took to land.
      for (const text of [...new Set(of.map(e => e.text))]) lines.push(`- ${text}`);
      lines.push("");
    }
  }
  return lines.join("\n").trim();
}

/**
 * Tick the roadmap.
 *
 * A checkbox is ticked when a commit named it in a `Roadmap:` trailer. Matching is on the
 * item's text, lowercased and trimmed — not on a line number or an id, because a roadmap
 * gets reordered and rewritten and an id nobody can see is an id nobody keeps accurate.
 *
 * NOTHING IS EVER UNTICKED HERE. A box ticked by hand stays ticked: this script knows
 * what the commits said, which is a subset of what has been done, and un-ticking on that
 * basis would quietly delete somebody's record of finished work.
 */
function tickRoadmap(text, ticked) {
  const missed = [];
  const out = text.split("\n").map(line => {
    const m = /^(\s*[-*]\s*)\[( |x|X)\]\s*(.+?)\s*$/.exec(line);
    if (!m) return line;
    const [, bullet, mark, item] = m;
    if (mark.toLowerCase() === "x") return line;
    return ticked.has(item.toLowerCase()) ? `${bullet}[x] ${item}` : line;
  });
  const items = new Set(
    text.split("\n")
      .map(l => /^\s*[-*]\s*\[[ xX]\]\s*(.+?)\s*$/.exec(l)?.[1]?.toLowerCase())
      .filter(Boolean)
  );
  for (const t of ticked) if (!items.has(t)) missed.push(t);
  return { text: out.join("\n"), missed };
}

/** Replace a generated block, or report that the file has no room for one. */
function replaceBlock(text, name, body) {
  const start = START(name), end = END(name);
  const a = text.indexOf(start), b = text.indexOf(end);
  if (a === -1 || b === -1 || b < a) return null;
  return text.slice(0, a + start.length) + "\n" + body + "\n" + text.slice(b);
}

/** The two or three lines the README and the handoff carry: what shipped, most recently. */
function latestSummary({ releases }) {
  const shipped = releases.find(r => r.name);
  const unreleased = releases[0].name ? null : releases[0];
  const lines = [];
  if (shipped) {
    lines.push(`**Latest release: ${shipped.name}** (${shipped.date}) — ${shipped.entries.length} ` +
      `${shipped.entries.length === 1 ? "change" : "changes"}. See [CHANGELOG.md](CHANGELOG.md).`);
  } else {
    lines.push("**No release has been published yet.** See [CHANGELOG.md](CHANGELOG.md) for what is waiting.");
  }
  if (unreleased && unreleased.entries.length > 0) {
    lines.push("");
    lines.push(`Unreleased: ${unreleased.entries.length} ` +
      `${unreleased.entries.length === 1 ? "change" : "changes"} since then —`);
    for (const e of unreleased.entries.slice(0, 5)) lines.push(`- ${KIND_LABELS[e.kind]}: ${e.text}`);
    if (unreleased.entries.length > 5) lines.push(`- …and ${unreleased.entries.length - 5} more.`);
  }
  lines.push("");
  lines.push("<sub>Generated from commit trailers by `node scripts/changelog.mjs` — do not edit inside this block.</sub>");
  return lines.join("\n");
}

/** ROADMAP.md → SQL the app's roadmap_phases can be brought into line with. */
function seedSql(roadmapText) {
  const phases = [];
  for (const line of roadmapText.split("\n")) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m && !/^generated/i.test(m[1])) phases.push(m[1]);
  }
  const rows = phases.map((name, i) => {
    const escaped = name.replace(/'/g, "''");
    return `  ('${escaped}', ${i + 1})`;
  });
  return [
    "-- Generated from ROADMAP.md by scripts/changelog.mjs --seed. Idempotent.",
    "--",
    "-- Names and order only. Dates and status are NOT written: they are decisions Amber",
    "-- makes in the app, and a file that overwrote them every commit would be a plan",
    "-- resetting itself. Superadmin, by the 0063 policy.",
    "--",
    "-- Two statements, and the first one is not optional: roadmap_phases_position_idx is",
    "-- UNIQUE and checked per row, so upserting positions straight over an existing run",
    "-- collides the moment two phases pass through one slot. Parking the whole run in the",
    "-- negatives first gives every new position an empty slot to land in.",
    "begin;",
    "update roadmap_phases set roadmap_phase_position = -roadmap_phase_position",
    " where roadmap_phase_position > 0;",
    "",
    "insert into roadmap_phases (roadmap_phase_name, roadmap_phase_position) values",
    rows.join(",\n") + "",
    "on conflict (roadmap_phase_name) do update",
    "  set roadmap_phase_position = excluded.roadmap_phase_position;",
    "",
    "-- Anything left parked is a phase this file no longer names. NOT deleted — it may",
    "-- hold requests, and dropping it would clear their roadmap_phase_id. It is pushed",
    "-- to the end instead, where somebody can see it and decide.",
    "update roadmap_phases set roadmap_phase_position = 1000 - roadmap_phase_position",
    " where roadmap_phase_position < 0;",
    "commit;"
  ].join("\n");
}

// ------------------------------------------------------------------------ main

const args = process.argv.slice(2);
const built = build();

if (args.includes("--seed")) {
  process.stdout.write(seedSql(readFileSync(ROADMAP, "utf8")) + "\n");
  process.exit(0);
}

const files = [];

const changelogBody = renderChangelog(built);
const changelogHead = [
  "# Changelog",
  "",
  "What has changed in the Lofty project app, newest first.",
  "",
  "**Generated — do not edit by hand.** Every line here comes from a `Changelog:` trailer",
  "in a commit message, and `node scripts/changelog.mjs` rewrites the file from the log.",
  "An edit made here is lost the next time somebody commits; put it in the commit instead.",
  "",
  "The four kinds are [Keep a Changelog](https://keepachangelog.com)'s, and they are also",
  "the CHECK on `release_entries.release_entry_kind` — one vocabulary, so what the repo",
  "says shipped and what the app shows people cannot use different words for it.",
  ""
].join("\n");
files.push([CHANGELOG, `${changelogHead}\n${changelogBody}\n`]);

const roadmapText = readFileSync(ROADMAP, "utf8");
const { text: tickedRoadmap, missed } = tickRoadmap(roadmapText, built.ticked);
files.push([ROADMAP, tickedRoadmap]);

const summary = latestSummary(built);
for (const file of [README, HANDOFF]) {
  const text = readFileSync(file, "utf8");
  const next = replaceBlock(text, "shipped", summary);
  if (next === null) {
    console.error(`${file} has no <!-- generated:shipped --> block — skipped.`);
    continue;
  }
  files.push([file, next]);
}

const stale = files.filter(([path, next]) => !existsSync(path) || readFileSync(path, "utf8") !== next);

for (const problem of built.problems) console.error(`unreadable trailer — ${problem}`);
for (const item of missed) console.error(`Roadmap trailer matched no checkbox: "${item}"`);

if (args.includes("--check")) {
  if (stale.length === 0 && built.problems.length === 0) {
    console.log("changelog, roadmap, README and handoff are up to date.");
    process.exit(0);
  }
  for (const [path] of stale) console.error(`out of date: ${path.replace(ROOT + "/", "")}`);
  console.error("Run: node scripts/changelog.mjs");
  process.exit(1);
}

for (const [path, next] of stale) {
  writeFileSync(path, next);
  console.log(`updated ${path.replace(ROOT + "/", "")}`);
}
if (stale.length === 0) console.log("nothing to update.");
// A bad trailer is a change that never reaches the changelog, so it fails the run even
// when the files themselves were rewritten successfully.
process.exit(built.problems.length > 0 ? 1 : 0);
