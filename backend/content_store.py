"""Firestore-backed draft/published site content for Landing and About pages."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Literal

import firebase_config

from content_defaults import PAGE_DEFAULTS
from helpers import now_iso
from schemas import AboutContent, LandingContent

PageId = Literal["landing", "about"]
VALID_PAGES: set[str] = {"landing", "about"}

_CONTENT_MODELS = {
    "landing": LandingContent,
    "about": AboutContent,
}


def _site_content_ref():
    return firebase_config.db.collection("site_content")


def validate_page_id(page_id: str) -> PageId:
    if page_id not in VALID_PAGES:
        raise ValueError(f"unknown page: {page_id}")
    return page_id  # type: ignore[return-value]


def default_content(page_id: PageId) -> dict[str, Any]:
    return deepcopy(PAGE_DEFAULTS[page_id])


def normalize_content(page_id: PageId, raw: dict[str, Any] | None) -> dict[str, Any]:
    """Validate and re-serialize content as camelCase JSON-ready dict."""
    model = _CONTENT_MODELS[page_id]
    payload = raw if isinstance(raw, dict) else default_content(page_id)
    parsed = model.model_validate(payload)
    return parsed.model_dump(by_alias=True, mode="json")


def _empty_record(page_id: PageId) -> dict[str, Any]:
    content = default_content(page_id)
    return {
        "pageId": page_id,
        "draft": content,
        "published": None,
        "draftUpdatedAt": None,
        "publishedAt": None,
    }


def _read_doc(page_id: PageId) -> dict[str, Any]:
    snap = _site_content_ref().document(page_id).get()
    if not snap.exists:
        return _empty_record(page_id)
    data = snap.to_dict() or {}
    draft_raw = data.get("draft")
    published_raw = data.get("published")
    draft = normalize_content(page_id, draft_raw if isinstance(draft_raw, dict) else None)
    published = None
    if isinstance(published_raw, dict):
        try:
            published = normalize_content(page_id, published_raw)
        except Exception:
            published = None
    return {
        "pageId": page_id,
        "draft": draft,
        "published": published,
        "draftUpdatedAt": data.get("draftUpdatedAt"),
        "publishedAt": data.get("publishedAt"),
    }


def get_published(page_id: PageId) -> dict[str, Any]:
    """Public payload: published content or code defaults. Never returns draft."""
    record = _read_doc(page_id)
    content = record["published"] if record["published"] is not None else default_content(page_id)
    return {
        "pageId": page_id,
        "content": content,
        "publishedAt": record["publishedAt"],
        "source": "published" if record["published"] is not None else "default",
    }


def get_admin_record(page_id: PageId) -> dict[str, Any]:
    """Admin payload including draft and publication metadata."""
    record = _read_doc(page_id)
    has_published = record["published"] is not None
    return {
        "pageId": page_id,
        "draft": record["draft"],
        "published": record["published"],
        "draftUpdatedAt": record["draftUpdatedAt"],
        "publishedAt": record["publishedAt"],
        "status": "published" if has_published else "unpublished",
        "hasUnpublishedChanges": (
            has_published and record["draft"] != record["published"]
        )
        or (not has_published and record["draftUpdatedAt"] is not None),
    }


def save_draft(page_id: PageId, content: dict[str, Any]) -> dict[str, Any]:
    """Persist draft only — does not modify published content."""
    normalized = normalize_content(page_id, content)
    stamp = now_iso()
    ref = _site_content_ref().document(page_id)
    snap = ref.get()
    existing = snap.to_dict() if snap.exists else {}
    published = existing.get("published") if isinstance(existing, dict) else None
    published_at = existing.get("publishedAt") if isinstance(existing, dict) else None
    # Keep previous published blob untouched.
    ref.set(
        {
            "pageId": page_id,
            "draft": normalized,
            "published": published if isinstance(published, dict) else None,
            "draftUpdatedAt": stamp,
            "publishedAt": published_at,
        },
        merge=False,
    )
    return get_admin_record(page_id)


def publish_draft(page_id: PageId) -> dict[str, Any]:
    """Copy current draft onto published in one write. Failed write leaves public unchanged."""
    record = _read_doc(page_id)
    draft = record["draft"]
    stamp = now_iso()
    # Single document set: published becomes a full copy of draft.
    _site_content_ref().document(page_id).set(
        {
            "pageId": page_id,
            "draft": draft,
            "published": deepcopy(draft),
            "draftUpdatedAt": record["draftUpdatedAt"] or stamp,
            "publishedAt": stamp,
        },
        merge=False,
    )
    return get_admin_record(page_id)
