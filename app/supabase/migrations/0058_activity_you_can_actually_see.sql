-- 0058 — activity you can actually see
--
-- Amber, 28 Aug: "projects also need to have their history and project activity. I like
-- the way it appears in the prototype layout — this is neat and clean."
--
-- The activity is already being recorded — 556 rows, 230 of them about projects and
-- jobs — and until now **nobody below admin could read a single one of them**. A panel
-- built on that would have rendered empty for almost everybody while looking perfect to
-- the admin who built it, which is the same shape of fault as the feedback insert two
-- days ago. So the policy comes first.
--
-- ------------------------------------------------------------------ what this opens up
-- Two tables, and only two. `activity_audit` rows carry whole row snapshots in
-- `old_row` / `new_row`, so widening it wholesale would hand every signed-in person the
-- history of the `profiles` table — permission levels included. Naming the tables keeps
-- that shut.
--
-- For `projects` and `jobs` specifically it discloses nothing new: both are readable by
-- `is_active_user()` already (their read policies are exactly that), so the columns in
-- these snapshots are columns the same person can select from the tables themselves.
-- What the feed adds is the PREVIOUS value and who changed it — which is the feature,
-- and is not a secret about a record somebody can already open.
--
-- The admin policy stays. Policies are OR'd, so admin keeps the whole audit table.

create policy "read activity on projects and jobs" on activity_audit
  for select to authenticated
  using (
    (select is_active_user())
    and table_name in ('projects', 'jobs')
  );

-- ---------------------------------------------------------------------------- proof
-- (in a rolled-back transaction on the live database, as a signed-in VIEWER: reads
-- project and job audit rows; reads exactly ZERO rows for every other table, profiles
-- included; and a demo account still reads none of it at all, because is_active_user()
-- is false. Then the table list dropped from the predicate, and the same viewer watched
-- reading profiles history — which is the disclosure this clause exists to prevent.)
