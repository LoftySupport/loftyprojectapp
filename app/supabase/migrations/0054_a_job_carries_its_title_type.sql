-- 0054 — a job carries its title type
--
-- The other half of 0053. Amber, 28 Aug: "these are different types and the job will
-- need to carry this information through to the job."
--
-- The project holds the intended split (3 community, 3 Torrens); this is which one a
-- particular job actually is. Both are needed and neither is derivable from the other:
-- the project's numbers are a plan and can be wrong, and there is no rule that says
-- which lots take which title.
--
-- Nullable, and null means nobody has said. Every job created before today is in that
-- state, honestly — a default of 'torrens' would put a title type on 60 jobs that
-- nobody at Lofty chose, which is the kind of invented value this project has already
-- been bitten by.
--
-- Text under a CHECK rather than a new enum: the same call 0035 made for the lifecycle,
-- for the same reason — an enum needs a migration and an exclusive lock to gain a value,
-- and "is there a third kind of title" is not a question this schema should assume the
-- answer to.

alter table jobs
  add column job_title_type text
    constraint job_title_type_is_known
      check (job_title_type in ('community', 'torrens'));

comment on column jobs.job_title_type is
  'Community title or Torrens title — which product this job is (Amber, 28 Aug). Set at the split, from the project''s intended mix, and editable per job afterwards. Null means nobody has said yet, which is every job created before this column.';

-- The board groups and filters by this soon enough, and 200 jobs are coming.
create index jobs_title_type_idx on jobs (job_title_type) where job_title_type is not null;

-- ---------------------------------------------------------------------------- proof
-- (with the migration, in a rolled-back transaction on the live database: 'community'
-- and 'torrens' accepted; 'strata' refused by name; null accepted and left null; and the
-- negative control — the CHECK dropped, and 'strata' watched being accepted.)
