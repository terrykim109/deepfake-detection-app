from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from firebase_admin import auth
from firebase_config import db
from pydantic import ValidationError

from admin_metrics import aggregate_analysis_requests, aggregate_daily_metrics
from analysis_tracking import analysis_requests_ref
from auth_dependency import require_admin
from content_store import (
    VALID_PAGES,
    get_admin_record,
    publish_draft,
    save_draft,
    validate_page_id,
)
from helpers import log_event
from schemas import SiteContentDraftBody

router = APIRouter(prefix="/admin", tags=["admin"])


def _documents(collection: Any) -> list[dict[str, Any]]:
    documents = []
    for doc in collection.stream():
        data = doc.to_dict() or {}
        data.setdefault("requestId", doc.id)
        documents.append(data)
    return documents


@router.get("/usage")
async def admin_usage(
    interval: str = Query("daily"),
    user: dict = Depends(require_admin),
):
    del user
    if interval not in {"daily", "weekly", "monthly"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="interval must be daily, weekly, or monthly",
        )
    daily_metrics = _documents(db.collection("adminMetrics"))
    if daily_metrics:
        return aggregate_daily_metrics(daily_metrics, interval=interval)
    return aggregate_analysis_requests(_documents(analysis_requests_ref), interval=interval)


@router.get("/analyses")
async def admin_analyses(user: dict = Depends(require_admin)):
    del user
    analyses = []
    for record in _documents(analysis_requests_ref):
        request_id = record.get("requestId")
        if not request_id:
            continue
        analyses.append(
            {
                "requestId": request_id,
                "userId": record.get("userId", ""),
                "status": str(record.get("status", "")).lower(),
                "createdAt": record.get("createdAt"),
                "completedAt": record.get("completedAt"),
                "confidence": record.get("confidence"),
                "error": record.get("error"),
                "startedAt": record.get("startedAt"),
                "provider": record.get("provider"),
                "reverseSearchStatus": record.get("reverseSearchStatus"),
                "forensicsStatus": record.get("forensicsStatus"),
                "diagnosticError": record.get("diagnosticError"),
            }
        )
    analyses.sort(
        key=lambda item: item["completedAt"] or item["createdAt"] or "",
        reverse=True,
    )
    return {"analyses": analyses}


@router.get("/analyses/{request_id}")
async def admin_analysis_detail(
    request_id: str,
    user: dict = Depends(require_admin),
):
    del user
    for record in _documents(analysis_requests_ref):
        if record.get("requestId") == request_id:
            user_id = record.get("userId", "")
            email = ""
            if user_id:
                try:
                    account = auth.get_user(user_id)
                    email = account.email or ""
                except Exception:
                    email = ""
            return {
                "requestId": request_id,
                "userId": user_id,
                "email": email,
                "status": str(record.get("status", "")).lower(),
                "startedAt": record.get("startedAt"),
                "createdAt": record.get("createdAt"),
                "completedAt": record.get("completedAt"),
                "confidence": record.get("confidence"),
                "error": record.get("error"),
                "provider": record.get("provider"),
                "reverseSearchStatus": record.get("reverseSearchStatus"),
                "forensicsStatus": record.get("forensicsStatus"),
                "diagnosticError": record.get("diagnosticError"),
            }
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Analysis not found.",
    )


@router.get("/users")
async def admin_users(user: dict = Depends(require_admin)):
    del user
    profiles = {
        doc.id: doc.to_dict() or {}
        for doc in db.collection("users").stream()
    }
    users: list[dict[str, Any]] = []
    page = auth.list_users()
    while page:
        for account in page.users:
            profile = profiles.get(account.uid, {})
            created_at = _creation_time(account)
            last_login = _last_login_time(account)
            claims = account.custom_claims or {}
            users.append(
                {
                    "userId": account.uid,
                    "email": account.email or profile.get("email") or "",
                    "displayName": account.display_name or profile.get("display_name"),
                    "createdAt": created_at,
                    "lastLogin": last_login,
                    "isVerified": bool(account.email_verified),
                    "role": "admin" if claims.get("admin") is True else "user",
                    "status": "disabled" if getattr(account, "disabled", False) else "active",
                }
            )
        page = page.get_next_page()

    users.sort(key=lambda item: (item["createdAt"] or "", item["userId"]))
    verified = sum(1 for account in users if account["isVerified"])
    return {
        "totalUsers": len(users),
        "verifiedUsers": verified,
        "unverifiedUsers": len(users) - verified,
        "users": users,
    }


def _creation_time(account: Any) -> str | None:
    metadata = getattr(account, "user_metadata", None)
    timestamp = getattr(metadata, "creation_timestamp", None)
    if timestamp is None:
        return None
    try:
        from datetime import datetime, timezone

        return datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OSError):
        return None


def _last_login_time(account: Any) -> str | None:
    metadata = getattr(account, "user_metadata", None)
    timestamp = getattr(metadata, "last_sign_in_timestamp", None)
    if timestamp is None:
        return None
    try:
        from datetime import datetime, timezone

        return datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OSError):
        return None


def _require_known_page(page_id: str) -> str:
    if page_id not in VALID_PAGES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown page")
    return validate_page_id(page_id)


@router.get("/content/{page_id}")
async def admin_get_content(page_id: str, user: dict = Depends(require_admin)):
    """Admin-only: draft + publication metadata (never exposed on public routes)."""
    del user
    return get_admin_record(_require_known_page(page_id))


@router.put("/content/{page_id}/draft")
async def admin_save_content_draft(
    page_id: str,
    body: SiteContentDraftBody,
    user: dict = Depends(require_admin),
):
    """Save draft only — does not change the public published document."""
    known = _require_known_page(page_id)
    try:
        record = save_draft(known, body.content)
    except (ValueError, ValidationError) as exc:
        detail = (
            "; ".join(err["msg"] for err in exc.errors())
            if isinstance(exc, ValidationError)
            else str(exc)
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        ) from exc
    log_event(
        "content_draft_saved",
        f"Saved draft for {known}",
        user_id=user.get("uid"),
        meta={"pageId": known},
    )
    return record


@router.post("/content/{page_id}/publish")
async def admin_publish_content(page_id: str, user: dict = Depends(require_admin)):
    """Publish the current draft atomically (previous published stays until write succeeds)."""
    known = _require_known_page(page_id)
    try:
        record = publish_draft(known)
    except (ValueError, ValidationError) as exc:
        detail = (
            "; ".join(err["msg"] for err in exc.errors())
            if isinstance(exc, ValidationError)
            else str(exc)
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        ) from exc
    log_event(
        "content_published",
        f"Published content for {known}",
        user_id=user.get("uid"),
        meta={"pageId": known, "publishedAt": record.get("publishedAt")},
    )
    return record
