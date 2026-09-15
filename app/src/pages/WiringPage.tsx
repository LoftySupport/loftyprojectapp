import { Label, Text } from "@vibe/core";
import { ALL_METHODS, METHOD_TABLES, type RepositoryMethod } from "../data/repository";
import { useRepository } from "../data/DataProvider";
import { isSupabaseConfigured } from "../data/supabaseRepository";
import { PageShell } from "./Placeholder";

/**
 * The wiring checklist.
 *
 * The whole point of the seam is that data arrives one table at a time, so there has to
 * be somewhere that says which ones are live. Without it, "is projects wired yet?" is
 * answered by reading source.
 */
export function WiringPage() {
  const repo = useRepository();
  const configured = isSupabaseConfigured();

  // Lookups and records are different kinds of "not wired". A lookup answered from
  // the seed is genuinely serving the business process; a record returning empty is
  // simply not there yet. Showing both as one "Stub" badge reads as less progress
  // than there is.
  const LOOKUPS: RepositoryMethod[] = [
    "listStages", "listTeams", "listTemplatePhases",
    "listTemplateMilestones", "listPropertyDefs"
  ];

  const rows = ALL_METHODS.map(method => ({
    method,
    table: METHOD_TABLES[method],
    isLookup: LOOKUPS.includes(method),
    wired: repo.wired.has(method as keyof typeof repo)
  }));

  // The "N methods across N tables · N reading from Supabase" line these two fed was the
  // page's subtitle, and subtitles went from every page on 12 September. The numbers are
  // still on the page, in the panel below and in each section's own count.
  const records = rows.filter(r => !r.isLookup);
  const lookups = rows.filter(r => r.isLookup);

  return (
    <PageShell title="Wiring">
      <div className="panel" style={{ marginBottom: "var(--space-16)" }}>
        <Text type="text2">
          {configured
            ? "Supabase is configured. Methods still marked stub fall through to empty results."
            : "Supabase is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local, or set them in the Vercel project. They are read at build time. Until then every method returns empty and the app renders its structure only."}
        </Text>
      </div>

      <Section
        title="Records"
        note="What users create. Empty until the table exists and the method is a query."
        rows={records}
        configured={configured}
      />

      <Section
        title="Lookups"
        note="The business process — stages, teams, template phases, milestones, property definitions. Seeded rather than user-created, so the stub answers them honestly: the board has its columns and the drawer its field slots before any table exists. They still come through the seam, so seeding them in Supabase changes one method and no screens."
        rows={lookups}
        configured={configured}
      />

      <div className="panel" style={{ marginTop: "var(--space-16)" }}>
        <Text type="text2" weight="medium">To bring a table online</Text>
        <ol>
          <li><Text type="text2">Add it in <code>supabase/migrations</code> and push.</Text></li>
          <li><Text type="text2">Replace that one method's body in <code>src/data/supabaseRepository.ts</code> with a query.</Text></li>
          <li><Text type="text2">Add the method name to <code>WIRED</code> in the same file.</Text></li>
        </ol>
        <Text type="text2" color="secondary">
          No screen changes. They already read through the seam, so a table going live shows
          up as data appearing rather than as a refactor.
        </Text>
      </div>
    </PageShell>
  );
}

function Section({
  title,
  note,
  rows,
  configured
}: {
  title: string;
  note: string;
  rows: { method: RepositoryMethod; table: string; isLookup: boolean; wired: boolean }[];
  configured: boolean;
}) {
  return (
    <div className="panel" style={{ marginBottom: "var(--space-16)" }}>
      <Text type="text2" weight="bold">{title}</Text>
      <Text type="text3" color="secondary">{note}</Text>
      {/* The wrapper is what scrolls on a narrow screen — three columns of method
          names do not fit on a phone, and a table that widens the page is worse
          than one you swipe. */}
      <div className="data-table-wrap" style={{ marginTop: "var(--space-12)" }}>
      <table className="wiring-table">
        <thead>
          <tr>
            <th scope="col">Repository method</th>
            <th scope="col">Table</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.method}>
              <td><code>{row.method}()</code></td>
              <td><Text type="text2" color="secondary">{row.table}</Text></td>
              <td>
                {row.wired && configured ? (
                  <Label kind="fill" color="positive" text="Supabase" />
                ) : row.wired ? (
                  <Label kind="fill" color="primary" text="Seeded" />
                ) : (
                  <Label kind="fill" color="dark" text="Empty" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
