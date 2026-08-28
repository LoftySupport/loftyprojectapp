-- 0059 — the latest update is the last comment
--
-- Amber, 28 August: *"the latest update should be the last comment placed on the job."*
--
-- One mechanism, not two. There is no `latest_update` column and there must not be: a
-- stored copy of the newest comment is a second version of a fact the comments table
-- already holds, and the two disagree the first time somebody edits or deletes a
-- comment. This is a view — `distinct on (job_id)` over comments ordered newest first —
-- so it cannot drift, because it is not a copy.
--
-- It is a view rather than a client-side reduce for one specific reason: the board asks
-- for sixty jobs at once, and the honest client version is "read every comment on all
-- sixty jobs, sort, keep the first of each". That is fine at zero comments and wrong at
-- ten thousand — and the tempting fix, a LIMIT, silently drops the newest comment on a
-- quiet job the moment a busy job has more comments than the cap. Postgres does this
-- with an index and no cap at all.
--
-- `comment_id desc` is the tiebreak, so two comments posted in the same millisecond
-- resolve the same way on every read rather than flickering between two answers.
--
-- security_invoker = on, as every view here: the reader's own policies decide. A person
-- who cannot read the job cannot read its comments, and therefore reads no row here. The
-- author name is a LEFT join, so a comment by somebody whose profile the reader cannot
-- see still shows its body with no name — the update is the point, the byline is not.

create view job_latest_update as
select distinct on (c.job_id)
  c.job_id,
  c.comment_id                as latest_comment_id,
  c.comment_body              as latest_comment_body,
  c.comment_created_at        as latest_comment_at,
  c.comment_edited_at         as latest_comment_edited_at,
  a.profile_full_name         as latest_comment_author
from comments c
left join profiles a on a.profile_id = c.comment_created_by
where c.job_id is not null
order by c.job_id, c.comment_created_at desc, c.comment_id desc;

alter view job_latest_update set (security_invoker = on);

comment on view job_latest_update is
  'The newest comment on each job, which is what "latest update" means here (Amber, 28 August). A view rather than a column: a stored copy disagrees with the thread the first time a comment is edited or deleted. security_invoker is on, so a reader sees an update only for a job they can already read.';

-- The index the view leans on. Without it, `distinct on` over a growing comments table
-- is a sort of the whole thing on every board load; with it, Postgres walks the index
-- backwards and stops at the first row per job.
create index if not exists comments_job_id_created_at_idx
  on comments (job_id, comment_created_at desc, comment_id desc)
  where job_id is not null;
