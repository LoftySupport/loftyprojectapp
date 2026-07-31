import { Avatar, Label, Text } from "@vibe/core";
import "./PlaceholderJobCard.css";

/**
 * Structure without data.
 *
 * Each of these is the real card — same fields in the same places at the same
 * sizes — with every value replaced by the `table.column` it will come from.
 * An empty page tells you nothing about what a record looks like; these show
 * the layout and double as the binding checklist. They disappear on their own
 * as soon as their repository method starts returning rows.
 */

export function Token({ children }: { children: string }) {
  return <span className="sb-token">{`{{${children}}}`}</span>;
}

export function PlaceholderProjectCard() {
  return (
    <article className="ph-card ph-card--wide" aria-label="Project card structure — not yet bound to data">
      <header className="ph-card-top">
        <Text type="text3" color="secondary">
          <Token>projects.lofty_project_number</Token>
        </Text>
        <Label kind="fill" color="dark" text="Unbound" />
      </header>

      <Text type="text1" weight="medium">
        <Token>projects.name</Token>
      </Text>

      <div className="ph-card-divider" />

      <dl className="ph-card-meta">
        <dt><Text type="text3" color="secondary">Suburb</Text></dt>
        <dd><Text type="text3"><Token>projects.suburb</Token></Text></dd>
        <dt><Text type="text3" color="secondary">Client</Text></dt>
        <dd><Text type="text3"><Token>projects.client</Token></Text></dd>
        <dt><Text type="text3" color="secondary">Manager</Text></dt>
        <dd><Text type="text3"><Token>users.full_name</Token></Text></dd>
      </dl>

      <div className="ph-card-divider" />

      <Text type="text3" color="secondary">Jobs in this project</Text>
      <div className="ph-card-nested">
        <Text type="text3"><Token>jobs.combined_lofty_job_number</Token></Text>
        <Text type="text3"><Token>jobs.address</Token></Text>
      </div>
    </article>
  );
}

export function PlaceholderDashboardCard() {
  return (
    <article className="ph-card" aria-label="Dashboard card structure — not yet bound to data">
      <header className="ph-card-top">
        <Text type="text3" color="secondary">
          <Token>jobs.combined_lofty_job_number</Token>
        </Text>
        <Label kind="fill" color="dark" text="Unbound" />
      </header>

      <Text type="text1" weight="medium">
        <Token>jobs.address</Token>
      </Text>

      <div className="ph-card-divider" />

      <dl className="ph-card-meta">
        <dt><Text type="text3" color="secondary">Stage</Text></dt>
        <dd><Text type="text3"><Token>stages.name</Token></Text></dd>
        <dt><Text type="text3" color="secondary">In stage since</Text></dt>
        <dd><Text type="text3"><Token>job_stages.entered_at</Token></Text></dd>
      </dl>

      <footer className="ph-card-foot">
        <div className="ph-card-who">
          <Avatar size="small" type="text" text="SB" aria-label="Assignee, unbound" />
          <div>
            <Text type="text3" weight="medium"><Token>teams.name</Token></Text>
            <Text type="text3" color="secondary"><Token>users.full_name</Token></Text>
          </div>
        </div>
      </footer>
    </article>
  );
}

/** The wrapper both unbound pages use, so the explanation reads the same way. */
export function UnboundNote({ table, children }: { table: string; children: React.ReactNode }) {
  return (
    <>
      <Text type="text2" color="secondary" className="ph-note">
        Structure only — <code>{table}</code> is not wired yet. Each value shows the
        column it will come from.
      </Text>
      {children}
    </>
  );
}
