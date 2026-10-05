# Animal Parts Library

Animal Parts Library is a planned local-first visual search application for finding high-quality animal reference imagery across legitimate biodiversity, museum, and natural-history repositories. It will help users discover images, inspect licensing and provenance, and organize eligible images in a local reference library.

## Current development stage

Phase 3 now contains a minimal browser-capable React + TypeScript prototype with a Smithsonian `SourceAdapter`, fixture-based normalization tests, and a small Vite server boundary that keeps the API key private.

The functional path is limited to:

**search → Smithsonian API → normalized results → image grid → detail view → original source**

Desktop packaging and local-library features come later. The planned stack is React + TypeScript, Tauri, Rust, and SQLite. Missing or ambiguous licensing information must never be treated as permission for commercial use.

## Run the prototype

Use Node.js 24.5 or newer. From this repository:

```sh
npm ci
cp .env.example .env
# Edit .env and replace the placeholder with your api.data.gov key.
npm run dev
```

Open the local address printed by Vite in your browser (port 5173), enter `frog eye`, and select Search. Click an image card for its normalized metadata and original Smithsonian source link. The key can also be supplied as a server environment variable, `SMITHSONIAN_API_KEY`; that takes precedence over `.env`. The cloud environment already supplies this variable, so copying/editing `.env` is unnecessary there. Real environment files are ignored by Git. Never prefix the key with `VITE_`, which would expose it to browser code. Restart the server after changing the key.

The adapter sends queries unchanged and fetches up to 100 Smithsonian records per page. Only usable image media are shown; a record may have no image or several images. Smithsonian's record total is not an image count. Results can contain unrelated matches, and a page without images can still have another page. Taxonomy, anatomy, and image creators are not inferred from titles or keywords; original metadata remains available in the detail view. Images are loaded directly from Smithsonian and show an unavailable-image placeholder if delivery fails.

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

Preview serves the built frontend and the same private-key API boundary on port 4173. Serving `dist` alone as static files does not provide Smithsonian search. These servers are for local development, not public deployment. They bind to loopback by default. The scripts use Node's environment-proxy support for environments with an HTTPS proxy; no proxy configuration is needed for ordinary local development. If the cloud npm cache directory is unavailable, use `npm ci --cache /tmp/animal-parts-npm`.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): planned components, normalized interfaces, licensing rules, and local storage.
- [Roadmap](docs/ROADMAP.md): development sequence and completion criteria.
- [Smithsonian API research](docs/SMITHSONIAN_API_RESEARCH.md): official sources, verified fields, rights, limits, and validation evidence.
