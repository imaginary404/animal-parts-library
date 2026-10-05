import type { IncomingMessage, ServerResponse } from "node:http";

// Public GETs only; no iNaturalist credentials, arbitrary upstream URLs,
// private-coordinate authentication, or write endpoints are supported.
export function inaturalistMiddleware(fetcher: typeof fetch = fetch) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/inaturalist/")) return next();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status: number, error: string) => { res.statusCode = status; res.end(JSON.stringify({ error })); };
    if (req.method !== "GET") return send(405, "Only GET requests are supported.");
    let upstream: URL;
    if (url.pathname === "/api/inaturalist/search") {
      const query = url.searchParams.get("q")?.trim();
      const page = Number(url.searchParams.get("page") ?? 1);
      const perPage = Number(url.searchParams.get("per_page") ?? 100);
      if (!query || query.length > 500 || !Number.isSafeInteger(page) || page < 1
        || !Number.isInteger(perPage) || perPage < 1 || perPage > 100) return send(400, "Enter a query of 1–500 characters with valid pagination.");
      upstream = new URL("https://api.inaturalist.org/v1/observations");
      upstream.search = new URLSearchParams({ q: query, page: String(page), per_page: String(perPage), photos: "true" }).toString();
    } else if (url.pathname === "/api/inaturalist/content") {
      const id = url.searchParams.get("id");
      if (!id || !/^[1-9][0-9]{0,15}$/.test(id) || !Number.isSafeInteger(Number(id))) return send(400, "Invalid iNaturalist observation identifier.");
      upstream = new URL(`https://api.inaturalist.org/v1/observations/${id}`);
    } else return send(404, "Unknown iNaturalist endpoint.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", disconnect);
    try {
      const response = await fetcher(upstream, { signal: controller.signal,
        headers: { Accept: "application/json", "User-Agent": "AnimalPartsLibrary/0.1 (browser prototype)" } });
      if (!response.ok) return send(response.status === 429 ? 429 : response.status === 404 ? 404 : 502,
        response.status === 429 ? "iNaturalist rate limit reached. Wait before searching again."
          : response.status === 404 ? "iNaturalist observation not found." : "iNaturalist is temporarily unavailable or rejected API access.");
      res.end(JSON.stringify(await response.json()));
    } catch {
      if (!res.destroyed) send(502, "Could not reach iNaturalist or the request timed out. Check network access and try again.");
    } finally { clearTimeout(timer); res.off("close", disconnect); }
  };
}
