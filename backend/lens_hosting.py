# Short-lived public HTTPS image URL for Scrappa (litterbox / tmpfiles fallback).

from __future__ import annotations

from typing import Callable
from urllib.parse import quote, urlparse, urlunparse

import httpx

CleanupFn = Callable[[], None]


def _noop() -> None:
    return None


def _safe_filename(image_id: str, filename: str | None) -> str:
    name = (filename or f"{image_id}.jpg").replace("\\", "/").split("/")[-1].strip()
    # Hosts reject odd names; keep a simple image extension.
    if "." not in name:
        name = f"{name}.jpg"
    stem, _, ext = name.rpartition(".")
    ext = (ext or "jpg").lower()
    if ext not in {"jpg", "jpeg", "png", "webp", "gif"}:
        ext = "jpg"
    stem = "".join(ch for ch in (stem or "image") if ch.isalnum() or ch in "-_")[:40] or "image"
    return f"{stem}.{ext}"


def _direct_tmpfiles_url(page_url: str) -> str:
    parsed = urlparse(page_url.strip())
    parts = [p for p in parsed.path.split("/") if p]
    if parts and parts[0] != "dl":
        parts.insert(0, "dl")
    path = "/" + "/".join(quote(p) for p in parts)
    return urlunparse(("https", parsed.netloc or "tmpfiles.org", path, "", "", ""))


async def _upload_litterbox(name: str, data: bytes, media: str) -> str:
    async with httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=10.0)) as client:
        response = await client.post(
            "https://litterbox.catbox.moe/resources/internals/api.php",
            data={"reqtype": "fileupload", "time": "1h"},
            files={"fileToUpload": (name, data, media)},
        )
    response.raise_for_status()
    url = (response.text or "").strip()
    if not url.startswith("https://"):
        raise RuntimeError(f"litterbox returned unexpected body: {url[:120]}")
    return url


async def _upload_tmpfiles(name: str, data: bytes, media: str) -> str:
    async with httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=10.0)) as client:
        response = await client.post(
            "https://tmpfiles.org/api/v1/upload",
            files={"file": (name, data, media)},
        )
    response.raise_for_status()
    body = response.json()
    page_url = ((body or {}).get("data") or {}).get("url") or ""
    if not page_url:
        raise RuntimeError("tmpfiles upload returned no URL")
    return _direct_tmpfiles_url(str(page_url))


async def publish_for_scrappa(
    *,
    image_id: str,
    data: bytes,
    content_type: str | None,
    access_token: str,
    public_base_url: str,
    filename: str | None = None,
) -> tuple[str, CleanupFn]:
    """
    Upload bytes to a temporary HTTPS host and return (url, cleanup).
    Scrappa cannot fetch localhost — a public HTTPS URL is required.
    """
    name = _safe_filename(image_id, filename)
    media = content_type or "application/octet-stream"
    errors: list[str] = []

    for uploader in (_upload_litterbox, _upload_tmpfiles):
        try:
            url = await uploader(name, data, media)
            return url, _noop
        except Exception as exc:
            errors.append(f"{uploader.__name__}: {type(exc).__name__}")

    base = (public_base_url or "").rstrip("/")
    if base.startswith("https://"):
        fallback = f"{base}/api/public/lens-image/{quote(image_id)}?t={quote(access_token)}"
        return fallback, _noop

    raise RuntimeError(
        "Could not create a public HTTPS image URL for online search. "
        + "; ".join(errors)
    )
