"""
FrudgeCare AI — Local Knowledge Base Retrieval (Tier 0).

Pure-Python, zero-dependency retriever. Loads hand-authored JSON knowledge base
files once at import time and exposes lookup helpers used by the tiered AI
pipeline. This layer runs BEFORE any LLM call, giving every AI response a set of
grounded facts that can (a) shape the LLM prompt, (b) verify LLM output, and
(c) serve as an authoritative fallback when the LLM is unavailable.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Tuple

KB_DIR = os.path.join(os.path.dirname(__file__), "knowledge_base")


def _load(name: str) -> Any:
    """Load a JSON knowledge base file. Fail loud at startup if malformed."""
    path = os.path.join(KB_DIR, name)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# Eagerly load everything once. These are tiny (<200KB total).
SYMPTOM_PATTERNS: List[Dict[str, Any]] = _load("symptom_patterns.json")
DRUG_INTERACTIONS: List[Dict[str, Any]] = _load("drug_interactions.json")
VITALS_RANGES: Dict[str, Dict[str, Any]] = _load("vitals_ranges.json")
ICD10_CODES: List[Dict[str, Any]] = _load("icd10_codes.json")
RED_FLAG_RULES: List[Dict[str, Any]] = _load("red_flag_rules.json")


# ------------------------------------------------------------------
# Symptom pattern retrieval
# ------------------------------------------------------------------

def _contains_any(haystack: str, needles: List[str]) -> int:
    """Number of needle phrases that appear in the lowercased haystack."""
    return sum(1 for n in needles if n.lower() in haystack)


def match_symptom_patterns(
    query: str, top_k: int = 3
) -> List[Tuple[Dict[str, Any], float]]:
    """
    Return up to `top_k` symptom patterns that match the query, each paired with
    a confidence score in [0, 1]. Scoring is based on how many keywords from
    each keyword group hit the query.
    """
    if not query:
        return []
    q = query.lower()
    scored: List[Tuple[Dict[str, Any], float]] = []

    for pattern in SYMPTOM_PATTERNS:
        groups = pattern.get("keyword_groups", [])
        if not groups:
            continue

        hits_per_group = [_contains_any(q, g) for g in groups]
        total_keywords = sum(len(g) for g in groups)
        total_hits = sum(hits_per_group)

        if pattern.get("match_all_groups", False):
            matched = all(h > 0 for h in hits_per_group)
        else:
            matched = any(h > 0 for h in hits_per_group)

        if not matched:
            continue

        # Coverage score — what fraction of kw phrases hit, scaled so partial
        # group hits still yield useful scores.
        coverage = total_hits / total_keywords if total_keywords else 0.0
        # Boost: matching more groups is more informative than piling hits into one.
        groups_hit = sum(1 for h in hits_per_group if h > 0)
        group_bonus = groups_hit / max(len(groups), 1)
        confidence = min(1.0, 0.5 * coverage + 0.5 * group_bonus)

        scored.append((pattern, confidence))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_k]


# ------------------------------------------------------------------
# Red-flag rule retrieval
# ------------------------------------------------------------------

def match_red_flags(
    query: str, age: Optional[int] = None
) -> List[Dict[str, Any]]:
    """Return every red-flag rule whose triggers and (optional) age fire."""
    if not query:
        return []
    q = query.lower()
    fired: List[Dict[str, Any]] = []

    for rule in RED_FLAG_RULES:
        triggers = rule.get("trigger_keywords", [])
        if _contains_any(q, triggers) == 0:
            continue

        requires_also = rule.get("requires_also")
        if requires_also and _contains_any(q, requires_also) == 0:
            continue

        age_min = rule.get("age_min")
        if age_min is not None and (age is None or age < age_min):
            continue

        fired.append(rule)

    return fired


# ------------------------------------------------------------------
# Vitals evaluation
# ------------------------------------------------------------------

def evaluate_vitals(
    vitals: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Apply the vitals_ranges knowledge base to a vitals dict.
    Returns a list of flag dicts shaped for NurseAssistResponse.VitalsFlag.
    """
    flags: List[Dict[str, Any]] = []
    if not vitals:
        return flags

    for key, value in vitals.items():
        spec = VITALS_RANGES.get(key)
        if not spec:
            continue
        if not isinstance(value, (int, float)):
            continue

        field = spec.get("field", key)
        messages = spec.get("messages", {})
        status: Optional[str] = None
        note: Optional[str] = None

        crit_low = spec.get("critical_low")
        crit_high = spec.get("critical_high")
        warn_low = spec.get("warning_low")
        warn_high = spec.get("warning_high")

        if crit_low is not None and value < crit_low:
            status, note = "critical", messages.get("critical_low")
        elif crit_high is not None and value > crit_high:
            status, note = "critical", messages.get("critical_high")
        elif warn_low is not None and value < warn_low:
            status, note = "warning", messages.get("warning_low")
        elif warn_high is not None and value > warn_high:
            status, note = "warning", messages.get("warning_high")

        if status and note:
            flags.append({
                "field": field,
                "value": value,
                "status": status,
                "note": note,
            })

    return flags


# ------------------------------------------------------------------
# Drug interaction retrieval
# ------------------------------------------------------------------

def _drug_match(name: str, entry_drug: str, aliases: List[str]) -> bool:
    name_l = name.lower()
    if entry_drug.lower() in name_l or name_l in entry_drug.lower():
        return True
    for alias in aliases:
        if alias.lower() in name_l:
            return True
    return False


def check_drug_interactions(
    medications: List[str], proposed: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Cross-check a medication list (optionally plus a proposed new drug) against
    the drug-interaction KB. Returns every matching interaction entry.
    """
    if not medications and not proposed:
        return []

    pool = list({m.strip() for m in medications if m and m.strip()})
    if proposed and proposed.strip():
        pool.append(proposed.strip())

    results: List[Dict[str, Any]] = []
    seen_pairs = set()

    for entry in DRUG_INTERACTIONS:
        drug_a = entry.get("drug_a", "")
        drug_b = entry.get("drug_b", "")
        a_aliases = entry.get("drug_a_aliases", [])
        b_aliases = entry.get("drug_b_aliases", [])

        a_hit = next((m for m in pool if _drug_match(m, drug_a, a_aliases)), None)
        b_hit = next((m for m in pool if _drug_match(m, drug_b, b_aliases)), None)

        if a_hit and b_hit and a_hit.lower() != b_hit.lower():
            key = tuple(sorted([a_hit.lower(), b_hit.lower(), drug_a, drug_b]))
            if key in seen_pairs:
                continue
            seen_pairs.add(key)
            results.append({
                "matched_on": [a_hit, b_hit],
                "severity": entry.get("severity"),
                "mechanism": entry.get("mechanism"),
                "recommendation": entry.get("recommendation"),
                "source_entry": f"{drug_a}↔{drug_b}",
            })

    return results


# ------------------------------------------------------------------
# ICD-10 lookup
# ------------------------------------------------------------------

def lookup_icd10(term: str) -> Optional[Dict[str, Any]]:
    """Best-effort ICD-10 lookup by display name or alias."""
    if not term:
        return None
    t = term.lower().strip()
    # Exact display match first.
    for entry in ICD10_CODES:
        if entry["display"].lower() == t:
            return entry
    # Alias match.
    for entry in ICD10_CODES:
        aliases = entry.get("aliases", [])
        if any(a.lower() == t for a in aliases):
            return entry
    # Partial display substring as last resort.
    for entry in ICD10_CODES:
        if t in entry["display"].lower():
            return entry
    return None


# ------------------------------------------------------------------
# Summary helpers used when building grounded context strings for the LLM
# ------------------------------------------------------------------

def format_patterns_context(
    matches: List[Tuple[Dict[str, Any], float]]
) -> str:
    """Render matched patterns as a plain-text block to feed the LLM."""
    if not matches:
        return "No matching patterns in local knowledge base."
    lines: List[str] = []
    for pattern, score in matches:
        lines.append(
            f"- {pattern['label']} (match confidence {score:.2f}, "
            f"urgency={pattern['urgency_hint']})"
        )
        diffs = pattern.get("differential", [])
        if diffs:
            dx_str = "; ".join(f"{d['diagnosis']} [{d.get('icd10','?')}]" for d in diffs[:3])
            lines.append(f"    differential: {dx_str}")
        red = pattern.get("red_flags", [])
        if red:
            lines.append(f"    red flags: {', '.join(red)}")
    return "\n".join(lines)


def format_red_flags_context(rules: List[Dict[str, Any]]) -> str:
    if not rules:
        return "No red-flag rules fired."
    return "\n".join(f"- [{r['id']}] {r['message']}" for r in rules)


def format_interactions_context(hits: List[Dict[str, Any]]) -> str:
    if not hits:
        return "No known interactions in local KB."
    lines: List[str] = []
    for h in hits:
        lines.append(
            f"- {h['matched_on'][0]} ↔ {h['matched_on'][1]} "
            f"[{h.get('severity', '?')}]: {h.get('mechanism', '')}"
        )
        if h.get("recommendation"):
            lines.append(f"    → {h['recommendation']}")
    return "\n".join(lines)
