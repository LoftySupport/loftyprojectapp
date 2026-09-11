import * as React from "react";

export interface NavDestination {
  id: string;
  label: string;
  /** Icon file stem. Lofty construction glyphs carry internal padding — give them iconSize 28 collapsed. */
  icon: string;
  count?: number | string;
  iconSize?: number;
}

/** Persistent dark application rail: 224px expanded, 64px collapsed, white-wash selection. */
export interface NavRailProps {
  collapsed?: boolean;
  destinations?: NavDestination[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onToggleCollapse?: () => void;
  onHoverDestination?: (id: string) => void;
  /** Slot above the destinations rule — collapsible groups such as My work and Pinned. */
  groups?: React.ReactNode;
  /** Slot below the rule — Settings, Admin. Gate by role. */
  footer?: React.ReactNode;
  user?: React.ReactNode;
  iconBasePath?: string;
  style?: React.CSSProperties;
  /** Header slot: wordmark when expanded, twin-triangle mark when collapsed. */
  children?: React.ReactNode;
}

export declare function NavRail(props: NavRailProps): JSX.Element;
export declare namespace NavRail {
  const wash: { rule: string; hover: string; selected: string; muted: string };
}
