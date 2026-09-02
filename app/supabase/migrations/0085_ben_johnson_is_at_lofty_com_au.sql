-- 0085_ben_johnson_is_at_lofty_com_au.sql
--
-- Amber, 2 September: "there should be no emails that are @loftygroup — all emails are
-- @lofty.com.au."
--
-- 0016 seeded Ben Johnson as ben@loftygroup.com.au in both columns and flagged him in its
-- header as the one row where the two addresses matched, "left as supplied". Supplied
-- wrong, it turns out. This corrects the live row rather than editing 0016: that migration
-- has been applied, and a seed file that says one thing while the table says another is
-- the drift verify/seeds.sh exists to catch. 0016's header now points here.
--
-- Two columns, two different answers:
--
--   * profile_email becomes ben@lofty.com.au — the address Amber gave.
--
--   * profile_login_email becomes NULL, not a guess. It is "the address they sign in with,
--     when it differs from email" (0015); the sign-in trigger matches it first and falls
--     through to profile_email. Everyone else's is @loftybg.onmicrosoft.com and Ben's
--     probably is too — but "probably" is a guess about the one key that decides whether
--     he can sign in at all, and the wrong guess surfaces as "your account is not set up".
--     Null lets the trigger match ben@lofty.com.au if that is what Entra presents, and
--     shows as a blank in Setup → Team if it is not. Amber confirms the login address;
--     nobody infers it.
--
-- 0026 moved Ben from Commercial to Lofty General by matching the old address. That ran
-- against the old address when it was live, so it is left as written: history, not a rule.
--
-- Idempotent and loud: a re-run, or a row somebody already corrected in the app, matches
-- nothing and says so. Any @loftygroup.com.au address still standing afterwards, in either
-- column, is an error — there is meant to be none.
do $$
declare
  n int;
begin
  update profiles
     set profile_email       = 'ben@lofty.com.au',
         profile_login_email = null
   where lower(profile_email) = 'ben@loftygroup.com.au';
  get diagnostics n = row_count;
  if n = 0 then
    raise notice '0085: no profile at ben@loftygroup.com.au — already corrected, nothing to do';
  end if;

  if exists (select 1 from profiles
              where lower(profile_email)       like '%@loftygroup.com.au'
                 or lower(profile_login_email) like '%@loftygroup.com.au') then
    raise exception '0085: a @loftygroup.com.au address remains in profiles; Lofty has no such domain';
  end if;
end $$;
