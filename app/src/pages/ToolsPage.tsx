import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Heading, Tab, TabList, Text } from "@vibe/core";
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
 * One tab today. It is a TabList anyway rather than a bare page, because Amber asked for
 * the section knowing there will be more ("there will be multiple built in the future"),
 * and adding the second tab to a page that already has tabs is one line where retrofitting
 * tabs onto a bare page moves every URL.
 *
 * The section is in the path — `/tools/template-builder` — for the same reason Setup's
 * is: a link to a particular tab has to be a link somebody can send.
 */
const SECTIONS = [
  { slug: "template-builder", label: "Template Builder" }
] as const;

export function ToolsPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const index = SECTIONS.findIndex(s => s.slug === section);

  // An unknown or missing section is a redirect, not an error page: /tools on its own is
  // a reasonable thing to type or to put in the nav, and it should land somewhere.
  if (index === -1) return <Navigate to={`/tools/${SECTIONS[0].slug}`} replace />;

  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">Tools</Heading>
        <Text type="text2" color="secondary">
          Things you use to make something, rather than records to work on.
        </Text>
      </div>

      <TabList activeTabId={index} onTabChange={i => navigate(`/tools/${SECTIONS[i].slug}`)}>
        {SECTIONS.map(s => <Tab key={s.slug}>{s.label}</Tab>)}
      </TabList>

      <div style={{ marginTop: "var(--space-16)" }}>
        {section === "template-builder" && <TemplateBuilderPage />}
      </div>
    </>
  );
}
