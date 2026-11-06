from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from firebase_admin import auth
from firebase_config import db

from admin_metrics import aggregate_analysis_requests, aggregate_daily_metrics
from analysis_tracking import analysis_requests_ref
from auth_dependency import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


def _documents(collection: Any) -> list[dict[str, Any]]:
    return [doc.to_dict() or {} for doc in collection.stream()]


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
    return aggregate_analysis_requests(
        _documents(analysis_requests_ref),
        interval=interval,
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
            claims = account.custom_claims or {}
            users.append(
                {
                    "userId": account.uid,
                    "email": account.email or profile.get("email") or "",
                    "displayName": account.display_name or profile.get("display_name"),
                    "createdAt": created_at,
                    "isVerified": bool(account.email_verified),
                    "role": "admin" if claims.get("admin") is True else "user",
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
