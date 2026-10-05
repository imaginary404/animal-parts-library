# Roadmap

Status: the Phase 3 Smithsonian-only browser prototype is implemented. Proceed in the following order; Phases 4–7 remain planned and have not started. See [API research](SMITHSONIAN_API_RESEARCH.md) for verified sources and validation details.

## 1. Research/API verification

Verify Smithsonian endpoints, authentication, browser CORS, pagination, media URLs, rate limits, and image-specific licensing against official documentation and representative responses. Record evidence and unresolved limitations. Investigate the other planned sources before implementing their adapters; do not assume identical API capabilities or rights policies.

Completion: a verified Smithsonian request and mapping plan, including handling of missing fields and ambiguous rights. Resolve access prerequisites before prototype development.

## 2. Architecture

Establish the normalized `SearchResult` and generic `SourceAdapter` contracts, licensing/provenance rules, browser-first boundary, and planned desktop library storage. Keep the design small and revise it when verified API evidence requires changes.

Completion: reviewed documentation with clear component responsibilities and no dependency on desktop packaging for initial search. The initial contracts are now implemented for Smithsonian; the desktop/library design remains documentation only.

## 3. Smithsonian-only minimal prototype

Implement only **search → Smithsonian API → normalized results → image grid → detail view → original source** in React + TypeScript. Show available rights and attribution details, handle unavailable images and request errors, and keep credentials outside browser assets.

Completion: a representative real search displays correctly mapped images; selecting a result shows its details and opens the original source record. Missing licensing is visibly unknown. No multi-source search, local imports, desktop packaging, advanced search, or AI is required.

Implemented: React search form, Smithsonian adapter, server-side key configuration, normalized image grid, detail metadata/provenance, source link, and basic record pagination. Normalization tests use public fixture data rather than the live API. No Phase 4 features are included.

## 4. Multi-source search

Add verified adapters independently for iNaturalist, Wikimedia Commons, BHL, and GBIF. Preserve source-specific pagination, rights evidence, and failures while presenting a common result shape. Handle rate limits and cancellation without hiding partial failures.

Completion: each added source has representative normalization checks, and combined searches retain accurate source identities and licensing states.

## 5. Local library

Introduce Tauri and the Rust application layer with SQLite metadata, unmodified originals, generated thumbnails, tags, provenance snapshots, and exact duplicate detection. Keep the browser search path available while desktop packaging develops.

Completion: permitted imports survive restart, remain available offline, retain rights/provenance, and detect exact duplicates without losing source history. Verify failed-import recovery and library backup/restore.

## 6. Advanced search

Add useful filters for taxonomy, anatomical parts, dimensions, source, and rights where verified data supports them. Distinguish source-supported filters from local filtering and keep unknown values explicit. Consider perceptual duplicate suggestions after exact duplicate handling is reliable.

Completion: filters have documented semantics and representative checks; commercial-use filtering never includes unknown rights as allowed.

## 7. Optional AI features

Evaluate optional tagging, similarity, or discovery assistance only after the core workflow is stable. Assess privacy, cost, model licensing, and user control before adopting a service or model. Preserve original images and separate generated annotations from source metadata.

Completion: any chosen feature is optional, labels its generated output, and leaves ordinary search and library use functional without AI. AI must never invent licensing permission or authoritative provenance.
