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
from urllib.parse import urlencode

import httpx


_TAVILY_ENDPOINT = "https://api.tavily.com/search"
_CACHE_TTL_SECONDS = 600  # Pricing pages don't update minute-to-minute.
_TIMEOUT_SECONDS = 8.0
_MAX_RETURNED = 5  # Patient-facing UI caps cards at 5; keep API in sync.

# Common over-the-counter drug names (US). Anything not on this list
# defaults to `rx_required` — honest fallback for the demo, since most
# prescription medication is in fact Rx-only. A clinical pharmacist
# would maintain a fuller list for production.
_OTC_DRUGS: frozenset[str] = frozenset(
    {
        "ibuprofen", "advil", "motrin",
        "acetaminophen", "tylenol", "paracetamol",
        "aspirin", "bayer",
        "naproxen", "aleve",
        "loratadine", "claritin",
        "cetirizine", "zyrtec",
        "fexofenadine", "allegra",
        "diphenhydramine", "benadryl",
        "pseudoephedrine", "sudafed",
        "phenylephrine",
        "omeprazole", "prilosec",
        "famotidine", "pepcid",
        "ranitidine",  # discontinued in many regions but still queried
        "calcium carbonate", "tums",
        "loperamide", "imodium",
        "bismuth subsalicylate", "pepto-bismol",
        "simethicone", "gas-x",
        "hydrocortisone",
        "miconazole",
        "clotrimazole",
        "dextromethorphan",
        "guaifenesin", "mucinex",
        "menthol",
        "nicotine",
        "saline nasal spray",
        "melatonin",
    }
)

# Curated demo set used when no Tavily key is configured. These are the
# real US pharmacy chains a patient is most likely to use, with
# illustrative addresses pinned to a Lake Charles, LA ZIP (70601) so the
# Maps button still produces a sensible route. Patients should always
# confirm the address with the dispensing pharmacy.
_DEMO_PHARMACIES: Tuple[Dict[str, object], ...] = (
    {
        "name": "CVS Pharmacy",
        "url": "https://www.cvs.com/shop/",
        "snippet": (
            "National pharmacy chain with same-day prescription pickup, "
            "ExtraCare savings, and CarePass auto-refill."
        ),
        "channel": "in_store",
        "address": "3105 Ryan St, Lake Charles, LA 70601",
        "phone": "(337) 433-5051",
        "demo_price": "from $11.99",
    },
    {
        "name": "Walgreens",
        "url": "https://www.walgreens.com/topic/pharmacy/pharmacy.jsp",
        "snippet": (
            "Walk-in prescriptions, free same-day pickup, and the "
            "Prescription Savings Club for cash-pay discounts."
        ),
        "channel": "in_store",
        "address": "2100 Country Club Rd, Lake Charles, LA 70605",
        "phone": "(337) 478-9831",
        "demo_price": "from $12.49",
    },
    {
        "name": "Walmart Pharmacy",
        "url": "https://www.walmart.com/cp/pharmacy/5431",
        "snippet": (
            "$4 generic medication list, free home delivery on most "
            "prescriptions, and price-match against major chains."
        ),
        "channel": "in_store",
        "address": "3415 Gerstner Memorial Dr, Lake Charles, LA 70601",
        "phone": "(337) 477-3785",
        "demo_price": "from $4.00",
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
        "address": "Online · use at any major pharmacy",
        "phone": "(855) 268-2822",
        "demo_price": "compare prices",
    },
    {
        "name": "Mark Cuban Cost Plus Drug Company",
        "url": "https://costplusdrugs.com/",
        "snippet": (
            "Online pharmacy with transparent cost-plus pricing on "
            "1,000+ generics, mailed direct to your address."
        ),
        "channel": "mail_order",
        "address": "Online · ships nationwide",
        "phone": "(833) 926-3384",
        "demo_price": "cost + 15%",
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

# US phone formats:  (337) 433-5051   337-433-5051   337.433.5051
_PHONE_REGEX = re.compile(
    r"\(?\b\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b"
)

# US address heuristic: "<number> <street words>, <city>, <ST> <ZIP>".
# Permissive on purpose — Tavily snippets are messy.
_ADDRESS_REGEX = re.compile(
    r"\b\d{1,6}\s+[A-Za-z0-9.\-' ]{3,60},\s*"  # street
    r"[A-Za-z .'\-]{2,40},\s*"                  # city
    r"[A-Z]{2}\s*\d{5}(?:-\d{4})?\b"            # state + zip
)


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


def _extract_phone(text: str) -> Optional[str]:
    """Pull the first US-style phone number out of free text."""
    if not text:
        return None
    m = _PHONE_REGEX.search(text)
    if not m:
        return None
    raw = m.group(0)
    digits = re.sub(r"\D", "", raw)
    if len(digits) != 10:
        return None
    return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"


def _extract_address(text: str) -> Optional[str]:
    """Pull the first US-style street address out of free text."""
    if not text:
        return None
    m = _ADDRESS_REGEX.search(text)
    return m.group(0).strip() if m else None


def _build_maps_url(
    name: str, address: Optional[str], zip_code: str, channel: str
) -> Optional[str]:
    """Build a Google Maps directions URL the patient can tap to navigate.

    Returns ``None`` when there is no real physical destination — this is the
    case for coupon/mail-order results (GoodRx, RxSaver, Cost Plus Drugs)
    whose Tavily *page title* is something like "Albuterol Coupons & Prices
    – SingleCare" and whose listing has no street address. Forcing those
    titles into Google Maps lands the patient on a "can't find this place"
    error screen, which is worse than no button at all.

    For results we *can* navigate to, we feed only the parsed street address
    (never the page title) into the ``maps/dir`` directions endpoint, which
    drops a pin and offers turn-by-turn navigation from the patient's
    current location.
    """
    if channel != "in_store":
        return None
    if not address:
        return None
    encoded = urlencode({
        "api": "1",
        "destination": address,
        "travelmode": "driving",
    })
    return f"https://www.google.com/maps/dir/?{encoded}"


def _classify_availability(drug: str) -> str:
    """Return `"otc"`, `"rx_required"`, or `"unknown"` for a drug name."""
    if not drug:
        return "unknown"
    name = drug.strip().lower()
    if not name:
        return "unknown"
    if name in _OTC_DRUGS:
        return "otc"
    # Token-level match — handles "ibuprofen 200mg" and "extra strength tylenol".
    for token in re.split(r"[\s\-]+", name):
        if token in _OTC_DRUGS:
            return "otc"
    return "rx_required"


def _availability_label(availability: str) -> str:
    """Patient-friendly headline that pairs with the `availability` value."""
    if availability == "otc":
        return (
            "This medication is generally available over the counter — "
            "you can buy it without a prescription."
        )
    if availability == "rx_required":
        return (
            "This medication usually requires a prescription. Visit a "
            "clinic or your provider before going to the pharmacy."
        )
    return (
        "We weren't able to confirm whether this medication is "
        "over-the-counter. Ask the dispensing pharmacy."
    )


def _demo_payload(drug: str, zip_code: str, reason: str) -> Dict[str, object]:
    """Render the curated stub set as if it had come from Tavily."""
    availability = _classify_availability(drug)
    results: List[Dict[str, object]] = []
    for entry in _DEMO_PHARMACIES[:_MAX_RETURNED]:
        address = str(entry.get("address") or "")
        channel = str(entry.get("channel") or "in_store")
        # In the demo set the "Online ·" addresses are placeholders, not
        # routable. Only build a maps URL for in-store entries.
        routable_address = address if channel == "in_store" and not address.lower().startswith("online") else None
        results.append(
            {
                "name": entry["name"],
                "url": entry["url"],
                "snippet": entry["snippet"],
                "channel": channel,
                "address": address,
                "phone": entry.get("phone"),
                "maps_url": _build_maps_url(
                    str(entry["name"]), routable_address, zip_code, channel,
                ),
                "estimated_prices": [str(entry.get("demo_price"))] if entry.get("demo_price") else [],
                "availability": availability,
                "score": None,
                "source": "demo_curated",
            }
        )
    return {
        "mode": "demo",
        "drug": drug,
        "zip": zip_code,
        "availability": availability,
        "availability_label": _availability_label(availability),
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


def _normalise_tavily_hit(hit: Dict[str, object], zip_code: str) -> Optional[Dict[str, object]]:
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
    address = _extract_address(content) or _extract_address(snippet)
    phone = _extract_phone(content) or _extract_phone(snippet)
    channel = _classify_channel(url)
    return {
        "name": title,
        "url": url,
        "snippet": snippet,
        "estimated_prices": _extract_prices(content),
        "score": round(score, 3) if score is not None else None,
        "channel": channel,
        "address": address or "",
        "phone": phone,
        "maps_url": _build_maps_url(title, address, zip_code, channel),
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

    # Two-pronged search:
    #   1. A chain-locator query that nudges Tavily toward real pharmacy
    #      store-locator pages (Walgreens / CVS / Walmart / Rite Aid),
    #      which actually contain a street address + phone in the page
    #      content. These produce results we can drop a pin on.
    #   2. A pricing query for the specific drug, so the patient still
    #      sees coupon / cash-price information from GoodRx-style hits.
    # Together they give "navigate me there" rows AND "what does it cost"
    # rows in the same payload.
    queries = [
        f"pharmacy near {zip_clean} address phone hours",
        f"{drug_clean} pharmacy near {zip_clean} price",
    ]
    headers = {"User-Agent": "frudgecare-pharmacy-finder/0.1"}
    async with httpx.AsyncClient(headers=headers, timeout=_TIMEOUT_SECONDS) as client:
        batches = await asyncio.gather(*[_tavily_call(client, api_key, q) for q in queries])

    merged: Dict[str, Dict[str, object]] = {}
    for batch in batches:
        for hit in batch:
            if not isinstance(hit, dict):
                continue
            norm = _normalise_tavily_hit(hit, zip_clean)
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

    # Rank: results with a real parseable street address come first (the
    # patient can navigate to those), then by Tavily score. Without this,
    # pure coupon pages with high relevance scores crowd out the actual
    # walkable pharmacies.
    ranked = sorted(
        merged.values(),
        key=lambda r: (
            1 if r.get("address") else 0,
            r.get("score") or 0.0,
        ),
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

    availability = _classify_availability(drug_clean)
    payload = {
        "mode": "live",
        "drug": drug_clean,
        "zip": zip_clean,
        "availability": availability,
        "availability_label": _availability_label(availability),
        "results": ranked,
        "note": "Live results via Tavily Search.",
        "fetched_at": _now_iso(),
    }
    _put_cached(cache_key, payload)
    return payload
