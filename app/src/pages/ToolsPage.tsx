import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Heading, Tab, TabList } from "@vibe/core";
import { TemplateBuilderPage } from "./TemplateBuilderPage";
import "../components/ui.css";

/**
 * Tools.
 *
 * Things you *use*, as opposed to the records you work on and the configuration behind
 * them. Projects, Jobs, Maintenance and Reports are the work; Setup is how the app is
 * wired; this is the third kind — a builder, a calculator, a converter, whatever comes
 * next — and none of those fitted either of the other two.
 *
 * ONE ROW OF TABS, NOT TWO
 *
 *   There used to be a TabList here with a single tab, "Template Builder", sitting
 *   directly above the builder's own three. Amber, 4 September: *"remove this as it is a
 *   duplicate"* — and it read as one, because a tab row with one tab in it is not a
 *   choice, it is a label with a line under it.
 *
 *   So the three lanes ARE the sections now. That keeps what the outer row was for: the
 *   lane is in the path, so a link to the Section Library is a link somebody can send —
 *   which a tab held in component state would not be.
 *
 *   When the second tool arrives it gets its own slugs here and the grouping question can
 *   be answered then, with two real tools to look at rather than one and a hypothetical.
 */
const SECTIONS = [
  { slug: "document-builder", label: "Document Builder", lane: "documents" },
  { slug: "template-library", label: "Template Library", lane: "template" },
  { slug: "section-library", label: "Section Library", lane: "section" }
] as const;

/** Where the old single-tool URL goes. Links to it exist in Teams messages and bookmarks. */
const RETIRED = new Set(["template-builder"]);

export function ToolsPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const index = SECTIONS.findIndex(s => s.slug === section);

  // An unknown or missing section is a redirect, not an error page: /tools on its own is
  // a reasonable thing to type or to put in the nav, and it should land somewhere. The
  // retired slug lands in the same place rather than 404ing somebody's bookmark.
  if (index === -1) {
    return <Navigate to={`/tools/${SECTIONS[0].slug}`} replace state={{ from: section }} />;
  }

  return (
    <>
      {/* No subtitle. Amber: *"remove sub header as it takes up space and adds no value
          and reduce the spacing as we don't need this much room"*. The sentence said what
          Tools is for, which is a thing you read once and then step over every day. */}
      <div className="page-head page-head-tight">
        <Heading type="h2" weight="bold">Tools</Heading>
      </div>

      <TabList activeTabId={index} onTabChange={i => navigate(`/tools/${SECTIONS[i].slug}`)}>
        {SECTIONS.map(s => <Tab key={s.slug}>{s.label}</Tab>)}
      </TabList>

      <TemplateBuilderPage lane={SECTIONS[index].lane} />
    </>
  );
}

export { SECTIONS as TOOLS_SECTIONS, RETIRED as TOOLS_RETIRED_SLUGS };
