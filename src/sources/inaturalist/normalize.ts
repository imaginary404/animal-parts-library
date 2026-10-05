import type { SearchPage, SearchResult } from "../types.ts";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as ObjectValue : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const positiveInteger = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;

function safeUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

// These exact hosts and replacing only the size qualifier are documented by
// iNaturalist. Never derive variants for external or placeholder image URLs.
function photoUrl(value: unknown, id: number, size: string): string | null {
  const raw = safeUrl(value);
  if (!raw) return null;
  const url = new URL(raw);
  if (!["static.inaturalist.org", "inaturalist-open-data.s3.amazonaws.com"].includes(url.hostname)) return null;
  const pattern = new RegExp(`/photos/${id}/(square|thumb|small|medium|large|original)\\.([a-zA-Z0-9]+)$`);
  if (!pattern.test(url.pathname)) return null;
  url.pathname = url.pathname.replace(pattern, `/photos/${id}/${size}.$2`);
  url.protocol = "https:";
  return url.href;
}

const licenses: Record<string, { label: string; url: string; commercialUse: SearchResult["commercialUse"] }> = {
  cc0: { label: "CC0 1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/", commercialUse: "allowed" },
  "cc-by": { label: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/", commercialUse: "allowed" },
  "cc-by-sa": { label: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/", commercialUse: "allowed" },
  "cc-by-nd": { label: "CC BY-ND 4.0", url: "https://creativecommons.org/licenses/by-nd/4.0/", commercialUse: "allowed" },
  "cc-by-nc": { label: "CC BY-NC 4.0", url: "https://creativecommons.org/licenses/by-nc/4.0/", commercialUse: "not-allowed" },
  "cc-by-nc-sa": { label: "CC BY-NC-SA 4.0", url: "https://creativecommons.org/licenses/by-nc-sa/4.0/", commercialUse: "not-allowed" },
  "cc-by-nc-nd": { label: "CC BY-NC-ND 4.0", url: "https://creativecommons.org/licenses/by-nc-nd/4.0/", commercialUse: "not-allowed" },
};

function rights(photo: ObjectValue): Pick<SearchResult, "license" | "licenseUrl" | "commercialUse" | "creator" | "attribution"> {
  const code = text(photo.license_code)?.toLowerCase() ?? null;
  const attribution = text(photo.attribution);
  const license = code ? licenses[code] : undefined;
  // v1 emits attribution, not the photo owner's user object. Extract the name
  // only from the exact formats in iNaturalist's official photoAttribution helper.
  // Never assume that observation.user is the photo's creator.
  const name = attribution?.match(/^\(c\) (.+), (?:some rights reserved \(CC [A-Z -]+\)|all rights reserved)$/)?.[1]
    ?? attribution?.match(/^(.+), no known copyright restrictions \(public domain\)$/)?.[1];
  const creator = name && !["undefined", "null"].includes(name) ? name : null;
  let commercialUse = license?.commercialUse ?? (code === "c" ? "not-allowed" : "unknown");
  // Retain conflicting source evidence rather than silently granting permission.
  const attributionCode = attribution?.match(/some rights reserved \((CC [A-Z -]+)\)$/)?.[1]?.toLowerCase().replaceAll(" ", "-");
  const conflict = Boolean(code && attributionCode && code !== attributionCode)
    || Boolean(license && attribution?.endsWith("all rights reserved"))
    || Boolean(code && code !== "cc0" && attribution === "no rights reserved")
    || Boolean(code === "cc0" && attribution && attribution !== "no rights reserved");
  if (conflict) commercialUse = "unknown";
  return {
    license: license?.label ?? text(photo.license_code),
    licenseUrl: license?.url ?? null,
    commercialUse,
    creator,
    attribution,
  };
}

export function normalizeObservation(value: unknown): SearchResult[] {
  const observation = object(value);
  const observationId = positiveInteger(observation.id);
  if (!observationId) return [];
  const sourceId = String(observationId);
  const taxon = object(observation.taxon);
  const scientificName = text(taxon.name);
  const commonName = text(taxon.preferred_common_name);
  const photos = Array.isArray(observation.photos) ? observation.photos
    : array(observation.observation_photos).map(value => object(value).photo);
  return photos.flatMap(value => {
    const photo = object(value);
    const id = positiveInteger(photo.id);
    const url = safeUrl(photo.url);
    if (!id || !url) return [];
    const originalUrl = photoUrl(url, id, "original");
    const dimensions = object(photo.original_dimensions);
    return [{
      id: `inaturalist:${sourceId}:photo:${id}`,
      source: "inaturalist",
      sourceId,
      title: commonName ?? scientificName ?? text(observation.species_guess),
      scientificName,
      commonName,
      anatomicalPart: null,
      description: text(observation.description),
      thumbnailUrl: photoUrl(url, id, "small") ?? url,
      previewUrl: photoUrl(url, id, "large") ?? url,
      originalUrl,
      downloadUrl: originalUrl,
      width: originalUrl ? positiveInteger(dimensions.width) : null,
      height: originalUrl ? positiveInteger(dimensions.height) : null,
      ...rights(photo),
      date: text(observation.observed_on),
      sourceUrl: `https://www.inaturalist.org/observations/${sourceId}`,
      sourceMetadata: {
        observation,
        photo,
        dateMeaning: "Observation date, not a verified photo capture date",
        dimensionsMeaning: "API-reported original_dimensions; served original may be resized by iNaturalist",
        licenseEvidence: "Selected photo.license_code and photo.attribution; observation license and image host do not grant image permission",
        licenseTerms: "CC BY requires attribution; SA requires share-alike; ND restricts sharing adaptations; NC prohibits commercial use. Third-party rights can still apply.",
      },
    }];
  });
}

export function normalizeSearch(payload: unknown, query: string, expectedPage: number, expectedPageSize: number): SearchPage {
  const response = object(payload);
  if (!Array.isArray(response.results) || typeof response.total_results !== "number"
    || !Number.isSafeInteger(response.total_results) || response.total_results < 0
    || response.page !== expectedPage || response.per_page !== expectedPageSize) {
    throw new Error("iNaturalist returned an unexpected observation response structure.");
  }
  return {
    results: response.results.flatMap(normalizeObservation),
    total: response.total_results,
    nextCursor: response.results.length && expectedPage * expectedPageSize < response.total_results
      ? JSON.stringify({ query, page: expectedPage + 1, pageSize: expectedPageSize }) : null,
  };
}

export function normalizeContent(payload: unknown): SearchResult[] {
  const response = object(payload);
  if (!Array.isArray(response.results)) throw new Error("iNaturalist returned an unexpected detail response structure.");
  return response.results.flatMap(normalizeObservation);
}
