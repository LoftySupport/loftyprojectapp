#!/usr/bin/env python3
"""
Phase B — turn the jobs workbook into staging rows (migration 0087).

    python3 generate-jobs-import.py            # writes ../migrations/0087_the_jobs_workbook_of_31_august.sql
    python3 generate-jobs-import.py --report   # prints what it decided and refused, writes nothing

Source: `lofty-jobs-grouped-by-project-2026-08-31.xlsx`, Amber's grouping of the old
system's CERTIFICATION tab — 801 job rows across 121 projects, numbered 1001–1121 with
`01, 02…` sequences inside each, the old job number beside every row. Its own Method tab
says how it was built; nothing here re-groups anything.

WHAT THIS EMITS

  One `import_staging_jobs` row per sheet row, carrying TWO jsonb documents:

    row    the sheet row VERBATIM, keyed "<column letter> · <header>" (the sheet repeats
           headers, so the letter is what keeps the keys apart). Dates as ISO strings.
           Nothing trimmed, nothing corrected. This is the record of what was imported.

    spine  what this script decided the row means for addresses, projects and jobs —
           and, where it changed a value, the original beside it:
             project_number, job_sequence   from the sheet, as integers
             project_type                   'residential' for every row (Amber, 2 Sep: retail
                                            means residential with an external client, and
                                            development is residential; the client type is
                                            kept in `client_type` for Phase C)
             street_number, street, suburb, postcode, council, lot_number, street_2, lot_label
             respelled                      {field: original} for anything normalised
             old_number_shared              true when the old number is on more than one row
             source_stage                   the sheet's "stage" word, lowercased: cancelling ·
                                            on hold · in doubt (or absent)
             agreement, client_type, title_type
             skip_reason                    when the row cannot become a job, and why

  It does NOT load the spine. `import_spine()` (0086) does that, with the four decisions
  the sheet cannot make — owning team, stage, numbering base, status words — passed in by
  whoever runs it. Nothing about the live database's nine hand-made projects is decided
  here either; that is the numbering base.

WHAT IT REFUSES TO GUESS

  * A row with no site address at all cannot be a job (the job address guard wants a
    street and a number or a lot). It is staged with a skip_reason and listed.
  * A suburb it cannot find in the SA postcode list is a skip, not a nearest match — except
    the one explicit respelling in ALIASES, which is recorded on the row.
  * A council is looked up from the same list the app uses (`saSuburbs.ts`); a suburb the
    app treats as ambiguous (Dernancourt) gets no council, as it would in the form.
  * The old number is never altered here. When several rows share one, the row is marked
    and `import_spine()` decides — refuse, or append the lot label — per its parameter.
  * "OTR - Community Title = Yes" becomes title_type community. "No" becomes nothing: not
    community is not the same statement as torrens.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl
from openpyxl.utils import get_column_letter

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "lofty-jobs-grouped-by-project-2026-08-31.xlsx"
SHEET = "project import"
SOURCE_LABEL = "Lofty_Jobs_Grouped_by_Project.xlsx · project import"
POSTCODES = HERE / "sa-suburbs-postcodes.csv"
SUBURBS_TS = HERE.parent.parent / "src" / "data" / "saSuburbs.ts"
OUT = HERE.parent / "migrations" / "0087_the_jobs_workbook_of_31_august.sql"

# The sheet's columns, by position (its headers carry stray spaces and repeat).
COL_PROJECT, COL_SEQ, COL_JOB, COL_OLD, COL_AGREEMENT, COL_STAGE = 0, 1, 2, 3, 4, 5
COL_STREET_NO, COL_STREET, COL_SUBURB, COL_LOT, COL_SITE = 6, 7, 8, 9, 10
COL_CLIENT_TYPE, COL_COMMUNITY_TITLE = 14, 20

# The one suburb spelt in a way no list carries. Recorded on every row it touches.
ALIASES = {"mitchel park": "Mitchell Park"}


def load_lookups():
    postcodes: dict[str, set[str]] = defaultdict(set)
    with POSTCODES.open() as fh:
        for r in csv.DictReader(fh):
            postcodes[r["suburb"].strip().upper()].add(r["postcode"].strip())
    ts = SUBURBS_TS.read_text()
    by_council = json.loads(re.search(r"const SUBURBS_BY_COUNCIL: Record<string, readonly string\[\]> = (\{.*?\});", ts, re.S).group(1))
    council_of = {s.upper(): c for c, subs in by_council.items() for s in subs}
    ambiguous = set(json.loads(re.search(r"export const AMBIGUOUS_SUBURBS: readonly string\[\] = (\[.*?\]);", ts, re.S).group(1)))
    return postcodes, council_of, {a.upper() for a in ambiguous}


def cell_json(v):
    if isinstance(v, dt.datetime):
        return v.date().isoformat() if v.time() == dt.time(0, 0) else v.isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, dt.time):
        return v.isoformat()
    return v


def text(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def resolve_suburb(raw: str | None, postcodes, respelled: dict) -> str | None:
    """The sheet's suburb, resolved against the SA list; None when it is not there."""
    if raw is None:
        return None
    s = re.sub(r"\s+", " ", raw).strip()
    # "(AKA 21 Jessamine ave) Reynella", "Findon (single build)": the bracketed part is a
    # note, not a suburb. Kept verbatim in the row; noted here.
    stripped = re.sub(r"\s*\([^)]*\)\s*", " ", s).strip()
    if stripped != s:
        respelled["suburb"] = raw
        s = stripped
    key = s.upper()
    if key in ALIASES_UPPER:
        respelled["suburb"] = raw
        return ALIASES_UPPER[key]
    if key in postcodes:
        canonical = TITLE[key]
        if canonical != s:
            respelled["suburb"] = raw
        return canonical
    return None


def split_trailing_suburb(street: str, postcodes) -> tuple[str, str | None]:
    """'Grandview Grove Sturt' → ('Grandview Grove', 'Sturt') when the tail is a suburb."""
    words = street.split()
    for n in (3, 2, 1):
        if len(words) > n:
            tail = " ".join(words[-n:]).upper()
            if tail in postcodes:
                return " ".join(words[:-n]), TITLE[tail]
    return street, None


ALIASES_UPPER: dict[str, str] = {}
TITLE: dict[str, str] = {}


def main(report_only: bool) -> int:
    postcodes, council_of, ambiguous = load_lookups()
    global ALIASES_UPPER, TITLE
    ALIASES_UPPER = {k.upper(): v for k, v in ALIASES.items()}
    # The postcode list is upper case; the app and the address table want title case with
    # the apostrophes right — take the spelling from the council list where it has one.
    TITLE = {k: k.title() for k in postcodes}
    for c, subs in json.loads(re.search(r"const SUBURBS_BY_COUNCIL: Record<string, readonly string\[\]> = (\{.*?\});", SUBURBS_TS.read_text(), re.S).group(1)).items():
        for s in subs:
            TITLE[s.upper()] = s

    wb = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True)
    ws = wb[SHEET]
    rows = list(ws.iter_rows(values_only=True))
    header = [(h or "").strip() for h in rows[0]]
    keys = [f"{get_column_letter(i + 1)} · {h}" for i, h in enumerate(header)]
    data = [(i + 1, r) for i, r in enumerate(rows[1:]) if any(v is not None for v in r)]

    staged = []
    tally = Counter()
    respellings = Counter()
    skipped = []
    old_counts = Counter()

    for row_no, r in data:
        row_json = {keys[i]: cell_json(v) for i, v in enumerate(r) if v is not None and i < len(keys)}
        spine: dict = {}
        respelled: dict = {}
        notes: list[str] = []

        spine["project_number"] = int(r[COL_PROJECT])
        spine["job_sequence"] = int(str(r[COL_SEQ]))
        spine["project_type"] = "residential"
        agreement = text(r[COL_AGREEMENT])
        if agreement:
            spine["agreement"] = agreement
        stage_word = text(r[COL_STAGE])
        if stage_word and stage_word != "-":
            spine["source_stage"] = re.sub(r"\s+", " ", stage_word).lower()
        client = text(r[COL_CLIENT_TYPE])
        if client:
            spine["client_type"] = client
        if (text(r[COL_COMMUNITY_TITLE]) or "").lower() == "yes":
            spine["title_type"] = "community"

        old = r[COL_OLD]
        old_no = str(old) if isinstance(old, int) else text(old)

        # ---- the address
        site = text(r[COL_SITE])
        street_no = text(r[COL_STREET_NO])
        street = text(r[COL_STREET])
        suburb_raw = text(r[COL_SUBURB])
        lot_raw = text(r[COL_LOT])

        if street_no and street_no.startswith("#"):
            respelled["street_number"] = street_no
            street_no = street_no.lstrip("#").strip() or None
        if street:
            cleaned = re.sub(r"\s+", " ", street)
            bracket = re.search(r"\(([^)]*)\)", cleaned)
            if bracket:
                notes.append(f"street note dropped from the street name: ({bracket.group(1)})")
                cleaned = re.sub(r"\s*\([^)]*\)\s*", " ", cleaned).strip()
            if cleaned != street:
                respelled["street"] = street
            street = cleaned

        suburb = resolve_suburb(suburb_raw, postcodes, respelled)
        if suburb is None and street and suburb_raw is None:
            # The sheet could not split the suburb off; try the street's tail against the
            # whole SA list rather than the sheet's own suburbs.
            street2, tail = split_trailing_suburb(street, postcodes)
            if tail:
                respelled["street"] = respelled.get("street", r[COL_STREET])
                street, suburb = street2, tail
                notes.append("suburb recognised from the end of the street cell")

        lot_number = None
        street_2 = None
        lot_label = None
        # Project 1024's twenty rows read "Res 1 , Lot 311 (portion of lot 232) Dankie Rd":
        # the sheet's split kept the residence and lost the lot. The lot is in the source
        # cell, so it is read from there — the bracketed "portion of lot 232" first removed
        # so the parent lot is not mistaken for this one.
        if site and (lot_raw is None or not re.match(r"^\s*lot", lot_raw, re.I)):
            m = re.search(r"\blot\s*#?\s*(\d+)\b", re.sub(r"\([^)]*\)", " ", site), re.I)
            if m:
                lot_number = m.group(1)
                notes.append(f"lot number read from the site address cell: Lot {lot_number}")
        if lot_raw:
            m = re.match(r"^\s*lot\s*#?\s*(\d+)\s*$", lot_raw, re.I)
            if m:
                lot_number, lot_label = m.group(1), f"Lot {m.group(1)}"
            else:
                m = re.match(r"^\s*res\s*(\d+)\s*$", lot_raw, re.I)
                if m:
                    street_2, lot_label = f"Res {m.group(1)}", f"Res {m.group(1)}"
                    if lot_number:
                        lot_label = f"Res {m.group(1)}, Lot {lot_number}"
                else:
                    street_2, lot_label = lot_raw, lot_raw
                    notes.append(f"lot column is a descriptor, kept as the address's second line: {lot_raw}")

        skip = None
        if not site and not street:
            skip = "no site address in the source"
        elif not street:
            skip = "no street name in the source"
        elif suburb is None:
            skip = f"suburb not in the SA list: {suburb_raw or '(blank)'}"
        elif not street_no and not lot_number:
            skip = "no street number and no lot number — a job's address needs one"
        else:
            codes = postcodes[suburb.upper()]
            if len(codes) != 1:
                skip = f"suburb {suburb} has {len(codes)} postcodes"

        if skip:
            spine["skip_reason"] = skip
            skipped.append((row_no, r[COL_JOB], skip))
            tally["skipped"] += 1
        else:
            spine.update({"street_number": street_no, "street": street, "suburb": suburb,
                          "postcode": next(iter(postcodes[suburb.upper()])),
                          "council": None if suburb.upper() in ambiguous else council_of.get(suburb.upper())})
            if spine["council"] is None:
                notes.append("no council: " + ("ambiguous in the council list" if suburb.upper() in ambiguous else "not in the council list"))
            if lot_number:
                spine["lot_number"] = lot_number
            if street_2:
                spine["street_2"] = street_2
            if lot_label:
                spine["lot_label"] = lot_label
            if old_no:
                old_counts[old_no] += 1
            tally["staged for the spine"] += 1
        spine = {k: v for k, v in spine.items() if v is not None}
        if respelled:
            spine["respelled"] = respelled
            for k in respelled:
                respellings[k] += 1
        if notes:
            spine["notes"] = notes
        staged.append((row_no, old_no, row_json, spine))

    shared = {k for k, c in old_counts.items() if c > 1}
    for _, old_no, _, spine in staged:
        if old_no in shared and "skip_reason" not in spine:
            spine["old_number_shared"] = True

    projects = {s["project_number"] for _, _, _, s in staged if "skip_reason" not in s}
    print(f"{len(data)} sheet rows → {tally['staged for the spine']} staged for the spine across {len(projects)} projects, {tally['skipped']} skipped", file=sys.stderr)
    print(f"respelled: {dict(respellings)}", file=sys.stderr)
    print(f"old numbers shared by more than one row: {sorted(shared)}", file=sys.stderr)
    for row_no, job, why in skipped:
        print(f"  skipped sheet row {row_no} ({job}): {why}", file=sys.stderr)
    if report_only:
        return 0

    lines = [
        "-- =============================================================================",
        "-- 0087 — the jobs workbook of 31 August, staged",
        "-- =============================================================================",
        "-- GENERATED by app/supabase/import/generate-jobs-import.py from",
        f"-- {SOURCE.name}, sheet \"{SHEET}\". Edit the script, not this file.",
        "--",
        f"-- {len(data)} sheet rows: {tally['staged for the spine']} carry a spine across {len(projects)} projects,",
        f"-- {tally['skipped']} are staged with a skip_reason and make no job. Nothing is loaded here —",
        "-- import_spine() (0086) does that with the decisions the sheet does not carry.",
        "--",
        "-- Skipped rows:",
    ] + [f"--   sheet row {row_no} ({job}): {why}" for row_no, job, why in skipped] + [
        f"-- Respelled (original kept on the row): {dict(respellings)}",
        f"-- Old numbers shared by more than one row: {', '.join(sorted(shared))}",
        "-- =============================================================================",
        "",
    ]
    for start in range(0, len(staged), 40):
        chunk = staged[start:start + 40]
        lines.append("insert into import_staging_jobs (import_staging_job_source, import_staging_job_source_row, import_staging_job_number_old, import_staging_job_row, import_staging_job_spine) values")
        values = []
        for row_no, old_no, row_json, spine in chunk:
            old_sql = "null" if old_no is None else "'" + old_no.replace("'", "''") + "'"
            values.append(f"  ('{SOURCE_LABEL}', {row_no}, {old_sql}, $json${json.dumps(row_json, ensure_ascii=False)}$json$::jsonb, $json${json.dumps(spine, ensure_ascii=False)}$json$::jsonb)")
        lines.append(",\n".join(values))
        lines.append("on conflict (import_staging_job_source, import_staging_job_source_row) do nothing;")
        lines.append("")
    lines += [
        "do $$",
        "declare n integer;",
        "begin",
        f"  select count(*) into n from import_staging_jobs where import_staging_job_source = '{SOURCE_LABEL}';",
        f"  if n <> {len(data)} then raise exception '0087: expected {len(data)} staging rows, found %', n; end if;",
        "end $$;",
        "",
    ]
    OUT.write_text("\n".join(lines))
    print(f"wrote {OUT.relative_to(HERE.parent.parent.parent)} ({OUT.stat().st_size // 1024} KB)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main("--report" in sys.argv[1:]))
