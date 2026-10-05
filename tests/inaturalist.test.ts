import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeContent, normalizeObservation, normalizeSearch } from "../src/sources/inaturalist/normalize.ts";
import { INaturalistAdapter } from "../src/sources/inaturalist/adapter.ts";

// Synthetic public-response fixture based on the official v1 schema and helpers.
// IDs/names are illustrative; tests make no live API calls.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/inaturalist-search.json", import.meta.url), "utf8"));
const record = () => structuredClone(fixture.results[0]);

test("iNaturalist maps each photo with stable identity, taxonomy, date, sizes and independent creator/rights", () => {
  const page = normalizeSearch(fixture, "frog eye", 1, 2);
  assert.equal(page.results.length, 2);
  const result = page.results[0];
  assert.equal(result.id, "inaturalist:123456:photo:111");
  assert.equal(result.source, "inaturalist");
  assert.equal(result.sourceId, "123456");
  assert.equal(result.sourceUrl, "https://www.inaturalist.org/observations/123456");
  assert.equal(result.title, "Red-eyed Tree Frog");
  assert.equal(result.scientificName, "Agalychnis callidryas");
  assert.equal(result.commonName, "Red-eyed Tree Frog");
  assert.equal(result.anatomicalPart, null);
  assert.equal(result.description, fixture.results[0].description);
  assert.equal(result.thumbnailUrl, "https://inaturalist-open-data.s3.amazonaws.com/photos/111/small.jpeg");
  assert.equal(result.previewUrl, "https://inaturalist-open-data.s3.amazonaws.com/photos/111/large.jpeg");
  assert.equal(result.originalUrl, "https://inaturalist-open-data.s3.amazonaws.com/photos/111/original.jpeg");
  assert.equal(result.downloadUrl, result.originalUrl);
  assert.equal(result.width, 1800);
  assert.equal(result.height, 1200);
  assert.equal(result.date, "2026-09-30");
  assert.equal(result.creator, "Photo, Creator");
  assert.equal(result.attribution, fixture.results[0].photos[0].attribution);
  assert.equal(result.license, "CC BY 4.0");
  assert.equal(result.licenseUrl, "https://creativecommons.org/licenses/by/4.0/");
  assert.equal(result.commercialUse, "allowed");
  assert.equal(page.results[1].commercialUse, "not-allowed");
  assert.equal(page.results[1].creator, "Second Creator");
  assert.deepEqual(result.sourceMetadata.photo, fixture.results[0].photos[0]);
  assert.deepEqual(result.sourceMetadata.observation, fixture.results[0]);
  assert.deepEqual(JSON.parse(page.nextCursor!), { query: "frog eye", page: 2, pageSize: 2 });
  const reversed = record(); reversed.photos.reverse();
  assert.equal(normalizeObservation(reversed)[0].id, page.results[1].id);
});

test("photo license codes have conservative commercial-use outcomes, never inherited from observation or host", () => {
  for (const [code, permission] of [
    ["cc0", "allowed"], ["cc-by", "allowed"], ["cc-by-sa", "allowed"], ["cc-by-nd", "allowed"],
    ["cc-by-nc", "not-allowed"], ["cc-by-nc-sa", "not-allowed"], ["cc-by-nc-nd", "not-allowed"], ["c", "not-allowed"],
    [null, "unknown"], ["", "unknown"], ["made-up", "unknown"], ["pd", "unknown"], ["gfdl", "unknown"],
  ]) {
    const row = record(); row.photos[0].license_code = code; row.photos[0].attribution = null;
    assert.equal(normalizeObservation(row)[0].commercialUse, permission, String(code));
  }
  const row = record(); row.photos[0].license_code = null;
  const missing = normalizeObservation(row)[0];
  assert.equal(missing.commercialUse, "unknown");
  assert.equal(missing.license, null);
  assert.equal(missing.licenseUrl, null);
});

test("conflicting license and attribution never grant commercial permission", () => {
  for (const attribution of ["(c) Photographer, some rights reserved (CC BY-NC)", "(c) Photographer, all rights reserved"]) {
    const row = record(); row.photos[0].attribution = attribution;
    assert.equal(normalizeObservation(row)[0].commercialUse, "unknown");
    assert.equal(normalizeObservation(row)[0].attribution, attribution);
  }
  const cc0 = record(); cc0.photos[0].license_code = "cc0";
  assert.equal(normalizeObservation(cc0)[0].commercialUse, "unknown");
  cc0.photos[0].attribution = "no rights reserved";
  assert.equal(normalizeObservation(cc0)[0].commercialUse, "allowed");
  assert.equal(normalizeObservation(cc0)[0].creator, null);
});

test("missing metadata is null; observer names are not substituted for photo creators", () => {
  const row = record(); row.taxon = null; row.species_guess = null; row.description = null; row.observed_on = null;
  row.photos[0].attribution = "unrecognized attribution"; delete row.photos[0].original_dimensions;
  const result = normalizeObservation(row)[0];
  for (const key of ["title", "scientificName", "commonName", "anatomicalPart", "description", "date", "creator", "width", "height"] as const) assert.equal(result[key], null, key);
  assert.equal(result.attribution, "unrecognized attribution");
});

test("only documented native image URLs get size variants; placeholder/external/unsafe URLs are not fabricated", () => {
  const row = record();
  row.photos[0].url = "https://static.inaturalist.org/photos/111/square.png?version=1";
  assert.equal(normalizeObservation(row)[0].originalUrl, "https://static.inaturalist.org/photos/111/original.png?version=1");
  for (const url of ["https://example.org/image.jpg", "https://www.inaturalist.org/attachment_defaults/local_photos/square.png", "https://static.inaturalist.org/photos/999/square.jpg"]) {
    row.photos[0].url = url;
    const result = normalizeObservation(row)[0];
    assert.equal(result.thumbnailUrl, url);
    assert.equal(result.originalUrl, null);
    assert.equal(result.width, null);
  }
  row.photos = [row.photos[0]];
  for (const url of ["javascript:alert(1)", "https://secret@example.org/photo.jpg", "/relative.jpg"]) {
    row.photos[0].url = url; assert.deepEqual(normalizeObservation(row), []);
  }
  for (const bad of [null, {}, { id: -1 }, { id: "123456" }, { id: 123456, photos: null }]) assert.deepEqual(normalizeObservation(bad), []);
});

test("pagination uses observation counts rather than number of photos and rejects malformed envelopes", () => {
  const last = structuredClone(fixture); last.page = 2; last.results = [fixture.results[0]];
  assert.equal(normalizeSearch(last, "frog eye", 2, 2).nextCursor, null);
  assert.deepEqual(normalizeSearch({ total_results: 0, page: 1, per_page: 2, results: [] }, "x", 1, 2), { results: [], total: 0, nextCursor: null });
  for (const bad of [{}, { ...fixture, results: null }, { ...fixture, total_results: -1 }, { ...fixture, page: 3 }, { ...fixture, per_page: 3 }]) assert.throws(() => normalizeSearch(bad, "frog eye", 1, 2));
  assert.equal(normalizeContent({ results: [fixture.results[0]] }).length, 2);
  assert.throws(() => normalizeContent({ error: "not found" }));
});

test("iNaturalist adapter uses unchanged query and opaque pagination, without keys, and refreshes photo details", async context => {
  const controller = new AbortController();
  context.mock.method(globalThis, "fetch", async (path: string, options: RequestInit) => {
    const url = new URL(path, "http://localhost");
    assert.equal(options.signal, controller.signal);
    assert.equal(url.searchParams.has("api_key"), false);
    if (url.pathname.endsWith("search")) {
      assert.equal(url.searchParams.get("q"), "frog eye"); assert.equal(url.searchParams.get("per_page"), "2");
      return Response.json(fixture);
    }
    assert.equal(url.searchParams.get("id"), "123456");
    return Response.json({ results: [fixture.results[0]] });
  });
  const adapter = new INaturalistAdapter();
  assert.equal((await adapter.search({ query: "frog eye", pageSize: 2 }, controller.signal)).results.length, 2);
  assert.equal((await adapter.getResult("123456", "inaturalist:123456:photo:111", controller.signal)).source, "inaturalist");
  await assert.rejects(adapter.getResult("123456", "missing", controller.signal), /no longer available/);
  for (const cursor of [{ query: "wrong", page: 2, pageSize: 2 }, { query: "frog eye", page: -1, pageSize: 2 }, { query: "frog eye", page: 2, pageSize: 100 }]) {
    await assert.rejects(adapter.search({ query: "frog eye", pageSize: 2, cursor: JSON.stringify(cursor) }), /cursor/);
  }
});

test("iNaturalist adapter surfaces rate-limit errors", async context => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ error: "iNaturalist rate limit reached" }, { status: 429 }));
  await assert.rejects(new INaturalistAdapter().search({ query: "frog eye", pageSize: 2 }), /rate limit/);
});
