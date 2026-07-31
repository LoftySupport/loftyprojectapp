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

  const rows = ALL_METHODS.map(method => ({
    method,
    table: METHOD_TABLES[method],
    wired: repo.wired.has(method as keyof typeof repo)
  }));

  const live = rows.filter(r => r.wired).length;
  const byTable = [...new Set(rows.map(r => r.table))];

  return (
    <PageShell
      title="Wiring"
      subtitle={`${live} of ${rows.length} repository methods backed by real data · ${byTable.length} tables in the seam`}
    >
      <div className="panel" style={{ marginBottom: "var(--space-16)" }}>
        <Text type="text2">
          {configured
            ? "Supabase is configured. Methods still marked stub fall through to empty results."
            : "Supabase is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local. Until then every method returns empty and the app renders its structure only."}
        </Text>
      </div>

      <div className="panel">
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
                <td><code>{row.method as RepositoryMethod}()</code></td>
                <td><Text type="text2" color="secondary">{row.table}</Text></td>
                <td>
                  {row.wired ? (
                    <Label kind="fill" color="positive" text="Wired" />
                  ) : (
                    <Label kind="fill" color="dark" text="Stub" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
