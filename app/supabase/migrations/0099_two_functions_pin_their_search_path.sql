-- 0099 — two functions pin their search_path.
--
-- Supabase's security advisor reports `function_search_path_mutable` against
-- `private.audit_exempt_tables()` and `public.stage_sla_columns()`. Both are cleared here
-- by setting `search_path` on the function rather than leaving it to the caller's.
--
-- HOW BIG THIS ACTUALLY IS, BECAUSE OVERSTATING IT WOULD BE WORSE THAN LEAVING IT
--
--   Small. The usual danger behind this warning is a SECURITY DEFINER function that
--   resolves an unqualified name — `from users` — against a search_path the caller
--   controls, so the caller points it at their own `users` and the function does their
--   work with the owner's rights. Neither of these is that:
--
--     - Neither is SECURITY DEFINER. Both run as whoever calls them.
--     - Neither reads a table, calls a function or uses an operator that could be
--       shadowed. Each is one `select array[…]` of string literals, marked IMMUTABLE.
--
--   So this is hygiene, not a hole that was open. It is worth doing anyway for one
--   reason: an advisor with two permanent warnings on it is an advisor nobody reads, and
--   the next real finding arrives in the same list. Clearing what is cheap to clear keeps
--   that list meaningful.
--
--   `pg_catalog, pg_temp` and not `public`: neither function names anything outside
--   pg_catalog, so the narrowest path that still works is the right one. `pg_temp` is
--   pinned last deliberately — left out it is searched FIRST, which is the hole this
--   syntax exists to close.

alter function private.audit_exempt_tables() set search_path = pg_catalog, pg_temp;
alter function public.stage_sla_columns()   set search_path = pg_catalog, pg_temp;

-- ==================================================================== proof
-- Two claims: the path is pinned, and the functions still answer.
--
-- The second is not padding. `alter function … set search_path` narrows what the body can
-- resolve, and a path that is too narrow turns a working function into one that raises
-- "type text[] does not exist" the first time something calls it — which here would be
-- the audit trigger on every table, on every write. Cheaper to find now.
do $$
declare
  cfg text[];
begin
  -- Pinned, on both.
  for cfg in
    select p.proconfig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname, p.proname) in (('private','audit_exempt_tables'), ('public','stage_sla_columns'))
  loop
    if cfg is null or not exists (
      select 1 from unnest(cfg) c where c like 'search_path=%'
    ) then
      raise exception 'a function was left with a mutable search_path: %', cfg;
    end if;
  end loop;

  -- And still answering, through the narrowed path.
  if array_length(private.audit_exempt_tables(), 1) is null then
    raise exception 'audit_exempt_tables() came back empty after its search_path was pinned';
  end if;
  if array_length(public.stage_sla_columns(), 1) <> 2 then
    raise exception 'stage_sla_columns() no longer returns its two columns';
  end if;
end $$;
