# Architecture

Status: Phase 3 browser prototype implemented. The contracts below are implemented in `src/sources/types.ts`; desktop and local-library sections remain planned. Verified Smithsonian behavior and mapping limits are recorded in [API research](SMITHSONIAN_API_RESEARCH.md).

## Product scope and stack

Animal Parts Library will search legitimate biodiversity, museum, and natural-history repositories and support a local reference library with explicit licensing and provenance.

- React + TypeScript: search, image grid, detail view, and later library UI.
- Tauri: planned desktop shell, introduced after the browser prototype.
- Rust: planned application layer for disk access, SQLite operations, imports, and thumbnail generation.
- SQLite: local metadata database; original image bytes remain on disk.

The browser prototype has no desktop dependency. Its entire functional path is **search → Smithsonian API → normalized results → image grid → detail view → original source**. It does not import images, require SQLite, or depend on Tauri/Rust. A minimal Vite middleware in `server/smithsonian.ts` reads `SMITHSONIAN_API_KEY` server-side and provides fixed same-origin search/content endpoints in both development and build preview. The key is never a frontend environment variable. Browser CORS support is not assumed or needed by this boundary.

## Component boundaries

The current UI submits a source-neutral search request directly to a single `SourceAdapter`. `SmithsonianAdapter` owns pagination, normalization, cancellation, and errors; the server boundary owns authentication and the fixed upstream request. The UI consumes normalized data without understanding upstream schemas. A coordinator that invokes multiple enabled adapters and combines their results is planned for Phase 4, not implemented now.

Start with one Smithsonian adapter. Add iNaturalist, Wikimedia Commons, Biodiversity Heritage Library (BHL), GBIF, and future repositories independently after verifying their APIs and policies. Do not create a universal query language, plugin runtime, or background service for the first prototype.

The current detail view displays the metadata already returned by search. The adapter also implements `getResult` for explicit upstream refresh; the UI does not make an extra request on each selection. The image grid includes only `Images` media with a safe thumbnail or preview URL. Raw source metadata is displayed as text, never executed as HTML. There is no deduplication, query expansion, advanced filter, download action, or other source adapter.

## Normalized result contract

Unknown scalar metadata is `null`; do not fabricate names, dimensions, dates, or image URLs. `id` is a stable namespaced image identity, distinct from the upstream record identity in `sourceId`. For records with multiple images, include a stable upstream media identifier in `id`. `source` is a stable adapter key such as `smithsonian` or `wikimedia-commons`.

```typescript
interface SearchResult {
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
```

`sourceUrl` points to the original repository's record page. Image URLs serve distinct purposes: thumbnail for the grid, preview for inspection, original for the highest-quality original asset, and download for an explicitly provided download endpoint. Any of these image URLs may be unavailable. Dimensions describe the original asset when known. `date` preserves the source's image or record date and precision; its meaning is recorded in `sourceMetadata`.

`sourceMetadata` retains relevant upstream identifiers, original rights statements, media-specific fields, and mapping evidence as JSON-compatible data. It must contain no credentials. Render upstream text as untrusted content. A source label or a repository-wide policy alone is insufficient evidence of an individual image's rights.

## Source adapter contract

```typescript
interface SearchRequest {
  query: string;
  pageSize: number;
  cursor?: string; // Opaque and scoped to the originating adapter/query.
}

interface SearchPage {
  results: SearchResult[];
  nextCursor: string | null;
  total: number | null;
}

interface SourceAdapter {
  readonly source: string;
  readonly displayName: string;
  search(request: SearchRequest, signal?: AbortSignal): Promise<SearchPage>;
  getResult(sourceId: string, id: string, signal?: AbortSignal): Promise<SearchResult>;
}
```

Adapters normalize data at their boundary, support cancellation, and report authentication, rate-limit, network, and mapping failures explicitly rather than returning a misleading empty success. `getResult` refreshes an individual image's detail from its upstream record and image identity. Pagination remains source-specific behind opaque cursors; totals may be unknown. Keep initial search requests text-based. Add advanced filters only when supported capabilities are verified.

## Licensing and provenance rules

1. Evaluate rights for the specific image, separately from record text, specimen metadata, or collection-wide branding.
2. Set `commercialUse` to `allowed` only when explicit, applicable licensing or public-domain evidence permits commercial use. Preserve license terms, attribution obligations, and evidence. This status does not waive other restrictions or imply blanket legal clearance.
3. Set `not-allowed` when explicit terms prohibit commercial use. Missing, ambiguous, conflicting, or unverified terms result in `unknown`; absence of a restriction is never permission.
4. Display license, creator, attribution, and source links in detail views. Preserve the source's rights wording and relevant URLs; do not silently replace it with a more permissive label. Rights filters must keep `unknown` distinct from `allowed`.
5. Follow API terms, rate limits, and access/download restrictions. A downloadable image is not automatically licensed for reuse. Search visibility is separate from permission to download or reuse.
6. At import time, retain the source record and image IDs, record URL, fetched media URL, retrieval timestamp, rights evidence, creator, attribution, normalized metadata, and relevant source metadata. Later refreshes must not erase the historical import evidence.
7. User tags and annotations do not alter source provenance or licensing. Preserve provenance for every imported occurrence, including duplicate files with different source records.

## Planned local library

Introduce a small library-service boundary after multi-source search. Desktop builds use Tauri commands to call the Rust layer; React does not access the filesystem or SQLite directly. Browser search remains usable without that service. Browser persistence equivalent to the desktop library is outside the initial scope.

- **SQLite metadata:** assets, source/provenance records, rights snapshots, tags, asset-tag associations, and thumbnail references. Store relative file paths and schema versions. Keep source records separate from physical assets so one asset can retain multiple provenance histories.
- **Original files:** save downloaded bytes unmodified under a managed library directory. Use stable asset IDs or content hashes for filenames, retaining the original filename as metadata. Never overwrite originals during tagging, resizing, or metadata edits.
- **Thumbnails:** generate separate, rebuildable derivatives in a thumbnail directory. Record generation settings and associate each thumbnail with its asset. Thumbnails are disposable; originals and provenance are authoritative.
- **Tags:** user-defined labels and anatomical annotations stored in SQLite, separate from upstream descriptive fields.
- **Duplicate detection:** use source/media identity to avoid repeated imports and SHA-256 of original bytes for exact content duplicates. Reuse a physical asset while retaining all provenance records. Perceptual similarity is a later feature and must never automatically merge or delete distinct originals.
- **Import consistency:** download to a temporary file, validate the response and image, compute its hash, then finalize the file and commit metadata. Handle failures with cleanup/recovery; filesystem writes and SQLite transactions are not one atomic operation. Never report an import complete when its original file is missing.
- **Portability:** keep database, originals, and generated thumbnails in one configurable library root. Back up metadata and originals together; thumbnails can be regenerated.

Local library operations should work offline for already imported assets. Remote search and source refresh still require network access. No cloud synchronization or AI subsystem is required by this design.
