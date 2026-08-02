import { Avatar, Text } from "@vibe/core";
import { RECORD_STATUS_LABELS, type RecordStatus } from "../data/types";
import { Token } from "./Token";
import "./ui.css";

/**
 * The record cards, one per level.
 *
 * Same geometry the board ships with — the structure being previewed is the structure
 * that ships. Values are tokenised until their table is wired; the card does not change
 * shape when they bind, it just stops showing braces.
 */

export function StatusPill({ status }: { status: RecordStatus }) {
  return <span className={`status-pill ${status}`}>{RECORD_STATUS_LABELS[status]}</span>;
}

export function JobCard({
  jobNumber,
  stageName,
  team,
  status = "on_track",
  onOpen
}: {
  jobNumber: string;
  stageName: string;
  team: string;
  status?: RecordStatus;
  onOpen?: () => void;
}) {
  return (
    <article
      className="card card--unbound"
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={e => {
        if (onOpen && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Job ${jobNumber}`}
    >
      <header className="card-top">
        <Text type="text3" color="secondary">{jobNumber}</Text>
        <StatusPill status={status} />
      </header>

      <div>
        <Token>project_display.current_address</Token>
        <div><Token>addresses.consolidated_address</Token></div>
      </div>

      <div className="card-divider" />

      <dl className="card-meta">
        <dt><Text type="text3" color="secondary">Type</Text></dt>
        <dd><Text type="text3"><Token>job_display.project_type</Token></Text></dd>
        <dt><Text type="text3" color="secondary">Stage</Text></dt>
        <dd><Text type="text3">{stageName}</Text></dd>
      </dl>

      <footer className="card-foot">
        <div className="card-who">
          <Avatar size="small" type="text" text="SB" aria-label="Assignee, unbound" />
          <div>
            <Text type="text3" weight="medium">{team}</Text>
            <Text type="text3" color="secondary"><Token>profiles.full_name</Token></Text>
          </div>
        </div>
      </footer>
    </article>
  );
}

export function ProjectCard({
  projectNumber,
  jobNumbers,
  status = "on_track",
  onOpen
}: {
  projectNumber: string;
  jobNumbers: string[];
  status?: RecordStatus;
  onOpen?: () => void;
}) {
  return (
    <article
      className="card card--unbound"
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={e => {
        if (onOpen && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Project ${projectNumber}`}
    >
      <header className="card-top">
        <Text type="text3" color="secondary">Project {projectNumber}</Text>
        <StatusPill status={status} />
      </header>

      <Text type="text1" weight="medium"><Token>project_display.current_address</Token></Text>

      <div className="card-divider" />

      <dl className="card-meta">
        <dt><Text type="text3" color="secondary">Suburb</Text></dt>
        <dd><Text type="text3"><Token>addresses.suburb</Token></Text></dd>
        <dt><Text type="text3" color="secondary">Type</Text></dt>
        <dd><Text type="text3"><Token>projects.project_type</Token></Text></dd>
        <dt><Text type="text3" color="secondary">Target</Text></dt>
        <dd><Text type="text3"><Token>projects.target_completion</Token></Text></dd>
      </dl>

      <div className="card-divider" />

      <Text type="text3" color="secondary">
        {jobNumbers.length} job{jobNumbers.length === 1 ? "" : "s"} on this project
      </Text>
      <div className="stack-tight">
        {jobNumbers.map(no => (
          <div key={no}>
            <Text type="text3" weight="medium" element="span">{no}</Text>{" "}
            <Token>addresses.consolidated_address</Token>
          </div>
        ))}
      </div>
    </article>
  );
}
