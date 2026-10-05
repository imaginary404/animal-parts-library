import type { IncomingMessage, ServerResponse } from "node:http";

type Next = () => void;
type Fetch = typeof globalThis.fetch;

// The browser can reach only two fixed read-only endpoints. The key and the
// authenticated upstream URL never enter client assets, errors, or logs.
export function smithsonianMiddleware(apiKey: string | undefined, fetcher: Fetch = fetch) {
  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/smithsonian/")) return next();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status: number, error: string) => {
      res.statusCode = status;
      res.end(JSON.stringify({ error }));
    };
    if (req.method !== "GET") return send(405, "Only GET requests are supported.");
    let upstream: URL;
    if (url.pathname === "/api/smithsonian/search") {
      const query = url.searchParams.get("q")?.trim();
      const rows = Number(url.searchParams.get("rows") ?? 100);
      const start = Number(url.searchParams.get("start") ?? 0);
      if (!query || query.length > 500 || !Number.isInteger(rows) || rows < 1 || rows > 100
        || !Number.isSafeInteger(start) || start < 0) {
        return send(400, "Enter a query of 1–500 characters with a valid page size and offset.");
      }
      upstream = new URL("https://api.si.edu/openaccess/api/v1.0/search");
      upstream.search = new URLSearchParams({ q: query, rows: String(rows), start: String(start), type: "edanmdm", row_group: "objects" }).toString();
    } else if (url.pathname === "/api/smithsonian/content") {
      const id = url.searchParams.get("id");
      if (!id || !/^[A-Za-z0-9_.:-]{1,250}$/.test(id)) return send(400, "Invalid Smithsonian record identifier.");
      upstream = new URL(`https://api.si.edu/openaccess/api/v1.0/content/${encodeURIComponent(id)}`);
    } else return send(404, "Unknown Smithsonian endpoint.");
    if (!apiKey || apiKey === "replace_with_your_api_data_gov_key") {
      return send(503, "Set SMITHSONIAN_API_KEY in the server environment or .env, then restart the app.");
    }
    upstream.searchParams.set("api_key", apiKey);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", disconnect);
    try {
      const response = await fetcher(upstream, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) {
        const error = response.status === 429 ? "Smithsonian rate limit reached. Wait before searching again."
          : response.status === 401 || response.status === 403 ? "Smithsonian rejected API access. Check the server key and network access."
          : response.status === 404 ? "Smithsonian record not found."
          : "Smithsonian is temporarily unavailable.";
        return send(response.status === 429 ? 429 : response.status === 404 ? 404 : 502, error);
      }
      const payload: unknown = await response.json();
      res.end(JSON.stringify(payload));
    } catch {
      if (!res.destroyed) send(502, "Could not reach Smithsonian or the request timed out. Check network access and try again.");
    } finally {
      clearTimeout(timer);
      res.off("close", disconnect);
    }
  };
}
