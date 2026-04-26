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
}: {
  narrative: string;
  className?: string;
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

  return (
    <section
      className={`rounded-[14px] border border-slate-200 bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.04)] ${className}`}
      aria-label="Similar discussions on Reddit"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold tracking-tight text-slate-900">
            Similar conversations on Reddit
          </h3>
          <p className="mt-0.5 text-[12px] leading-snug text-slate-500">
            Read-only matches from{" "}
            {(data?.subreddits ?? ["AskDocs", "medicine", "HealthAnxiety"]).map((s, i, arr) => (
              <span key={s}>
                <span className="font-mono text-[11px]">r/{s}</span>
                {i < arr.length - 1 ? ", " : ""}
              </span>
            ))}
            . Public threads only — not medical advice.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
          {loading ? "Searching…" : data?.source === "cache" ? "Cached" : data?.source ?? "live"}
        </span>
      </div>

      {error ? (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          Couldn&apos;t load community posts: {error}
        </div>
      ) : loading && !data ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[78px] animate-pulse rounded-[10px] border border-slate-100 bg-slate-50"
            />
          ))}
        </div>
      ) : (data?.results?.length ?? 0) === 0 ? (
        <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          No close matches in the last year. Try a more specific symptom phrase.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {data!.results.map((post) => (
            <li key={`${post.subreddit}-${post.id}`}>
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-full rounded-[10px] border border-slate-200 bg-white p-3 transition hover:border-[#0F4C81] hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-wide">
                  <span className="text-[#0F4C81]">r/{post.subreddit}</span>
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
                <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                  <span>{post.score} pts</span>
                  <span>·</span>
                  <span>{post.num_comments} comments</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
