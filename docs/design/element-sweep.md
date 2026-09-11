# The element sweep

`app/scripts/check-elements.mjs`, run by CI on every pull request as **"no screen invents a new
way to draw something"**.

```bash
cd app
npm run check:elements                  # compare against the baseline
npm run check:elements -- --report      # the live census
npm run check:elements -- --update      # write the baseline from the live census
```

## What it is for

Every other check in this repository asks whether something is **present**. So do the design
rules. *Interface Must-Haves* in [`PRODUCT.md`](../../PRODUCT.md) is written as behaviours —
"every comparable column sorts", "the filters are persistent and inline", "the empty state says
what to do" — and a behaviour is satisfied by **any** implementation that produces it.

That is the whole mechanism behind the drift. Each screen satisfied the rules its own way,
honestly, and passed. By 11 September the app was carrying thirty-seven header idioms, thirteen
hand-built filter rows, six table classes and a hundred and ten container recipes, and the
same app was *more* token-disciplined than the prototype it replaced — no hex in any component,
seventy-eight per cent of spacing on tokens against the prototype's nineteen. Compliance went up
the entire time consistency went down, because nothing was counting the second thing.

The other half is propagation. Amber, 4 September: *"fix the other 2 pages as well to have same
format."* A fix lands on the screen that was asked about and not on the twelve with the same
fault. The date-picker rule was agreed on 1 September and honoured in three files; ten days later
sixteen raw `type="date"` inputs were still in the tree and nothing went red.

So the sweep does not ask whether a screen is correct. It counts **how many different ways the app
does each thing**, and holds that number down. A fix that reaches one screen and not the other
twelve leaves the count where it was — which is the point. It is not finished, and now something
says so.

## The ratchet

[`app/scripts/elements-baseline.json`](../../app/scripts/elements-baseline.json) holds what each
family measured when it was last agreed. The check fails in **both** directions:

| | |
| --- | --- |
| The count went **up** | A screen did something its own way. The failure names the new selector, or the file whose count rose, and the component that already does the job. Fix it there — do not add a baseline entry. |
| The count went **down** | Somebody fixed something. The baseline has to come down with it in the same commit, or the ground gained is free to be given back tomorrow with nothing noticing. `--update` writes it. |

The diff of the baseline file is therefore the record of which idioms were retired, and by which
change.

## The twelve families

The numbers are those measured on `main` at `3a132fa`, 11 September 2026.

| | Family | Now | Target | The rule |
| --- | --- | --- | --- | --- |
| E02 | page header | 37 | 1 | One header component. A page that draws its own is a new idiom. |
| E07 | table | 6 | 1 | One data table. `SortableTable` sorts; a screen does not bring its own. |
| E08 | record card | 8 | 1 | The Jobs card and the Tasks card are two drawings of one object. |
| E11 | container recipe | 110 | — | A padded, bordered or filled box is a `panel`. Each distinct recipe is another box that is almost a panel. |
| E12 | empty state | 6 | 1 | PRODUCT.md requires an empty state to say what to do. It does not require a new class each time. |
| E04 | bespoke filter row | 13 | 0 | The filters are `Toolbar`'s. A control outside it gets no `toolbar-field` wrapper, so Vibe's `width:100%` takes the whole row — this is the full-width filters Amber has been pointing at. |
| E05 | prose in the page body | 45 | — | Ratchet only. Empty-state copy is required and is counted here too: the number is not meant to reach zero, it is meant never to rise. |
| E14 | unbound token | 25 | 0 | `<Token>` prints `{{column.name}}` on the screen. A token that names its column beats a guess — but a person should never be the one reading it. |
| E17 | field hint line | 88 | 0 | `Form.tsx:39` turns every `hint` into a permanent line under its control. A description belongs in a tooltip or nowhere. |
| E17 | slot metadata line | 32 | 0 | `PropertySlots.tsx` prints team · format · SLA under every row. Amber, 10 September, on those three: *"Remove all three"*. |
| E16 | raw date input | 16 | 0 | Agreed 1 September: every date filter is `DateRangeFilter`. These are the files the fix never reached. |
| — | hex colour in a component | 0 | 0 | Already zero, and held there. The one rule written as a value rather than a behaviour is the one that never drifted. |

Two shapes sit behind those rows. **Variant** families (E02, E07, E08, E11, E12) store every
distinct idiom by name, so a failure can say `.maint-panel-head` is new rather than "37 became
38". **Site** families (the rest) store a count per file rather than per line, because line
numbers churn on every edit above them and a check that cries wolf gets deleted.

## What it does not do

- **It does not judge a design.** A family at 1 is consistent, not correct: the single `FieldRow`
  could still be the wrong row. The sweep catches divergence, which was the invisible thing.
- **E03 is absent on purpose.** Where a page puts its record count has no mechanical signature,
  and an approximate measure fires on the wrong thing, gets muted, and a muted check is worse
  than none.
- **It reads through Node, not `grep`.** `TasksPage.tsx` declares two deliberate NUL-prefixed
  sentinels (`const NONE = "\0none"`). Those bytes make `grep` class the file as binary and skip
  it in silence — counted with `grep` the raw date inputs came to thirteen, and the true figure
  is sixteen. A census that quietly drops a file is worse than no census, because the number
  still looks like one.

## Adding a family

Add an entry to `families` in the script with an `id`, a `name`, a `kind`, the `rule` a person
reads when it fails, and a `measure()` returning either `{key, where}` (variants) or
`{where, count}` (sites). Then `--update`, and **watch it fail** before committing it: break the
thing it guards, see it report, restore. A check nobody has watched fail is not evidence.
