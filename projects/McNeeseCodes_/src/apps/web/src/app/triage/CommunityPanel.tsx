"use client";

/**
 * CommunityPanel — read-only Reddit similarity strip.
 *
 * Renders below the triage result and the cascade fan-out. Calls our
 * BFF (/api/community/similar) which proxies to the AI engine, which in
 * turn fans out to a curated subreddit allowlist (AskDocs, medicine,
 * HealthAnxiety) and ranks threads by token overlap.
 *
 * The panel is intentionally subdued — it should look like a citation
 * strip, not a social feed. We surface the source ("reddit"/"offline"),
 * the per-post similarity score, and a link out. We never render bodies,
 * only short snippets, to discourage taking medical advice from
 * strangers on the internet.
 *
 * Hides itself on:
 *   - empty narrative (parent passes empty string)
 *   - engine offline (source === "offline" and no results)
 */

import { useEffect, useState } from "react";

type CommunityPost = {
  id: string;
  title: string;
  snippet: string;
  subreddit: string;
  url: string;
  score: number;
  num_comments: number;
  created_utc: number;
  similarity: number;
};

type CommunityResponse = {
  ok: boolean;
  query: string;
  subreddits: string[];
  results: CommunityPost[];
  source: "reddit" | "cache" | "offline";
  fetched_at?: string;
  note?: string;
};

export function CommunityPanel({
  narrative,
  className = "",
  flat = false,
}: {
  narrative: string;
  className?: string;
  /**
   * When true, renders as a flat content section (no card chrome). Used
   * inside the consolidated CarePlanCard on /triage. When false (default),
   * renders as a standalone card.
   */
  flat?: boolean;
}) {
  const [data, setData] = useState<CommunityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = narrative.trim();
    if (trimmed.length < 12) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const params = new URLSearchParams({ q: trimmed });
    fetch(`/api/community/similar?${params.toString()}`, {
      signal: ctrl.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as CommunityResponse;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
      })
      .catch((e) => {
        if (cancelled || (e instanceof Error && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : "Failed to load community posts.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [narrative]);

  if (!narrative || narrative.trim().length < 12) return null;
  const offline = data?.source === "offline" && (data?.results?.length ?? 0) === 0;
  if (offline) return null;

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="fc-section-title">Similar conversations on Reddit</h3>
        <span className="inline-flex items-center h-5 px-2 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-medium uppercase tracking-wider text-slate-600">
          {loading ? "Searching…" : data?.source === "cache" ? "Cached" : data?.source ?? "live"}
        </span>
      </div>
      <p className="mb-3 text-[12px] leading-snug text-slate-500 max-w-[560px]">
        Read-only matches from{" "}
        {(data?.subreddits ?? ["AskDocs", "medicine", "HealthAnxiety"]).map((s, i, arr) => (
          <span key={s}>
            <span className="font-mono text-[11px]">r/{s}</span>
            {i < arr.length - 1 ? ", " : ""}
          </span>
        ))}
        . Public threads only — not medical advice.
      </p>

      {error ? (
        <p className="inline-block fc-highlight-warn pl-3 py-1 text-[12px] text-slate-700">
          Couldn&apos;t load community posts: {error}
        </p>
      ) : loading && !data ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="fc-skeleton h-[78px] w-full rounded-[var(--radius-control)]" />
          ))}
        </div>
      ) : (data?.results?.length ?? 0) === 0 ? (
        <p className="text-[12px] text-slate-500">
          No close matches in the last year. Try a more specific symptom phrase.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {data!.results.map((post) => (
            <li key={`${post.subreddit}-${post.id}`}>
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="fc-focus-ring block h-full rounded-[var(--radius-control)] border border-slate-200 bg-white p-3 transition hover:border-[var(--primary)] hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider">
                  <span className="text-[var(--primary)]">r/{post.subreddit}</span>
                  <span
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600"
                    title="Token-overlap similarity to your narrative"
                  >
                    {Math.round(post.similarity * 100)}% match
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug text-slate-900">
                  {post.title}
                </div>
                {post.snippet ? (
                  <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-slate-600">
                    {post.snippet}
                  </p>
                ) : null}
                <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{post.score} pts</span>
                  <span aria-hidden="true">·</span>
                  <span>{post.num_comments} comments</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (flat) {
    return (
      <div className={className} aria-label="Similar discussions on Reddit">
        {body}
      </div>
    );
  }
  return (
    <section
      className={`fc-card p-5 ${className}`}
      aria-label="Similar discussions on Reddit"
    >
      {body}
    </section>
  );
}
