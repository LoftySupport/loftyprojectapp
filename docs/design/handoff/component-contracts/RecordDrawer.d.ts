import * as React from "react";

/** 460px drawer over a list, or the left column of the 1180px page. Three flex siblings; only the body scrolls. */
export interface RecordDrawerProps {
  width?: number;
  header?: React.ReactNode;
  /** Docked. If this ends up inside the scroll region the tabs scroll away and the pattern is broken. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export interface RecordSectionProps {
  title: string;
  /** Right-aligned summary, e.g. "Stage 2 of 5 · 22 days". */
  meta?: string;
  open?: boolean;
  onToggle?: () => void;
  /** Suppresses the top rule on the first section. */
  first?: boolean;
  children?: React.ReactNode;
}

export declare function RecordDrawer(props: RecordDrawerProps): JSX.Element;
export declare function RecordSection(props: RecordSectionProps): JSX.Element;
