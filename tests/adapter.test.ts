import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { SmithsonianAdapter } from "../src/sources/smithsonian/adapter.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/smithsonian-search.json", import.meta.url), "utf8"));

test("adapter sends the unchanged query and cancellation signal through same-origin API and normalizes", async context => {
  const controller = new AbortController();
  context.mock.method(globalThis, "fetch", async (path: string, options: RequestInit) => {
    assert.ok(path.startsWith("/api/smithsonian/search?"));
    const url = new URL(path, "http://localhost");
    assert.equal(url.searchParams.get("q"), "frog eye");
    assert.equal(url.searchParams.get("start"), "0");
    assert.equal(url.searchParams.has("api_key"), false);
    assert.equal(options.signal, controller.signal);
    return Response.json(fixture);
  });
  const adapter = new SmithsonianAdapter();
  assert.equal((await adapter.search({ query: "frog eye", pageSize: 100 }, controller.signal)).results.length, 1);
  await assert.rejects(adapter.search({ query: "frog", pageSize: 100, cursor: JSON.stringify({ query: "other", start: 10 }) }), /cursor/);
});

test("detail refresh uses the record identity and selects the requested image", async context => {
  context.mock.method(globalThis, "fetch", async (path: string) => {
    assert.ok(path.startsWith("/api/smithsonian/content?"));
    assert.equal(new URL(path, "http://localhost").searchParams.get("id"), fixture.response.rows[0].id);
    return Response.json({ status: 200, responseCode: 1, response: fixture.response.rows[0] });
  });
  const adapter = new SmithsonianAdapter();
  const id = `smithsonian:${fixture.response.rows[0].id}:media:NZP-20081119-074MM`;
  assert.equal((await adapter.getResult(fixture.response.rows[0].id, id)).id, id);
  await assert.rejects(adapter.getResult(fixture.response.rows[0].id, "missing"), /no longer available/);
});

test("request errors remain visible to the UI", async context => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ error: "Set SMITHSONIAN_API_KEY" }, { status: 503 }));
  await assert.rejects(new SmithsonianAdapter().search({ query: "frog", pageSize: 100 }), /SMITHSONIAN_API_KEY/);
});
