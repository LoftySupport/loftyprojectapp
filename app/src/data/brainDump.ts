// app/src/data/brainDump.ts

/**
 * One line, one issue — and a colon splits the issue from its details.
 *
 * Amber, 14 September: *"I want to have the ability to do a dump where I add in a whole
 * lot of text and then it will auto create a new line for each item, like the braindump
 * section in dodumpling"*. A PCI walk is written on a phone or in an email as a list, and
 * retyping it into twelve boxes is the reason it does not get logged.
 *
 * Then, the same day: *"if a new line is added and it has ':' in it e.g. 'bathroom
 * silicone fix: fix the silicone in the shower screen' … everything before the ':' is the
 * issue and everything after is the description … if no ':' then just add it all to the
 * issue"*. That is how the lists are already written — a name, then what is wrong with it
 * — so the shape was in the paste all along and the drawer was throwing it away.
 *
 * IN `data/` RATHER THAN IN THE PAGE, and not for tidiness: `MaintenancePage.tsx` carries
 * JSX, Node cannot load JSX, and a rule about what counts as an item is exactly the kind
 * of thing that should be provable without a browser. Written inside the page first, the
 * check for it could not import it at all.
 *
 * WHAT IS STRIPPED, AND WHAT IS NOT
 *
 *   Leading bullets and numbering go — `-`, `*`, `•`, `–`, `1.`, `1)` — because they are
 *   the list's punctuation rather than part of the defect, and a queue full of issues
 *   called "- Ensuite tap leaking" is a queue somebody has to clean up afterwards.
 *
 *   A trailing full stop STAYS. It is somebody's wording, and trimming punctuation off
 *   the end is where a tidier starts eating "Unit 3." down to "Unit 3" — and a unit
 *   number is not decoration.
 *
 *   Blank lines go. **Duplicates do not**: two cracked tiles is a real answer, and
 *   collapsing them would lose one with nothing to say it happened.
 *
 *   Windows line endings are handled because most of what gets pasted comes out of
 *   Outlook.
 *
 * WHICH COLON, AND WHEN IT DOES NOT SPLIT
 *
 *   The FIRST separating colon, so "Ensuite: tap leaking: replace the washer" is one
 *   issue called "Ensuite" whose details keep the rest, colon and all. Splitting on the
 *   last one instead would make the issue a sentence and the details a fragment.
 *
 *   Two colons are NOT separators, and both were found by writing the lines a site note
 *   actually contains rather than by imagining them:
 *
 *     - a colon between two digits — "Site inspection 9:30 tap leaking" — because the
 *       split would give an issue called "Site inspection 9";
 *     - a colon followed by `/` — "see https://…" — same reason, an issue called "https".
 *
 *   Nothing before the colon (": tap leaking") does not split either: there is no issue
 *   name to take, and inventing one is the thing this repository does not do. The line
 *   goes into the issue exactly as written. Nothing AFTER it ("Kitchen:") does split, and
 *   drops the colon — at that point the colon is the separator the person typed and
 *   nothing else, so an issue called "Kitchen:" would be carrying a piece of syntax.
 */

/** One pasted line, already divided the way the drawer will store it. */
export interface BrainDumpItem {
  /** Goes in the Issue field. Never empty — a line that produced no name is not an item. */
  issue: string;
  /** Goes in Details. Empty when the line carried no separating colon. */
  description: string;
}

const BULLET = /^\s*(?:[-*•–—]|\d+[.)])\s+/;

/** The first colon that separates a name from a sentence, rather than a time or a URL. */
function separatorIndex(line: string): number {
  for (let i = line.indexOf(":"); i >= 0; i = line.indexOf(":", i + 1)) {
    const before = line[i - 1];
    const after = line[i + 1];
    if (before !== undefined && after !== undefined && /\d/.test(before) && /\d/.test(after)) continue;
    if (after === "/") continue;
    return i;
  }
  return -1;
}

function divide(line: string): BrainDumpItem {
  const at = separatorIndex(line);
  if (at < 0) return { issue: line, description: "" };
  const issue = line.slice(0, at).trim();
  const description = line.slice(at + 1).trim();
  if (issue === "") return { issue: line, description: "" };
  return { issue, description };
}

export function splitBrainDump(text: string): BrainDumpItem[] {
  return text
    .split(/\r\n|\r|\n/)
    .map(line => line.replace(BULLET, "").trim())
    .filter(line => line !== "")
    .map(divide);
}
