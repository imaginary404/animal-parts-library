import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeContent, normalizeRecord, normalizeSearch, safeUrl } from "../src/sources/smithsonian/normalize.ts";

// Public API record captured October 5, 2026. Tests never contact Smithsonian.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/smithsonian-search.json", import.meta.url), "utf8"));
const record = () => structuredClone(fixture.response.rows[0]);

test("maps an observed Smithsonian image, original dimensions, date, source, and provenance", () => {
  const page = normalizeSearch(fixture, "frog eye", 0);
  assert.equal(page.results.length, 1);
  const result = page.results[0];
  assert.equal(result.id, "smithsonian:zoo-1582653800612-1582653804953-0:media:NZP-20081119-074MM");
  assert.equal(result.sourceId, "zoo-1582653800612-1582653804953-0");
  assert.equal(result.source, "smithsonian");
  assert.equal(result.title, "Vietnamese Mossy Frog");
  assert.equal(result.thumbnailUrl, "https://ids.si.edu/ids/deliveryService?max=90&id=NZP-20081119-074MM");
  assert.equal(result.previewUrl, "https://ids.si.edu/ids/deliveryService?id=NZP-20081119-074MM");
  assert.equal(result.originalUrl, "https://ids.si.edu/ids/download?id=NZP-20081119-074MM.jpg");
  assert.equal(result.downloadUrl, result.originalUrl);
  assert.equal(result.width, 3000);
  assert.equal(result.height, 2000);
  assert.equal(result.date, "2008:11:19");
  assert.equal(result.attribution, "Credit Line: Smithsonian Institution");
  assert.equal(result.sourceUrl, "https://www.si.edu/object/edanmdm%3Anzp_NZP-20081119-074MM");
  assert.equal(result.license, "CC0");
  assert.equal(result.licenseUrl, "https://creativecommons.org/publicdomain/zero/1.0/");
  assert.equal(result.commercialUse, "allowed");
  assert.deepEqual(result.sourceMetadata.record, fixture.response.rows[0]);
  assert.equal(result.sourceMetadata.dateMeaning, "Creation Date");
  assert.equal(result.scientificName, null);
  assert.equal(result.commonName, null);
  assert.equal(result.anatomicalPart, null);
  assert.equal(result.creator, null);
  assert.match(result.description!, /Keywords: eye/);
  assert.equal(page.total, 1);
  assert.equal(page.nextCursor, null);
});

test("metadata CC0 never grants rights to an image with missing, ambiguous, or conflicting usage", () => {
  for (const usage of [undefined, {}, { access: "" }, { access: "Not determined" },
    { access: "no known copyright restriction" }, { access: "CC0", text: "Usage conditions apply" },
    { access: "Usage conditions apply", text: "CC0" }]) {
    const row = record();
    row.content.descriptiveNonRepeating.online_media.media[0].usage = usage;
    const result = normalizeRecord(row)[0];
    assert.equal(result.commercialUse, "unknown");
    assert.equal(result.licenseUrl, null);
  }
});

test("explicit usage conditions prohibit commercial use; original statement is retained", () => {
  const row = record();
  row.content.descriptiveNonRepeating.online_media.media[0].usage = { access: "Usage conditions apply" };
  const result = normalizeRecord(row)[0];
  assert.equal(result.commercialUse, "not-allowed");
  assert.equal(result.license, "Usage conditions apply");
});

test("missing metadata stays null and originals are not invented from previews", () => {
  const row = record();
  delete row.title;
  delete row.content.descriptiveNonRepeating.title;
  delete row.content.freetext;
  const media = row.content.descriptiveNonRepeating.online_media.media[0];
  delete media.resources;
  delete media.thumbnail;
  const result = normalizeRecord(row)[0];
  for (const key of ["title", "description", "thumbnailUrl", "originalUrl", "downloadUrl", "width", "height", "date", "attribution"] as const) {
    assert.equal(result[key], null, key);
  }
  assert.ok(result.previewUrl);
});

test("ignores non-images, missing media, unsafe URLs, and invalid records without throwing", () => {
  const row = record();
  const media = row.content.descriptiveNonRepeating.online_media.media[0];
  media.type = "Scanned books";
  assert.deepEqual(normalizeRecord(row), []);
  media.type = "Images";
  media.thumbnail = "javascript:alert(1)";
  media.content = "data:text/html,bad";
  assert.deepEqual(normalizeRecord(row), []);
  delete row.content.descriptiveNonRepeating.online_media;
  assert.deepEqual(normalizeRecord(row), []);
  for (const value of [null, {}, { content: null }, "bad"]) assert.deepEqual(normalizeRecord(value), []);
  assert.equal(safeUrl("https://user:password@example.org/image.jpg"), null);
  assert.equal(safeUrl("/relative/path"), null);
});

test("multiple images have stable distinct identities and use their own rights", () => {
  const row = record();
  const media = row.content.descriptiveNonRepeating.online_media.media;
  const second = structuredClone(media[0]);
  second.id = "media:second";
  second.usage = {};
  media.push(second);
  const results = normalizeRecord(row);
  assert.equal(results.length, 2);
  assert.notEqual(results[0].id, results[1].id);
  assert.equal(results[0].commercialUse, "allowed");
  assert.equal(results[1].commercialUse, "unknown");
  media.reverse();
  assert.equal(normalizeRecord(row)[0].id, results[1].id);
});

test("pagination advances by records fetched, including those without images", () => {
  const payload = structuredClone(fixture);
  const noMedia = record();
  delete noMedia.content.descriptiveNonRepeating.online_media;
  payload.response.rows.push(noMedia);
  payload.response.rowCount = 9;
  const page = normalizeSearch(payload, "frog eye", 3);
  assert.equal(page.results.length, 1);
  assert.deepEqual(JSON.parse(page.nextCursor!), { query: "frog eye", start: 5 });
  assert.deepEqual(normalizeSearch({ status: 200, responseCode: 1, response: { rows: [], rowCount: 0 } }, "x", 0),
    { results: [], total: 0, nextCursor: null });
});

test("API failures and malformed envelopes are errors rather than empty search successes", () => {
  for (const value of [{}, { status: 403, responseCode: 0 },
    { status: 200, responseCode: 1, response: { rows: "bad", rowCount: 1 } },
    { status: 200, responseCode: 1, response: { rows: [], rowCount: -1 } }]) {
    assert.throws(() => normalizeSearch(value, "frog", 0));
  }
  const results = normalizeContent({ status: 200, responseCode: 1, response: record() });
  assert.equal(results.length, 1);
  assert.throws(() => normalizeContent({ status: 200, responseCode: 1, response: {} }));
});
