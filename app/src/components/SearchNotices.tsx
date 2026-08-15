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
  return (
    <div className="panel no-results">
      {/* `ellipsis={false}` on both: Vibe's Text clips to a single line by default, which
          turns the explanation into "Every word has to appear somew…" at any width worth
          having. */}
      <Text type="text1" weight="medium" ellipsis={false}>
        No {noun} match “{query.trim()}”.
      </Text>
      <Text type="text2" color="secondary" ellipsis={false}>
        Every word has to appear somewhere on the record, so a shorter query matches more.
      </Text>
      <Button kind="secondary" size="small" onClick={() => setQuery("")}>
        Clear search
      </Button>
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
