import type { SearchRequest, SourceAdapter } from "../types.ts";
import { normalizeContent, normalizeSearch } from "./normalize.ts";

async function request(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`/api/smithsonian/${path}?${params}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === "string" ? body.error : "Smithsonian request failed.");
  }
  return response.json();
}

export class SmithsonianAdapter implements SourceAdapter {
  readonly source = "smithsonian";
  readonly displayName = "Smithsonian";

  async search({ query, pageSize, cursor }: SearchRequest, signal?: AbortSignal) {
    let start = 0;
    if (cursor) {
      const parsed: unknown = JSON.parse(cursor);
      if (!parsed || typeof parsed !== "object" || !("query" in parsed) || parsed.query !== query
        || !("start" in parsed) || typeof parsed.start !== "number"
        || !Number.isSafeInteger(parsed.start) || parsed.start < 0) {
        throw new Error("Invalid Smithsonian search cursor.");
      }
      start = parsed.start;
    }
    const params = new URLSearchParams({ q: query, rows: String(pageSize), start: String(start) });
    return normalizeSearch(await request("search", params, signal), query, start);
  }

  async getResult(sourceId: string, id: string, signal?: AbortSignal) {
    const results = normalizeContent(await request("content", new URLSearchParams({ id: sourceId }), signal));
    const result = results.find(result => result.id === id);
    if (!result) throw new Error("This image is no longer available in the Smithsonian record.");
    return result;
  }
}
