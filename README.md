# Animal Parts Library

Animal Parts Library is a planned local-first visual search application for finding high-quality animal reference imagery across legitimate biodiversity, museum, and natural-history repositories. It will help users discover images, inspect licensing and provenance, and organize eligible images in a local reference library.

## Current development stage

Phase 4 now adds iNaturalist to the browser-capable React + TypeScript prototype. Independent `SourceAdapter`s search Smithsonian and iNaturalist concurrently, normalize image metadata, and retain successful results when either source fails. No other source is implemented.

The functional path is limited to:

**search → Smithsonian + iNaturalist APIs → normalized results → shared image grid → detail view → original source**

Desktop packaging and local-library features come later. The planned stack is React + TypeScript, Tauri, Rust, and SQLite. Missing or ambiguous licensing information must never be treated as permission for commercial use.

## Run the prototype

Use Node.js 24.5 or newer. From this repository:

```sh
npm ci
cp .env.example .env
# Edit .env and replace the placeholder with your api.data.gov key.
npm run dev
```

Open the local address printed by Vite in your browser (port 5173), enter `frog eye`, and select Search. Click an image card for its normalized metadata and original repository source link. The key can also be supplied as a server environment variable, `SMITHSONIAN_API_KEY`; that takes precedence over `.env`. The cloud environment already supplies this variable, so copying/editing `.env` is unnecessary there. Real environment files are ignored by Git. Never prefix the key with `VITE_`, which would expose it to browser code. Restart the server after changing the key.

Both adapters send queries unchanged and fetch up to 100 records/observations per source per page. iNaturalist uses the documented `photos=true` selector to request observations containing photos and requires no API key for these public reads. Only usable image media are shown; a record may have no image or several images. Source totals count records/observations, not images. Source labels and independent errors are shown; Load more advances each source cursor and retries failed sources without restarting exhausted sources. Results can contain unrelated matches, and a page without images can still have another page. iNaturalist taxonomy comes from its taxon fields; anatomy remains unknown. Photo creators and licenses come from photo-level evidence, never the observation owner/license. CC noncommercial licenses prohibit commercial use; missing, unrecognized, or conflicting rights remain unknown. Original metadata remains available in the detail view. Images are loaded directly from their repositories and show an unavailable-image placeholder if delivery fails.

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

Preview serves the built frontend and the same private-key API boundary on port 4173. Serving `dist` alone as static files does not provide either source API boundary. These servers are for local development, not public deployment. They bind to loopback by default. The scripts use Node's environment-proxy support for environments with an HTTPS proxy; no proxy configuration is needed for ordinary local development. If the cloud npm cache directory is unavailable, use `npm ci --cache /tmp/animal-parts-npm`.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): planned components, normalized interfaces, licensing rules, and local storage.
- [Roadmap](docs/ROADMAP.md): development sequence and completion criteria.
- [iNaturalist API research](docs/INATURALIST_API_RESEARCH.md): verified endpoints, pagination, photo rights, live checks, and limitations.
- [Smithsonian API research](docs/SMITHSONIAN_API_RESEARCH.md): official sources, verified fields, rights, limits, and validation evidence.
