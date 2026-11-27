/**
 * Microsoft Graph-koppeling. Alle aanroepen gebruiken het gedelegeerde token
 * van de ingelogde gebruiker: de gebruiker ziet in de app nooit meer dan in
 * Microsoft 365 / SharePoint zelf.
 */
const GRAPH = "https://graph.microsoft.com/v1.0";

export class GraphError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function graphFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new GraphError(`Graph ${res.status} op ${path}`, res.status);
  }
  return (await res.json()) as T;
}

/** Controleer lidmaatschap van de opgegeven groepen (ook bij 'group overage'). */
export async function checkMemberGroups(accessToken: string, groupIds: string[]): Promise<string[]> {
  if (!groupIds.length) return [];
  const data = await graphFetch<{ value: string[] }>(accessToken, "/me/checkMemberGroups", {
    method: "POST",
    body: JSON.stringify({ groupIds }),
  });
  return data.value;
}

export type SharePointDriveItem = {
  id: string;
  name: string;
  webUrl: string;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
  folder?: unknown;
  parentReference?: { driveId?: string };
  listItem?: { fields?: Record<string, unknown> };
};

/**
 * Haal alle bestanden (recursief) uit de documentbibliotheek, inclusief de
 * SharePoint-kolommen (listItem.fields) voor status, versie, eigenaar en revisiedatum.
 */
export async function listLibraryFiles(accessToken: string, driveId: string): Promise<SharePointDriveItem[]> {
  const files: SharePointDriveItem[] = [];
  const queue: string[] = [`/drives/${encodeURIComponent(driveId)}/root/children?$expand=listItem($expand=fields)&$top=200`];
  let guard = 0;
  while (queue.length && guard++ < 500) {
    let next: string | undefined = queue.shift();
    while (next) {
      const page: { value: SharePointDriveItem[]; "@odata.nextLink"?: string } = await graphFetch(accessToken, next);
      for (const item of page.value) {
        if (item.folder) {
          queue.push(`/drives/${encodeURIComponent(driveId)}/items/${item.id}/children?$expand=listItem($expand=fields)&$top=200`);
        } else if (item.file) {
          files.push(item);
        }
      }
      next = page["@odata.nextLink"];
    }
  }
  return files;
}

/** Voorbeeld-URL (embed) voor een document. */
export async function getPreviewUrl(accessToken: string, driveId: string, itemId: string): Promise<string | null> {
  const data = await graphFetch<{ getUrl?: string }>(accessToken, `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/preview`, {
    method: "POST",
    body: "{}",
  });
  return data.getUrl ?? null;
}

/**
 * Vertaal SharePoint-kolommen naar onze metadata. De interne kolomnamen zijn
 * per bibliotheek verschillend; pas FIELD_MAP aan op de bibliotheek "IMS-documenten".
 */
export const FIELD_MAP = {
  status: ["Status", "_ModerationStatus", "Documentstatus"],
  version: ["_UIVersionString", "Versie"],
  owner: ["Eigenaar", "Owner", "Documenteigenaar"],
  revisionDate: ["Revisiedatum", "ReviewDate", "Herzieningsdatum"],
  documentNumber: ["Documentnummer", "DocumentNumber"],
  title: ["Title"],
} as const;

export function mapFields(fields: Record<string, unknown> | undefined) {
  const pick = (keys: readonly string[]) => {
    for (const k of keys) {
      const v = fields?.[k];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return undefined;
  };
  const asText = (v: unknown) => {
    if (v === undefined) return undefined;
    if (typeof v === "object" && v && "LookupValue" in v) return String((v as { LookupValue: unknown }).LookupValue);
    if (Array.isArray(v)) return v.map((x) => (typeof x === "object" && x && "LookupValue" in x ? x.LookupValue : x)).join(", ");
    return String(v);
  };
  const rev = asText(pick(FIELD_MAP.revisionDate));
  const revDate = rev ? new Date(rev) : undefined;
  return {
    status: asText(pick(FIELD_MAP.status)),
    version: asText(pick(FIELD_MAP.version)),
    ownerName: asText(pick(FIELD_MAP.owner)),
    revisionDate: revDate && !isNaN(revDate.getTime()) ? revDate : undefined,
    documentNumber: asText(pick(FIELD_MAP.documentNumber)),
    title: asText(pick(FIELD_MAP.title)),
  };
}
