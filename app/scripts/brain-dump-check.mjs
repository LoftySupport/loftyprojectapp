/**
 * `npm run check:brain-dump` — one line, one issue.
 *
 * Amber, 14 September: *"I want to have the ability to do a dump where I add in a whole
 * lot of text and then it will auto create a new line for each item, like the braindump
 * section in dodumpling"*. A PCI walk is written on a phone or in an email as a list, and
 * retyping it into twelve boxes is the reason it does not get logged.
 *
 * Then, the same day: *"if a new line is added and it has ':' in it … everything before
 * the ':' is the issue and everything after is the description … if no ':' then just add
 * it all to the issue"*.
 *
 * A pure function, so this needs no browser and no database — which is the point of
 * having it as a function rather than as logic inside the drawer. Every case below is one
 * that actually arrives: a list pasted out of Outlook (CRLF), a list somebody numbered, a
 * list with the bullets still on it, and two lines that really are the same defect twice.
 */
import { splitBrainDump } from "../src/data/brainDump.ts";

let failures = 0;
const ok = (name, condition, detail = "") => {
  if (condition) console.log(`  ok   ${name}`);
  else { failures += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name, got, want) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

eq("plain lines become one issue each",
  splitBrainDump("Ensuite tap leaking\nLaundry tile cracked\nGarage door sticks"),
  [{ issue: "Ensuite tap leaking", description: "" }, { issue: "Laundry tile cracked", description: "" }, { issue: "Garage door sticks", description: "" }]);

// Outlook is where most of this will be pasted from, and it sends CRLF.
eq("Windows line endings split the same way",
  splitBrainDump("Tap leaking\r\nTile cracked"),
  [{ issue: "Tap leaking", description: "" }, { issue: "Tile cracked", description: "" }]);

eq("bullets are stripped, because they are the list's punctuation",
  splitBrainDump("- Tap leaking\n* Tile cracked\n• Door sticks\n– Skirting gap"),
  [{ issue: "Tap leaking", description: "" }, { issue: "Tile cracked", description: "" }, { issue: "Door sticks", description: "" }, { issue: "Skirting gap", description: "" }]);

eq("numbering is stripped, in both the styles people write",
  splitBrainDump("1. Tap leaking\n2) Tile cracked\n10. Door sticks"),
  [{ issue: "Tap leaking", description: "" }, { issue: "Tile cracked", description: "" }, { issue: "Door sticks", description: "" }]);

eq("blank lines and stray whitespace are dropped",
  splitBrainDump("Tap leaking\n\n   \n  Tile cracked  \n"),
  [{ issue: "Tap leaking", description: "" }, { issue: "Tile cracked", description: "" }]);

// The one thing NOT cleaned. Trimming punctuation off the end is where a tidier starts
// eating "Unit 3." down to "Unit 3", and a unit number is not decoration.
eq("a trailing full stop is somebody's wording and stays",
  splitBrainDump("Tap leaking in Unit 3."),
  [{ issue: "Tap leaking in Unit 3.", description: "" }]);

// Two cracked tiles is a real answer. Collapsing them loses one with nothing to say so.
eq("duplicates are kept, because two of the same defect is a real answer",
  splitBrainDump("Tile cracked\nTile cracked"),
  [{ issue: "Tile cracked", description: "" }, { issue: "Tile cracked", description: "" }]);

eq("a hyphen inside a line is left alone", splitBrainDump("Re-hang the garage door"), [{ issue: "Re-hang the garage door", description: "" }]);
eq("a bare dash with no text after it is not an issue", splitBrainDump("-\n- \nTap leaking"), [{ issue: "-", description: "" }, { issue: "Tap leaking", description: "" }]);
eq("nothing pasted is no issues", splitBrainDump(""), []);
eq("whitespace only is no issues", splitBrainDump("\n\n   \n"), []);

// ------------------------------------------------------- the colon splits issue from details
// Amber's own two examples, verbatim.
eq("a colon divides the issue from its details",
  splitBrainDump("bathroom silicone fix: fix the silicone in the shower screen\nmaster bed: lightswtich in wrong spot"),
  [{ issue: "bathroom silicone fix", description: "fix the silicone in the shower screen" },
   { issue: "master bed", description: "lightswtich in wrong spot" }]);

eq("no colon means the whole line is the issue",
  splitBrainDump("Ensuite tap leaking"),
  [{ issue: "Ensuite tap leaking", description: "" }]);

// The FIRST colon. Splitting on the last would make the issue a sentence and the details
// a fragment, which is backwards.
eq("the first colon splits and the rest stays in the details",
  splitBrainDump("Ensuite: tap leaking: replace the washer"),
  [{ issue: "Ensuite", description: "tap leaking: replace the washer" }]);

eq("the bullet comes off before the colon is looked for",
  splitBrainDump("- Kitchen: cupboard door off its hinge\n2. Garage: crack in the slab"),
  [{ issue: "Kitchen", description: "cupboard door off its hinge" },
   { issue: "Garage", description: "crack in the slab" }]);

eq("the space either side of the colon is not part of either half",
  splitBrainDump("Laundry   :   tile cracked"),
  [{ issue: "Laundry", description: "tile cracked" }]);

// Two colons that are not separators, both found by writing the lines a site note really
// carries rather than by imagining them.
eq("a time is not a separator",
  splitBrainDump("Site inspection 9:30 tap leaking"),
  [{ issue: "Site inspection 9:30 tap leaking", description: "" }]);

eq("a URL is not a separator",
  splitBrainDump("Tile cracked, see https://lofty.au/defects/12"),
  [{ issue: "Tile cracked, see https://lofty.au/defects/12", description: "" }]);

eq("a time before a real separator still splits at the separator",
  splitBrainDump("Handover 9:30: front door scratched"),
  [{ issue: "Handover 9:30", description: "front door scratched" }]);

// Nothing after the colon: the colon was the separator and nothing else, so it goes.
eq("a colon with nothing after it leaves the issue without it",
  splitBrainDump("Kitchen:"),
  [{ issue: "Kitchen", description: "" }]);

// Nothing BEFORE it: there is no issue name to take, and inventing one is the thing this
// repository does not do. The line goes in as written.
eq("a colon with nothing before it does not split",
  splitBrainDump(": tap leaking"),
  [{ issue: ": tap leaking", description: "" }]);

eq("a line that is only a colon is still one issue",
  splitBrainDump(":"),
  [{ issue: ":", description: "" }]);

console.log(failures ? `\n${failures} failed` : "\nok — a pasted list becomes one issue per line, split at the colon");
process.exit(failures ? 1 : 0);
