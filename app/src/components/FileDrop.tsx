// app/src/components/FileDrop.tsx
import { useRef, useState, type DragEvent } from "react";
import { Button, Text } from "@vibe/core";
import "./ui.css";

/**
 * Choose files, or drag them in.
 *
 * Amber, 14 September: *"can you make it so file uploads can be drag and dropped into the
 * add files as they are often dragged from emails and not saved"*. The second half is the
 * requirement — the file she wants to attach is an Outlook attachment that exists nowhere
 * on disk, so "Browse…" means saving it first and then finding it again.
 *
 * WHAT A DRAG FROM AN EMAIL ACTUALLY HANDS OVER, WHICH IS NOT ALWAYS A FILE
 *
 *   Dropping gives `dataTransfer.files` when the source materialises real bytes — Outlook
 *   for Mac and Apple Mail generally do, and so does the Finder. It gives an EMPTY list
 *   when the source only promised a file the browser cannot collect, which is what a drag
 *   out of Outlook on the web and a drag between browser tabs usually are.
 *
 *   So an empty drop is a real case rather than a fault, and it SAYS SO. Silently doing
 *   nothing is the control that lies — somebody drags, nothing happens, and there is no
 *   way to tell a rejected file from a broken page. The note names the likely reason and
 *   what to do instead.
 *
 * THE TYPE CHECK IS HERE AS WELL AS IN THE BUCKET, AND THAT IS DELIBERATE
 *
 *   `accept` on an `<input type="file">` filters the file picker and does NOTHING to a
 *   drop — a dropped `.mov` reaches the caller unless something stops it. Storage would
 *   refuse it, but the message a bucket returns for a type it does not take is not one
 *   anybody can act on. So the list below is checked before the upload and the skipped
 *   files are named.
 *
 *   The list MIRRORS the `job-documents` allowlist as `0115` left it. Two copies of one
 *   truth, which is a cost: widen the bucket and this goes stale, and the symptom is a
 *   file this control refuses that the database would have taken. The alternative —
 *   reading the bucket's allowlist at runtime — is a round trip on every drawer open for
 *   a list that changes once a year.
 */

/** What `job-documents` takes (0115). Keep in step with the bucket, not with a guess. */
export const ATTACHABLE_MIME_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  // Video since 0119. Amber, 14 September: *"there may be videos as well. It is essential
  // to keep these as a record"*. Four types rather than `video/*`, the same allowlist
  // reasoning as the images above: quicktime is what an iPhone records, mp4 what Android
  // does, webm a browser capture, mpeg the older cameras still on site.
  "video/mp4", "video/quicktime", "video/webm", "video/mpeg",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain", "text/markdown", "text/html"
] as const;

/** The same set as an `accept` string, so the picker and the drop agree. */
export const ATTACHABLE_ACCEPT = ATTACHABLE_MIME_TYPES.join(",");

/**
 * HEIC from a phone sometimes arrives with an empty `type`, and so does a file dragged
 * out of some mail clients. Falling back to the extension keeps a real photograph from
 * being refused by a check that never saw its MIME type.
 *
 * (Until 0119 this comment ended "…by a check that was meant for a video", because video
 * was the thing being kept out. It is not any more.)
 */
const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  heic: "image/heic", heif: "image/heif",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mpeg: "video/mpeg", mpg: "video/mpeg",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain", md: "text/markdown", html: "text/html", htm: "text/html"
};

const typeOf = (f: File): string => {
  if (f.type) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[ext] ?? "";
};

const isAttachable = (f: File) => (ATTACHABLE_MIME_TYPES as readonly string[]).includes(typeOf(f));

export function FileDrop({
  onFiles,
  ariaLabel,
  disabled = false,
  hint = "photos, PDFs, Word"
}: {
  onFiles: (files: File[]) => void;
  ariaLabel: string;
  disabled?: boolean;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /**
   * `dragleave` fires when the pointer crosses onto a CHILD of the zone, so a boolean set
   * from it flickers the highlight off while the cursor is still inside. Counting enters
   * against leaves is the usual fix and the only one that survives having children.
   */
  const depth = useRef(0);

  /** Split what arrived, take what can be uploaded, and say what was left. */
  const take = (files: File[]) => {
    if (!files.length) {
      setNote(
        "Nothing came across. Some mail clients hand the browser a promise rather than the file itself — " +
        "Outlook on the web is one. Save the attachment first, then drag it in or use Choose files."
      );
      return;
    }
    const good = files.filter(isAttachable);
    const bad = files.filter(f => !isAttachable(f));
    if (good.length) onFiles(good);
    setNote(bad.length
      ? `Not attached: ${bad.map(f => f.name).join(", ")} — ${hint} only.`
      : null);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    if (disabled) return;
    take(Array.from(e.dataTransfer?.files ?? []));
  };

  return (
    <div className="file-drop-wrap">
      <div
        className={`get-started-card file-drop${over ? " is-over" : ""}${disabled ? " is-disabled" : ""}`}
        // Without preventDefault on dragover the browser navigates to the file instead of
        // dropping it, which looks like the page crashing.
        onDragOver={e => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragEnter={e => { e.preventDefault(); depth.current += 1; if (!disabled) setOver(true); }}
        onDragLeave={() => { depth.current -= 1; if (depth.current <= 0) { depth.current = 0; setOver(false); } }}
        onDrop={onDrop}
      >
        <Button size="small" kind="tertiary" disabled={disabled} onClick={() => input.current?.click()}>
          Choose files
        </Button>
        {/* `ellipsis={false}`: Vibe's Text clamps to one line, and this sits in a 240px
            column in the drawer where it clipped to "or drag them in — Photos, PDFs an…". */}
        <Text type="text3" color="secondary" element="span" ellipsis={false}>or drag them in — {hint}</Text>
        <input
          ref={input}
          type="file"
          multiple
          accept={ATTACHABLE_ACCEPT}
          className="file-drop-input"
          aria-label={ariaLabel}
          disabled={disabled}
          onChange={e => {
            const picked = Array.from(e.target.files ?? []);
            // Cleared so choosing the same file twice in a row still fires a change.
            e.target.value = "";
            take(picked);
          }}
        />
      </div>
      {note && <Text type="text3" color="secondary" element="p" ellipsis={false} className="file-drop-note">{note}</Text>}
    </div>
  );
}
