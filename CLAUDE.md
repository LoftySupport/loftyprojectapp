# Lofty Hub — working on this repo

**Lofty Hub** is Lofty's job pipeline board: React + [Vibe](https://vibe.monday.com) +
Supabase, in `app/`. **Vercel is the only host**, and the app answers at
**`hub.lofty.au`**. Everything else at the repository root is documentation or the
assembly the deploy runs.

## How to present substantial work

**Default to a published Artifact for anything explanatory.** Schema walkthroughs, design
options, plans, comparisons, "how does this work" answers — build the page, publish it, and
hand over the link. This is a stated preference, not a fallback: the format made the data
model legible in a way prose in the terminal did not.

What made it work, and should be repeated:

- **Diagrams that show the mechanism**, not boxes with nouns in them. The address timeline
  and the permission decision-ladder each replaced several paragraphs.
- **Real examples throughout** — project 1042, job `1042-01`, 28 Corner Street, actual
  people and teams. Never placeholders.
- **Show the same thing from two sides** where a rule is subtle. The job drawer seen by
  Deanna and by Ketan proved the permission model better than any description of it.
- **End with what needs checking** — the questions where Amber has the answer and Claude
  does not, stated plainly.

Keep the chat reply short when an artifact carries the detail: what changed, what to look
at first, what needs a decision.

## Asking Amber things — one question at a time

**[`docs/open-questions.md`](docs/open-questions.md) is the queue, and the record.** Amber,
7 September: *"ask me questions on what I should fix one at a time … if you want a question,
ask it here and then record updates"*.

- **Interview her, in the chat.** Amber, 10 September: *"always ask open questions here in
  interview style"*. Put the question to her as a question — the context, the options, and a
  recommendation where there is one — and wait for the answer before moving to the next.
  Pointing at the file and listing what is outstanding is not asking; the file is the record,
  the chat is where the asking happens.
- **One at a time.** Ask the top open question in the chat. Not four at once, not a survey.
  When she answers one, record it and ask the next — that is the interview.
- **Ask, then record.** The answer goes into that file's *Answered* table the same session,
  with the date and her own words where they are shorter than a paraphrase. A decision that
  only exists in a chat log has to be made again.
- **Do the unblocked work first.** Everything that does not depend on the answer gets
  finished before the question is asked, and the question says what is blocked.
- **Never guess ahead of an answer** — see *Never fill a gap with a plausible value* below.
  A question in that file is a gap somebody deliberately left open.
- **A row leaves the file only when it is answered or stops mattering**, and if it stops
  mattering, say why rather than deleting it.

## The seven files at the root, and what each owns

Nothing else belongs at the root. If a document does not fit one of these, it goes under
`docs/` — see [`docs/README.md`](docs/README.md) for that map.

| File | Owns |
| --- | --- |
| [`README.md`](README.md) | The entry point: what this is, where it runs, how to work on it |
| **[`HANDOFF.md`](HANDOFF.md)** | **Start here.** State of play, what is next, and which kinds of change are cheaper before the import than after |
| [`PRODUCT.md`](PRODUCT.md) | Who the app is for, what binds it, and the **interface must-haves** every screen has to meet |
| [`DESIGN.md`](DESIGN.md) | **The single design file.** Tokens, contrast decisions, the accessibility contract, the board's colour rule |
| [`ROADMAP.md`](ROADMAP.md) | What is planned. Partly generated — the ticks come from commit trailers |
| [`CHANGELOG.md`](CHANGELOG.md) | **What is done.** Fully generated from `Changelog:` trailers |
| [`CLAUDE.md`](CLAUDE.md) | This file |

**[`docs/schema/schema-plan.md`](docs/schema/schema-plan.md) is the current data design and
the record of how it was decided.** Phase A (structure) is **built and applied**; Phase B
(the import) has not run, so there are no projects or jobs yet; Phase C waits on business
decisions listed at its end. It is a decision log rather than a specification — reversed
decisions are kept on purpose, because a schema choice without its reasoning gets
"simplified" back into a bug by the next person. A readable version with diagrams is
published at <https://claude.ai/code/artifact/188ca532-0cb0-4cf9-a6fb-d10db5bc7d0c> — show
that one to people; edit the file.

**Trust the migrations and the live database over every document here**, this one
included. [`docs/README.md`](docs/README.md) says which of the older documents are records
rather than references.

## Conventions that already bind

- **One branch and PR per table.** Each schema change moves four files together:
  the migration in `app/supabase/migrations/`, `app/src/data/types.ts`,
  `app/src/data/dictionary.ts` and `docs/schema/schema-plan.md` — then
  `cd app && npm run dictionary`. `.github/pull_request_template.md` carries the checklist.
- **Never edit a generated file by hand.** `docs/schema/data-dictionary.md` comes from
  `app/src/data/dictionary.ts`; `CHANGELOG.md`, the ticks in `ROADMAP.md` and the
  `<!-- generated:shipped -->` blocks in `README.md` and `HANDOFF.md` come from commit
  trailers via `node scripts/changelog.mjs`. An edit made in one of them is lost on the
  next commit — put it in the source, or in the commit message.
- **Every change carries a `Changelog:` trailer.** `Added:`, `Changed:`, `Fixed:`,
  `Removed:` — or `Changelog: skip` for something nobody outside the repo would notice.
  Add `Roadmap: <the item's text>` when it finishes a roadmap item.
- **A new screen starts from the checklist, not from a blank file.** *The checklist for a
  new screen* at the end of **Interface Must-Haves** in [`PRODUCT.md`](PRODUCT.md) is the
  list, and it is not advisory: build on the `loftybrand` design system (Vibe underneath,
  `DESIGN.md` over the top) rather than inventing a control; a screen that lists records
  gets Board, Table, Gantt and Calendar unless the omission is named and reasoned; the
  filters are `Toolbar`'s — persistent, inline, one wrapping row plus an Advanced row,
  never a panel that takes the screen; every comparable column sorts and every date filter
  is `DateRangeFilter`; rows and cards have tick boxes and a bulk bar; a kanban column
  that is a settable value takes a drop; and the empty state says what to do. Copy the
  Jobs or Tasks board — they are the two that meet all of it.
- **No component imports the Supabase client or seed data.** Everything reads through the
  repository seam in `app/src/data/repository.ts`. If a screen needs something new, add a
  method — do not reach around it.
- **RLS is the security boundary.** The app's `can()` checks hide controls; they are not
  security. Every one needs a matching policy or it is decoration.
- **Never fill a gap with a plausible value.** An invented default is worse than a blank,
  because a blank invites configuring and a guess gets quoted back as though it were agreed.
  Sign-in was down for an hour behind an error two `catch` blocks turned into "your account
  is not set up"; Reports showed "45% on track" computed from a fixed array; the job
  template showed 36 checkpoints nobody at Lofty wrote. Empty, or a token that names its
  column — never a stand-in.
- **A check nobody has watched fail is not evidence.** Every assertion in
  `app/supabase/verify/` was proved by breaking the thing it guards and seeing it report.
  `./check.sh` runs the lot: constraints bite, RLS holds, embeds resolve, seeds agree.

## Before opening a PR

```bash
cd app && npm run lint && npm run typecheck && npm run build
node scripts/check-links.mjs        # if any document moved or was added
cd app && npm run responsive        # if a screen's layout changed
cd app && npm run check:elements    # always — CI runs it too
app/supabase/verify/check.sh        # if a migration changed
```

CI runs the first two of those, the element sweep, and `./build.sh`, which is what Vercel runs.

**The element sweep counts how many different ways the app draws each thing**, and fails when a
number goes up — see [`docs/design/element-sweep.md`](docs/design/element-sweep.md). It exists
because every rule in *Interface Must-Haves* is written as a behaviour, and a behaviour is
satisfied by any implementation that produces it: thirty-seven header idioms all passed. When a
fix brings a number **down**, lower the baseline in the same commit
(`npm run check:elements -- --update`) — otherwise the ground gained can be given back without
anything noticing.
