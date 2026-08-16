-- 0016_seed_team.sql
--
-- Lofty's people, as at August 2026 — forty-five rows, and the list that decides who may
-- use the app at all. Sign-in links against these; anyone in the Entra directory without
-- a row here holds a session that reads nothing.
--
-- `auth_user_id` is deliberately left null on every row. Nobody has signed in yet, and
-- 0015's trigger fills it the first time each person does, matching on `login_email`.
--
-- Two things about the source data, both deliberate and both worth knowing:
--
--   * The Microsoft login is @loftybg.onmicrosoft.com and the real address is
--     @lofty.com.au. They are different fields for that reason — `email` is what the app
--     shows and what people actually use.
--   * Ben Johnson is @loftygroup.com.au for both, which is the only row where the two
--     match. Left as supplied.
--
-- One correction was applied to the source: `amber@lofty.com.auy` had a trailing "y" and
-- is seeded as `amber@lofty.com.au`. Flagged here rather than silently fixed, because a
-- unique column is an awkward place to discover a typo later.
--
-- `on conflict do nothing` throughout, so a re-run adds anyone new without disturbing a
-- permission or team that has since been edited in the app. This seed is a starting
-- point, not the authority — once someone is promoted, the table is.

insert into profiles (first_name, last_name, email, login_email, job_title, permission) values
  ('Mitch', 'Gurnett', 'mitch@lofty.com.au', 'mitch@loftybg.onmicrosoft.com', 'Acquisition & Development Manager', 'manager'::permission_level),
  ('Olivia', 'Sinderberry', 'olivia@lofty.com.au', 'olivia@loftybg.onmicrosoft.com', 'Acquisition & Development Administrator', 'user'::permission_level),
  ('Rayan', 'Harb', 'rayan@lofty.com.au', 'rayan@loftybg.onmicrosoft.com', 'Junior Acquisition & Development Consultant', 'user'::permission_level),
  ('Brenton', 'Garritty', 'brenton@lofty.com.au', 'brenton@loftybg.onmicrosoft.com', 'Development Manager – Head of Acquisitions', 'user'::permission_level),
  ('Brennan', 'Pengelly', 'brennan@lofty.com.au', 'brennan@loftybg.onmicrosoft.com', 'Junior Acquisition & Development Consultant', 'user'::permission_level),
  ('Paul', 'Ferka', 'paul@lofty.com.au', 'paul@loftybg.onmicrosoft.com', 'Pre-Construction Manager', 'manager'::permission_level),
  ('Isabel', 'Berzins', 'isabel@lofty.com.au', 'isabel@loftybg.onmicrosoft.com', 'Commercial Construction Administrator', 'user'::permission_level),
  ('Nicole', 'Carle', 'nicole@lofty.com.au', 'nicole@loftybg.onmicrosoft.com', 'Executive Assistant to the Director', 'user'::permission_level),
  ('James', 'Jose', 'james@lofty.com.au', 'james@loftybg.onmicrosoft.com', 'Pre-Construction Administrator', 'user'::permission_level),
  ('Laoise', 'Kurmelovs', 'reception@lofty.com.au', 'reception@loftybg.onmicrosoft.com', 'Reception & Administrative Assistant', 'user'::permission_level),
  ('Atelio', 'Storti', 'atelio@lofty.com.au', 'atelio@loftybg.onmicrosoft.com', 'Construction Manager', 'manager'::permission_level),
  ('Ben', 'Johnson', 'ben@loftygroup.com.au', 'ben@loftygroup.com.au', 'Commercial Development Executive', 'user'::permission_level),
  ('Darren', 'Carle', 'darren@lofty.com.au', 'darren@loftybg.onmicrosoft.com', 'Commercial Site Supervisor', 'user'::permission_level),
  ('Samuel', 'Hargreaves', 'samuel@lofty.com.au', 'samuel@loftybg.onmicrosoft.com', 'Construction Scheduler', 'user'::permission_level),
  ('Joe', 'Argent', 'joe@lofty.com.au', 'joe@loftybg.onmicrosoft.com', 'Construction Supervisor', 'user'::permission_level),
  ('Mario', 'Monteleone', 'mario@lofty.com.au', 'mario@loftybg.onmicrosoft.com', 'Construction Supervisor', 'user'::permission_level),
  ('Isaac', 'Trembath', 'isaac@lofty.com.au', 'isaac@loftybg.onmicrosoft.com', 'Site Supervisor', 'user'::permission_level),
  ('Cameron', 'Glomb', 'cameron@lofty.com.au', 'cameron@loftybg.onmicrosoft.com', 'Construction Supervisor', 'user'::permission_level),
  ('Tomasz', 'Mikolajski', 'tomasz@lofty.com.au', 'tomasz@loftybg.onmicrosoft.com', 'Project Manager', 'user'::permission_level),
  ('Fabian', 'Vignogna', 'fabian@lofty.com.au', 'fabian@loftybg.onmicrosoft.com', 'Site Supervisor', 'user'::permission_level),
  ('Carlos', 'Figueroa', 'carlos@lofty.com.au', 'carlos@loftybg.onmicrosoft.com', 'Design Manager', 'manager'::permission_level),
  ('John', 'Gentilcore', 'johng@lofty.com.au', 'johng@loftybg.onmicrosoft.com', 'New Home Designer', 'user'::permission_level),
  ('Prabhat', 'Bhattarai', 'prabhat@lofty.com.au', 'prabhat@loftybg.onmicrosoft.com', 'New Home Designer', 'user'::permission_level),
  ('Lauren', 'Phillips', 'lauren@lofty.com.au', 'lauren@loftybg.onmicrosoft.com', 'Senior New Home Designer', 'user'::permission_level),
  ('Yui', 'Gu', 'yui@lofty.com.au', 'yui@loftybg.onmicrosoft.com', 'New Home Designer', 'user'::permission_level),
  ('Brijesh', 'Savaliya', 'brijesh@lofty.com.au', 'brijesh@loftybg.onmicrosoft.com', 'New Home Designer', 'user'::permission_level),
  ('Jarrod', 'Hicks', 'jarrod@lofty.com.au', 'jarrod@loftybg.onmicrosoft.com', 'Estimating Manager', 'manager'::permission_level),
  ('Nick', 'Altieri', 'nick@lofty.com.au', 'nick@loftybg.onmicrosoft.com', 'Estimator', 'user'::permission_level),
  ('Swatej', 'Bhatia', 'swatej@lofty.com.au', 'swatej@loftybg.onmicrosoft.com', 'Estimator', 'user'::permission_level),
  ('Daniyal', 'Doola', 'daniyal@lofty.com.au', 'daniyal@loftybg.onmicrosoft.com', 'Estimator', 'user'::permission_level),
  ('Sean', 'Campbell', 'sean@lofty.com.au', 'sean@loftybg.onmicrosoft.com', 'Sales Estimator', 'user'::permission_level),
  ('Gary', 'Patel', 'gary@lofty.com.au', 'gary@loftybg.onmicrosoft.com', 'Director', 'admin'::permission_level),
  ('Ketan', 'Patel', 'ketan@lofty.com.au', 'ketan@loftybg.onmicrosoft.com', 'Finance Director', 'admin'::permission_level),
  ('Hitesh', 'Yadav', 'hitesh@lofty.com.au', 'hitesh@loftybg.onmicrosoft.com', 'Accounts Clerk', 'user'::permission_level),
  ('Jangid', 'Ankitkumar', 'jangid@lofty.com.au', 'jangid@loftybg.onmicrosoft.com', 'Accounts Clerk', 'user'::permission_level),
  ('Robin', 'Patel', 'robin@lofty.com.au', 'robin@loftybg.onmicrosoft.com', 'Accounts Clerk', 'user'::permission_level),
  ('Sapna', 'Somani', 'sapna@lofty.com.au', 'sapna@loftybg.onmicrosoft.com', 'Accounts Clerk', 'user'::permission_level),
  ('Jamie', 'Beaumont', 'jamie@lofty.com.au', 'jamie@loftybg.onmicrosoft.com', 'ICT Manager', 'superadmin'::permission_level),
  ('Maurice', 'Zelaya', 'maurice@lofty.com.au', 'maurice@loftybg.onmicrosoft.com', 'Maintenance', 'user'::permission_level),
  ('Richard', 'Summers', 'richard@lofty.com.au', 'richard@loftybg.onmicrosoft.com', 'Residential Maintenance Supervisor', 'user'::permission_level),
  ('Sacha', 'Lovric', 'sacha@lofty.com.au', 'sacha@loftybg.onmicrosoft.com', 'Maintenance Supervisor', 'user'::permission_level),
  ('Nick', 'Brown', 'nickb@lofty.com.au', 'nickb@loftybg.onmicrosoft.com', 'Maintenance', 'user'::permission_level),
  ('Krystie', 'Pastore', 'krystie@lofty.com.au', 'krystie@loftybg.onmicrosoft.com', 'Marketing Manager', 'user'::permission_level),
  ('Deanna', 'Sidiropoulos', 'deanna@lofty.com.au', 'deanna@loftybg.onmicrosoft.com', 'Workflow Manager', 'manager'::permission_level),
  ('Amber', 'Beaumont', 'amber@lofty.com.au', 'amber@loftybg.onmicrosoft.com', 'Automations & Systems Lead', 'superadmin'::permission_level)
on conflict do nothing;

-- Team membership. Everyone has exactly one today, so each is their primary — but the
-- table is (profile_id, team) with a partial unique index allowing only one primary, so
-- a second team is another row and nothing here has to change to allow it.
insert into profile_teams (profile_id, team, is_primary)
select p.id, v.team::team, true
from (values
  ('mitch@loftybg.onmicrosoft.com', 'Acquisition & Development'),
  ('olivia@loftybg.onmicrosoft.com', 'Acquisition & Development'),
  ('rayan@loftybg.onmicrosoft.com', 'Acquisition & Development'),
  ('brenton@loftybg.onmicrosoft.com', 'Acquisition & Development'),
  ('brennan@loftybg.onmicrosoft.com', 'Acquisition & Development'),
  ('paul@loftybg.onmicrosoft.com', 'Pre-Construction Admin'),
  ('isabel@loftybg.onmicrosoft.com', 'Construction Admin'),
  ('nicole@loftybg.onmicrosoft.com', 'Admin'),
  ('james@loftybg.onmicrosoft.com', 'Pre-Construction Admin'),
  ('reception@loftybg.onmicrosoft.com', 'Admin'),
  ('atelio@loftybg.onmicrosoft.com', 'Construction'),
  ('ben@loftygroup.com.au', 'Commercial'),
  ('darren@loftybg.onmicrosoft.com', 'Construction'),
  ('samuel@loftybg.onmicrosoft.com', 'Construction'),
  ('joe@loftybg.onmicrosoft.com', 'Construction'),
  ('mario@loftybg.onmicrosoft.com', 'Construction'),
  ('isaac@loftybg.onmicrosoft.com', 'Construction'),
  ('cameron@loftybg.onmicrosoft.com', 'Construction'),
  ('tomasz@loftybg.onmicrosoft.com', 'Construction'),
  ('fabian@loftybg.onmicrosoft.com', 'Construction'),
  ('carlos@loftybg.onmicrosoft.com', 'Design'),
  ('johng@loftybg.onmicrosoft.com', 'Design'),
  ('prabhat@loftybg.onmicrosoft.com', 'Design'),
  ('lauren@loftybg.onmicrosoft.com', 'Design'),
  ('yui@loftybg.onmicrosoft.com', 'Design'),
  ('brijesh@loftybg.onmicrosoft.com', 'Design'),
  ('jarrod@loftybg.onmicrosoft.com', 'Estimating'),
  ('nick@loftybg.onmicrosoft.com', 'Estimating'),
  ('swatej@loftybg.onmicrosoft.com', 'Estimating'),
  ('daniyal@loftybg.onmicrosoft.com', 'Estimating'),
  ('sean@loftybg.onmicrosoft.com', 'Estimating'),
  ('gary@loftybg.onmicrosoft.com', 'Executive'),
  ('ketan@loftybg.onmicrosoft.com', 'Finance'),
  ('hitesh@loftybg.onmicrosoft.com', 'Finance'),
  ('jangid@loftybg.onmicrosoft.com', 'Finance'),
  ('robin@loftybg.onmicrosoft.com', 'Finance'),
  ('sapna@loftybg.onmicrosoft.com', 'Finance'),
  ('jamie@loftybg.onmicrosoft.com', 'Lofty General'),
  ('maurice@loftybg.onmicrosoft.com', 'Maintenance'),
  ('richard@loftybg.onmicrosoft.com', 'Maintenance'),
  ('sacha@loftybg.onmicrosoft.com', 'Maintenance'),
  ('nickb@loftybg.onmicrosoft.com', 'Maintenance'),
  ('krystie@loftybg.onmicrosoft.com', 'Lofty General'),
  ('deanna@loftybg.onmicrosoft.com', 'Selections'),
  ('amber@loftybg.onmicrosoft.com', 'Lofty General')
) as v(login_email, team)
join profiles p on lower(p.login_email) = v.login_email
on conflict do nothing;
