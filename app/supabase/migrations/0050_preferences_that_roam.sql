-- 0050 — preferences that roam
--
-- Q9's last layer. Landing page and default jobs view are device-local today
-- (localStorage, and the Settings page says so); this puts them on the person, so
-- signing in on the site laptop finds the same app as the office one. The notification
-- matrix's choices join them, for the same reason: nobody should answer seven questions
-- twice.
--
-- ---------------------------------------------------------------------------------
-- WHY A TABLE AND NOT A COLUMN ON `profiles` — the security reason, checked, not assumed
-- ---------------------------------------------------------------------------------
-- `preferences.ts` guessed "a column or small table". It has to be the table, and the
-- reason only shows up when you look at the grants:
--
--   authenticated holds UPDATE on EVERY column of profiles — profile_permission
--   included. What stops a person promoting themselves today is the RLS policy, which
--   admits only admins.
--
-- So adding a preferences column to `profiles` would need a second policy saying "…or
-- it's your own row", and policies are OR'd: that one sentence would also hand every
-- signed-in person write access to their own permission level. The alternatives are
-- column-grant surgery on the table that holds the permission ladder, or a
-- SECURITY DEFINER function to audit forever.
--
-- A separate table needs neither. Owner-only RLS, exactly like `saved_views` (0048),
-- and the profiles policies are not touched at all.

create table user_preferences (
  -- The person IS the key: one row each, so there is no way to end up with two rows
  -- disagreeing about where somebody lands.
  profile_id uuid primary key references profiles(profile_id) on delete cascade,

  -- One jsonb bag rather than a column per preference. Preferences are open-ended —
  -- landing page, default view, the 7x3 notification matrix, whatever density becomes —
  -- and a column each means a migration each. The app already treats them as a bag it
  -- validates on read (readPrefs falls back to the default for anything it does not
  -- recognise), so an unknown key is inert rather than dangerous.
  --
  -- CHECKed as an object: a bare string or array here would be a shape no reader
  -- expects, and that is worth refusing at the door.
  user_preferences_payload jsonb not null default '{}'::jsonb
    constraint user_preferences_payload_is_an_object
      check (jsonb_typeof(user_preferences_payload) = 'object'),

  user_preferences_created_at timestamptz not null default now(),
  user_preferences_updated_at timestamptz not null default now()
);

comment on table user_preferences is
  'One row per person: their working preferences, roaming with the profile instead of living in one browser (Amber''s Q9). Deliberately NOT a column on profiles — authenticated holds UPDATE on every profiles column, so a self-row policy there would also open profile_permission.';

alter table user_preferences enable row level security;

create policy "own preferences" on user_preferences
  for all to authenticated
  using (profile_id = (select current_profile_id()))
  with check (profile_id = (select current_profile_id()));

-- moddatetime with the column as its argument — the 0028 convention.
create trigger user_preferences_touch before update on user_preferences
  for each row execute function extensions.moddatetime(user_preferences_updated_at);

-- ---------------------------------------------------------------------- proof
-- (with the migration: the object CHECK watched refusing a bare string; and in
-- verify/rls.sql, the same five-probe shape as saved_views — another person's
-- preferences invisible, unwritable, undeletable; your own readable and writable —
-- each watched failing against a deliberately permissive policy first.)

-- ------------------------------------------------------------------- app side
-- preferences.ts keeps its shape; readPrefs/writePrefs gain a repository-backed pair:
--   listMyPreferences(): Promise<Prefs>            (upserts nothing; defaults on empty)
--   saveMyPreferences(patch: Partial<Prefs>): Promise<Prefs>   (upsert on profile_id)
-- localStorage stays as the pre-sign-in fallback and the offline answer, with the
-- profile winning whenever it has one — so a device that has never synced still opens
-- somewhere sensible. The Settings page drops its "this device only" caveat.
