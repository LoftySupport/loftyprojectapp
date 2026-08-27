import type { ReactNode } from "react";
import { Button, Text } from "@vibe/core";
import { useSearch } from "../data/SearchProvider";
import "./ui.css";

/**
 * The two things a search has to say beyond the results themselves.
 *
 * Shared rather than written per page so the wording is identical wherever you land —
 * an empty board that says something different from an empty table reads as two
 * different failures rather than one honest answer.
 */

/** Nothing matched. Says what was searched for, and offers the way out. */
export function NoResults({ noun }: { noun: string }) {
  const { query, setQuery } = useSearch();
  // Filters can empty a view with no search at all — 'No jobs match ""' blamed a
  // search nobody had typed. Two different facts, two different sentences, and the
  // Clear button only offers what actually caused it.
  const searching = query.trim() !== "";
  return (
    <div className="panel no-results">
      {/* `ellipsis={false}` on both: Vibe's Text clips to a single line by default, which
          turns the explanation into "Every word has to appear somew…" at any width worth
          having. */}
      <Text type="text1" weight="medium" ellipsis={false}>
        {searching ? <>No {noun} match “{query.trim()}”.</> : <>No {noun} match the current filters.</>}
      </Text>
      <Text type="text2" color="secondary" ellipsis={false}>
        {searching
          ? "Every word has to appear somewhere on the record, so a shorter query matches more."
          : "Every active filter has to match at once — clear one and more will show."}
      </Text>
      {searching && (
        <Button kind="secondary" size="small" onClick={() => setQuery("")}>
          Clear search
        </Button>
      )}
    </div>
  );
}

/**
 * Shown when a match came off an *original* address rather than the current one. That is
 * worth saying: whoever searched is working from an old email, a contract or a note, and
 * the address they have is not the address the job is at now.
 */
export function PreviousAddressNote() {
  return (
    <div className="search-note">
      <Text type="text3" ellipsis={false}>
        Some of these matched a <strong>previous</strong> address. The address shown is the
        current one.
      </Text>
    </div>
  );
}

/**
 * No records of this kind exist yet — as opposed to none matching a search.
 *
 * The distinction is the whole reason this is separate from NoResults. "No jobs match
 * 'corner'" and "there are no jobs" are different facts, and a screen that says the
 * second when it means the first sends somebody looking for a bug. This one carries no
 * Clear-search button for the same reason: there is nothing to clear.
 */
export function NothingYet({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  /**
   * The way out of the empty state.
   *
   * Optional, and worth having: this branch runs *instead of* the table, so a create
   * control that lives in a table row is unreachable at exactly the moment somebody
   * most needs it — the first time they open the page. The description said "create
   * one" and offered nothing to click.
   */
  action?: ReactNode;
}) {
  return (
    <div className="panel no-results">
      <Text type="text1" weight="medium" ellipsis={false}>{title}</Text>
      <Text type="text2" color="secondary" ellipsis={false}>{description}</Text>
      {action}
    </div>
  );
}

/**
 * A read that failed, shown rather than swallowed.
 *
 * An empty board and a board whose query errored look identical, and the difference
 * matters: one means "nothing here yet", the other means "you are not seeing what is
 * here". Postgres and PostgREST messages are worth reading verbatim — a permission
 * denied from RLS names itself — so the message is not replaced with a friendlier
 * fiction. This is the same lesson as the sign-in outage, where two catch blocks turned
 * a database error into "your account is not set up".
 */
export function LoadProblem({ error }: { error: Error }) {
  return (
    <div className="create-problem" role="alert">
      <Text type="text2" ellipsis={false}>
        Could not load these records: {error.message}
      </Text>
    </div>
  );
}
