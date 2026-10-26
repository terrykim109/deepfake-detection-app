# reverse_search.py — Scrappa Google Lens reverse image search (server-side only)

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import httpx

from config import SCRAPPA_API_KEY, SCRAPPA_LENS_URL

ONLINE_SEARCH_DISCLAIMER = (
    "Online search results show where similar or matching images appear on the web. "
    "They do not establish whether an image is authentic, original, or free of manipulation."
)

_MAX_RESULTS = 20


def _domain(value: str | None) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    if "://" not in raw:
        return raw
    try:
        host = urlparse(raw).netloc or raw
    except Exception:
        return raw
    return host[4:] if host.startswith("www.") else host


def _normalize_item(item: dict[str, Any], match_type: str) -> dict[str, Any] | None:
    link = (item.get("link") or item.get("url") or "").strip()
    title = (item.get("title") or "").strip() or "Untitled result"
    if not link:
        return None
    source = (item.get("source") or "").strip() or _domain(link)
    thumb = item.get("thumbnail")
    if thumb is not None:
        thumb = str(thumb).strip() or None
    position = item.get("position")
    try:
        position = int(position) if position is not None else None
    except (TypeError, ValueError):
        position = None
    return {
        "title": title,
        "link": link,
        "source": source,
        "thumbnail": thumb,
        "match_type": match_type,
        "position": position,
    }


def _empty_payload(*, status: str, error: str | None = None) -> dict[str, Any]:
    return {
        "status": status,
        "total_count": 0,
        "exact_count": 0,
        "visual_count": 0,
        "related_count": 0,
        "results": [],
        "error": error,
        "disclaimer": ONLINE_SEARCH_DISCLAIMER,
    }


async def reverse_image_search(image_url: str) -> dict[str, Any]:
    """
    Call Scrappa Google Lens with a short-lived public HTTPS image URL.
    Never raises — returns a structured payload with status ok | empty | error.
    """
    key = (SCRAPPA_API_KEY or "").strip()
    if not key:
        return _empty_payload(
            status="error",
            error="Online search is not configured (missing SCRAPPA_API_KEY).",
        )

    url = (image_url or "").strip()
    if not url.startswith("https://"):
        return _empty_payload(
            status="error",
            error="Online search needs a public HTTPS image URL (localhost cannot be used).",
        )

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(50.0, connect=10.0)) as client:
            response = await client.get(
                SCRAPPA_LENS_URL,
                params={"url": url, "type": "all"},
                headers={"X-API-KEY": key, "Accept": "application/json"},
            )
    except httpx.TimeoutException:
        return _empty_payload(
            status="error",
            error="Online search timed out. Deepfake detection results are unaffected.",
        )
    except Exception as exc:
        return _empty_payload(
            status="error",
            error=f"Online search failed: {type(exc).__name__}. Deepfake detection results are unaffected.",
        )

    if response.status_code != 200:
        detail = ""
        try:
            body = response.json()
            detail = str(body.get("error") or body.get("error_code") or "")
        except Exception:
            detail = (response.text or "")[:160]
        msg = f"Online search unavailable (HTTP {response.status_code})"
        if detail:
            msg = f"{msg}: {detail}"
        return _empty_payload(status="error", error=msg)

    try:
        data = response.json()
    except Exception:
        return _empty_payload(status="error", error="Online search returned an invalid response.")

    if not isinstance(data, dict):
        return _empty_payload(status="error", error="Online search returned an unexpected response.")

    exact_raw = data.get("exact_matches") or []
    visual_raw = data.get("visual_matches") or []
    related_raw = data.get("related_content") or []
    if not isinstance(exact_raw, list):
        exact_raw = []
    if not isinstance(visual_raw, list):
        visual_raw = []
    if not isinstance(related_raw, list):
        related_raw = []

    results: list[dict[str, Any]] = []
    for item in exact_raw:
        if isinstance(item, dict):
            normalized = _normalize_item(item, "exact")
            if normalized:
                results.append(normalized)
    for item in visual_raw:
        if isinstance(item, dict):
            normalized = _normalize_item(item, "visual")
            if normalized:
                results.append(normalized)
    for item in related_raw:
        if isinstance(item, dict):
            normalized = _normalize_item(item, "related")
            if normalized:
                results.append(normalized)

    # De-dupe by link while preserving exact-before-visual order
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for row in results:
        key_link = row["link"]
        if key_link in seen:
            continue
        seen.add(key_link)
        unique.append(row)

    unique = unique[:_MAX_RESULTS]
    exact_count = sum(1 for r in unique if r["match_type"] == "exact")
    visual_count = sum(1 for r in unique if r["match_type"] == "visual")
    related_count = sum(1 for r in unique if r["match_type"] == "related")
    total = len(unique)

    if total == 0:
        return _empty_payload(status="empty")

    return {
        "status": "ok",
        "total_count": total,
        "exact_count": exact_count,
        "visual_count": visual_count,
        "related_count": related_count,
        "results": unique,
        "error": None,
        "disclaimer": ONLINE_SEARCH_DISCLAIMER,
    }
