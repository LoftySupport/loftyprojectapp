// _shared/mail.ts — sending from a Lofty mailbox, and reading one.
//
// WHY THIS EXISTS
//
//   Three jobs, one API surface. Notifications go out (`deliver-notifications` has its own
//   copy of sendMail from before this module existed). Forwarded mail comes in and becomes
//   a comment on a job. And a channel can be reached by email, which is the one route into
//   Teams with no Power Automate flow behind it — see `teams.ts`.
//
// THE MAILBOX IS A PERMISSION BOUNDARY, AND GRAPH IS NOT THE ONE ENFORCING IT
//
//   `Mail.Read` and `Mail.Send` as application permissions mean EVERY mailbox in the tenant,
//   including the managing director's. What narrows them to Lofty's own is an Exchange
//   application access policy, set with `New-ApplicationAccessPolicy` in Exchange Online
//   PowerShell, and it is not optional and not visible from here. Until it is in place this
//   app can read anyone's mail; the ICT runbook makes that the step that is not skipped.
//   Nothing in this file can check it, which is exactly why it is written down.
//
// PLUS ADDRESSING CREATES NOTHING
//
//   `hub+1042-001@lofty.com.au` is one mailbox with routing text in it. Three hundred jobs
//   is still one mailbox, one inbox and no administration — which is the whole reason the
//   design chose it over an address per job. The tenant has to have plus addressing enabled
//   or the mail bounces; that is a tenant setting, not something this code can arrange.

import { graphFetch, graphJson, graphList } from "./graph.ts";

const user = (mailbox: string) => `/users/${encodeURIComponent(mailbox)}`;

// ─────────────────────────────────────────────────────────────────────── sending

export type Attachment = { name: string; contentType: string; /** base64 */ contentBytes: string };

export type Outgoing = {
  /** The mailbox to send AS. It must be inside the application access policy. */
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  html?: string;
  text?: string;
  /**
   * Where a reply should land — the job's own plus address, so replying to a notification
   * puts the reply on the record instead of in the notifications mailbox.
   */
  replyTo?: string;
  /**
   * Small files only. `sendMail` caps the whole message at about 4MB, so anything larger
   * has to be a draft plus an upload session. Nothing needs that yet; when something does,
   * it gets its own function rather than a size branch hidden in this one.
   */
  attachments?: Attachment[];
  saveToSentItems?: boolean;
};

/** Send one message. Returns Graph's request id, which is the nearest thing to a receipt. */
export async function sendMail(m: Outgoing): Promise<string> {
  const address = (a: string) => ({ emailAddress: { address: a } });
  const res = await graphFetch(`${user(m.from)}/sendMail`, {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject: m.subject,
        body: m.html ? { contentType: "HTML", content: m.html } : { contentType: "Text", content: m.text ?? "" },
        toRecipients: m.to.map(address),
        ccRecipients: (m.cc ?? []).map(address),
        replyTo: m.replyTo ? [address(m.replyTo)] : [],
        attachments: (m.attachments ?? []).map(a => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: a.name,
          contentType: a.contentType,
          contentBytes: a.contentBytes,
        })),
      },
      saveToSentItems: m.saveToSentItems ?? true,
    }),
  });
  // 202 with no body. The request id is what Microsoft support asks for.
  const id = res.headers.get("request-id") ?? "accepted";
  await res.body?.cancel();
  return id;
}

// ─────────────────────────────────────────────────────────────────────── reading

export type Message = {
  id: string;
  internetMessageId: string;
  subject: string | null;
  bodyPreview: string | null;
  body?: { contentType: "text" | "html"; content: string };
  receivedDateTime: string;
  hasAttachments: boolean;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: { emailAddress?: { address?: string; name?: string } }[];
  ccRecipients?: { emailAddress?: { address?: string; name?: string } }[];
};

const MESSAGE_FIELDS =
  "id,internetMessageId,subject,bodyPreview,body,receivedDateTime,hasAttachments,from,toRecipients,ccRecipients";

/**
 * The oldest unfiled messages in a folder, oldest first.
 *
 * Oldest first on purpose: mail is placed onto records in the order it arrived, so a thread
 * forwarded twice lands in the order the person sent it. `$top` bounds a run; whatever is
 * left is picked up on the next one, which is how a backlog drains without a timeout.
 */
export function listMessages(mailbox: string, folderId = "inbox", top = 25): Promise<Message[]> {
  return graphList<Message>(
    `${user(mailbox)}/mailFolders/${folderId}/messages` +
      `?$select=${MESSAGE_FIELDS}&$orderby=receivedDateTime asc&$top=${top}`,
  );
}

/** One message by id — what a change notification gives you the id of, and nothing else. */
export function getMessage(mailbox: string, messageId: string): Promise<Message> {
  return graphJson<Message>(`${user(mailbox)}/messages/${messageId}?$select=${MESSAGE_FIELDS}`);
}

/**
 * The message as raw MIME, for saving the email itself into the job's folder as a `.eml`.
 *
 * A forwarded email that becomes a comment loses its headers, its formatting and its
 * signature block; the `.eml` is the original, openable in Outlook, which is what somebody
 * asking "what exactly did the client say" actually needs.
 */
export async function messageMime(mailbox: string, messageId: string): Promise<Uint8Array> {
  const res = await graphFetch(`${user(mailbox)}/messages/${messageId}/$value`);
  return new Uint8Array(await res.arrayBuffer());
}

/** A message's file attachments, already base64. Inline images are skipped. */
export async function attachments(mailbox: string, messageId: string): Promise<Attachment[]> {
  const all = await graphList<{
    "@odata.type": string;
    name: string;
    contentType: string;
    contentBytes?: string;
    isInline?: boolean;
  }>(`${user(mailbox)}/messages/${messageId}/attachments`);
  return all
    .filter(a => a["@odata.type"] === "#microsoft.graph.fileAttachment" && !a.isInline && a.contentBytes)
    .map(a => ({ name: a.name, contentType: a.contentType, contentBytes: a.contentBytes as string }));
}

/** Move a message out of the inbox — so the inbox holds only what could not be placed. */
export async function moveMessage(mailbox: string, messageId: string, destinationFolderId: string): Promise<string> {
  const moved = await graphJson<{ id: string }>(`${user(mailbox)}/messages/${messageId}/move`, {
    method: "POST",
    body: JSON.stringify({ destinationId: destinationFolderId }),
  });
  // A move gives the message a NEW id. Storing the old one against the record would be a
  // link to nothing, so the caller gets the new one back.
  return moved.id;
}

/** A mail folder by name under the mailbox root, made if it is not there. Idempotent. */
export async function ensureMailFolder(mailbox: string, displayName: string): Promise<string> {
  const found = await graphList<{ id: string; displayName: string }>(
    `${user(mailbox)}/mailFolders?$select=id,displayName&$top=100`,
  );
  const existing = found.find(f => f.displayName.toLowerCase() === displayName.toLowerCase());
  if (existing) return existing.id;

  const made = await graphJson<{ id: string }>(`${user(mailbox)}/mailFolders`, {
    method: "POST",
    body: JSON.stringify({ displayName }),
  });
  return made.id;
}

// ───────────────────────────────────────────────────────────────────── routing

/** What a forwarded email says it is about. */
export type Routing =
  | { kind: "job"; jobId: string; via: "address" | "subject" }
  | { kind: "project"; projectId: number; via: "address" }
  | { kind: "none" };

// `1042-001`, and `1042-001c` for a community-title job — the shape `job_number()` builds in
// migration 0120. A project number is four digits or more because 0028 says so
// (`constraint projects_number_floor check (project_id >= 1000)`), and the sequence is padded
// to three by `assign_job_sequence()` and only goes wider past the 999th job in one project.
//
// There are two patterns rather than one because the two places a number is read are not
// equally trustworthy. An address is deliberate — somebody typed `+1042-1001` — so it takes
// the loose sequence. A SUBJECT is prose, and `\d{4,}-\d{4,}` reads "the 2024-2025 budget"
// as job 2024-2025. The subject pattern therefore insists on exactly three digits, which
// covers every job Lofty has ever had (Amber: "sometimes 300 jobs per project") and cannot
// match a year range. The thousandth job in a project is routable by address and not by
// subject, which is the right way round for the rarer case to break.
const JOB_IN_ADDRESS = /^(\d{4,})-(\d{3,})(c?)$/;
const JOB_IN_SUBJECT = /\b(\d{4,})-(\d{3})(c?)\b/i;

/**
 * Read the plus tag off one address: `hub+1042-001@lofty.com.au` → a job, `hub+1042@` → a
 * project. Anything else is nothing, which is the right answer for ordinary mail.
 */
export function routingFromAddress(address: string): Routing {
  const local = address.trim().toLowerCase().split("@")[0] ?? "";
  const plus = local.indexOf("+");
  if (plus === -1) return { kind: "none" };
  const tag = local.slice(plus + 1);

  const job = tag.match(JOB_IN_ADDRESS);
  if (job) return { kind: "job", jobId: `${job[1]}-${job[2]}${job[3]}`, via: "address" };

  if (/^\d{4,}$/.test(tag)) return { kind: "project", projectId: Number(tag), via: "address" };
  return { kind: "none" };
}

/**
 * What this message is about: every recipient address first, then the subject line.
 *
 * The subject is a fallback because forwarding from a phone often rewrites the recipients
 * while leaving `FW: 1042-001 slab inspection` intact. It only ever proposes a JOB, never a
 * project: a bare four-digit number in a subject is far more likely to be a price, a lot
 * number or a year than a routing instruction, and placing a stray email onto the wrong
 * project is worse than leaving it in the inbox for a person — which is what "none" means.
 *
 * **This proposes; it does not place.** The caller must confirm the record exists before
 * writing anything against it, and leave the mail in the inbox when it does not. A regex
 * reading prose will eventually offer a number that is not a job, and the database is the
 * only thing that actually knows. Nothing is guessed onto a record — the same rule
 * `maintenance-inbound` already follows when it answers 422 rather than inventing a match.
 */
export function routeMessage(m: Pick<Message, "toRecipients" | "ccRecipients" | "subject">): Routing {
  const addresses = [...(m.toRecipients ?? []), ...(m.ccRecipients ?? [])]
    .map(r => r.emailAddress?.address ?? "")
    .filter(Boolean);
  for (const a of addresses) {
    const r = routingFromAddress(a);
    if (r.kind !== "none") return r;
  }
  const s = (m.subject ?? "").match(JOB_IN_SUBJECT);
  if (s) return { kind: "job", jobId: `${s[1]}-${s[2]}${s[3].toLowerCase()}`, via: "subject" };
  return { kind: "none" };
}

/**
 * The address to put on a job or a project.
 *
 * Derived, never stored: a stored copy of something computed from the number is a column
 * that can disagree with the number, and this one would be quoted onto paperwork before
 * anybody noticed. The app shows it with click-to-copy and works it out every time.
 */
export function addressForRecord(mailbox: string, tag: string): string {
  const [local, domain] = mailbox.split("@");
  if (!domain) throw new Error(`"${mailbox}" is not an email address`);
  return `${local}+${tag}@${domain}`;
}

// ─────────────────────────────────────────────────────── change notifications

/**
 * Ask Graph to POST here when mail arrives.
 *
 * Mail subscriptions expire in under three days whatever you ask for, so renewal is not
 * housekeeping — it is the difference between the integration working and quietly stopping
 * on the Saturday nobody was watching. It belongs in the outbox as a scheduled kind, and the
 * receiving function must also echo Graph's `validationToken`, which is why
 * `maintenance-inbound` keeps that one path open ahead of its secret check.
 */
export async function subscribeToMail(opts: {
  mailbox: string;
  notificationUrl: string;
  clientState: string;
  folderId?: string;
  minutes?: number;
}): Promise<{ id: string; expirationDateTime: string }> {
  const folder = opts.folderId ?? "inbox";
  return await graphJson(`/subscriptions`, {
    method: "POST",
    body: JSON.stringify({
      changeType: "created",
      notificationUrl: opts.notificationUrl,
      resource: `${user(opts.mailbox)}/mailFolders('${folder}')/messages`,
      // Graph caps mail at 4230 minutes and refuses anything longer outright.
      expirationDateTime: new Date(Date.now() + Math.min(opts.minutes ?? 4230, 4230) * 60_000).toISOString(),
      clientState: opts.clientState,
    }),
  });
}

/** Push a subscription's expiry out. Cheaper and less racy than deleting and re-creating. */
export async function renewSubscription(id: string, minutes = 4230): Promise<{ expirationDateTime: string }> {
  return await graphJson(`/subscriptions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      expirationDateTime: new Date(Date.now() + Math.min(minutes, 4230) * 60_000).toISOString(),
    }),
  });
}
