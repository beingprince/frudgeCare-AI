"""Live Reddit similarity search for the /triage page.

We hit Reddit's anonymous JSON search endpoint
(https://www.reddit.com/r/<sub>/search.json) instead of the OAuth API
because FrudgeCare ships as a kiosk demo with no per-user auth. Reddit
is fine with that traffic for low-volume read-only use as long as we
send a descriptive User-Agent and respect their rate limits, which we
do via an in-process TTL cache.

Posts are ranked by Jaccard token overlap between the user's symptom
narrative and (title + selftext) so the panel shows clinically related
threads, not just whatever Reddit's relevance ranking puts on top.

Failure modes are intentional:
  - If Reddit returns 429 / 5xx / network error we drop that subreddit
    silently and surface whatever else worked.
  - If every subreddit fails we return an empty list with
    source="offline" so the UI hides the panel instead of throwing.
"""

from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import httpx


# Curated default subreddits. r/symptoms doesn't exist (the user asked
# us to verify and it 404s on Reddit), so we fall back to clinical-
# adjacent communities that allow symptom discussion threads.
DEFAULT_SUBREDDITS: Tuple[str, ...] = (
    "AskDocs",
    "medicine",
    "HealthAnxiety",
)

# Quirky Reddit detail learned the hard way (April 2026): if we send
# an explicit `Accept: application/json` header, Reddit's anti-bot
# returns HTTP 403. With NO Accept header (or Accept: */*) the same
# request from the same UA returns 200. The `.json` suffix on the URL
# is enough to negotiate JSON. We therefore only set User-Agent.
_USER_AGENT = "frudgecare-care-demo/0.1 (educational; read-only)"
_CACHE_TTL_SECONDS = 300  # 5 minutes — Reddit search results don't move that fast.
_TIMEOUT_SECONDS = 6.0
_MAX_RESULTS_PER_SUB = 10
_MAX_RETURNED = 6

# Hosts to try in order. www.reddit.com sometimes bot-blocks anonymous
# JSON; old.reddit.com is more permissive for read-only traffic.
_REDDIT_HOSTS: Tuple[str, ...] = ("https://www.reddit.com", "https://old.reddit.com")


# Tokens we strip before computing similarity so the ranker focuses on
# clinical content instead of generic English.
_STOPWORDS = frozenset(
    {
        "a", "an", "and", "are", "as", "at", "be", "but", "by", "do",
        "for", "from", "has", "have", "he", "her", "him", "his", "i",
        "if", "in", "is", "it", "its", "just", "me", "my", "no", "not",
        "of", "on", "or", "she", "so", "that", "the", "their", "them",
        "they", "this", "to", "was", "we", "were", "what", "when",
        "which", "who", "will", "with", "you", "your", "ive", "im",
        "feel", "feeling", "felt", "had", "got", "get", "getting",
        "really", "very", "much", "some", "any", "also", "too",
        "now", "still", "since", "after", "before", "today", "yesterday",
        "year", "month", "week", "day", "days", "weeks", "months",
        "hours", "minutes", "lot", "bit", "kind", "sort",
    }
)


@dataclass
class _CachedEntry:
    posts: List[Dict[str, object]]
    expires_at: float


@dataclass
class _CacheStore:
    entries: Dict[str, _CachedEntry] = field(default_factory=dict)


_CACHE = _CacheStore()


def _tokenise(text: str) -> List[str]:
    if not text:
        return []
    cleaned = re.sub(r"[^a-zA-Z0-9 ]+", " ", text.lower())
    return [tok for tok in cleaned.split() if tok and tok not in _STOPWORDS and len(tok) > 2]


def _similarity(query_tokens: List[str], post_tokens: List[str]) -> float:
    if not query_tokens or not post_tokens:
        return 0.0
    q = set(query_tokens)
    p = set(post_tokens)
    intersect = len(q & p)
    if intersect == 0:
        return 0.0
    union = len(q | p)
    return intersect / union if union else 0.0


def _cache_key(query: str, subreddit: str) -> str:
    return f"{subreddit.lower()}::{query.strip().lower()}"


def _get_cached(key: str) -> Optional[List[Dict[str, object]]]:
    entry = _CACHE.entries.get(key)
    if entry is None:
        return None
    if entry.expires_at < time.time():
        _CACHE.entries.pop(key, None)
        return None
    return entry.posts


def _put_cached(key: str, posts: List[Dict[str, object]]) -> None:
    _CACHE.entries[key] = _CachedEntry(
        posts=posts,
        expires_at=time.time() + _CACHE_TTL_SECONDS,
    )


def _normalise_post(raw: Dict[str, object], subreddit: str) -> Optional[Dict[str, object]]:
    data = raw.get("data") if isinstance(raw, dict) else None
    if not isinstance(data, dict):
        return None
    title = str(data.get("title") or "").strip()
    if not title:
        return None
    selftext = str(data.get("selftext") or "").strip()
    permalink = str(data.get("permalink") or "").strip()
    url = f"https://www.reddit.com{permalink}" if permalink else str(data.get("url") or "")
    snippet = selftext[:280] + ("…" if len(selftext) > 280 else "")
    return {
        "id": str(data.get("id") or ""),
        "title": title,
        "snippet": snippet,
        "subreddit": subreddit,
        "url": url,
        "score": int(data.get("score") or 0),
        "num_comments": int(data.get("num_comments") or 0),
        "created_utc": float(data.get("created_utc") or 0.0),
        "_text_for_match": f"{title} {selftext}",
    }


async def _fetch_subreddit(client: httpx.AsyncClient, subreddit: str, query: str) -> List[Dict[str, object]]:
    """Hit Reddit search for one subreddit, with cache and graceful fail.

    We try www.reddit.com first, then old.reddit.com if that 403s. The
    old domain has a more permissive policy for anonymous JSON reads.
    """
    cache_key = _cache_key(query, subreddit)
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached
    params = {
        "q": query,
        "restrict_sr": "1",
        "sort": "relevance",
        "t": "year",
        "limit": str(_MAX_RESULTS_PER_SUB),
        "raw_json": "1",
    }
    payload = None
    last_status: Optional[int] = None
    for host in _REDDIT_HOSTS:
        url = f"{host}/r/{subreddit}/search.json"
        try:
            resp = await client.get(url, params=params)
        except (httpx.HTTPError, asyncio.TimeoutError) as exc:  # pragma: no cover - network
            print(f"[community] {subreddit} via {host} fetch failed: {exc}", flush=True)
            continue
        last_status = resp.status_code
        if resp.status_code == 200:
            try:
                payload = resp.json()
                break
            except ValueError:
                continue
        else:
            print(
                f"[community] {subreddit} via {host} returned HTTP {resp.status_code}",
                flush=True,
            )
            continue
    if payload is None:
        print(f"[community] {subreddit} all hosts failed (last={last_status})", flush=True)
        return []
    children = payload.get("data", {}).get("children", []) if isinstance(payload, dict) else []
    posts: List[Dict[str, object]] = []
    for child in children:
        post = _normalise_post(child, subreddit) if isinstance(child, dict) else None
        if post is not None:
            posts.append(post)
    _put_cached(cache_key, posts)
    return posts


async def search_similar(
    query: str,
    subreddits: Optional[List[str]] = None,
) -> Dict[str, object]:
    """Return up to _MAX_RETURNED related Reddit posts, ranked by overlap.

    Always returns a structured envelope so the UI can render with a
    single code path:

        {
          "query": "...",
          "subreddits": ["AskDocs", "medicine", "HealthAnxiety"],
          "results": [...],
          "source": "reddit" | "cache" | "offline",
          "fetched_at": iso8601,
        }
    """
    cleaned = (query or "").strip()
    subs = [s.strip() for s in (subreddits or DEFAULT_SUBREDDITS) if s and s.strip()]
    if not cleaned or not subs:
        return {
            "query": cleaned,
            "subreddits": subs,
            "results": [],
            "source": "offline",
            "fetched_at": _now_iso(),
        }

    # NOTE: Do not set Accept here — Reddit 403s us if we ask for
    # application/json explicitly. See _USER_AGENT comment above.
    headers = {"User-Agent": _USER_AGENT}
    async with httpx.AsyncClient(headers=headers, timeout=_TIMEOUT_SECONDS, follow_redirects=True) as client:
        tasks = [_fetch_subreddit(client, sub, cleaned) for sub in subs]
        results = await asyncio.gather(*tasks, return_exceptions=False)

    aggregated: List[Dict[str, object]] = []
    for batch in results:
        aggregated.extend(batch)

    if not aggregated:
        return {
            "query": cleaned,
            "subreddits": subs,
            "results": [],
            "source": "offline",
            "fetched_at": _now_iso(),
        }

    query_tokens = _tokenise(cleaned)
    scored: List[Tuple[float, Dict[str, object]]] = []
    for post in aggregated:
        post_tokens = _tokenise(str(post.get("_text_for_match") or post.get("title") or ""))
        sim = _similarity(query_tokens, post_tokens)
        scored.append((sim, post))

    scored.sort(key=lambda pair: (pair[0], pair[1].get("score", 0)), reverse=True)
    top = []
    for sim, post in scored[:_MAX_RETURNED]:
        post.pop("_text_for_match", None)
        post["similarity"] = round(sim, 3)
        top.append(post)

    return {
        "query": cleaned,
        "subreddits": subs,
        "results": top,
        "source": "reddit",
        "fetched_at": _now_iso(),
    }


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat(timespec="seconds")
