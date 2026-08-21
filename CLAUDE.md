# Working with Amber on this repo

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

## Where the current work lives

**`schema-plan.md` is the current design and the record of how it was decided.** Phase A
(structure) is fully specified; Phase C waits on business decisions listed at its end. It is
a decision log rather than a specification — reversed decisions are kept on purpose, because
a schema choice without its reasoning gets "simplified" back into a bug by the next person.

A readable version with diagrams is published at
https://claude.ai/code/artifact/188ca532-0cb0-4cf9-a6fb-d10db5bc7d0c — show that one to
people; edit `schema-plan.md`.

`supabase-schema.md` is **superseded** and carries a banner saying so. It was written before
the migrations and never swept forward, and it now contradicts the plan on keys, naming,
stages, teams, permissions and parties. Kept for its reasoning, not for its schema. Trust
the migrations and the live database over it.

## Conventions that already bind

- **One branch and PR per table.** Each schema change moves four files together:
  `supabase-schema.md`, the migration, `app/src/data/types.ts`, `app/src/data/dictionary.ts`
  — then `cd app && npm run dictionary`.
- **Never edit `data-dictionary.md` by hand.** It is generated from `dictionary.ts`.
- **No component imports the Supabase client or seed data.** Everything reads through the
  repository seam in `app/src/data/repository.ts`. If a screen needs something new, add a
  method — do not reach around it.
- **RLS is the security boundary.** The app's `can()` checks hide controls; they are not
  security. Every one needs a matching policy or it is decoration.
