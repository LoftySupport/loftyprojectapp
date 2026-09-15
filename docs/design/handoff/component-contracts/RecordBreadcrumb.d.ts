import * as React from "react";

export interface CrumbItem { id?: string; label: string; }

/** Three levels, no more: object › parent › record. The last crumb is current and not a link. */
export interface RecordBreadcrumbProps {
  items?: CrumbItem[];
  onNavigate?: (item: CrumbItem) => void;
  style?: React.CSSProperties;
}

/** Job title in the house format, with the leading project number as a quiet link. */
export interface JobTitleProps {
  /** e.g. "1209-002" — the first four digits are the project. */
  jobNumber: string;
  /** e.g. "EVANSTON PARK, 14/24 Wandoo Road". */
  location: string;
  size?: "drawer" | "page";
  onOpenProject?: () => void;
  style?: React.CSSProperties;
}

export declare function RecordBreadcrumb(props: RecordBreadcrumbProps): JSX.Element;
export declare function JobTitle(props: JobTitleProps): JSX.Element;
