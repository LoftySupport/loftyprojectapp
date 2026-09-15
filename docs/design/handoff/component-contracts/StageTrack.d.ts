import * as React from "react";

export type HealthStatus = "on-track" | "at-risk" | "overdue";
export type StageState = "done" | "current" | "todo";

export interface Stage {
  name: string;
  state: StageState;
  /** Dark semibold — the thing you scan for. */
  readoutLabel?: string;
  /** Light secondary — the number. */
  readoutValue?: string;
}

/** Health pill: outline-free, pill-radius, carrying the status colour. */
export interface HealthChipProps {
  status?: HealthStatus;
  label: string;
  iconBasePath?: string;
  style?: React.CSSProperties;
}

/** Pipeline strip. The current stage takes the record's health colour, so stage and health read as one signal. */
export interface StageTrackProps {
  stages?: Stage[];
  status?: HealthStatus;
  /** "bars" = separated 4px lines (drawer); "track" = butted segments with white hairlines (page). */
  variant?: "bars" | "track";
  style?: React.CSSProperties;
}

export declare function HealthChip(props: HealthChipProps): JSX.Element;
export declare function StageTrack(props: StageTrackProps): JSX.Element;
export declare function stageColor(state: StageState, status: HealthStatus): string;
