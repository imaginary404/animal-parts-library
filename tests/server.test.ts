import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { smithsonianMiddleware } from "../server/smithsonian.ts";

async function withServer(key: string | undefined, fetcher: typeof fetch, run: (base: string) => Promise<void>) {
  const middleware = smithsonianMiddleware(key, fetcher);
  const server = createServer((req, res) => { void middleware(req, res, () => { res.statusCode = 404; res.end(); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test("keeps the server key upstream and forwards only validated query parameters", async () => {
  const fakeKey = "fixture-key-not-a-real-credential";
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.si.edu");
    assert.equal(url.pathname, "/openaccess/api/v1.0/search");
    assert.equal(url.searchParams.get("api_key"), fakeKey);
    assert.equal(url.searchParams.get("q"), "frog eye");
    assert.equal(url.searchParams.get("rows"), "100");
    assert.equal(url.searchParams.get("type"), "edanmdm");
    assert.equal(url.searchParams.get("url"), null);
    return Response.json({ status: 200, responseCode: 1, response: { rows: [], rowCount: 0 } });
  };
  await withServer(fakeKey, fetcher, async base => {
    const response = await fetch(`${base}/api/smithsonian/search?q=frog%20eye&url=https://example.org`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(!(await response.text()).includes(fakeKey));
  });
});

test("missing keys and invalid inputs never call the upstream service", async () => {
  const fetcher: typeof fetch = async () => { throw new Error("Should not fetch"); };
  await withServer(undefined, fetcher, async base => {
    assert.equal((await fetch(`${base}/api/smithsonian/search?q=frog`)).status, 503);
    assert.equal((await fetch(`${base}/api/smithsonian/search?q=frog&rows=101`)).status, 400);
    assert.equal((await fetch(`${base}/api/smithsonian/search?q=frog&start=-1`)).status, 400);
    assert.equal((await fetch(`${base}/api/smithsonian/search?q=`)).status, 400);
    assert.equal((await fetch(`${base}/api/smithsonian/content?id=https://example.org`)).status, 400);
    assert.equal((await fetch(`${base}/api/smithsonian/search?q=frog`, { method: "POST" })).status, 405);
    assert.equal((await fetch(`${base}/api/smithsonian/unknown`)).status, 404);
  });
});

test("upstream authorization, rate limits, and network errors never echo credentials", async () => {
  for (const status of [403, 429]) {
    await withServer("fake-secret", async () => new Response("fake-secret", { status }), async base => {
      const response = await fetch(`${base}/api/smithsonian/search?q=frog`);
      assert.equal(response.status, status === 429 ? 429 : 502);
      assert.ok(!(await response.text()).includes("fake-secret"));
    });
  }
  await withServer("fake-secret", async () => { throw new Error("URL containing fake-secret"); }, async base => {
    const response = await fetch(`${base}/api/smithsonian/search?q=frog`);
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes("fake-secret"));
  });
});
