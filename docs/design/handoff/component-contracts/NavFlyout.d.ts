import * as React from "react";

export interface FlyoutItem { label: string; count?: number | string; }

/** 240px views panel anchored to a hovered rail destination. */
export interface NavFlyoutProps {
  title: string;
  newLabel?: string;
  views?: FlyoutItem[];
  /** Rendered as "VIEW BY <GROUPLABEL>". */
  groupLabel?: string;
  groups?: FlyoutItem[];
  /** 232 beside the expanded rail, 72 beside the collapsed rail. */
  left?: number;
  top?: number;
  onNew?: () => void;
  onSelectView?: (item: FlyoutItem) => void;
  style?: React.CSSProperties;
}

export declare function NavFlyout(props: NavFlyoutProps): JSX.Element;
