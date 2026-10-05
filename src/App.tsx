import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { SearchPage, SearchResult, SourceAdapter } from "./sources/types.ts";
import { SmithsonianAdapter } from "./sources/smithsonian/adapter.ts";

const adapter: SourceAdapter = new SmithsonianAdapter();

function Image({ url, title }: { url: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return url && !failed
    ? <img src={url} alt={title} loading="lazy" onError={() => setFailed(true)} />
    : <span className="image-missing">Image unavailable</span>;
}

function Detail({ result, close }: { result: SearchResult; close: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [result.id]);
  return <section className="detail" aria-labelledby="detail-title">
    <button onClick={close}>Close details</button>
    <h2 id="detail-title" tabIndex={-1} ref={heading}>{result.title ?? "Untitled image"}</h2>
    <div className="preview"><Image url={result.previewUrl ?? result.thumbnailUrl} title={result.title ?? "Reference image"} /></div>
    <p><a href={result.sourceUrl} target="_blank" rel="noopener noreferrer">Open original Smithsonian source ↗</a> (opens Smithsonian in a new tab)</p>
    <p className="rights-note">Commercial use: <strong>{result.commercialUse}</strong>. Missing or ambiguous rights are not permission. CC0 does not clear third-party rights.</p>
    <dl>{Object.entries(result).filter(([key]) => key !== "sourceMetadata").map(([key, value]) =>
      <div key={key}><dt>{key}</dt><dd>{value === null ? "Not provided" : String(value)}</dd></div>
    )}</dl>
    <details><summary>Source metadata and provenance</summary><pre>{JSON.stringify(result.sourceMetadata, null, 2)}</pre></details>
  </section>;
}

export function App() {
  const [query, setQuery] = useState("frog eye");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [page, setPage] = useState<SearchPage | null>(null);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activeRequest = useRef<AbortController | null>(null);
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);

  async function search(cursor?: string) {
    const term = cursor ? searchedQuery : query.trim();
    if (!term) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setError("");
    if (!cursor) { setPage(null); setSelected(null); setSearchedQuery(term); }
    try {
      const next = await adapter.search({ query: term, pageSize: 100, cursor }, controller.signal);
      if (!controller.signal.aborted) setPage(previous => ({
        ...next, results: cursor ? [...(previous?.results ?? []), ...next.results] : next.results,
      }));
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Search failed.");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void search(); }

  return <main>
    <header><h1>Animal Parts Library</h1><p>Smithsonian reference image search · minimal browser prototype</p></header>
    <form onSubmit={submit}>
      <label htmlFor="query">Search Smithsonian</label>
      <div className="search-bar"><input id="query" value={query} onChange={event => setQuery(event.target.value)} maxLength={500} required placeholder="frog eye" /><button disabled={!query.trim()}>Search</button></div>
    </form>
    <p className="hint">Queries go to Smithsonian unchanged. Results may include unrelated matches; records without image media are omitted.</p>
    <div role="status" aria-live="polite">{busy ? "Searching Smithsonian…" : page ? `${page.results.length} images shown · ${page.total ?? "Unknown"} matching Smithsonian records` : "Enter a query to begin."}</div>
    {error && <p role="alert" className="error">{error}</p>}
    {page && !page.results.length && !busy && <p>No usable images in the records fetched. Try another query{page.nextCursor ? " or load the next page" : ""}.</p>}
    <div className="grid" aria-label="Search results">{page?.results.map((result, index) =>
      <button className="card" key={`${result.id}:${index}`} onClick={event => { selectedButton.current = event.currentTarget; setSelected(result); }} aria-pressed={selected?.id === result.id}>
        <div className="thumbnail"><Image url={result.thumbnailUrl ?? result.previewUrl} title={result.title ?? "Reference image"} /></div>
        <span className="card-title">{result.title ?? "Untitled image"}</span><small>{result.license ?? "License unknown"}</small>
      </button>
    )}</div>
    {page?.nextCursor && <button disabled={busy} onClick={() => void search(page.nextCursor!)}>Load next 100 records</button>}
    {selected && <Detail result={selected} close={() => { setSelected(null); selectedButton.current?.focus(); }} />}
  </main>;
}
