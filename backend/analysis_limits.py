# analysis_limits.py — one active analysis + rolling 24h quota per user

from datetime import datetime, timedelta, timezone

from firebase_config import db
from config import MAX_ACTIVE_ANALYSES_PER_USER, MAX_ANALYSES_PER_24H
from helpers import now_iso

usage_ref = db.collection("analysis_usage")


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _prune(timestamps: list[str], *, now: datetime) -> list[str]:
    cutoff = now - timedelta(hours=24)
    kept: list[str] = []
    for stamp in timestamps:
        dt = _parse_iso(stamp)
        if dt and dt >= cutoff:
            kept.append(stamp)
    return kept


def get_usage(user_id: str) -> dict:
    snap = usage_ref.document(user_id).get()
    data = snap.to_dict() if snap.exists else {}
    now = datetime.now(timezone.utc)
    stamps = _prune(list(data.get("request_timestamps") or []), now=now)
    return {
        "user_id": user_id,
        "active": bool(data.get("active")),
        "request_timestamps": stamps,
        "count_24h": len(stamps),
        "max_24h": MAX_ANALYSES_PER_24H,
        "remaining_24h": max(0, MAX_ANALYSES_PER_24H - len(stamps)),
    }


def check_can_start(user_id: str) -> str | None:
    """Return a plain-language block reason, or None if analysis may start."""
    usage = get_usage(user_id)
    if usage["active"] and MAX_ACTIVE_ANALYSES_PER_USER <= 1:
        return (
            "You already have an analysis in progress. "
            "Please wait for it to finish before uploading another image."
        )
    if usage["count_24h"] >= MAX_ANALYSES_PER_24H:
        return (
            "You have reached the limit of 20 analyses in the last 24 hours. "
            "Please try again later."
        )
    return None


def mark_analysis_started(user_id: str) -> dict:
    reason = check_can_start(user_id)
    if reason:
        raise ValueError(reason)

    usage = get_usage(user_id)
    stamps = list(usage["request_timestamps"])
    stamps.append(now_iso())
    payload = {
        "user_id": user_id,
        "active": True,
        "request_timestamps": stamps,
        "updated_at": now_iso(),
    }
    usage_ref.document(user_id).set(payload, merge=True)
    return get_usage(user_id)


def mark_analysis_finished(user_id: str) -> dict:
    usage = get_usage(user_id)
    usage_ref.document(user_id).set(
        {
            "user_id": user_id,
            "active": False,
            "request_timestamps": usage["request_timestamps"],
            "updated_at": now_iso(),
        },
        merge=True,
    )
    return get_usage(user_id)
