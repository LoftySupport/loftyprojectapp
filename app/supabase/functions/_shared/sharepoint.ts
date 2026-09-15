// _shared/sharepoint.ts — the folder half of the Microsoft 365 work.
//
// WHY THIS EXISTS
//
//   The one rule of the 15 September design is that every file lives in SharePoint and the
//   app holds a pointer. That makes SharePoint the write path for three things — a project
//   folder made from a template, a job folder made from a template, and a file put onto a
//   record — and the read path for one: what is already in the folder, including whatever
//   somebody dropped there from File Explorer or their phone. All four are Graph drive
//   calls, and all four are wanted by more than one caller, so they live here rather than
//   in whichever edge function needed them first.
//
// EVERYTHING IS ADDRESSED BY ID, NEVER BY PATH
//
//   A folder is `1042 - GOLDEN GROVE, 28 Corner Street` today and something else the day the
//   address changes, and the app renames it itself. A path-addressed integration breaks on
//   the first rename; an id-addressed one does not notice. So every function below takes a
//   drive id and an item id, and `name` appears only where a name is genuinely being set or
//   searched for. The one place a path is unavoidable is `applyTemplate`, which compares two
//   trees, and there the paths are relative and never leave this module.
//
// IDEMPOTENCY IS THE POINT, NOT A NICETY
//
//   Splitting a project into 300 jobs queues 300 folder copies, and an outbox retries. Every
//   create below looks for the name first and treats Graph's 409 as "somebody else just made
//   it" rather than as a failure, so a row retried after a timeout that actually succeeded
//   finds the folder instead of making a second one called `1042-001 1`.
//
// NOTHING HERE DECIDES WHAT A FOLDER IS CALLED
//
//   The naming patterns are Lofty's and live in settings; `safeFolderName` only removes the
//   characters SharePoint refuses. It is a filter on a name somebody chose, not a namer.

import { GraphError, graphFetch, graphJson, graphList } from "./graph.ts";

/** The shape of a drive item, as much of it as anything here reads. */
export type DriveItem = {
  id: string;
  name: string;
  webUrl: string;
  size?: number;
  lastModifiedDateTime?: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  parentReference?: { driveId?: string; id?: string; path?: string };
  lastModifiedBy?: { user?: { displayName?: string; email?: string } };
};

/**
 * SharePoint refuses these outright, and a name it refuses fails the whole copy.
 *
 * `" * : < > ? / \ |` are illegal anywhere in the name; a leading or trailing space or a
 * trailing dot is silently wrong rather than illegal, which is worse, because two folders
 * then differ by something nobody can see. An address genuinely can contain a slash —
 * "Lot 3/5 Corner Street" is how a South Australian unit is written — so this is a real
 * transformation and not defensive padding.
 */
export function safeFolderName(name: string): string {
  const cleaned = name
    .replace(/[\\/]/g, "-")
    .replace(/["*:<>?|]/g, "")
    // Control characters cannot be typed but arrive from an import, and a TAB is one of
    // them. Replaced with a space rather than removed: stripping it first turned
    // "GOLDEN\tGROVE" into "GOLDENGROVE", which the whitespace collapse below then had
    // nothing left to fix. Two words run together is the kind of wrong nobody spots.
    // Two linters, two spellings, one rule — the repo lints this tree with oxlint and
    // Supabase deploys it with Deno.
    // deno-lint-ignore no-control-regex
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .slice(0, 250);
  if (!cleaned) throw new Error(`"${name}" has nothing left in it that SharePoint accepts as a folder name`);
  return cleaned;
}

/** The default document library of a site. One site, one library — the 15 September rule. */
export async function defaultDriveId(siteId: string): Promise<string> {
  const drive = await graphJson<{ id: string }>(`/sites/${siteId}/drive?$select=id`);
  return drive.id;
}

/** Every document library on a site, for the settings screen to choose from. */
export function drives(siteId: string): Promise<{ id: string; name: string; webUrl: string }[]> {
  return graphList(`/sites/${siteId}/drives?$select=id,name,webUrl`);
}

/** The drive's root folder — the parent a project folder is created under. */
export function driveRoot(driveId: string): Promise<DriveItem> {
  return graphJson<DriveItem>(`/drives/${driveId}/root`);
}

/** What is in a folder. Every page of it: see `graphList`. */
export function listChildren(driveId: string, itemId: string): Promise<DriveItem[]> {
  return graphList<DriveItem>(
    `/drives/${driveId}/items/${itemId}/children?$top=200` +
      `&$select=id,name,webUrl,size,lastModifiedDateTime,folder,file,parentReference,lastModifiedBy`,
  );
}

/** One named child, or null. The lookup every create does before it creates. */
export async function childByName(driveId: string, parentId: string, name: string): Promise<DriveItem | null> {
  // Addressed by relative path rather than filtered, because Graph's `$filter` on name is
  // not supported on every drive and fails with a 501 where it is not.
  const res = await graphFetch(
    `/drives/${driveId}/items/${parentId}:/${encodeURIComponent(safeFolderName(name))}?$select=id,name,webUrl,folder,file,parentReference`,
  );
  if (res.status === 404) { await res.body?.cancel(); return null; }
  return (await res.json()) as DriveItem;
}

/** A folder with this name under this parent, made if it is not there. Safe to call twice. */
export async function ensureFolder(driveId: string, parentId: string, name: string): Promise<DriveItem> {
  const wanted = safeFolderName(name);
  const existing = await childByName(driveId, parentId, wanted);
  if (existing) return existing;

  const res = await graphFetch(`/drives/${driveId}/items/${parentId}/children`, {
    method: "POST",
    body: JSON.stringify({ name: wanted, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
  if (res.status === 409) {
    // Two outbox rows raced, or a retry of a call that actually worked. Either way the
    // folder now exists and is the one we wanted — never `fail` into making a second.
    await res.body?.cancel();
    const found = await childByName(driveId, parentId, wanted);
    if (found) return found;
    throw new Error(`SharePoint says "${wanted}" already exists under ${parentId} but will not return it`);
  }
  return (await res.json()) as DriveItem;
}

/** Rename in place. The address changed; the folder's id did not. */
export async function renameItem(driveId: string, itemId: string, name: string): Promise<DriveItem> {
  return await graphJson<DriveItem>(`/drives/${driveId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: safeFolderName(name) }),
  });
}

/**
 * Copy a template folder to a new name under a parent. Returns a monitor URL to poll.
 *
 * Copy is the one Graph drive operation that is always asynchronous: it answers 202 with a
 * `Location` header and does the work afterwards. A caller that treats 202 as done will
 * write back a folder id before the subfolders exist.
 */
export async function startCopy(
  driveId: string,
  templateItemId: string,
  parentId: string,
  name: string,
): Promise<string> {
  const res = await graphFetch(`/drives/${driveId}/items/${templateItemId}/copy`, {
    method: "POST",
    body: JSON.stringify({
      parentReference: { driveId, id: parentId },
      name: safeFolderName(name),
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });
  const monitor = res.headers.get("location");
  await res.body?.cancel();
  if (!monitor) throw new Error("Graph accepted the copy but returned no monitor URL to follow");
  return monitor;
}

export type CopyProgress =
  | { done: false; percent: number }
  | { done: true; itemId: string }
  | { done: true; failed: string };

/**
 * Where a copy has got to.
 *
 * The monitor URL is pre-authenticated and is NOT a Graph endpoint: sending the bearer token
 * to it is what turns a working copy into an inexplicable 401, so this is a bare `fetch` and
 * must stay one. While the copy runs it answers 202 with a progress body; when it finishes
 * it redirects to the new item, which `fetch` follows, so a 200 carrying an id is success.
 */
export async function copyProgress(monitorUrl: string): Promise<CopyProgress> {
  const res = await fetch(monitorUrl);
  if (!res.ok) throw new GraphError(res.status, await res.text(), monitorUrl);
  const body = (await res.json()) as {
    status?: string;
    percentageComplete?: number;
    resourceId?: string;
    id?: string;
    error?: { message?: string };
  };
  if (body.status === "failed" || body.error) {
    return { done: true, failed: body.error?.message ?? "the copy failed and Graph did not say why" };
  }
  const id = body.resourceId ?? (body.status ? undefined : body.id);
  if (body.status === "completed" || id) {
    if (!id) throw new Error("Graph says the copy completed but named no item");
    return { done: true, itemId: id };
  }
  return { done: false, percent: body.percentageComplete ?? 0 };
}

/**
 * Every folder under an item, as paths relative to it. Files are ignored on purpose:
 * a template's job is to describe a shape, and a stray file left in one should not be
 * copied into three hundred job folders.
 */
export async function folderPaths(driveId: string, itemId: string, maxDepth = 6): Promise<string[]> {
  const out: string[] = [];
  const walk = async (id: string, prefix: string, depth: number): Promise<void> => {
    if (depth > maxDepth) return;
    for (const child of await listChildren(driveId, id)) {
      if (!child.folder) continue;
      const path = prefix ? `${prefix}/${child.name}` : child.name;
      out.push(path);
      await walk(child.id, path, depth + 1);
    }
  };
  await walk(itemId, "", 1);
  return out;
}

/**
 * Add to an existing folder whatever the template has grown since it was created.
 *
 * Adds only. It never renames, never moves and never deletes, which is what makes it safe to
 * run over a folder full of somebody's work: the worst it can do is leave an empty folder
 * nobody wanted. Returns the paths it created, so the outbox row records what it did rather
 * than "ok".
 */
export async function applyTemplate(
  driveId: string,
  templateItemId: string,
  targetItemId: string,
): Promise<string[]> {
  const created: string[] = [];
  // Shortest first, so a parent is always made before the child that needs it.
  const wanted = (await folderPaths(driveId, templateItemId)).sort((a, b) => a.split("/").length - b.split("/").length);
  const idByPath = new Map<string, string>([["", targetItemId]]);

  for (const path of wanted) {
    const cut = path.lastIndexOf("/");
    const parentPath = cut === -1 ? "" : path.slice(0, cut);
    const leaf = cut === -1 ? path : path.slice(cut + 1);
    const parentId = idByPath.get(parentPath);
    if (!parentId) continue; // Its parent could not be made; the error is already recorded there.

    const before = await childByName(driveId, parentId, leaf);
    const folder = before ?? (await ensureFolder(driveId, parentId, leaf));
    if (!before) created.push(path);
    idByPath.set(path, folder.id);
  }
  return created;
}

/**
 * The item behind a SharePoint URL somebody pasted — how the ~200 job folders that already
 * exist are adopted without moving anything.
 *
 * Graph's `/shares` encoding: "u!" then base64url of the URL with the padding removed. It
 * resolves a browser address, a "Copy link" sharing URL and a path alike.
 */
export function itemFromUrl(url: string): Promise<DriveItem> {
  const encoded = "u!" + btoa(url.trim()).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return graphJson<DriveItem>(`/shares/${encoded}/driveItem?$select=id,name,webUrl,folder,file,parentReference`);
}

/**
 * An upload URL the browser can PUT to directly.
 *
 * The bytes never pass through an edge function: a 200MB set of site photos through a Deno
 * isolate is a timeout and a memory limit, and the isolate adds nothing to a stream it only
 * forwards. The server's job is to decide the person may upload and to say where, which is
 * this; the browser does the rest. The URL it hands back is short-lived and single-purpose.
 */
export async function createUploadSession(
  driveId: string,
  parentId: string,
  fileName: string,
): Promise<{ uploadUrl: string; expirationDateTime: string }> {
  return await graphJson(`/drives/${driveId}/items/${parentId}:/${encodeURIComponent(fileName)}:/createUploadSession`, {
    method: "POST",
    body: JSON.stringify({
      // "replace" keeps one file per name in a job folder, which is what people expect of a
      // folder they also use from File Explorer. Versions are SharePoint's job, not ours.
      item: { "@microsoft.graph.conflictBehavior": "replace", name: fileName },
    }),
  });
}

/** A small file the server itself made — a report export, an email saved onto a job. */
export async function uploadSmall(
  driveId: string,
  parentId: string,
  fileName: string,
  bytes: Uint8Array<ArrayBuffer> | string,
  contentType = "application/octet-stream",
): Promise<DriveItem> {
  return await graphJson<DriveItem>(
    `/drives/${driveId}/items/${parentId}:/${encodeURIComponent(fileName)}:/content?@microsoft.graph.conflictBehavior=replace`,
    { method: "PUT", body: bytes, headers: { "content-type": contentType } },
  );
}
