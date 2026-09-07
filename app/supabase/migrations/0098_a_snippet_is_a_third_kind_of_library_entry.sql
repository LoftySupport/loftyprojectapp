-- 0098 — a snippet is a third kind of library entry.
--
-- Amber, 7 September: *"i also want to be able to save text snippets and reusue them"*,
-- in the same breath as asking for property placeholders in prose. The two go together:
-- once a letter can carry `{{job.number}}`, the paragraph around it is worth keeping too,
-- and retyping the standard wording is exactly the work the placeholders removed.
--
-- WHY THIS IS A THIRD KIND AND NOT A FOURTH TABLE
--
--   0094 made `report_template_kind` a discriminator for precisely this reason: same
--   shape, same library, same sign-off, so one table rather than two that would need
--   every policy, trigger and constraint written twice. A snippet has the same five
--   questions asked of it — what is it called, who is it for, has a manager signed it
--   off, is it retired, who wrote it — and the answers live in the same columns.
--
--   So the whole migration is one value on one CHECK. The index on (kind, scope) already
--   covers it, and the per-kind uniqueness already means a snippet and a section may
--   share a name without either being ambiguous.
--
-- WHY IT IS NOT JUST A SECTION
--
--   A section and a snippet differ in WHEN they are read, and that is the whole of it.
--
--     section  — a reference. The "Library section" block resolves it every time the
--                document is opened, so editing the section changes every template using
--                it. That is its purpose and 0094 says so.
--     snippet  — a starting point. Its text is copied into the paragraph at the caret and
--                is then that document's own, to cut about and rewrite.
--
--   A letter needs the second. "Please find attached our progress report for" is wording
--   somebody adjusts per client; if editing it in one letter rewrote it in forty, nobody
--   would dare touch it. Storing a snippet as a section and copying it anyway would work
--   until the first person opened it expecting the live behaviour the kind promises.
--
-- WHERE THE TEXT LIVES
--
--   In `report_template_layout`, as a single `text` widget — the same shape a template
--   uses, so the same CHECK guards it and the builder can open a snippet to edit it
--   without a second editor. Nothing here needs to know that: to Postgres a snippet is a
--   layout like any other, and the constraint it already has is the one that matters.

alter table report_templates
  drop constraint report_templates_kind_is_known;

alter table report_templates
  add constraint report_templates_kind_is_known
    check (report_template_kind in ('template', 'section', 'snippet'));

comment on column report_templates.report_template_kind is
  'template — a whole document''s worth of blocks. section — a fragment inserted into one by the "Library section" block, which resolves it live, so editing a section changes every template using it. snippet — reusable wording, copied into a text block at the caret and then that document''s own; edit a snippet and documents already written keep what they were given.';

-- ==================================================================== proof
-- The constraint was replaced, so it is worth watching the new one both accept and
-- refuse. The first half would pass against the OLD constraint too, which is why the
-- second half is here: `fragment` is still not a kind, and a migration that widened the
-- check to anything at all would be caught by it rather than reported as a pass.
--
-- Both rows are removed, so the table is left exactly as it was found.
do $$
declare
  made uuid;
begin
  -- The new kind is accepted.
  insert into report_templates (report_template_name, report_template_kind, report_template_layout)
  values ('__proof_snippet__', 'snippet',
          '{"widgets": [{"id": "w_proof", "kind": "text", "options": {"html": "<p>Please find attached</p>"}}]}'::jsonb)
  returning report_template_id into made;

  -- And it is still a closed set.
  begin
    insert into report_templates (report_template_name, report_template_kind)
    values ('__proof_fragment__', 'fragment');
    raise exception 'an unknown template kind was accepted';
  exception when check_violation then null; end;

  -- A snippet is subject to every other rule the table has. This one because a layout
  -- that is not a layout is the failure that opens the builder as a blank screen, and a
  -- new kind is exactly where somebody would assume the check no longer applies.
  begin
    insert into report_templates (report_template_name, report_template_kind, report_template_layout)
    values ('__proof_shape__', 'snippet', '{"html": "<p>no widgets key</p>"}'::jsonb);
    raise exception 'a snippet with no widgets array was accepted';
  exception when check_violation then null; end;

  delete from report_templates where report_template_id = made;
end $$;
