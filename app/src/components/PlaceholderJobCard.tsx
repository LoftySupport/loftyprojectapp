import { Avatar, Label, Text } from "@vibe/core";
import "./PlaceholderJobCard.css";

/**
 * A job card with its structure intact and every value unbound.
 *
 * An empty column tells you nothing about what a job looks like. This shows the
 * real card — the same fields in the same places at the same sizes — with each
 * value replaced by the `table.column` it will come from. It is the layout
 * reference and the binding checklist in one, and it disappears the moment
 * `listJobs()` returns rows.
 */

function Token({ children }: { children: string }) {
  return <span className="sb-token">{`{{${children}}}`}</span>;
}

export function PlaceholderJobCard({ stageName }: { stageName: string }) {
  return (
    <article className="ph-card" aria-label="Job card structure — not yet bound to data">
      <header className="ph-card-top">
        <Text type="text3" color="secondary">
          <Token>jobs.combined_lofty_job_number</Token>
        </Text>
        <Label kind="fill" color="dark" text="Unbound" />
      </header>

      <Text type="text3" color="secondary" className="ph-card-project">
        <Token>projects.name</Token>
      </Text>

      <div className="ph-card-address">
        <Text type="text1" weight="medium">
          <Token>jobs.address</Token>
        </Text>
      </div>

      <div className="ph-card-divider" />

      <dl className="ph-card-meta">
        <dt><Text type="text3" color="secondary">Type</Text></dt>
        <dd><Text type="text3"><Token>jobs.type_id</Token></Text></dd>
        <dt><Text type="text3" color="secondary">Stage</Text></dt>
        <dd><Text type="text3">{stageName}</Text></dd>
      </dl>

      <div className="ph-card-activity">
        <Text type="text3" color="secondary">
          <Token>activity.description</Token>
        </Text>
      </div>

      <footer className="ph-card-foot">
        <div className="ph-card-who">
          <Avatar size="small" type="text" text="SB" aria-label="Assignee, unbound" />
          <div>
            <Text type="text3" weight="medium"><Token>teams.name</Token></Text>
            <Text type="text3" color="secondary"><Token>users.full_name</Token></Text>
          </div>
        </div>
        <Text type="text3" color="secondary">
          <Token>job_stages.entered_at</Token>
        </Text>
      </footer>
    </article>
  );
}
