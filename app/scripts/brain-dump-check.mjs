/**
 * `npm run check:brain-dump` — one line, one issue.
 *
 * Amber, 14 September: *"I want to have the ability to do a dump where I add in a whole
 * lot of text and then it will auto create a new line for each item, like the braindump
 * section in dodumpling"*. A PCI walk is written on a phone or in an email as a list, and
 * retyping it into twelve boxes is the reason it does not get logged.
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
  ["Ensuite tap leaking", "Laundry tile cracked", "Garage door sticks"]);

// Outlook is where most of this will be pasted from, and it sends CRLF.
eq("Windows line endings split the same way",
  splitBrainDump("Tap leaking\r\nTile cracked"),
  ["Tap leaking", "Tile cracked"]);

eq("bullets are stripped, because they are the list's punctuation",
  splitBrainDump("- Tap leaking\n* Tile cracked\n• Door sticks\n– Skirting gap"),
  ["Tap leaking", "Tile cracked", "Door sticks", "Skirting gap"]);

eq("numbering is stripped, in both the styles people write",
  splitBrainDump("1. Tap leaking\n2) Tile cracked\n10. Door sticks"),
  ["Tap leaking", "Tile cracked", "Door sticks"]);

eq("blank lines and stray whitespace are dropped",
  splitBrainDump("Tap leaking\n\n   \n  Tile cracked  \n"),
  ["Tap leaking", "Tile cracked"]);

// The one thing NOT cleaned. Trimming punctuation off the end is where a tidier starts
// eating "Unit 3." down to "Unit 3", and a unit number is not decoration.
eq("a trailing full stop is somebody's wording and stays",
  splitBrainDump("Tap leaking in Unit 3."),
  ["Tap leaking in Unit 3."]);

// Two cracked tiles is a real answer. Collapsing them loses one with nothing to say so.
eq("duplicates are kept, because two of the same defect is a real answer",
  splitBrainDump("Tile cracked\nTile cracked"),
  ["Tile cracked", "Tile cracked"]);

eq("a hyphen inside a line is left alone", splitBrainDump("Re-hang the garage door"), ["Re-hang the garage door"]);
eq("a bare dash with no text after it is not an issue", splitBrainDump("-\n- \nTap leaking"), ["-", "Tap leaking"]);
eq("nothing pasted is no issues", splitBrainDump(""), []);
eq("whitespace only is no issues", splitBrainDump("\n\n   \n"), []);

console.log(failures ? `\n${failures} failed` : "\nok — a pasted list becomes one issue per line");
process.exit(failures ? 1 : 0);
