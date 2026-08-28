-- 0056 — the existing projects take the convention
--
-- Amber, 28 Aug: "yes please rename the existing projects."
--
-- 0053's app change made new projects name themselves `<number> - SUBURB, street`.
-- This brings the ones created before it into line. A data migration, not a schema one:
-- nothing about the table changes, and on a fresh database it matches no rows and does
-- nothing.
--
-- ------------------------------------------------------------- what is being overwritten
-- Recorded here rather than only in a diff, because these are the last copies of names
-- somebody typed, and one of them carried something the convention cannot:
--
--   1002  "14 Brodie Road, Reynella"          → 1002 - REYNELLA, 14 Brodie Road
--   1003  "2A Launceston Ave, Warradale"      → 1003 - WARRENDALE, 2A Launceston Ave
--   1004  "Howard Street Windsor Gardens"     → 1004 - WINDSOR GARDENS, 27 Howard Street
--   1005  "9 Riders Street, Seacombe Gardens" → 1005 - SEACOMBE GARDENS, 9 Riders Street
--   1006  "83A Awoonga Road, Hope Valley"     → 1006 - HOPE VALLEY, 83a Awoonga Road
--   1007  "St Clair 2007 St Clair Ave"        → 1007 - ST CLAIR, 2007 St clair ave
--   1008  "riverscape"                        → 1008 - PARALOWIE
--
-- **1008 loses a real name.** "riverscape" is not a restatement of the address the way
-- the other six are — it is what somebody calls that development. The convention has
-- nowhere to put it, so it is written down here and the rename goes ahead as asked;
-- restoring it is one update.
--
-- **1003's suburb disagrees with itself.** The typed name said Warradale; the address
-- row says Warrendale. The convention reads the address, so the address wins — but one
-- of the two is wrong and this migration does not know which. Not silently corrected.
--
-- **1006 and 1007 inherit their address's casing** — "83a", "St clair ave". Only the
-- suburb is upper-cased, by the rule. Tidying the address rows is a different edit on a
-- different table, and doing it inside a rename would hide it.

update projects p
   set project_name = p.project_id || ' - ' || upper(a.address_suburb)
     || case
          when btrim(coalesce(a.address_street_number, '') || ' ' || coalesce(a.address_street_1, '')) <> ''
          then ', ' || btrim(coalesce(a.address_street_number, '') || ' ' || coalesce(a.address_street_1, ''))
          else ''
        end
  from addresses a
 where a.address_id = p.project_current_address_id;

-- Derived from the address rather than written as seven literals, so it says the same
-- thing the app's `projectDisplayName` says — one rule, not a rule and a copy of its
-- output. Which also makes it safe to run twice.
--
-- ---------------------------------------------------------------------------- proof
-- (run live: all seven rows updated, then every project_name compared against the
-- expression that produced it — 0 disagreements — and the old names read back out of
-- this file to confirm nothing else moved.)
