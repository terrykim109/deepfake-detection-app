# Short-lived public image bytes for Scrappa Google Lens (token-gated, no auth cookie).

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from temp_images import get_temp_meta, read_temp_bytes

router = APIRouter(tags=["public"])


@router.get("/public/lens-image/{image_id}")
async def serve_lens_image(image_id: str, t: str = Query(..., min_length=16)):
    """
    Serve a temporary upload so Scrappa can fetch it over HTTPS.
    Requires the one-time access token issued at store time. Bytes are deleted
    as soon as analysis finishes (or within the 60s TTL).
    """
    iid = (image_id or "").strip()
    token = (t or "").strip()
    if not iid or not token:
        raise HTTPException(status_code=404, detail="Not found")

    meta = get_temp_meta(iid)
    if not meta or meta.get("deleted_at"):
        raise HTTPException(status_code=404, detail="Not found")

    expected = meta.get("access_token") or ""
    # Constant-time compare when lengths match; otherwise reject
    if len(expected) != len(token) or not _tokens_equal(expected, token):
        raise HTTPException(status_code=404, detail="Not found")

    data = read_temp_bytes(iid)
    if data is None:
        raise HTTPException(status_code=404, detail="Not found")

    media = meta.get("content_type") or "application/octet-stream"
    return Response(
        content=data,
        media_type=media,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "X-Robots-Tag": "noindex, nofollow",
        },
    )


def _tokens_equal(a: str, b: str) -> bool:
    import hmac

    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))
