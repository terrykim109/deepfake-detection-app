from __future__ import annotations

from typing import Any

from forensics.c2pa import check_c2pa
from forensics.ela import generate_ela
from forensics.metadata import extract_metadata
from forensics.noise import analyze_noise


def run_forensics(image_bytes: bytes, filename: str | None = None) -> dict[str, Any]:
    return {
        "metadata": _safe(extract_metadata, image_bytes),
        "ela": _safe(generate_ela, image_bytes),
        "noise": _safe(analyze_noise, image_bytes),
        "c2pa": _safe(check_c2pa, image_bytes),
    }


def _safe(fn, image_bytes: bytes) -> dict[str, Any]:
    try:
        return fn(image_bytes)
    except Exception as exc:
        return {"available": False, "error": str(exc)}
