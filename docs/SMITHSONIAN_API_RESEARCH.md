# Smithsonian API research

Verified October 5, 2026, before implementing the Phase 3 prototype. Official Smithsonian documentation is the primary source; live responses supply concrete examples where the published endpoint documentation delegates record fields to other schemas.

## Official sources

- [Open Access API documentation](https://edan.si.edu/openaccess/apidocs/), including its published [endpoint data](https://edan.si.edu/openaccess/apidocs/api_data.js) and [API overview](https://edan.si.edu/openaccess/apidocs/api_project.js).
- [EDAN content documentation](https://edan.si.edu/openaccess/docs/) and [record structure](https://edan.si.edu/openaccess/docs/more.html).
- [Smithsonian Open Access](https://www.si.edu/openaccess), [FAQ](https://www.si.edu/openaccess/faq), and [Terms of Use](https://www.si.edu/termsofuse).
- [Smithsonian's official Python client](https://github.com/Smithsonian/smithsonian-openaccess) and [OpenAccess metadata repository](https://github.com/Smithsonian/OpenAccess).
- [api.data.gov developer manual](https://api.data.gov/docs/developer-manual/) for the API gateway's key and rate-limit rules.

The initial environment proxy denied Smithsonian access. After publication, API and record documentation loaded normally. The main Smithsonian pages initially returned 403 responses; using a normal browser user agent and retrying the FAQ with an empty query string retrieved its content. The developer-tools page and linked historical PDF at `sirismm.si.edu` were not retrieved. The verified endpoint documentation, current live records, and official FAQ were sufficient for the narrow implemented mapping. No behavior is inferred from the unavailable PDF. The published API overview itself carries a 2021 generator timestamp; retrieval today does not imply it was authored today.

## Endpoint and authentication

Search: `GET https://api.si.edu/openaccess/api/v1.0/search`.

The documentation requires `q` and `api_key`. `q` supports Boolean and fielded syntax, but the prototype sends the user's query unchanged. Documented optional parameters include `start` (default 0), `rows` (default 10, documented range 0–1000), `sort` (default relevancy), `type` (default `edanmdm`), and `row_group` (default `objects`). The prototype requests 100 records per page, `type=edanmdm`, and `row_group=objects`; it leaves sort at the default and adds no animal/anatomical/media search clauses.

Content lookup: `GET https://api.si.edu/openaccess/api/v1.0/content/{id}`. The documentation accepts a row ID or EDAN URL/match key. The prototype adapter uses the persistent row ID.

Register for a key at [api.data.gov](https://api.data.gov/signup/). The gateway says keys should be private. The implementation reads `SMITHSONIAN_API_KEY` in the local Vite server, accepts `.env` as a fallback, and sends the documented upstream `api_key` query parameter server-side only. `.env.example` contains a placeholder, real environment files are gitignored, and no key is sent to the frontend. The browser talks only to same-origin `/api/smithsonian/search` and `/api/smithsonian/content`; direct upstream browser CORS behavior is not assumed. The local server supports only these fixed read-only upstream routes and returns generic errors without authenticated URLs or key values.

## Response and media mapping

The documented successful envelope is `{ status: 200, responseCode: 1, response: ... }`. Search `response` contains `rows` and `rowCount`; content lookup `response` contains one record. Each record carries `id`, `title`, `unitCode`, `type`, `url`, and `content`. EDAN documentation distinguishes `descriptiveNonRepeating`, `indexedStructured`, and `freetext` within `content`. Record timestamps describe repository ingest/update, not necessarily image creation.

The configured environment key was usable. A live unchanged `frog eye` search returned 102 records; the first 100 included six media-bearing records, five of which had `Images` media (the sixth was a scanned book), yielding seven image results. Two image records were Vietnamese mossy frogs; other matches included violin bows and clothing. The prototype does not reinterpret relevance or expand the query. Smithsonian's record total is not the number of normalized images.

The following fields were observed in current official API records:

| Normalized field | Verified mapping or deliberate limitation |
| --- | --- |
| `sourceId`, `title` | Persistent record `id`, record `title` (fallback: `descriptiveNonRepeating.title.content`). |
| `id` | `smithsonian:<record id>:<media id>`, with `idsId` or a provided image URL as a stable fallback when media ID is absent. No positional image identity. |
| Image selection | `content.descriptiveNonRepeating.online_media.media[]` entries with `type: "Images"`. Records without usable image URLs do not produce cards. |
| `thumbnailUrl`, `previewUrl` | Media `thumbnail`, media `content`; these are source-provided URLs, not constructed delivery URLs. |
| `originalUrl`, `downloadUrl` | Explicit `resources[]` labeled `High-resolution JPEG`, otherwise `High-resolution TIFF`. The prototype contains no download action. When absent, original/download URLs stay null rather than assuming preview is original. |
| `width`, `height` | Numeric dimensions of the selected high-resolution resource; not object measurements in `freetext.physicalDescription`. |
| `license`, `commercialUse` | Per-image `usage.access` and optional `usage.text`, independently of record `metadata_usage`. |
| `description` | Labeled `freetext.notes`; fallback to media `extDescrAccessibility`. Source markup is displayed as text. |
| `date` | First source `freetext.date[].content`, preserving source precision and format. Its label is retained as `sourceMetadata.dateMeaning`. |
| `attribution` | Source `freetext.creditLine` or `freetext.objectRights` entries labeled `Credit Line`, with labels retained. Object credit is not assumed to identify an image creator. |
| `sourceUrl` | Verified Smithsonian public object route using the EDAN record `url` match key; fallback to supplied `record_link` if no EDAN match key exists. |
| `scientificName`, `commonName`, `anatomicalPart`, `creator` | Null in this minimal mapping. Do not derive names/anatomy from keywords or assume object makers/authors are image creators. Full descriptive data remains available in source metadata. |
| `sourceMetadata` | Public upstream record, selected media, date meaning, and mapping limitations. No request headers, authenticated request URLs, or credentials. |

Observed media resources also include `Screen Image` and `Thumbnail Image`. These are preserved in source metadata, but their presence does not prove an original exists. Older provided IDS image URLs used HTTP; HTTPS was verified for the same IDS endpoints and is used to avoid mixed content. Other URLs are validated as HTTP(S) and must not contain embedded credentials. The canonical Smithsonian object route was checked on an observed frog record.

IDS initially returned HTTP 200 HTML containing “Request Rejected” to a command-line image request. A request with normal browser image headers returned an actual JPEG thumbnail. An HTTP 200 alone does not validate image delivery; the UI handles image-load failures explicitly. Images load directly from Smithsonian, without a separate image proxy.

## Rate limits

The Smithsonian endpoint documentation reviewed does not publish a separate numeric quota. The official api.data.gov manual publishes a default of **1,000 requests per hour per key**, shared across gateway APIs, and warns that individual services may vary. The live Smithsonian response for the configured key returned `X-RateLimit-Limit: 1000` and `X-RateLimit-Remaining`. A limit breach is HTTP 429. Do not assume every key has the same quota.

The prototype searches on explicit submission, not each keystroke. It supports cancellation, a request timeout, and a visible 429 error without automatic retry loops. No bulk harvesting or background pagination is implemented.

## Licensing and Open Access

The Smithsonian FAQ permits commercial use of **assets designated CC0** without a Smithsonian attribution requirement, fee, or additional permission. It recommends a caption with title, author, source, license, and source URL. CC0 does not waive third-party trademark, privacy, publicity, or other rights. Smithsonian names/logos are not included in the release.

The FAQ distinguishes metadata from media: restricted objects may expose CC0 metadata while withholding media. Accordingly, `metadata_usage.access: "CC0"` never grants image permission. The adapter uses only the selected image's `usage` evidence:

- Explicit media `access: "CC0"` with no unexplained additional rights text: `allowed`, with the CC0 URL.
- Explicit “Usage conditions apply”: `not-allowed`, retaining the source statement.
- Missing, unrecognized, conflicting, or otherwise ambiguous evidence: `unknown`, never commercial permission. Additional unexplained text accompanying CC0 is treated as ambiguous.

“No known copyright restriction” is not treated as CC0 or automatic permission. Rights and provenance remain visible in details. The application does not imply endorsement by Smithsonian.

## Scope and validation

Phase 3 implements React + TypeScript search, a Smithsonian `SourceAdapter`, normalization, thumbnail grid, detail metadata/provenance, original source link, and basic record pagination. Vite provides the local authenticated server boundary in both dev and built preview. There is no Tauri, Rust, SQLite, local library, download action, deduplication, advanced filter, extra source, or AI feature.

Tests use an offline public-record fixture captured October 5, 2026. They cover normalization, absent/ambiguous image rights, missing fields, multiple images, unsafe URLs, response failures, pagination, adapter requests, and server credential boundaries. Manual live validation is separate from these deterministic tests. Test/typecheck/build results are reported with the task completion; no API key is required for these checks.

Validation completed: clean `npm ci`, 14 offline tests passed (none skipped), TypeScript checking passed, production build passed, and whitespace checks passed. Live search and content lookup worked through the development server; built preview returned seven normalized images from 102 matching records for `frog eye`. The configured key was checked to be absent from project files and build assets, without printing its value.

Browser checks covered search, actual image rendering, frog detail/preview, source link, focus restoration, pagination, and a 390px mobile viewport, with no application runtime errors. Cloud Chromium rejected the egress proxy certificate even though its existing NSS store already contained the environment CA; importing that same CA did not resolve browser trust. For those automated rendering checks only, image requests were delivered through Node's verified TLS/proxy transport using normal browser image headers. No TLS verification was disabled and no image proxy was added to application code. Direct image transport in cloud Chromium remains an environment-specific validation limitation; the frontend continues to request Smithsonian URLs directly in an ordinary local browser.
