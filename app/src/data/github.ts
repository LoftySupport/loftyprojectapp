import { useEffect, useState } from "react";

/**
 * Merged pull requests, read straight from GitHub, for the changelog.
 *
 * Amber, 31 Aug: *"change log should pull in latest Pull requests as well as when a
 * request has been complete"*, and, on which ones: *"merged PRs that have a @changelog in
 * the description and have everything at the start of that row."*
 *
 * ============================================================================
 * WHY THIS IS NOT ON THE REPOSITORY SEAM
 *
 *   The house rule is that no component reaches around `repository.ts`. That rule is
 *   about the DATABASE — it exists so a screen cannot quietly grow a second way of
 *   reading Lofty's own records, with its own idea of what a job is.
 *
 *   GitHub is not Lofty's data and never becomes it: nothing here is written, joined or
 *   stored, and no RLS policy could govern it if one wanted to. Putting it on the
 *   repository interface would mean every implementation of that interface — including
 *   the stub used with no backend — had to answer for a third-party HTTP API.
 *
 *   So it is its own small seam, in `data/`, imported by one screen, and named after what
 *   it talks to.
 * ============================================================================
 *
 * ------------------------------------------------------------------- no token, ever
 * This is an unauthenticated read from the browser and it has to stay that way: a token
 * here would be inlined into the bundle by Vite exactly the way the handoff describes for
 * `VITE_` variables, and a changelog is not worth handing the world a credential for.
 *
 * ---------------------------------------------------- and therefore, while it is private
 * `LoftyGroup/loftyprojectapp` is the repository the work now lives in, and it is
 * PRIVATE. GitHub answers an unauthenticated read of a private repository with 404 — it
 * will not confirm the repository even exists. So until somebody makes it public, this
 * feed says it cannot read the repository rather than listing anything.
 *
 * It does NOT fall back to `amberbeaumont/loftyprojectapp`. That repository is public and
 * still carries the history, which is exactly what makes it the wrong answer: it stopped
 * receiving merges when the work moved here, so it would render a stale list that looks
 * current — the failure this codebase keeps writing down and keeps having to fix.
 *
 * Once it is public the remaining price is GitHub's unauthenticated limit — 60 requests
 * per hour per IP address, shared by everybody on the Lofty office connection. Hence the
 * session cache below, and hence a rate-limit answer that SAYS it was rate limited rather
 * than rendering an empty changelog, which would read as "nothing has shipped".
 */

export const CHANGELOG_REPO = "LoftyGroup/loftyprojectapp";

/** One merged pull request that declared something for the changelog. */
export interface PullRequestNote {
  number: number;
  title: string;
  url: string;
  mergedAt: string;
  author: string | null;
  /** The `@changelog` lines from the description, in the order they were written. */
  notes: string[];
}

/**
 * `@changelog <text>` — the marker at the START of a row, and the rest of that row is the
 * entry. Amber's own spec, and it is a good one: the line reads as a sentence in the pull
 * request as well as in the changelog, so nobody is writing markup for a machine.
 *
 * Case-insensitive and tolerant of leading spaces and of a `-` or `*` bullet, because a
 * description is written in a textarea by a person in a hurry. A colon straight after the
 * marker is swallowed too — `@changelog: fixed the thing` is what half of people type.
 *
 * Anything after the marker on that row is the note, and a row with nothing after it is
 * ignored rather than added as a blank line.
 */
const CHANGELOG_LINE = /^\s*(?:[-*]\s*)?@changelog\b:?\s*(.+?)\s*$/i;

export function parseChangelogNotes(body: string | null): string[] {
  if (!body) return [];
  const out: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = CHANGELOG_LINE.exec(line);
    if (m && m[1]) out.push(m[1]);
  }
  return out;
}

interface GhPull {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  merged_at: string | null;
  user?: { login?: string } | null;
}

// v2 because v1 holds pull requests read from `amberbeaumont/loftyprojectapp`. The cache
// is sessionStorage with a ten-minute life so it would clear itself, but "would clear
// itself" is ten minutes of a tab showing the wrong repository's history as this one's.
const CACHE_KEY = "lofty.changelog.pulls.v2";
/** Ten minutes. Long enough that clicking between tabs costs nothing against the 60/hour. */
const CACHE_MS = 10 * 60 * 1000;

export type PullsResult =
  | { state: "loading" }
  | { state: "ok"; pulls: PullRequestNote[] }
  /**
   * Failure is a state the screen renders, not an empty list. An unreachable GitHub and a
   * repository where nothing has shipped look identical in a list of zero items, and only
   * one of them is worth telling somebody about.
   */
  | { state: "error"; reason: string };

async function fetchPulls(): Promise<PullRequestNote[]> {
  // `state=closed` and then filtered on merged_at: GitHub has no "merged" filter, and a
  // closed-unmerged pull request is a decision NOT to ship something, which has no place
  // in a list of what shipped.
  const res = await fetch(
    `https://api.github.com/repos/${CHANGELOG_REPO}/pulls` +
      "?state=closed&sort=updated&direction=desc&per_page=100",
    { headers: { Accept: "application/vnd.github+json" } }
  );

  if (res.status === 403 || res.status === 429) {
    throw new Error(
      "GitHub is rate limiting this connection — it allows 60 requests an hour per " +
      "network without a sign-in. The published releases below are unaffected."
    );
  }
  // A 404 here is almost never a wrong path. GitHub refuses to confirm that a private
  // repository exists, so an unauthenticated read of one is answered 404 rather than 403.
  // Saying so, because "GitHub answered 404" sends the next person hunting for a typo in
  // a constant that is correct.
  if (res.status === 404) {
    throw new Error(
      `GitHub will not serve ${CHANGELOG_REPO} without a sign-in, which is what it does ` +
      "for a private repository. Merged pull requests will appear here once it is public."
    );
  }
  if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);

  const raw = (await res.json()) as GhPull[];
  return raw
    .filter(p => p.merged_at)
    .map(p => ({
      number: p.number,
      title: p.title,
      url: p.html_url,
      mergedAt: p.merged_at as string,
      author: p.user?.login ?? null,
      notes: parseChangelogNotes(p.body)
    }))
    .filter(p => p.notes.length > 0)
    .sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt));
}

export function useChangelogPulls(): PullsResult {
  const [result, setResult] = useState<PullsResult>({ state: "loading" });

  useEffect(() => {
    let live = true;

    const cached = readCache();
    if (cached) {
      setResult({ state: "ok", pulls: cached });
      return;
    }

    fetchPulls()
      .then(pulls => {
        if (!live) return;
        writeCache(pulls);
        setResult({ state: "ok", pulls });
      })
      .catch((e: unknown) => {
        if (!live) return;
        setResult({ state: "error", reason: e instanceof Error ? e.message : String(e) });
      });

    return () => { live = false; };
  }, []);

  return result;
}

/* sessionStorage, wrapped: a private window, blocked site data or a quota error all throw
   on access rather than returning null, and a changelog is not worth a white screen. */
function readCache(): PullRequestNote[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, pulls } = JSON.parse(raw) as { at: number; pulls: PullRequestNote[] };
    return Date.now() - at < CACHE_MS ? pulls : null;
  } catch {
    return null;
  }
}

function writeCache(pulls: PullRequestNote[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), pulls }));
  } catch {
    /* Not worth reporting: the feed works, it just refetches next time. */
  }
}
