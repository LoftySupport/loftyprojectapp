import * as React from "react";

export type FieldType = "text" | "date" | "pick" | "person" | "link";

/** One property row: label column, typed control inline, 32px row. */
export interface FieldRowProps {
  label: string;
  value?: string | null;
  type?: FieldType;
  /** 120 in the drawer, 136 on the page. Set once via FieldList. */
  labelWidth?: number;
  /** 300 on the page. Every control in a column is the same width and height. */
  controlWidth?: number | string;
  onChange?: () => void;
  iconBasePath?: string;
  /** Supply a real design-system control instead of the placeholder box. */
  children?: React.ReactNode;
}

export interface FieldListProps {
  variant?: "drawer" | "page";
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function FieldRow(props: FieldRowProps): JSX.Element;
export declare function FieldList(props: FieldListProps): JSX.Element;
