import type { SearchRequest, SourceAdapter } from "../types.ts";
import { normalizeContent, normalizeSearch } from "./normalize.ts";

async function request(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`/api/inaturalist/${path}?${params}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === "string" ? body.error : "iNaturalist request failed.");
  }
  return response.json();
}

export class INaturalistAdapter implements SourceAdapter {
  readonly source = "inaturalist";
  readonly displayName = "iNaturalist";

  async search({ query, pageSize, cursor }: SearchRequest, signal?: AbortSignal) {
    let page = 1;
    if (cursor) {
      const parsed: unknown = JSON.parse(cursor);
      if (!parsed || typeof parsed !== "object" || !("query" in parsed) || parsed.query !== query
        || !("pageSize" in parsed) || parsed.pageSize !== pageSize
        || !("page" in parsed) || typeof parsed.page !== "number" || !Number.isSafeInteger(parsed.page) || parsed.page < 1) {
        throw new Error("Invalid iNaturalist search cursor.");
      }
      page = parsed.page;
    }
    const params = new URLSearchParams({ q: query, per_page: String(pageSize), page: String(page) });
    return normalizeSearch(await request("search", params, signal), query, page, pageSize);
  }

  async getResult(sourceId: string, id: string, signal?: AbortSignal) {
    const results = normalizeContent(await request("content", new URLSearchParams({ id: sourceId }), signal));
    const result = results.find(result => result.id === id && result.sourceId === sourceId);
    if (!result) throw new Error("This photo is no longer available in the iNaturalist observation.");
    return result;
  }
}
