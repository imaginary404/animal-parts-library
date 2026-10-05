import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { inaturalistMiddleware } from "../server/inaturalist.ts";

async function withServer(fetcher: typeof fetch, run: (base: string) => Promise<void>) {
  const middleware = inaturalistMiddleware(fetcher);
  const server = createServer((req, res) => { void middleware(req, res, () => { res.statusCode = 404; res.end(); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test("iNaturalist public routes forward only validated fixed-endpoint parameters without credentials", async () => {
  const urls: URL[] = [];
  await withServer(async (input, options) => {
    const url = new URL(String(input));
    urls.push(url);
    assert.equal(url.origin, "https://api.inaturalist.org");
    const headers = new Headers(options?.headers);
    assert.equal(headers.get("authorization"), null);
    assert.match(headers.get("user-agent")!, /AnimalPartsLibrary/);
    assert.ok(options?.signal);
    return Response.json({ results: [], total_results: 0, page: 2, per_page: 10 });
  }, async base => {
    const response = await fetch(`${base}/api/inaturalist/search?q=frog%20eye&page=2&per_page=10&api_key=ignore&url=https://example.org`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(urls[0].pathname, "/v1/observations");
    assert.deepEqual(Object.fromEntries(urls[0].searchParams), { q: "frog eye", page: "2", per_page: "10", photos: "true" });
    assert.equal((await fetch(`${base}/api/inaturalist/content?id=123456`)).status, 200);
    assert.equal(urls[1].pathname, "/v1/observations/123456");
    assert.equal(urls[1].search, "");
  });
});

test("iNaturalist invalid inputs and unsupported routes never fetch upstream", async () => {
  await withServer(async () => { throw new Error("Should not fetch"); }, async base => {
    for (const suffix of ["search?q=", "search?q=frog&page=0", "search?q=frog&per_page=101", "content?id=https://example.org", "content?id=9007199254740992"]) {
      assert.equal((await fetch(`${base}/api/inaturalist/${suffix}`)).status, 400);
    }
    assert.equal((await fetch(`${base}/api/inaturalist/search?q=frog`, { method: "POST" })).status, 405);
    assert.equal((await fetch(`${base}/api/inaturalist/unknown`)).status, 404);
  });
});

test("iNaturalist rate-limit, missing-record, service and network failures stay explicit", async () => {
  for (const status of [429, 404, 503]) {
    await withServer(async () => new Response("upstream diagnostic must not leak", { status }), async base => {
      const response = await fetch(`${base}/api/inaturalist/content?id=123456`);
      assert.equal(response.status, status === 503 ? 502 : status);
      const body = await response.text();
      assert.ok(!body.includes("diagnostic"));
      if (status === 429) assert.match(body, /rate limit/);
    });
  }
  await withServer(async () => { throw new Error("private network detail"); }, async base => {
    const response = await fetch(`${base}/api/inaturalist/search?q=frog`);
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes("private network"));
  });
});
