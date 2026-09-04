import { fileStem, type ExportDocument } from "./table";
import { toPdf } from "./pdf";
import { toXlsx } from "./xlsx";
import { toDocx } from "./docx";

export type { ExportCell, ExportColumn, ExportDocument, ExportField, ExportTable } from "./table";
export { tableFromFields, tableOfFigures, fileStem, stamp } from "./table";
export { toPdf } from "./pdf";
export { toXlsx } from "./xlsx";
export { toDocx } from "./docx";

export type ExportFormat = "xlsx" | "docx" | "pdf";

/**
 * The order here is the order of the menu, and it is deliberate: Excel first because it is
 * what most exports are for, Word next for the report that goes out under a cover note,
 * PDF last for the fixed copy. Adding a format is one line each here and in `MIME`, and the
 * menu, the check and the toast all read from this map rather than repeating the list.
 */
export const FORMAT_LABELS: Record<ExportFormat, string> = {
  xlsx: "Excel workbook (.xlsx)",
  docx: "Word document (.docx)",
  pdf: "PDF document (.pdf)"
};

const MIME: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf"
};

/** How the toast names each file — "downloaded as a spreadsheet." and so on. */
export const FORMAT_NOUNS: Record<ExportFormat, string> = {
  xlsx: "spreadsheet",
  docx: "Word document",
  pdf: "PDF"
};

const WRITERS: Record<ExportFormat, (doc: ExportDocument) => Uint8Array> = {
  xlsx: toXlsx,
  docx: toDocx,
  pdf: toPdf
};

/**
 * Build the file and hand it to the browser.
 *
 * The object URL is revoked on the next turn of the event loop rather than immediately:
 * revoking it in the same tick cancels the download in Safari, which is the kind of bug
 * that only ever appears on somebody else's laptop. A second is long after the browser
 * has taken the bytes and long before the tab could accumulate anything.
 */
export function download(doc: ExportDocument, format: ExportFormat): void {
  const takenAt = doc.takenAt ?? new Date();
  const bytes = WRITERS[format]({ ...doc, takenAt });
  const blob = new Blob([bytes as BlobPart], { type: MIME[format] });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileStem(doc.title, takenAt)}.${format}`;
  // Appended before the click: a detached anchor's click is ignored by Firefox.
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
