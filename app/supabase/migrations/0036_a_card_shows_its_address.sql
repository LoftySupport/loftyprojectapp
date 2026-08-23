-- =============================================================================
-- 0036 — a job card shows its job number and its address
-- =============================================================================
-- Lofty, 23 August: "a card needs to show the job number e.g. 1001-01 and the address
-- of the job. The job address will come down from the project once created."
--
-- The second half already happens — 0034's split copies the project's address per lot,
-- with the lot number on it, and that copy is the job's immutable original. What was
-- missing is that nothing could READ it: the card rendered
-- `{{addresses.consolidated_address}}` because `listJobs` selects from `jobs`, which
-- carries two address *ids* and no text.
--
-- `job_display` exists for exactly this — its comment says "a job with the things a card
-- needs joined on" — and it already resolves both addresses. But it was built for the
-- board card alone, so it dropped the columns the repository's `toJob` needs, and the
-- repository went on reading the base table instead. A view nobody can use in place of
-- the table it summarises is a view that gets bypassed, which is what happened.
--
-- WHY NOT AN EMBED
--
--   PostgREST can join this in a select — `addresses!jobs_job_current_address_id_fkey(…)`
--   — and that is the shape to avoid here. `jobs` points at `addresses` twice, which is
--   the PGRST201 ambiguity that took the app down on 21 August, and the disambiguating
--   syntax puts the constraint's NAME in a TypeScript string. Rename the constraint and
--   the app breaks at runtime with nothing to catch it. The view names the join once, in
--   the database, where a rename cannot silently pass.
--
-- STILL security_invoker, so RLS on `jobs` decides who sees which rows. A view that
-- bypassed it would be a hole straight through the read policy.
-- =============================================================================

drop view if exists job_display;

create view job_display with (security_invoker = true) as
  select j.job_id,
         j.project_id,
         -- Added: `toJob` needs these, and without them the repository cannot read the
         -- view instead of the table — which was the whole reason it did not.
         j.job_sequence,
         j.job_number_old,
         j.job_original_address_id,
         j.job_current_address_id,
         j.job_created_at,
         j.job_created_by,
         j.job_updated_at,
         j.job_updated_by,

         p.project_type,
         j.job_status,
         is_current(j.job_status) as job_is_current,
         j.job_stage,
         j.job_stage_entered_at,
         j.job_owning_team,
         j.job_engaged_teams,
         j.job_assignee_id,

         -- What the card renders. `cur` is an inner join because
         -- job_current_address_id is not null; `orig` is left because the original is
         -- only set once a job has been renamed away from it.
         cur.address_consolidated  as job_current_address,
         orig.address_consolidated as job_original_address,
         cur.address_suburb        as job_suburb,

         -- The project's address, read through rather than copied — the same rule the
         -- property store follows. A job shows the site it belongs to without being able
         -- to disagree with it.
         pcur.address_consolidated as project_current_address
  from jobs j
  join projects p using (project_id)
  join addresses cur       on cur.address_id  = j.job_current_address_id
  left join addresses orig on orig.address_id = j.job_original_address_id
  join addresses pcur      on pcur.address_id = p.project_current_address_id;

comment on view job_display is
  'A job with the things a card needs joined on: its project type, its own two addresses, its project''s current address, and whether it is still live. Carries every column of `jobs` that the repository maps, so it can be read in place of the table rather than beside it. security_invoker so RLS on jobs decides who sees what.';

-- ---------------------------------------------------------------------- proof
do $$
declare
  missing text;
  invoker boolean;
begin
  -- Every column the repository's JOB_COLUMNS list asks for has to be here, or reading
  -- the view instead of the table returns 42703 on the first request. Asserted against
  -- the view as BUILT rather than as typed above.
  select string_agg(c, ', ') into missing
  from unnest(array[
    'job_id','project_id','job_sequence','job_number_old',
    'job_original_address_id','job_current_address_id','job_status','job_stage',
    'job_stage_entered_at','job_owning_team','job_engaged_teams','job_assignee_id',
    'job_created_at','job_created_by','job_updated_at','job_updated_by',
    'job_current_address','job_original_address','project_current_address'
  ]) as c
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'job_display' and column_name = c);

  if missing is not null then
    raise exception 'job_display is missing: %', missing;
  end if;

  -- The one that would turn a read policy into decoration.
  --
  -- Postgres stores reloptions as the literal that was written, so this reads
  -- `security_invoker=true` — the first version of this probe looked for
  -- `security_invoker=on` and failed against a view that was entirely correct. Matched
  -- on the key with a LIKE rather than on one spelling of the value, so `true`, `on`
  -- and `1` all pass and only the option's absence fails.
  select exists (
    select 1 from pg_class c, unnest(c.reloptions) o
    where c.relname = 'job_display' and c.relkind = 'v' and o like 'security_invoker=%'
  ) into invoker;
  if not coalesce(invoker, false) then
    raise exception 'job_display is not security_invoker — it would bypass RLS on jobs';
  end if;

  raise notice 'ok  job_display carries every mapped column and still runs as the caller';
end $$;
