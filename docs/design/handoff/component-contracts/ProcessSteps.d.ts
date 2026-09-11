import * as React from "react";
import { FieldType } from "../FieldRow/FieldRow";

export interface ProcessStepField { label: string; value?: string | null; type?: FieldType; }

export interface ProcessStep {
  name: string;
  done?: boolean;
  /** dd/mm/yyyy. Stamped on tick, cleared on untick, editable afterwards. */
  date?: string | null;
  owner?: string;
  fields?: ProcessStepField[];
}

/** Process checklist on a Flint 50 card with a Crisp Orange progress bar. */
export interface ProcessStepsProps {
  steps?: ProcessStep[];
  /** Index of the one open step, or null. */
  openStep?: number | null;
  onToggleStep?: (index: number, date: string | null) => void;
  onOpenStep?: (index: number | null) => void;
  /** Show only the first N steps behind a "Show all N steps" control. */
  visible?: number;
  iconBasePath?: string;
  style?: React.CSSProperties;
}

export declare function ProcessSteps(props: ProcessStepsProps): JSX.Element;
