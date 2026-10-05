export interface SearchResult {
  id: string;
  source: string;
  sourceId: string;
  title: string | null;
  scientificName: string | null;
  commonName: string | null;
  anatomicalPart: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  originalUrl: string | null;
  downloadUrl: string | null;
  width: number | null;
  height: number | null;
  license: string | null;
  licenseUrl: string | null;
  creator: string | null;
  date: string | null;
  attribution: string | null;
  sourceUrl: string;
  commercialUse: "allowed" | "not-allowed" | "unknown";
  sourceMetadata: Record<string, unknown>;
}

export interface SearchRequest {
  query: string;
  pageSize: number;
  cursor?: string;
}

export interface SearchPage {
  results: SearchResult[];
  nextCursor: string | null;
  total: number | null;
}

export interface SourceAdapter {
  readonly source: string;
  readonly displayName: string;
  search(request: SearchRequest, signal?: AbortSignal): Promise<SearchPage>;
  getResult(sourceId: string, id: string, signal?: AbortSignal): Promise<SearchResult>;
}
