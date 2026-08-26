-- 0047 — the SLA gets a warning lead
--
-- Amber, 26 Aug (Q1): the SLA editor captures, per stage, the expected number of days
-- in stage and how many days before that deadline the record starts flagging at risk.
-- Overdue needs no third number — it is simply past the expected days.
--
-- The expectation itself has existed since 0029 (`pipeline_stage_expected_days`,
-- nullable on purpose — an unset SLA is a real state, and it is not zero). This adds
-- the lead. It hangs off the expectation both ways: a lead with no deadline to lead
-- has nothing to warn about, and a lead as long as the stay would flag the record at
-- risk the moment it arrived — so it requires an expectation and must be shorter.
--
-- Editing stays superadmin's, per 0029's policy on pipeline_stages: the SLA is part of
-- what the stages ARE, not a per-job fact. The editor in Setup → Automations draws the
-- same line, and no policy changes here.

alter table pipeline_stages
  add column pipeline_stage_at_risk_lead_days smallint;

comment on column pipeline_stages.pipeline_stage_at_risk_lead_days is
  'How many days before the expected-days deadline the record starts flagging at risk. Null means no lead is set — a real state, like the unset expectation, and not zero. Requires pipeline_stage_expected_days, and must be shorter than it.';

alter table pipeline_stages
  add constraint pipeline_stages_at_risk_lead_is_positive
    check (pipeline_stage_at_risk_lead_days > 0),
  add constraint pipeline_stages_at_risk_lead_fits_the_expectation
    check (pipeline_stage_at_risk_lead_days is null
           or (pipeline_stage_expected_days is not null
               and pipeline_stage_at_risk_lead_days < pipeline_stage_expected_days));

-- ---------------------------------------------------------------------- proof
-- Each check is watched biting: an insert that should be refused, refused for the
-- right reason, in a sub-block whose rollback removes the attempt. The one accepted
-- row is deleted explicitly, so the migration leaves the table exactly as it found it
-- plus one column.
do $$
declare
  lifecycle uuid;
begin
  select pipeline_id into strict lifecycle
  from pipelines where pipeline_key = 'build_lifecycle';

  -- A lead with no expectation is refused.
  begin
    insert into pipeline_stages (pipeline_id, pipeline_stage_name, pipeline_stage_position,
                                 pipeline_stage_expected_days, pipeline_stage_at_risk_lead_days)
    values (lifecycle, '__sla_proof__', 99, null, 3);
    raise exception 'a lead with no expectation was accepted';
  exception
    when check_violation then null;
  end;

  -- A lead as long as the expectation is refused.
  begin
    insert into pipeline_stages (pipeline_id, pipeline_stage_name, pipeline_stage_position,
                                 pipeline_stage_expected_days, pipeline_stage_at_risk_lead_days)
    values (lifecycle, '__sla_proof__', 99, 10, 10);
    raise exception 'a lead as long as the expectation was accepted';
  exception
    when check_violation then null;
  end;

  -- A zero lead is refused — "warn zero days before" is not a lead, it is the deadline.
  begin
    insert into pipeline_stages (pipeline_id, pipeline_stage_name, pipeline_stage_position,
                                 pipeline_stage_expected_days, pipeline_stage_at_risk_lead_days)
    values (lifecycle, '__sla_proof__', 99, 10, 0);
    raise exception 'a zero lead was accepted';
  exception
    when check_violation then null;
  end;

  -- A sound pair is accepted, and both columns nullable stays true.
  insert into pipeline_stages (pipeline_id, pipeline_stage_name, pipeline_stage_position,
                               pipeline_stage_expected_days, pipeline_stage_at_risk_lead_days)
  values (lifecycle, '__sla_proof__', 99, 10, 3);
  delete from pipeline_stages
  where pipeline_id = lifecycle and pipeline_stage_name = '__sla_proof__';

  raise notice 'ok  at-risk lead: requires an expectation, shorter than it, above zero';
end $$;
