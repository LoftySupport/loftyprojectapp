# docs

Everything that is not one of the seven files at the repository root. The root holds what a
new person reads; this holds the reference they read next and the record of how it was
decided.

## `open-questions.md` — the queue

[`open-questions.md`](open-questions.md) holds the decisions only Amber can make, **asked
one at a time**, with every answer recorded against its date. It is current, not history:
where it says something is undecided, nothing should be built that assumes an answer.
`CLAUDE.md` carries the convention.

## `schema/` — the data model

| File | What it is |
| --- | --- |
| [`schema/schema-plan.md`](schema/schema-plan.md) | **The current design, and the record of how it was decided.** Phase A is built and applied; Phase C waits on the business decisions at its end. A decision log, not a specification — reversed decisions are kept on purpose |
| [`schema/data-dictionary.md`](schema/data-dictionary.md) | Every property: Lofty name, definition, type, rules, relationships, status. **Generated** from `app/src/data/dictionary.ts` by `cd app && npm run dictionary` — never edit it by hand |
| [`schema/concept-spec.md`](schema/concept-spec.md) | The original data-architecture write-up |
| [`schema/supabase-schema.md`](schema/supabase-schema.md) | **Superseded**, and carries a banner saying so. Written before the migrations and never swept forward; it contradicts the plan on keys, naming, stages, teams, permissions and parties. Kept for its reasoning |

The authority above all four is `app/supabase/migrations/` and the live database.
`app/supabase/verify/check.sh` replays every migration into a throwaway database and proves
the schema *behaves*.

## `design/` — the approved design, and what to build from it

| File | What it is |
| --- | --- |
| [`design/handoff/README.md`](design/handoff/README.md) | **The rail and the job record, as handed over on 11 September.** Both packages marked high fidelity by their author, plus the ten decisions that answer the gaps in them and the four corrections found in review |
| [`design/handoff/BUILD-BRIEF.md`](design/handoff/BUILD-BRIEF.md) | Everything a build needs in one file — what to read, what is decided, what to correct, the order, and the two things still open |
| [`design/handoff/sidebar-navigation/`](design/handoff/sidebar-navigation/) | The left rail: four states, every measurement, screenshots, the Lofty glyphs |
| [`design/handoff/job-record/`](design/handoff/job-record/) | The drawer, the full page and the column picker |

The `.dc.html` files in there are **design references, not production code** — they carry an
in-house template runtime that does not come across. The design system itself is
`app/src/design-system/tokens/`, mirrored from Lofty's App Design System.

## `integrations/` — connecting the outside

| File | What it is |
| --- | --- |
| [`integrations/api-and-mcp-plan.md`](integrations/api-and-mcp-plan.md) | **The plan for an API, an MCP server and an in-app Ask box** — one gateway, three doors, every call running as the caller under RLS. Recommendations, the phases, and a review of its own pitfalls. Nothing in it is built; its six open decisions are questions 14–19 in `open-questions.md` |

## `history/` — the record

Kept, not deleted. A schema or design choice without its reasoning gets "simplified" back
into a bug by the next person, and a document that says how a decision moved is what stops
it being re-litigated. **Nothing here is current.** Where one of these disagrees with a root
file, the root file is right.

| File | What it is |
| --- | --- |
| [`history/handoff-2026-08.md`](history/handoff-2026-08.md) | The session-by-session record, 2026-08-16 to 2026-09-01, moved verbatim out of `HANDOFF.md` |
| [`history/next-session-2026-08-28.md`](history/next-session-2026-08-28.md) | The starting prompt written for the property-layer session on 28 August |
| [`history/design-system-evaluation.md`](history/design-system-evaluation.md) | The July 2026 evaluation of the prototype against Vibe, with the before/after measurements behind every rule in `DESIGN.md` |
| [`history/vibe-catalog-status.md`](history/vibe-catalog-status.md) | The foundation- and component-by-component audit of the prototype against the Vibe catalog |
| [`history/react-migration.md`](history/react-migration.md) | The plan for moving off the single-file prototype. Written before the schema decisions, so its table shapes are out of date |
| [`history/prototype-handover.md`](history/prototype-handover.md) | The prototype, handed over |
| [`history/prototype-app-comparison.md`](history/prototype-app-comparison.md) | Screen-by-screen comparison of the prototype against the React app, illustrated from `comparison-screenshots/` |
| [`history/preconstruction-process.md`](history/preconstruction-process.md) | The 37 pre-construction rows, as given |
| [`history/app-handoff-original.md`](history/app-handoff-original.md) | The first handoff, written the day the app moved out of the prototype repo. Wrong on almost everything a reader would act on, and says so at the top |

## `archive/` — kept, referenced by nothing

Not linked from any document and not part of any build. Here rather than deleted because
the working files were derived from them.

- `lofty-job-oversight-board_prototype_v3.html` — an earlier prototype, superseded by
  `prototypes/prototype.html`
- `lofty-schema-and-recommendations.xlsx` — the schema workbook
- `circle triangle.png`

## `comparison-screenshots/`

The ~30 screenshots `history/prototype-app-comparison.md` is built from.
