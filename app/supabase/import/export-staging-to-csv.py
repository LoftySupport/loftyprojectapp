#!/usr/bin/env python3
"""
Write `import_staging_jobs` out as two spreadsheets, so the table can be dropped.

    python3 export-staging-to-csv.py "postgresql://…/lofty_verify"

WHY THIS EXISTS
---------------
Audit decision 9, Amber, 15 September: *"Export the rows to a spreadsheet in the repository
and drop the lot."* Chosen over moving the table to an `archive` schema and over leaving it in
`public`. The 801 rows are a load from a workbook that has already done its job — 116 projects
and 796 jobs exist because of it — and the table has sat there since 3 September being counted
by an advisor and nothing else.

WHY TWO FILES, AND WHY CSV
--------------------------
Two, because the rows carry two different things and flattening them together would lose the
distinction that matters:

  · `-raw-` is the WORKBOOK, one column per sheet header, exactly as it was staged. This is
    the file somebody opens. Ninety-odd columns with headers like
    "AI · STAGE 1  Concept Plan Signed Off (7 Days)" — unwieldy, and that is the sheet's
    doing rather than this script's.
  · `-spine-` is what the IMPORTER DECIDED from each row: the project number, the lot, the
    respelt street, the skip reason. `0087`'s header says it plainly — *"Nothing is loaded
    here — import_spine() does that with the decisions the sheet does not carry"* — so those
    decisions are the half that would actually be lost.

CSV rather than .xlsx because the point of putting it in the repository is that it can be
read back: git shows what changed between two loads, a reviewer can see the file in a pull
request, and a future generator parses it without a library. Every spreadsheet opens it.

THE LAST COLUMN, AND WHY IT IS THERE
------------------------------------
Each file ends with `json`, the column's value written out verbatim. A flat CSV cannot round
-trip JSON on its own — every number, boolean and null comes back a string — so a file that
only had the flattened columns would be readable and NOT reloadable, which is the worse half
of both. The last column makes the export lossless, `--verify` proves it by rebuilding the
digest from the files alone, and a spreadsheet reader can ignore it.

WHAT IT DOES NOT DO
-------------------
It does not talk to the live project. It reads a database that has replayed `0087`, because
`0087` IS the rows: 1.2 MB of INSERT literals generated from the workbook. The local replay
and the live table were compared by digest before this was written — 801 rows, md5
daac704c522fc80b9d0aab0f8d2e10a9, identical — so the export is proved equal to what is live
rather than assumed to be.
"""
import csv
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
STAMP = "2026-08-31"          # the workbook's own date, not today's
RAW = HERE / f"import-staging-jobs-raw-{STAMP}.csv"
SPINE = HERE / f"import-staging-jobs-spine-{STAMP}.csv"

QUERY = """
  select import_staging_job_source_row,
         import_staging_job_number_old,
         import_staging_job_row::text,
         import_staging_job_spine::text
    from import_staging_jobs
   order by import_staging_job_source_row
"""


def rows(dsn: str):
    """One record per sheet row, read through psql so this needs no driver installed."""
    out = subprocess.run(
        ["psql", dsn, "-t", "-A", "-F", "\x1f", "-c", " ".join(QUERY.split())],
        capture_output=True, text=True, check=True,
    ).stdout
    for line in out.splitlines():
        if not line.strip():
            continue
        source_row, number_old, raw, spine = line.split("\x1f", 3)
        yield int(source_row), number_old, json.loads(raw), json.loads(spine)


def digest_of(records, key_of) -> str:
    """The same digest the database computes, built from whatever is passed in."""
    import hashlib
    joined = "\n".join(
        f"{source_row}|{number_old}|{json.dumps(key_of(*rest), sort_keys=True, separators=(',', ':'))}"
        for source_row, number_old, *rest in records
    )
    return hashlib.md5(joined.encode()).hexdigest()


def write(path: Path, records, first_columns, key_of):
    """Union of every key, in sheet order where the header carries one (A ·, AB ·, …)."""
    keys = set()
    for _, _, *rest in records:
        keys |= set(key_of(*rest).keys())

    def sheet_order(k: str):
        prefix = k.split(" · ", 1)[0]
        if prefix.isalpha() and prefix.isupper():
            return (0, len(prefix), prefix)
        return (1, 0, k)

    columns = first_columns + sorted(keys, key=sheet_order) + ["json"]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        w.writeheader()
        for source_row, number_old, *rest in records:
            value = key_of(*rest)
            d = {k: "" if v is None else v for k, v in value.items()}
            d["sheet_row"] = source_row
            d["old_job_number"] = number_old
            d["json"] = json.dumps(value, sort_keys=True, separators=(",", ":"))
            w.writerow({c: d.get(c, "") for c in columns})
    return len(columns)


def read_back(path: Path):
    """Rebuild the records from the file alone — the round trip the drop depends on."""
    with path.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            yield int(r["sheet_row"]), r["old_job_number"], json.loads(r["json"])


def main() -> int:
    verify = "--verify" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--verify"]
    if len(args) != 1:
        print("usage: export-staging-to-csv.py [--verify] <dsn>", file=sys.stderr)
        return 2
    records = list(rows(args[0]))
    if not records:
        print("No staging rows found. Has 0087 replayed into this database?", file=sys.stderr)
        return 1

    skipped = sum(1 for *_, spine in records if "skip_reason" in spine)

    # --verify does NOT rewrite. The first version did, and it could not fail: a row's JSON was
    # mistyped by hand, the run overwrote the file with a fresh export and then checked its own
    # output, which of course matched. A verification that repairs what it is checking proves
    # the writer agrees with the reader and nothing about the file on disk.
    if not verify:
        n_raw = write(RAW, records, ["sheet_row", "old_job_number"], lambda raw, spine: raw)
        n_spine = write(SPINE, records, ["sheet_row", "old_job_number"], lambda raw, spine: spine)
        print(f"{RAW.name}: {len(records)} rows, {n_raw} columns")
        print(f"{SPINE.name}: {len(records)} rows, {n_spine} columns ({skipped} carry a skip_reason)")
        return 0

    # The round trip, from the files as they are. Without this the export is a file somebody
    # hopes is right, and the table it replaces is about to be dropped.
    bad = 0
    for path, key_of in ((RAW, lambda raw, spine: raw), (SPINE, lambda raw, spine: spine)):
        want = digest_of(records, key_of)
        if not path.exists():
            print(f"FAIL {path.name} is not there — nothing to verify")
            bad += 1
            continue
        got = digest_of([(n, o, v) for n, o, v in read_back(path)], lambda v: v)
        if want == got:
            print(f"ok  {path.name} rebuilds the rows exactly ({want})")
        else:
            print(f"FAIL {path.name}: {want} from the database, {got} from the file")
            bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
