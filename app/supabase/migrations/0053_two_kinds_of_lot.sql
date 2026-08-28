-- 0053 — two kinds of lot
--
-- Amber, 28 Aug: "with the 'proposed dwellings' change this to be 'Community Title
-- Lots' and 'Torrens Title Lots' as these are different types and the job will need to
-- carry this information through to the job. so now where you set 6 lots, 3 may be
-- community title, and 3 may be torrens title and we need to know that split."
--
-- Two facts, not one relabelled. A community-title lot and a Torrens-title lot are
-- different products — different titling process, different documents, different
-- timeline — so "6 lots" was never the whole answer, and a project with 3 of each has
-- been indistinguishable from one with 6 of either.
--
-- ------------------------------------------------------- why the total column survives
-- The obvious reading of "change this to be" is: drop `project_proposed_dwellings`, add
-- the two. Not done, and the reason is on the live rows. Six projects carry totals —
-- 3, 3, 4, 4, 28, 16 — and nobody knows their split. Dropping the column would throw
-- away a number somebody entered in order to store two nulls, and the import ahead has
-- the same shape: a total is often all the old system knows.
--
-- So the total stays as the total, the two new columns carry the split when it is known,
-- and the constraint below keeps them honest whenever all three are present. The form
-- asks for the split and writes the sum, so nothing typed after today can disagree; a
-- legacy row is a total with an unknown split, which is exactly what it is.

alter table projects
  add column project_community_title_lots smallint
    constraint project_community_title_lots_not_negative
      check (project_community_title_lots >= 0),
  add column project_torrens_title_lots smallint
    constraint project_torrens_title_lots_not_negative
      check (project_torrens_title_lots >= 0);

comment on column projects.project_community_title_lots is
  'How many of the proposed lots are community title (Amber, 28 Aug). Null means the split is not known — which is true of every project created before this column existed.';
comment on column projects.project_torrens_title_lots is
  'How many of the proposed lots are Torrens title. Null means the split is not known.';

-- Only bites when all three are known. A legacy row (total set, split null) passes; so
-- does a project that has the split and no total, and one that has neither. What it
-- refuses is the one state that is meaningless: 6 dwellings made of 2 + 3.
alter table projects
  add constraint project_lot_split_adds_up
    check (
      project_proposed_dwellings is null
      or project_community_title_lots is null
      or project_torrens_title_lots is null
      or project_proposed_dwellings = project_community_title_lots + project_torrens_title_lots
    );

-- ---------------------------------------------------------------------------- proof
-- (with the migration, in a rolled-back transaction on the live database: 3 + 3 against
-- a total of 6 accepted; 2 + 3 against 6 refused by name; a legacy row with a total and
-- no split still updatable; and the negative control — the constraint dropped, and the
-- same 2 + 3 watched being accepted.)
