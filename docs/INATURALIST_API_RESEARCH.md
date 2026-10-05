# iNaturalist API verification

Verified 2026-10-05 before implementing the iNaturalist increment of Phase 4. Official documentation and official source code are primary evidence. Live responses corroborate the fields used below; undocumented behavior is not assumed.

## Official references

- [Deployed v1 API documentation](https://api.inaturalist.org/v1/docs/) and its [Swagger document](https://api.inaturalist.org/v1/swagger.json), currently reporting API version 1.3.0.
- [API recommended practices](https://www.inaturalist.org/pages/api+recommended+practices).
- [Official documentation source](https://github.com/inaturalist/iNaturalistAPI/blob/main/lib/views/swagger_v1.yml.ejs).
- [Observation photo serialization](https://github.com/inaturalist/iNaturalistAPI/blob/main/lib/models/observation_preload.js) and [photo attribution helper](https://github.com/inaturalist/iNaturalistAPI/blob/main/lib/util.js).
- [Photo model](https://github.com/inaturalist/inaturalist/blob/main/app/models/photo.rb), [official license mapping](https://github.com/inaturalist/inaturalist/blob/main/app/models/shared/license_module.rb), and [license explanations](https://github.com/inaturalist/inaturalist/blob/main/config/locales/en.yml).
- [Creative Commons BY-ND 4.0 terms](https://creativecommons.org/licenses/by-nd/4.0/), confirming commercial sharing is permitted while distributing adaptations is restricted.
- [Terms of Service](https://www.inaturalist.org/terms) and [Privacy Policy](https://www.inaturalist.org/privacy), which the API documentation incorporates.

## Endpoints, access, and pagination

Use `GET https://api.inaturalist.org/v1/observations?q=frog%20eye&photos=true&per_page=100&page=1`. `q` searches observation properties; `photos=true` requests observations containing photos. This is observation search, with each observation's photos normalized individually. The documented `/photos` route is a photo creation POST, not a public photo-search GET. No guessed image endpoint is used.

`GET /v1/observations/{id}` refreshes an observation and its images. Both search and detail were verified live without an API key, account, OAuth token, or Authorization header. The documentation explains JWT authentication for writes and access to private information; Swagger also includes security declarations on these GETs. Successful anonymous requests establish the public-read behavior used here; the prototype does not request private coordinates or authenticated data.

Search responses have `total_results`, `page`, `per_page`, and `results[]`. Pages are one-based. The documented general maximum page size is 200; the prototype caps both sources at 100. Pagination counts observations, not photos. One observation may yield multiple cards. The normalizer validates the response envelope rather than turning malformed responses into empty successes.

The endpoint warns that page-based access to large result sets is limited and recommends `id_above`/`id_below` for bulk retrieval. The minimal prototype uses ordinary pages and shows an independent source error if deeper pagination is rejected; it does not implement a bulk exporter or assume an undocumented numeric cutoff.

## Response mapping and image URLs

| Normalized field | Verified evidence |
| --- | --- |
| `id` | Namespaced observation ID + selected photo ID; photos remain distinct |
| `source` / `sourceId` | `inaturalist` / observation `id` |
| `sourceUrl` | Canonical `https://www.inaturalist.org/observations/{id}` |
| `scientificName` / `commonName` | `taxon.name` / `taxon.preferred_common_name` |
| `title` | Common name, scientific name, then observation `species_guess`; no invented taxonomy |
| `description` | Observation `description`, rendered as text |
| `anatomicalPart` | Null; no reliable anatomy field or inference is introduced |
| `date` | Observation `observed_on`, explicitly labeled as observation date in provenance |
| Images | Selected entry in `photos[]`; fallback to `observation_photos[].photo` if the former is absent |
| Dimensions | Photo `original_dimensions.width` / `.height`, retained as reported |
| Rights | Photo `license_code` and exact original `attribution`, not observation license |
| `creator` | Name from recognized official photo-attribution formats; never observation `user` |
| `sourceMetadata` | Observation, selected photo, original rights, and mapping/meaning notes |

The deployed API documentation explicitly permits replacing only the size qualifier in photo URLs served from `static.inaturalist.org` or `inaturalist-open-data.s3.amazonaws.com`, retaining the same extension. Sizes are `original` (maximum 2048px in either dimension), `large` (1024), `medium` (500), `small` (240), `thumb` (100), and `square` (75px crop). The prototype derives small thumbnails, large previews, and original URLs only for matching documented hosts and photo-ID filenames. External/placeholder URLs do not acquire an invented original URL.

The platform's `original` is not necessarily an unmodified camera upload, and API-reported original dimensions may exceed the served variant. These limitations are retained in provenance. `downloadUrl` only fills the existing normalized contract; no download action or local storage is implemented.

## Licensing, attribution, and commercial use

A visible observation and a photo hosted in the Open Data bucket do not establish commercial permission. Observations and photos have separate licenses, and noncommercial photos are present in that bucket. Each selected photo's evidence is evaluated independently:

| Photo code | Commercial status | Preserved obligations |
| --- | --- | --- |
| `cc0` | allowed | CC0 1.0; other rights may still apply |
| `cc-by` | allowed | Attribution, CC BY 4.0 |
| `cc-by-sa` | allowed | Attribution and share-alike, CC BY-SA 4.0 |
| `cc-by-nd` | allowed | Attribution; no distribution of adaptations, CC BY-ND 4.0 |
| `cc-by-nc`, `cc-by-nc-sa`, `cc-by-nc-nd` | not-allowed | Noncommercial; additional SA/ND terms retained |
| `c` | not-allowed | Explicit copyright/all rights reserved; no license permission |
| Missing, unsupported (including `pd`/`gfdl`), conflicting | unknown | Retain original evidence; never interpret ambiguity as permission |

Current license versions and URLs follow the official `LicenseModule` mapping. The original code and attribution remain in `sourceMetadata`. Recognized conflicts between code and attribution make commercial use unknown. `allowed` describes the license's commercial-use condition, not blanket clearance from privacy, publicity, trademark, or other rights.

The official v1 attribution helper emits `(c) NAME, some rights reserved (CC …)`, `(c) NAME, all rights reserved`, `NAME, no known copyright restrictions (public domain)`, or `no rights reserved` for CC0. Only recognized name-bearing formats supply a creator. A CC0 response without a name leaves creator null. The observation owner is not a substitute for the photo owner.

## Rate limits and prototype behavior

The deployed v1 documentation states a maximum of 100 API requests/minute, asks clients to stay at 60/minute or lower and under 10,000/day, and reserves the right to block disruptive use. Recommended practices say approximately one request/second and around 10,000/day, return HTTP 429 when throttled, and warn against bulk scraping. Published media limits include 5 GB/hour or 24 GB/day before possible blocking.

The prototype searches only on explicit submission or pagination; it has no polling, automatic retry loop, or bulk download. The server identifies the application with a User-Agent, applies a 20-second timeout, and reports 429 visibly. Wait before retrying a rate-limited source. There is no global quota scheduler; this remains a local development prototype, not a multi-user public service.

## Validation evidence

All three live queries succeeded through the same server boundaries and adapters used by the browser, with unchanged query text. These are normalized image counts from the first 100 records/observations per source, not total search counts:

| Query | Smithsonian images | iNaturalist images |
| --- | ---: | ---: |
| `frog eye` | 7 | 179 |
| `bird wing` | 25 | 281 |
| `lizard tail` | 17 | 197 |

An additional two-observation iNaturalist page test advanced to different observations, and detail refresh selected the same photo identity. Observation `406132269`, photo `746111533`, returned creator `suraj_sampath`, CC BY-NC, and commercial use `not-allowed`. Its derived thumbnail, preview, and original returned HTTP 200 with `image/jpeg`; its source page returned HTTP 200. Responses can change over time. A later readiness check encountered a transient iNaturalist service/access error while Smithsonian remained usable; subsequent native requests and preview checks succeeded. No automatic retry was added.

Fixture/mock tests cover metadata, multiple photos, conservative rights, creator separation, documented URL derivation, malformed envelopes, pagination, adapter transport, server validation/errors, concurrent search, either-source failure, and retry isolation. Live checks are separate from the test suite. All 30 tests, type checking, and production build passed. The built preview was also checked in headless Chromium: both source labels appeared, an iNaturalist detail showed creator/NC rights and its original source link, and simulated failure of either API left the other source's cards and a visible error. This UI check does not establish direct cloud Chromium image transport. No new dependencies were required.

## Remaining limits

Text matches can be broad or unrelated to anatomy. iNaturalist's default ordering and Smithsonian relevance are not a shared ranking; combined pages retain adapter order. No anatomy inference, query expansion, taxon restriction, license filter, deduplication, or quality scoring is implemented. Photos may become unavailable or change licensing; source links and current rights should be checked before reuse. The existing cloud headless-browser TLS limitation described in Smithsonian research remains; this phase verified native HTTPS API/media requests, not direct cloud Chromium image delivery.
