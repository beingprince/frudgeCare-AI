"""Pharmacy / medication price lookup via Tavily Search.

The /triage flow ends with a recommendation that often includes a
prescription. This module powers the "where can I buy this medication
near me?" follow-up: given a drug name and a US ZIP code, hit Tavily
Search and surface the top pharmacy listings with whatever pricing or
contact info Tavily extracted.

Two modes:

  - LIVE: when TAVILY_API_KEY is set, we call api.tavily.com/search
    twice (one for "<drug> pharmacy near <zip>" and one for
    "<drug> price <zip>"), merge by URL, and rank by Tavily's score.

  - DEMO: when no key is configured we return a curated stub set
    (CVS, Walgreens, Walmart Pharmacy, GoodRx, Costco) so the kiosk
    demo still works for judges. The envelope's `mode` field is
    `"demo"` so the UI can label it honestly.

Always returns a structured envelope with `mode`, `query`, `results`,
and `fetched_at`. Failures degrade to demo mode rather than 500-ing.
"""

from __future__ import annotations

import asyncio
import os
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import httpx


_TAVILY_ENDPOINT = "https://api.tavily.com/search"
_CACHE_TTL_SECONDS = 600  # Pricing pages don't update minute-to-minute.
_TIMEOUT_SECONDS = 8.0
_MAX_RETURNED = 6

# Curated demo set used when no Tavily key is configured. These are the
# real US pharmacy chains a patient is most likely to use; we render
# illustrative prices the user can independently verify.
_DEMO_PHARMACIES: Tuple[Dict[str, object], ...] = (
    {
        "name": "CVS Pharmacy",
        "url": "https://www.cvs.com/shop/",
        "snippet": (
            "National pharmacy chain with same-day prescription pickup, "
            "ExtraCare savings, and CarePass auto-refill."
        ),
        "channel": "in_store",
    },
    {
        "name": "Walgreens",
        "url": "https://www.walgreens.com/topic/pharmacy/pharmacy.jsp",
        "snippet": (
            "Walk-in prescriptions, free same-day pickup, and the "
            "Prescription Savings Club for cash-pay discounts."
        ),
        "channel": "in_store",
    },
    {
        "name": "Walmart Pharmacy",
        "url": "https://www.walmart.com/cp/pharmacy/5431",
        "snippet": (
            "$4 generic medication list, free home delivery on most "
            "prescriptions, and price-match against major chains."
        ),
        "channel": "in_store",
    },
    {
        "name": "Costco Pharmacy",
        "url": "https://www.costco.com/pharmacy.html",
        "snippet": (
            "Member-pricing on common generics, often the lowest cash "
            "price in the area for chronic-condition meds."
        ),
        "channel": "in_store",
    },
    {
        "name": "GoodRx",
        "url": "https://www.goodrx.com/",
        "snippet": (
            "Free coupons that compare cash prices across local "
            "pharmacies. Show the coupon at checkout — no insurance "
            "required."
        ),
        "channel": "coupon",
    },
    {
        "name": "Mark Cuban Cost Plus Drug Company",
        "url": "https://costplusdrugs.com/",
        "snippet": (
            "Online pharmacy with transparent cost-plus pricing on "
            "1,000+ generics, mailed direct to your address."
        ),
        "channel": "mail_order",
    },
)


@dataclass
class _CachedEntry:
    payload: Dict[str, object]
    expires_at: float


@dataclass
class _CacheStore:
    entries: Dict[str, _CachedEntry] = field(default_factory=dict)


_CACHE = _CacheStore()


_PRICE_REGEX = re.compile(r"\$\s?\d+(?:\.\d{2})?(?:\s?-\s?\$?\d+(?:\.\d{2})?)?")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _cache_key(drug: str, zip_code: str) -> str:
    return f"{drug.strip().lower()}::{zip_code.strip()}"


def _get_cached(key: str) -> Optional[Dict[str, object]]:
    entry = _CACHE.entries.get(key)
    if entry is None:
        return None
    if entry.expires_at < time.time():
        _CACHE.entries.pop(key, None)
        return None
    return entry.payload


def _put_cached(key: str, payload: Dict[str, object]) -> None:
    _CACHE.entries[key] = _CachedEntry(
        payload=payload,
        expires_at=time.time() + _CACHE_TTL_SECONDS,
    )


def _extract_prices(text: str) -> List[str]:
    if not text:
        return []
    matches = _PRICE_REGEX.findall(text)
    # Dedup while preserving order.
    seen = []
    for m in matches:
        clean = m.replace(" ", "")
        if clean not in seen:
            seen.append(clean)
    return seen[:3]


def _is_us_zip(zip_code: str) -> bool:
    return bool(re.fullmatch(r"\d{5}(?:-\d{4})?", zip_code.strip()))


def _demo_payload(drug: str, zip_code: str, reason: str) -> Dict[str, object]:
    """Render the curated stub set as if it had come from Tavily."""
    results: List[Dict[str, object]] = []
    for entry in _DEMO_PHARMACIES:
        results.append(
            {
                "name": entry["name"],
                "url": entry["url"],
                "snippet": entry["snippet"],
                "channel": entry["channel"],
                "estimated_prices": [],
                "score": None,
                "source": "demo_curated",
            }
        )
    return {
        "mode": "demo",
        "drug": drug,
        "zip": zip_code,
        "results": results,
        "note": reason,
        "fetched_at": _now_iso(),
    }


async def _tavily_call(client: httpx.AsyncClient, api_key: str, query: str) -> List[Dict[str, object]]:
    body = {
        "api_key": api_key,
        "query": query,
        "search_depth": "basic",
        "max_results": 6,
        "include_answer": False,
        "include_raw_content": False,
        "include_images": False,
    }
    try:
        resp = await client.post(_TAVILY_ENDPOINT, json=body)
    except (httpx.HTTPError, asyncio.TimeoutError) as exc:  # pragma: no cover - network
        print(f"[pharmacy] Tavily call failed: {exc}", flush=True)
        return []
    if resp.status_code != 200:
        print(f"[pharmacy] Tavily returned HTTP {resp.status_code}", flush=True)
        return []
    try:
        data = resp.json()
    except ValueError:
        return []
    results = data.get("results") if isinstance(data, dict) else None
    return results if isinstance(results, list) else []


def _normalise_tavily_hit(hit: Dict[str, object]) -> Optional[Dict[str, object]]:
    title = str(hit.get("title") or "").strip()
    url = str(hit.get("url") or "").strip()
    if not title or not url:
        return None
    content = str(hit.get("content") or "").strip()
    snippet = content[:280] + ("…" if len(content) > 280 else "")
    score_raw = hit.get("score")
    try:
        score = float(score_raw) if score_raw is not None else None
    except (TypeError, ValueError):
        score = None
    return {
        "name": title,
        "url": url,
        "snippet": snippet,
        "estimated_prices": _extract_prices(content),
        "score": round(score, 3) if score is not None else None,
        "channel": _classify_channel(url),
        "source": "tavily",
    }


def _classify_channel(url: str) -> str:
    host = url.lower()
    if "goodrx.com" in host or "singlecare" in host:
        return "coupon"
    if "costplusdrugs.com" in host or "amazon.com/pharmacy" in host:
        return "mail_order"
    return "in_store"


async def search_pharmacies(drug: str, zip_code: str) -> Dict[str, object]:
    """Return up to ~6 pharmacy candidates for `drug` near `zip_code`."""
    drug_clean = (drug or "").strip()
    zip_clean = (zip_code or "").strip()
    if not drug_clean:
        return _demo_payload(drug_clean, zip_clean, "Missing medication name; showing demo set.")
    if not _is_us_zip(zip_clean):
        return _demo_payload(drug_clean, zip_clean, "ZIP must be 5 digits; showing demo set.")

    cache_key = _cache_key(drug_clean, zip_clean)
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        payload = _demo_payload(
            drug_clean,
            zip_clean,
            "TAVILY_API_KEY not configured on this server; showing demo set.",
        )
        _put_cached(cache_key, payload)
        return payload

    queries = [
        f"{drug_clean} pharmacy near {zip_clean} price",
        f"buy {drug_clean} pharmacy {zip_clean}",
    ]
    headers = {"User-Agent": "frudgecare-pharmacy-finder/0.1"}
    async with httpx.AsyncClient(headers=headers, timeout=_TIMEOUT_SECONDS) as client:
        batches = await asyncio.gather(*[_tavily_call(client, api_key, q) for q in queries])

    merged: Dict[str, Dict[str, object]] = {}
    for batch in batches:
        for hit in batch:
            if not isinstance(hit, dict):
                continue
            norm = _normalise_tavily_hit(hit)
            if norm is None:
                continue
            url_key = str(norm["url"]).split("?", 1)[0]
            existing = merged.get(url_key)
            if existing is None or (
                isinstance(norm.get("score"), float)
                and (
                    not isinstance(existing.get("score"), float)
                    or norm["score"] > existing["score"]  # type: ignore[operator]
                )
            ):
                merged[url_key] = norm

    ranked = sorted(
        merged.values(),
        key=lambda r: (r.get("score") or 0.0),
        reverse=True,
    )[:_MAX_RETURNED]

    if not ranked:
        payload = _demo_payload(
            drug_clean,
            zip_clean,
            "Tavily returned no results; showing curated demo set.",
        )
        _put_cached(cache_key, payload)
        return payload

    payload = {
        "mode": "live",
        "drug": drug_clean,
        "zip": zip_clean,
        "results": ranked,
        "note": "Live results via Tavily Search.",
        "fetched_at": _now_iso(),
    }
    _put_cached(cache_key, payload)
    return payload
