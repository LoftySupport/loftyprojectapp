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

### 1. Should filled primary buttons use the pressed orange?

**Blocked:** the palette's accessibility story. Nothing else waits on it.

The brand rule is *never black on Crisp Orange*, so buttons carry white — and white on
`#f47e63` is **2.62:1**, below the 4.5:1 normal-text floor *and* the 3:1 large-text floor.
The design system names the remedy itself: fill with `--lofty-orange-pressed` `#c2543c`
(**4.54:1** with white) wherever AA text on orange is required. A primary button label is
exactly that.

| | What it means | Cost |
| --- | --- | --- |
| **Use the pressed step** | Filled buttons paint `#c2543c`; `--primary-color` stays `#f47e63` for focus rings, tints, accents, data series | Buttons are a deeper orange than the brand hue. A deliberate divergence from the mirror |
| **Leave it** | Buttons stay `#f47e63` with white labels | Every primary button label sits at 2.62:1 |
| **Change the brand hue** | Darken Crisp Orange itself in the design project | Changes the brand everywhere, print included |

**Claude's recommendation:** use the pressed step. It is the design system's own answer, it
keeps the brand hue where the brand is visible, and it is the only option that reaches AA
without reopening the brand rule.

### 2. What does "mark as complete" mean for the seven import sites?

**Blocked:** the tail of Phase B. The safe half is already settled — the app is the record
for those seven, their workbook rows are skipped, nothing is deleted.

Amber, 7 September: *"I am creating jobs from project tso ignore and mark as comete"*. The
"ignore" half is clear. "Mark as complete" is not, and the two readings are very different:

- **A stage change on live records** — set those seven projects to a completed lifecycle
  stage in the database, or
- **Closing the decision out in the docs** — the import README and `schema-plan.md` stop
  listing it as undecided.

One writes to live data and one edits a paragraph, so it is not a thing to assume.

### 3. Should creating a notification *type* stay with admins?

Left unanswered when the other two of the 4 September trio were settled. Types went down to
manager along with the rules. A rule is who hears a thing; a type is whether that kind of
notification exists at all. Pulling types back up is a second policy, not a second screen.

### 4. Is the placeholder at 3.47:1 accepted, or does it get fixed?

The design system now labels it *"example text only, never a label"*, which narrows the
exposure but does not clear it — placeholder text is still text under WCAG 1.4.3. `#757478`
would clear it at 4.64:1 as a new `--lofty-black-70` step, leaving `--ui-border-color` at
the 3.47:1 it was deliberately chosen for.

### 5. What should five missing roadmap items say?

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

### 6. How is health status worked out?

Long-standing, from the schema plan's own risk list. *"Status is what someone sets. Health
is what the system works out"* — from inputs nobody has defined. Kanban-by-status and
kanban-by-team work today; **kanban-by-health cannot be built until this is answered.** Is a
job at risk because it is past `expected_days`, because a required field is empty, because a
dependency is blocked, or some combination?

### 7. Does Acquisition & Development want a `project_stage` vocabulary?

`project_stage` is nullable and costs nothing empty. Do not seed a vocabulary until they
confirm they want one — a half-filled stage column that some projects use and others ignore
is worse for reporting than no column.

---

## Answered

| Date | Question | Answer |
| --- | --- | --- |
| 7 Sep | Text colour on Crisp Orange | **Never black on orange.** Filled orange carries Finisher White. Reversed the previous day's ink decision; the design system was updated to match |
| 7 Sep | Where do the three contrast fixes live? | Amber fixes them in the Claude Design project; Claude supplies exact hexes and re-syncs. Sync stays one-way into this repository |
| 7 Sep | PR #47 — merge, or hold? | Hold as a draft. *"You look, then I merge"* — the Vercel preview is behind SSO, so only Amber can judge whether the orange reads right |
| 7 Sep | Who sees Bugs and Ideas triage? | *"Only admins and super admin get to see the bug manager."* The **form** is open to everyone with app access, viewers included. Both already behaved that way |
| 7 Sep | Is Roadmap/Changelog duplicated? | Yes — *"there is duplication on footer and other page"*. The Admin tabs come out and the cog links to `/updates` |
| 7 Sep | The seven colliding import sites | The app is the record; ignore those workbook rows. *(The "mark as complete" half is question 2 above)* |
| 6 Sep | Primary colour | Follow the design system: **Crisp Orange**, inverting the app's previous green primary |
| 6 Sep | How much of the design system to take? | Tokens, icons and brand assets only — not the ~50 JSX components, the 276 Vibe icons, the Fieldwork fonts or the brand silhouettes |
| 6 Sep | The domain | `hub.lofty.au`, on **Vercel** |
| 6 Sep | Netlify | Remove it entirely |
| 6 Sep | `HANDOFF.md` | Split: current state at the root, the session-by-session record into `history/` |
| 6 Sep | The loose prototypes | Move to `prototypes/` and archive the dead ones |
| 4 Sep | `amberbeaumont/modules` | Out of scope. *"ignore the amberbeaumont repositry now"* |
