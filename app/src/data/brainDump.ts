// app/src/data/brainDump.ts

/**
 * One line, one issue.
 *
 * Amber, 14 September: *"I want to have the ability to do a dump where I add in a whole
 * lot of text and then it will auto create a new line for each item, like the braindump
 * section in dodumpling"*. A PCI walk is written on a phone or in an email as a list, and
 * retyping it into twelve boxes is the reason it does not get logged.
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
 */
export function splitBrainDump(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map(line => line.replace(/^\s*(?:[-*•–—]|\d+[.)])\s+/, "").trim())
    .filter(line => line !== "");
}
