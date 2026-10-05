import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { SearchPage, SearchRequest, SourceAdapter } from "../src/sources/types.ts";
import { searchSources } from "../src/sources/search.ts";
import { normalizeSearch } from "../src/sources/inaturalist/normalize.ts";
import { normalizeSearch as normalizeSmithsonian } from "../src/sources/smithsonian/normalize.ts";

const inat = normalizeSearch(JSON.parse(readFileSync(new URL("./fixtures/inaturalist-search.json", import.meta.url), "utf8")), "frog eye", 1, 2);
const smithsonian = normalizeSmithsonian(JSON.parse(readFileSync(new URL("./fixtures/smithsonian-search.json", import.meta.url), "utf8")), "frog eye", 0);
const adapter = (source: string, search: SourceAdapter["search"]): SourceAdapter => ({ source, displayName: source, search,
  async getResult() { throw new Error("Not used"); } });

test("sources start concurrently and retain namespaced identity, URLs, and photo rights", async () => {
  const started: string[] = [];
  let releaseFirst!: (value: SearchPage) => void;
  let releaseSecond!: (value: SearchPage) => void;
  const adapters = [adapter("smithsonian", () => { started.push("smithsonian"); return new Promise(resolve => { releaseFirst = resolve; }); }),
    adapter("inaturalist", () => { started.push("inaturalist"); return new Promise(resolve => { releaseSecond = resolve; }); })];
  const pending = searchSources(adapters, { query: "frog eye", pageSize: 2 });
  assert.deepEqual(started, ["smithsonian", "inaturalist"]);
  releaseSecond(inat); releaseFirst(smithsonian);
  const page = await pending;
  assert.deepEqual(page.results, [...smithsonian.results, ...inat.results]);
  assert.deepEqual(page.sources.map(source => source.error), [null, null]);
  assert.equal(page.sources[0].exhausted, true);
  assert.equal(page.sources[1].exhausted, false);
});

test("either source failing, including synchronous throws, cannot discard the other's results", async () => {
  for (const failed of ["smithsonian", "inaturalist"]) {
    const adapters = [adapter("smithsonian", () => { if (failed === "smithsonian") throw new Error("Smithsonian offline"); return Promise.resolve(smithsonian); }),
      adapter("inaturalist", async () => { if (failed === "inaturalist") throw new Error("iNaturalist rate limit"); return inat; })];
    const page = await searchSources(adapters, { query: "frog eye", pageSize: 2 });
    assert.deepEqual(page.results, failed === "smithsonian" ? inat.results : smithsonian.results);
    assert.ok(page.sources.find(source => source.source === failed)?.error);
    assert.equal(page.sources.find(source => source.source !== failed)?.error, null);
  }
});

test("failed initial source can retry without restarting an exhausted successful source", async () => {
  let firstCalls = 0; let secondCalls = 0;
  const adapters = [adapter("smithsonian", async () => { firstCalls++; return smithsonian; }), adapter("inaturalist", async request => {
    secondCalls++; assert.equal(request.cursor, undefined); if (secondCalls === 1) throw new Error("offline"); return inat;
  })];
  const first = await searchSources(adapters, { query: "frog eye", pageSize: 2 });
  const retry = await searchSources(adapters, { query: "frog eye", pageSize: 2 }, first);
  assert.equal(firstCalls, 1); assert.equal(secondCalls, 2);
  assert.deepEqual(retry.results, inat.results);
  assert.equal(retry.sources[1].error, null);
});

test("pagination failure preserves that source's cursor while the other source advances", async () => {
  let fail = false;
  const calls: { source: string; cursor?: string }[] = [];
  const make = (source: string) => adapter(source, async request => {
    calls.push({ source, cursor: request.cursor });
    if (request.cursor && fail && source === "inaturalist") throw new Error("offline");
    return { ...inat, nextCursor: request.cursor ? null : `${source}-next` };
  });
  const adapters = [make("smithsonian"), make("inaturalist")];
  const first = await searchSources(adapters, { query: "frog eye", pageSize: 2 });
  fail = true;
  const second = await searchSources(adapters, { query: "frog eye", pageSize: 2 }, first);
  assert.equal(second.sources[1].nextCursor, "inaturalist-next");
  assert.equal(second.sources[0].exhausted, true);
  fail = false;
  const third = await searchSources(adapters, { query: "frog eye", pageSize: 2 }, second);
  assert.equal(third.sources[1].error, null);
  assert.deepEqual(calls.slice(-3), [{ source: "smithsonian", cursor: "smithsonian-next" }, { source: "inaturalist", cursor: "inaturalist-next" }, { source: "inaturalist", cursor: "inaturalist-next" }]);
});

test("both failures remain explicit, cancellation is not reported as a source failure, and queries stay scoped", async () => {
  const adapters = [adapter("smithsonian", async () => { throw new Error("offline"); }), adapter("inaturalist", async () => { throw new Error("offline"); })];
  const page = await searchSources(adapters, { query: "frog eye", pageSize: 2 });
  assert.equal(page.results.length, 0); assert.equal(page.sources.filter(source => source.error).length, 2);
  await assert.rejects(searchSources(adapters, { query: "bird wing", pageSize: 2 }, page), /query/);
  const controller = new AbortController();
  const cancelling = adapter("inaturalist", async (_request: SearchRequest, signal?: AbortSignal) => { assert.equal(signal, controller.signal); controller.abort(); return inat; });
  await assert.rejects(searchSources([cancelling], { query: "frog eye", pageSize: 2 }, undefined, controller.signal), { name: "AbortError" });
});
