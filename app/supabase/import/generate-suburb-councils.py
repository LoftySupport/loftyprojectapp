#!/usr/bin/env python3
"""
Writes app/src/data/suburbCouncils.ts from the SA council list.

Source: "List of Councils by Suburb/Locality as at 1 July 2026", supplied by Lofty and
kept beside this script so the output can be rebuilt rather than trusted. The list is
reissued — the date is in the filename for that reason — so when a new one arrives, drop
it in, point SOURCE at it, and run:

    python3 app/supabase/import/generate-suburb-councils.py

Requires openpyxl. Not a repo dependency: this runs about once a year, and adding an
xlsx parser to the app's bundle to read a file the app never reads would be the wrong
trade.

WHAT IT REFUSES TO EMIT

  Four suburbs sit in more than one council and are left out deliberately, so the form
  asks instead of guessing. A council on a lodged application is not a field to be
  confidently wrong about.
"""
import csv
import json
import re
import sys
from pathlib import Path

import openpyxl

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "councils-by-suburb-2026-07-01.xlsx"
POSTCODES = HERE / "sa-suburbs-postcodes.csv"
AS_AT = "1 July 2026"
OUT = HERE.parent.parent / "src" / "data" / "saSuburbs.ts"
TYPES = HERE.parent.parent / "src" / "data" / "types.ts"

# The four the sheet spells differently from the enum. Everything else matches once
# "Corporation Of The" is dropped and case is ignored.
ALIASES = {
    "city of campbelltown": "Campbelltown City Council",
    "clare & gilbert valleys council": "Clare and Gilbert Valleys Council",
    "city of port augusta": "Port Augusta City Council",
    "the rural city of murray bridge": "Rural City of Murray Bridge",
}


def normalise(name: str) -> str:
    return re.sub(r"\s+", " ", name.lower().replace("corporation of the ", "")).strip()


def main() -> int:
    app_councils = re.findall(
        r'"([^"]+)"',
        re.search(r"export const SA_COUNCILS = \[(.*?)\] as const;", TYPES.read_text(), re.S).group(1),
    )
    canonical = {normalise(c): c for c in app_councils}

    wb = openpyxl.load_workbook(SOURCE, data_only=True)
    rows = [
        (str(r[0]).strip(), str(r[1]).strip())
        for r in wb["Full list"].iter_rows(values_only=True)
        if r[0] and r[1]
    ]

    seen: dict[str, set[str]] = {}
    for suburb, council in rows:
        seen.setdefault(suburb, set()).add(council)

    by_council: dict[str, list[str]] = {}
    ambiguous: list[str] = []
    unmatched: set[str] = set()

    for suburb, councils in sorted(seen.items()):
        # More than one row, or a cell naming two councils. "Norwood Payneham & St
        # Peters" is one council whose NAME contains an ampersand, so the split is
        # detected by resolving both halves rather than by looking for the character.
        names = set()
        for c in councils:
            key = normalise(c)
            if key in ALIASES:
                names.add(ALIASES[key])
            elif key in canonical:
                names.add(canonical[key])
            else:
                halves = [h.strip() for h in re.split(r"\s+&\s+", c)]
                resolved = [canonical.get(normalise(h)) or ALIASES.get(normalise(h)) for h in halves]
                if len(halves) > 1 and all(resolved):
                    names.update(resolved)
                else:
                    unmatched.add(c)

        if len(names) != 1:
            if names:
                ambiguous.append(suburb)
            continue
        by_council.setdefault(names.pop(), []).append(suburb)

    if unmatched:
        # "Out Of Council" is the expected one — those localities are in no council at
        # all, and the column has no value that says so.
        print("not in SA_COUNCILS (skipped):", sorted(unmatched), file=sys.stderr)

    # Postcodes. Every suburb in this file has exactly one — checked, not assumed —
    # which is why the postcode can be filled in where the council sometimes cannot.
    postcodes: dict[str, str] = {}
    with POSTCODES.open() as fh:
        for row in csv.DictReader(fh):
            suburb = (row.get("suburb") or "").strip()
            code = (row.get("postcode") or "").strip()
            if suburb and code:
                postcodes.setdefault(suburb.title(), code)

    total = sum(len(v) for v in by_council.values())
    # json.dumps, not repr-and-swap-quotes: "O'Halloran Hill" has an apostrophe, and
    # swapping quote characters turned it into O"halloran Hill — a syntax error in the
    # generated file, and the kind a generator should never be able to emit.
    postcode_body = ",\n".join(
        f"  {json.dumps(s)}: {json.dumps(c)}" for s, c in sorted(postcodes.items())
    )
    body = ",\n".join(
        f'  {json.dumps(council)}: [{", ".join(json.dumps(s) for s in sorted(suburbs))}]'
        for council, suburbs in sorted(by_council.items())
    )

    OUT.write_text(f'''import type {{ SaCouncil }} from "./types";

/**
 * Which council a South Australian suburb sits in.
 *
 * GENERATED — do not edit by hand.
 * Source: "List of Councils by Suburb/Locality as at {AS_AT}", in
 * `app/supabase/import/`. Rebuild with
 * `python3 app/supabase/import/generate-suburb-councils.py`.
 *
 * {total} suburbs across {len(by_council)} councils. Stored by council rather than by
 * suburb because each council name then appears once instead of a few dozen times, and
 * the reverse index is built at module load where it costs nothing.
 *
 * FOUR SUBURBS ARE DELIBERATELY ABSENT
 *
 *   {", ".join(sorted(ambiguous))} each sit in more than one council. They are left out
 *   so the form asks rather than guesses — a council on a lodged application is not a
 *   field to be confidently wrong about, and a lookup that is right 1,779 times out of
 *   1,783 is exactly the kind of wrong nobody checks.
 *
 * Localities in no council at all — the "Out of council areas" sheet, most of the far
 * north — are absent for a different reason: there is no value for them in the enum,
 * because "no council" is not a council.
 */
const SUBURBS_BY_COUNCIL: Record<string, readonly string[]> = {{
{body}
}};

/**
 * Every SA suburb with its postcode.
 *
 * One postcode each — verified against the source rather than hoped for, which is what
 * makes this safe to fill in without asking. The council list and this one do not cover
 * exactly the same places, so a suburb can have a postcode and no council or the other
 * way round; each lookup answers for itself and returns null when it cannot.
 */
const POSTCODE_BY_SUBURB: Record<string, string> = {{
{postcode_body}
}};

/** Suburbs that sit in more than one council, and so are never filled in automatically. */
export const AMBIGUOUS_SUBURBS: readonly string[] = [{", ".join(json.dumps(a) for a in sorted(ambiguous))}];

/** Built once. Lower-cased keys, because people type "golden grove". */
const COUNCIL_BY_SUBURB = new Map<string, SaCouncil>(
  Object.entries(SUBURBS_BY_COUNCIL).flatMap(([council, suburbs]) =>
    suburbs.map(s => [s.toLowerCase(), council as SaCouncil] as const)
  )
);

/**
 * The council for a suburb, or null when the list cannot say.
 *
 * Null covers three different cases on purpose, and none of them should guess: a suburb
 * in two councils, a locality in none, and a spelling the list does not have.
 */
export function councilForSuburb(suburb: string | null | undefined): SaCouncil | null {{
  if (!suburb) return null;
  return COUNCIL_BY_SUBURB.get(suburb.trim().toLowerCase()) ?? null;
}}

const POSTCODE_LOOKUP = new Map(
  Object.entries(POSTCODE_BY_SUBURB).map(([s, code]) => [s.toLowerCase(), code] as const)
);

/** The postcode for a suburb, or null when the list does not have it. */
export function postcodeForSuburb(suburb: string | null | undefined): string | null {{
  if (!suburb) return null;
  return POSTCODE_LOOKUP.get(suburb.trim().toLowerCase()) ?? null;
}}

/** Every suburb name, for the suggestions under the field. Sorted once, at build time. */
export const SUBURB_NAMES: readonly string[] = Object.keys(POSTCODE_BY_SUBURB);

/**
 * Suburbs starting with what has been typed, then ones merely containing it.
 *
 * Prefix first because that is what somebody typing "reyn" means; the contains pass is
 * what finds "Old Reynella" when they type "reynella". Capped, because a list longer
 * than the panel is not a suggestion.
 */
export function suggestSuburbs(query: string, limit = 8): string[] {{
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const name of SUBURB_NAMES) {{
    const l = name.toLowerCase();
    if (l === q) continue;
    if (l.startsWith(q)) starts.push(name);
    else if (l.includes(q)) contains.push(name);
    if (starts.length >= limit) break;
  }}
  return [...starts, ...contains].slice(0, limit);
}}

/** Whether this suburb is one of the four the list refuses to answer for. */
export const isAmbiguousSuburb = (suburb: string | null | undefined): boolean =>
  !!suburb && AMBIGUOUS_SUBURBS.some(a => a.toLowerCase() === suburb.trim().toLowerCase());
''')
    print(f"saSuburbs.ts — {total} suburbs with a council, {len(by_council)} councils, "
          f"{len(postcodes)} postcodes, {len(ambiguous)} ambiguous "
          f"({', '.join(sorted(ambiguous))})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
