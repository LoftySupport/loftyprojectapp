-- =============================================================================
-- 0027 — make the `stage` enum in this repo match the one in the database
-- =============================================================================
-- Found by the replay harness, not by reading the SQL: 0028 sets a default of
-- 'Sales & Acquisition' and the replay failed with
--
--     ERROR: invalid input value for enum stage: "Sales & Acquisition"
--
-- because the value in this repo is spelled 'Sales & acquisition'.
--
-- The live database has NINE stage values. These migration files produce EIGHT, and five
-- of those are spelled differently. Somebody changed the type directly in the Supabase
-- SQL editor and no migration was ever written for it, so the repo has been unable to
-- reproduce the database since — the same class of problem as 0007, which could not
-- apply to an empty database at all.
--
--   in this repo (0004)              in the database
--   -------------------------------  ------------------------------
--   Sales & acquisition              Sales & Acquisition            (case)
--   Planning & Engineering           Planning & Engineering         (same)
--   Working Drawings & Contracts     Working Drawings & Contracts   (same)
--   Preconstruction                  Pre-construction               (hyphen)
--   Scheduling & Estimating          Scheduling & Estimating        (same)
--   Construction & execution         Construction                   (shortened)
--   Post-construction & closeout     Post-construction & Closeout   (case)
--   Handover & maintenance           Handover        ) split into
--                                    Maintenance     ) two stages
--
-- This migration makes the files say what the database already says. It is written to be
-- a no-op against the live database — every step checks first — so applying it there
-- changes nothing, while a fresh replay ends up in the same place.
--
-- Why bother, when the enum is due to be replaced by pipeline tables in a later batch:
-- because until the repo can rebuild the database, no migration can be verified before
-- it is applied, and every batch after this one is verified that way. The enum is
-- temporary; being unable to test is not.
--
-- ALTER TYPE ... RENAME VALUE preserves every stored value — it changes the label, not
-- the rows carrying it. `jobs` is empty regardless, so nothing depends on that here.
-- =============================================================================

do $$
begin
  -- ------------------------------------------------------------- the renames
  -- Guarded individually rather than as a block: on the live database the new spelling
  -- is already present and the old one absent, so each of these is skipped. On a fresh
  -- replay the opposite holds and each one fires.
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
             where t.typname = 'stage' and e.enumlabel = 'Sales & acquisition') then
    alter type stage rename value 'Sales & acquisition' to 'Sales & Acquisition';
  end if;

  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
             where t.typname = 'stage' and e.enumlabel = 'Preconstruction') then
    alter type stage rename value 'Preconstruction' to 'Pre-construction';
  end if;

  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
             where t.typname = 'stage' and e.enumlabel = 'Construction & execution') then
    alter type stage rename value 'Construction & execution' to 'Construction';
  end if;

  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
             where t.typname = 'stage' and e.enumlabel = 'Post-construction & closeout') then
    alter type stage rename value 'Post-construction & closeout' to 'Post-construction & Closeout';
  end if;

  -- Handover and Maintenance were one stage and became two. The rename takes the
  -- existing label to 'Handover'; 'Maintenance' is added after it below.
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
             where t.typname = 'stage' and e.enumlabel = 'Handover & maintenance') then
    alter type stage rename value 'Handover & maintenance' to 'Handover';
  end if;
end $$;

-- ------------------------------------------------------------- the ninth value
-- Outside the DO block: ALTER TYPE ... ADD VALUE has its own IF NOT EXISTS, and keeping
-- it out of a block that also renames values avoids adding and using a label in one
-- transaction, which Postgres refuses.
alter type stage add value if not exists 'Maintenance' after 'Handover';

-- ------------------------------------------------------------------- prove it
-- The list and the order both matter — `order by stage` is board order — so this checks
-- the sequence, not just the set.
do $$
declare
  actual text;
  expected text := 'Sales & Acquisition, Planning & Engineering, Working Drawings & Contracts, '
                || 'Pre-construction, Scheduling & Estimating, Construction, '
                || 'Post-construction & Closeout, Handover, Maintenance';
begin
  select string_agg(e.enumlabel, ', ' order by e.enumsortorder)
    into actual
    from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'stage';

  if actual is distinct from expected then
    raise exception 'stage enum does not match the database. expected [%] actual [%]',
      expected, actual;
  end if;
end $$;
