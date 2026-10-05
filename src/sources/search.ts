import type { SearchRequest, SearchResult, SourceAdapter } from "./types.ts";

export interface SourceSearchState {
  source: string;
  displayName: string;
  total: number | null;
  nextCursor: string | null;
  exhausted: boolean;
  error: string | null;
}

export interface MultiSourcePage {
  query: string;
  results: SearchResult[];
  sources: SourceSearchState[];
}

// Independent cursors and errors prevent a failed source from discarding the
// successful source's page or restarting an exhausted source on pagination.
export async function searchSources(adapters: SourceAdapter[], request: SearchRequest,
  previous?: MultiSourcePage, signal?: AbortSignal): Promise<MultiSourcePage> {
  if (previous && previous.query !== request.query) throw new Error("Pagination query does not match the previous search.");
  if (signal?.aborted) throw new DOMException("Search cancelled", "AbortError");
  const states = adapters.map(adapter => previous?.sources.find(state => state.source === adapter.source));
  const settled = await Promise.allSettled(adapters.map(async (adapter, index) => states[index]?.exhausted
    ? null
    : adapter.search({ query: request.query, pageSize: request.pageSize, cursor: states[index]?.nextCursor ?? undefined }, signal)));
  if (signal?.aborted) throw new DOMException("Search cancelled", "AbortError");
  const results: SearchResult[] = [];
  const sources = settled.map((outcome, index): SourceSearchState => {
    const adapter = adapters[index];
    const state = states[index];
    if (outcome.status === "fulfilled" && outcome.value === null) return state!;
    if (outcome.status === "fulfilled") {
      results.push(...outcome.value!.results);
      return { source: adapter.source, displayName: adapter.displayName, total: outcome.value!.total,
        nextCursor: outcome.value!.nextCursor, exhausted: outcome.value!.nextCursor === null, error: null };
    }
    return { source: adapter.source, displayName: adapter.displayName, total: state?.total ?? null,
      nextCursor: state?.nextCursor ?? null, exhausted: false,
      error: outcome.reason instanceof Error ? outcome.reason.message : "Search failed." };
  });
  return { query: request.query, results, sources };
}
