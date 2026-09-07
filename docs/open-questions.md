# Open questions

**The queue of things only Amber can decide, asked one at a time.**

Amber, 7 September: *"ask me questions on what I should fix one at a time … if you want a
question, ask it here and then record updates"*. So this file is the queue and the record.
It is not a backlog of work — it is the list of places where Claude would otherwise have to
invent a value, and `CLAUDE.md` is explicit that an invented default is worse than a blank.

## How this works

1. **One question at a time.** Ask the top open question in the chat, not four at once.
2. **Ask, then record.** The answer goes in *Answered* below, with the date and Amber's own
   words where they are shorter than a paraphrase.
3. **Never guess ahead of an answer.** Do everything that does not depend on it first, then
   ask. If a question is blocking, say what is blocked.
4. **A question leaves this file only when it is answered or it stops mattering** — and if it
   stops mattering, say why rather than deleting the row.

---

## Open — next question first

### 1. Should creating a notification *type* stay with admins?

Left unanswered when the other two of the 4 September trio were settled. Types went down to
manager along with the rules. A rule is who hears a thing; a type is whether that kind of
notification exists at all. Pulling types back up is a second policy, not a second screen.

### 2. Is the placeholder at 3.47:1 accepted, or does it get fixed?

The design system now labels it *"example text only, never a label"*, which narrows the
exposure but does not clear it — placeholder text is still text under WCAG 1.4.3. `#757478`
would clear it at 4.64:1 as a new `--lofty-black-70` step, leaving `--ui-border-color` at
the 3.47:1 it was deliberately chosen for.

### 3. What should five missing roadmap items say?

Five commits carry a `Roadmap:` trailer whose text matches no checkbox in `ROADMAP.md`, so
work that was finished has no line to tick:

- A readable change history on every record
- Companies, contacts and parties on records
- Maintenance
- Notifications, in-app first
- Tasks, sub-tasks and checklists

They are real and shipped. What is missing is which phase each belongs to and whether the
wording above is the wording you want, and inventing roadmap text is exactly the thing
`CLAUDE.md` forbids.

### 4. How is health status worked out?

Long-standing, from the schema plan's own risk list. *"Status is what someone sets. Health
is what the system works out"* — from inputs nobody has defined. Kanban-by-status and
kanban-by-team work today; **kanban-by-health cannot be built until this is answered.** Is a
job at risk because it is past `expected_days`, because a required field is empty, because a
dependency is blocked, or some combination?

### 5. Does Acquisition & Development want a `project_stage` vocabulary?

`project_stage` is nullable and costs nothing empty. Do not seed a vocabulary until they
confirm they want one — a half-filled stage column that some projects use and others ignore
is worse for reporting than no column.

---

## Answered

| Date | Question | Answer |
| --- | --- | --- |
| 7 Sep | What does "mark as complete" mean for the seven import sites? | **The question dissolved.** *"i don't need any jobs imported from spreadsheets. all jobs that need to be created from now on will be created from the projects in the app"* — so there is no import, no second copy, and nothing to reconcile. Phase B is closed without ever running |
| 7 Sep | What happens to the import machinery on the live database? | **Nothing — leave it.** *"everything that is in supabase now is correct. If I need to import other areas I will let you know as properties may change between now and then. No new importing for job or projects"*. The staging table, its 801 rows and the three functions stay applied and inert |
| 7 Sep | Should filled primary buttons use the pressed orange? | **Yes.** Filled buttons paint `--primary-action-color` `#c2543c` (4.54:1 with white); `--primary-color` stays `#f47e63` for focus rings, tints, accents and chart series. Hover `#9a4330` is derived here and should go back into the design project |
| 7 Sep | Text colour on Crisp Orange | **Never black on orange.** Filled orange carries Finisher White. Reversed the previous day's ink decision; the design system was updated to match |
| 7 Sep | Where do the three contrast fixes live? | Amber fixes them in the Claude Design project; Claude supplies exact hexes and re-syncs. Sync stays one-way into this repository |
| 7 Sep | PR #47 — merge, or hold? | Held as a draft while Amber looked, then **merged** (`3d218d0`). She marked it ready for review and confirmed the merge; it deployed the rebrand to `hub.lofty.au` |
| 7 Sep | Who sees Bugs and Ideas triage? | *"Only admins and super admin get to see the bug manager."* The **form** is open to everyone with app access, viewers included. Both already behaved that way |
| 7 Sep | Is Roadmap/Changelog duplicated? | Yes — *"there is duplication on footer and other page"*. **Done:** the Admin tabs came out, the cog links to `/updates`, and `/admin/roadmap` and `/admin/changelog` forward there |
| 7 Sep | The seven colliding import sites | The app is the record; ignore those workbook rows. *(Superseded the same day by closing the import altogether — see the two rows above)* |
| 6 Sep | Primary colour | Follow the design system: **Crisp Orange**, inverting the app's previous green primary |
| 6 Sep | How much of the design system to take? | Tokens, icons and brand assets only — not the ~50 JSX components, the 276 Vibe icons, the Fieldwork fonts or the brand silhouettes |
| 6 Sep | The domain | `hub.lofty.au`, on **Vercel** |
| 6 Sep | Netlify | Remove it entirely |
| 6 Sep | `HANDOFF.md` | Split: current state at the root, the session-by-session record into `history/` |
| 6 Sep | The loose prototypes | Move to `prototypes/` and archive the dead ones |
| 4 Sep | `amberbeaumont/modules` | Out of scope. *"ignore the amberbeaumont repositry now"* |
