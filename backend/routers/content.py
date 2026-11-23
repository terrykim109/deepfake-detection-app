"""Public published site-content endpoints (Landing / About)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from content_store import VALID_PAGES, get_published, validate_page_id

router = APIRouter(prefix="/content", tags=["content"])


@router.get("/{page_id}")
async def get_published_content(page_id: str):
    """Return the latest published content for a public page (never draft)."""
    if page_id not in VALID_PAGES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown page")
    return get_published(validate_page_id(page_id))
