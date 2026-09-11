import * as React from "react";

export interface RecordTabDef { id: string; label: string; count?: number | string; }

/** Record-panel tab strip: 36px tabs on a Flint 100 strip, dividers between, the active tab lifted as a white card with a Crisp Orange underline. */
export interface RecordTabsProps {
  tabs?: RecordTabDef[];
  value?: string;
  onChange?: (id: string) => void;
  style?: React.CSSProperties;
}

export declare function RecordTabs(props: RecordTabsProps): JSX.Element;
