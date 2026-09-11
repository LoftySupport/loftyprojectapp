import type { CSSProperties, ReactNode } from "react";
import "./record.css";

/**
 * Three levels, no more: object › parent › record.
 *
 * Built against `component-contracts/RecordBreadcrumb.d.ts`. `Jobs › 1209 › 1209-002`,
 * and the last crumb is current and not a link.
 *
 * **Jobs › project › job, not Board › stage › job**, which is the decision the old
 * drawer already carried and this keeps: the stage is where a job is *this week*, the
 * project is what it belongs to and that never changes. The database is unambiguous about
 * which is which — `job_id` is literally `project_id || '-' || job_sequence`.
 */

export interface CrumbItem {
  label: string;
  /** Absent on the last crumb, which is where you are. */
  render?: (label: string) => ReactNode;
}

export function RecordBreadcrumb({
  items = [],
  style
}: {
  items?: CrumbItem[];
  style?: CSSProperties;
}) {
  return (
    <nav className="record-crumbs" aria-label="Breadcrumb" style={style}>
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={c.label + i} className="record-crumb">
            {i > 0 && <span className="record-crumb-sep" aria-hidden>›</span>}
            {last
              ? <span aria-current="page" className="is-current">{c.label}</span>
              : c.render?.(c.label) ?? c.label}
          </span>
        );
      })}
    </nav>
  );
}

/**
 * The job title in the house format, with the leading project number as a quiet link.
 *
 * `1209-002 - EVANSTON PARK, 14/24 Wandoo Road`, where the first four digits are the
 * project and are marked **only by a light Flint underline** — not by the link colour.
 * That restraint is the point: the title is the loudest thing on the record and a
 * coloured fragment inside it reads as an error before it reads as a link.
 *
 * The split is arithmetic on the job number rather than a second prop, because
 * `1209-002` is `1209` and `002` by construction — see the breadcrumb note above.
 */
export function JobTitle({
  jobNumber,
  location,
  size = "drawer",
  renderProjectLink,
  style
}: {
  jobNumber: string;
  /** "EVANSTON PARK, 14/24 Wandoo Road". Null when the address is unreadable. */
  location?: ReactNode;
  size?: "drawer" | "page";
  /** Wraps the project fragment in whatever the app routes with. */
  renderProjectLink?: (projectNumber: string, body: ReactNode) => ReactNode;
  style?: CSSProperties;
}) {
  const dash = jobNumber.indexOf("-");
  const project = dash > 0 ? jobNumber.slice(0, dash) : null;
  const rest = dash > 0 ? jobNumber.slice(dash) : jobNumber;

  const number = project
    ? (
      <>
        {renderProjectLink
          ? renderProjectLink(project, <span className="job-title-project">{project}</span>)
          : <span className="job-title-project">{project}</span>}
        {rest}
      </>
    )
    : jobNumber;

  return (
    <h2 className={`job-title is-${size}`} style={style}>
      {number}
      {location ? <> - {location}</> : null}
    </h2>
  );
}
