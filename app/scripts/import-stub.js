/**
 * The importer, exposed on `window`, for `npm run check:import`.
 *
 * It needs a real browser and not Node: the .docx path parses html with `DOMParser`, and
 * pdfjs wants a Worker. Both exist here and neither exists there, so a Node test of this
 * module would be testing a different code path from the one that ships.
 */
import { documentToWidgets, sniffKind } from "../src/features/reports/index.js";

window.__sniff = async (url) => sniffKind(await fetchFile(url));
window.__import = async (url) => {
  const { widgets, notes } = await documentToWidgets(await fetchFile(url));
  // Plain data across the Playwright boundary — a widget holds only strings and numbers,
  // but `notes` order matters and structuredClone keeps it.
  return { widgets, notes };
};

async function fetchFile(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new File([blob], url.split("/").pop(), { type: blob.type });
}

document.getElementById("root").textContent = "ready";
