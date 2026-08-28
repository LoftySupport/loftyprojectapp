-- 0057 — cancelled is an ending
--
-- Amber, 28 Aug: "Cancelled will not be revived — if revived, it will need a new job
-- number as a lot of the initial info will be outdated, and we can use the old job
-- number field to capture the new information. Would be good to have the ability to
-- clone a job or a project."
--
-- **This reverses 0045.** That migration made Cancelled the one stage a record could
-- leave backwards, and called revival "the one backward move the lifecycle allows".
-- The reasoning then was that a stopped site sometimes restarts, which is true — and
-- turns out to be the wrong conclusion. What restarts is the *work*, not the record: by
-- the time a cancelled job comes back, its dates, its selections, its costings and
-- often its lot layout are all stale. Reviving the row keeps a number that is now
-- attached to a set of facts nobody should trust, and the number is the thing printed
-- on contracts.
--
-- So a cancelled record stays cancelled, exactly like a closed one, and coming back is
-- a NEW record that points at the old one. The reversal is kept rather than tidied
-- away, because "cancelled can be revived" is the obvious-looking simplification
-- somebody will otherwise reintroduce.
--
-- The lifecycle is unchanged in shape — five stages on the linear run (Acquisition &
-- Development, Pre-construction, Construction, Handover & Maintenance, Completed), plus
-- Closed and Cancelled, which are now both terminal.

create or replace function guard_lifecycle_is_linear()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  old_stage text;
  new_stage text;
  label     text;
begin
  if tg_table_name = 'projects' then
    old_stage := old.project_stage; new_stage := new.project_stage; label := 'project';
  else
    old_stage := old.job_stage;     new_stage := new.job_stage;     label := 'job';
  end if;

  if new_stage is not distinct from old_stage then
    return new;
  end if;

  -- Unauthenticated means the import or a migration, not a person. Left open on
  -- purpose: the import writes history, and history includes records that ended.
  if auth.uid() is null then
    return new;
  end if;

  if old_stage = 'Closed' then
    raise exception
      'A % in Closed is archived — nothing moves out of the archive.', label
      using errcode = '23514';
  end if;

  -- The change. Cancelled used to `return new` here, and that was the revival path.
  -- The message names the way out, because a refusal that does not say what to do
  -- instead is how somebody ends up editing the row by hand.
  if old_stage = 'Cancelled' then
    raise exception
      'A cancelled % stays cancelled. Its dates, selections and costings are stale, and its number is on contracts — clone it instead, and the new record keeps a link back to this one.', label
      using errcode = '23514';
  end if;

  -- Any live record may still be cancelled. That direction never changed.
  if new_stage = 'Cancelled' then
    return new;
  end if;

  if lifecycle_position(new_stage) < lifecycle_position(old_stage) then
    raise exception
      'A % cannot go back to %. The lifecycle only moves forwards, and this one is at %.',
      label, new_stage, old_stage
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke execute on function guard_lifecycle_is_linear() from public;
revoke execute on function guard_lifecycle_is_linear() from anon;
revoke execute on function guard_lifecycle_is_linear() from authenticated;

-- ---------------------------------------------------------------------------- proof
-- (in a rolled-back transaction on the live database, as a signed-in person: a live job
-- cancelled — accepted; that cancelled job moved to Construction — refused by name;
-- moved to Completed — refused; a job in Closed still refused; a forward move on the
-- linear run still accepted. Then the new branch removed and the same revival watched
-- being accepted again, which is the state 0045 left behind.)
