import type { SearchPage, SearchResult } from "../types.ts";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as ObjectValue : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const dimension = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;

// Reject executable URLs and embedded credentials. Only IDS's verified HTTP
// image URLs are upgraded to HTTPS; other source URLs retain their protocol.
export function safeUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    if (url.hostname === "ids.si.edu") url.protocol = "https:";
    return url.href;
  } catch { return null; }
}

function labeled(value: unknown): string | null {
  const lines = array(value).map(object).flatMap(entry => {
    const content = text(entry.content);
    return content ? [`${text(entry.label) ?? "Note"}: ${content}`] : [];
  });
  return lines.length ? lines.join("\n") : null;
}

function rights(value: unknown): Pick<SearchResult, "license" | "licenseUrl" | "commercialUse"> {
  const usage = object(value);
  const access = text(usage.access);
  const statement = text(usage.text);
  const license = [access, statement].filter(Boolean).join(" — ") || null;
  // Additional unexplained text makes CC0 ambiguous. Metadata usage is never
  // consulted here: only the selected image's usage evidence can grant permission.
  if (access?.toUpperCase() === "CC0" && (!statement || statement.toUpperCase() === "CC0")) {
    return { license, licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", commercialUse: "allowed" };
  }
  if (access?.toUpperCase() === "CC0") {
    return { license, licenseUrl: null, commercialUse: "unknown" };
  }
  const explicitlyRestricted = [access, statement].some(value =>
    value?.toLowerCase() === "usage conditions apply");
  if (explicitlyRestricted && statement?.toUpperCase() === "CC0") {
    return { license, licenseUrl: null, commercialUse: "unknown" };
  }
  return { license, licenseUrl: null, commercialUse: explicitlyRestricted ? "not-allowed" : "unknown" };
}

export function normalizeRecord(value: unknown): SearchResult[] {
  const row = object(value);
  const sourceId = text(row.id);
  const content = object(row.content);
  const descriptive = object(content.descriptiveNonRepeating);
  const freetext = object(content.freetext);
  // Smithsonian's verified public object route takes the EDAN match key, not
  // the internal persistent id. Do not guess a route when that key is absent.
  const matchKey = text(row.url);
  const sourceUrl = matchKey?.startsWith("edanmdm:")
    ? `https://www.si.edu/object/${encodeURIComponent(matchKey)}`
    : safeUrl(descriptive.record_link);
  if (!sourceId || !sourceUrl) return [];

  return array(object(descriptive.online_media).media).flatMap(value => {
    const media = object(value);
    if (media.type !== "Images") return [];
    const thumbnailUrl = safeUrl(media.thumbnail);
    const previewUrl = safeUrl(media.content);
    const mediaId = text(media.id) ?? text(media.idsId) ?? previewUrl ?? thumbnailUrl;
    if (!mediaId || (!thumbnailUrl && !previewUrl)) return [];

    const resources = array(media.resources).map(object);
    // Only explicitly labeled high-resolution resources qualify as originals.
    const original = resources.find(r => r.label === "High-resolution JPEG" && safeUrl(r.url))
      ?? resources.find(r => r.label === "High-resolution TIFF" && safeUrl(r.url));
    const originalUrl = safeUrl(original?.url);
    const dateEntries = array(freetext.date).map(object);
    const attribution = labeled(freetext.creditLine)
      ?? labeled(array(freetext.objectRights).filter(value => object(value).label === "Credit Line"));

    return [{
      id: `smithsonian:${sourceId}:${mediaId}`,
      source: "smithsonian",
      sourceId,
      title: text(row.title) ?? text(object(descriptive.title).content),
      scientificName: null,
      commonName: null,
      anatomicalPart: null,
      description: labeled(freetext.notes) ?? text(media.extDescrAccessibility),
      thumbnailUrl,
      previewUrl,
      originalUrl,
      downloadUrl: originalUrl,
      width: dimension(original?.width),
      height: dimension(original?.height),
      ...rights(media.usage),
      creator: null,
      date: text(dateEntries[0]?.content),
      attribution,
      sourceUrl,
      sourceMetadata: {
        record: row,
        media,
        dateMeaning: text(dateEntries[0]?.label),
        mappingNotes: "Taxonomy, anatomy, and image creator are not inferred from titles, keywords, object authors, or makers.",
      },
    }];
  });
}

function response(payload: unknown): ObjectValue {
  const envelope = object(payload);
  if (envelope.status !== 200 || envelope.responseCode !== 1) {
    throw new Error("Smithsonian returned an unsuccessful API response.");
  }
  return object(envelope.response);
}

export function normalizeSearch(payload: unknown, query: string, start: number): SearchPage {
  const data = response(payload);
  if (!Array.isArray(data.rows) || typeof data.rowCount !== "number"
    || !Number.isInteger(data.rowCount) || data.rowCount < 0) {
    throw new Error("Smithsonian returned an unexpected search response structure.");
  }
  const next = start + data.rows.length;
  return {
    results: data.rows.flatMap(normalizeRecord),
    total: data.rowCount,
    nextCursor: data.rows.length > 0 && next < data.rowCount
      ? JSON.stringify({ query, start: next }) : null,
  };
}

export function normalizeContent(payload: unknown): SearchResult[] {
  const data = response(payload);
  if (!text(data.id) || !data.content) throw new Error("Smithsonian returned an unexpected content response structure.");
  return normalizeRecord(data);
}
