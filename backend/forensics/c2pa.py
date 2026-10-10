from __future__ import annotations

from typing import Any

# C2PA --> a somewhat good indicator to figure out if photo is AI-generated
# AI tools/some cameras use a stamp that could have the following signatures (jumb, c2pa, etc.)
_C2PA_SIGNATURES = (b"jumb", b"c2pa", b"c2ma", b"urn:c2pa")

_CLAIM_GENERATOR_KEY = b'"claim_generator"'


def check_c2pa(image_bytes: bytes) -> dict[str, Any]:
    try:
        found = any(sig in image_bytes for sig in _C2PA_SIGNATURES)

        if not found:
            return {
                "found": False,
                "detail": "No content credentials (C2PA manifest) detected.",
                "claim_generator": None,
            }

        return {
            "found": True,
            "detail": "Possible C2PA content credentials signature detected in the file.",
            "claim_generator": _extract_claim_generator(image_bytes),
        }
    except Exception as exc:
        return {
            "found": False,
            "detail": f"C2PA check failed: {exc}",
            "claim_generator": None,
        }


def _extract_claim_generator(image_bytes: bytes) -> str | None:
    idx = image_bytes.find(_CLAIM_GENERATOR_KEY)
    if idx == -1:
        return None

    snippet = image_bytes[idx : idx + 200].decode("utf-8", errors="ignore")
    colon = snippet.find(":")
    if colon == -1:
        return None

    rest = snippet[colon + 1 :]
    quote_start = rest.find('"')
    if quote_start == -1:
        return None
    quote_end = rest.find('"', quote_start + 1)
    if quote_end == -1:
        return None

    return rest[quote_start + 1 : quote_end]
