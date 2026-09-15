-- 0124 — THE GROUP COLUMN GETS ITS NAME
--
-- `property_defs.property_def_automation` has never held an automation. 0043 made the column
-- for a note about how a value might arrive on its own, and nothing ever wrote one. Then the
-- workbook of 3 September came with a column headed GROUP ("Footings", "Frame", "2nd Fix",
-- "Practical Completion") and 0090 carried those words into the only spare text column and
-- said so in its own header: *"they look far more like a stage group than like an automation
-- note … moving them to a group of their own is a schema change and Amber has not asked for
-- one"*. 0092 added eighteen more on the same terms. The 15 September audit found 139 rows
-- carrying a group word under a name that says automation, nothing reading it, and an
-- Automations tab saying "Not built yet". Stage 0 of that audit: rename it to what it holds.
--
-- WHAT IT HOLDS, ON THE DAY
--
--   Construction        Footings 15 · Frame 12 · Roof Cover 6 · External Cladding 16 ·
--                       2nd Fix 16 · Practical Completion 28 · Handover 14
--   Pre-construction    Working Drawings 3 · Selections 6 · Site Survey 2 · Soil - Bore Logs 2
--                       · SA Water 6 · Section 221 - Stormwater/Crossover Permits 2 ·
--                       Retaining, Fencing & BOB 11 · and 106 rows with none
--   Everything else     none
--
--   The Construction words are the build's sub-stages, in build order. The Pre-construction
--   words are the processes Amber walked through on 15 September. So the column is two things
--   wearing one header, and both have a home coming: Stage 1 makes sub-stages rows
--   (`lifecycle_substages`) and Stage 2 gives processes their steps. Until then it stays free
--   text under an honest name, and the migration that gives each half its home moves these
--   words with it, which is what 0092 said would happen.
--
-- A RENAME, NOT A NEW COLUMN
--
--   Postgres renames in place: the values, the grants and the dependents come along (there
--   are none: no view, function or policy names it). The app reads the new name from the
--   same deploy, and nothing ever rendered the old one, so there is no screen to change.
alter table property_defs rename column property_def_automation to property_def_group;

comment on column property_defs.property_def_group is
  'The group of work the property belongs to, under the workbook''s own header (0124): a Construction sub-stage (Footings, Frame, Roof Cover, External Cladding, 2nd Fix, Practical Completion, Handover) or a Pre-construction process (Working Drawings, Selections, SA Water and so on). Free text until Stage 1 gives sub-stages rows and Stage 2 gives processes steps; each takes its half. Named property_def_automation from 0043 to 0124, and never held an automation.';

-- ---------------------------------------------------------------------- proof
-- Watched failing live before the rename: the old name present, the new one absent.
do $$
declare
  n_groups int;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'property_defs'
               and column_name = 'property_def_automation') then
    raise exception '0124 proof: property_def_automation is still there';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'property_defs'
                   and column_name = 'property_def_group') then
    raise exception '0124 proof: property_def_group is missing';
  end if;
  -- The words came with the column. 0090 seeds 121 of them on a replay, so this is never
  -- zero on a rebuild either.
  select count(property_def_group) into n_groups from property_defs;
  if n_groups = 0 then
    raise exception '0124 proof: no row carries a group, so the values did not come across';
  end if;
  raise notice '0124 proof: property_def_group exists, property_def_automation does not, % rows carry a group.', n_groups;
end $$;
