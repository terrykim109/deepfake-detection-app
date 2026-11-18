from __future__ import annotations

from typing import Any

from firebase_config import db
from helpers import generate_id, now_iso

analysis_requests_ref = db.collection("analysis_requests")


def create_analysis_request(user_id: str) -> str:
    request_id = generate_id("A")
    started_at = now_iso()
    analysis_requests_ref.document(request_id).set(
        {
            "requestId": request_id,
            "userId": user_id,
            "status": "processing",
            "createdAt": started_at,
            "startedAt": started_at,
            "completedAt": None,
        }
    )
    return request_id


def complete_analysis_request(
    request_id: str,
    *,
    status: str,
    confidence: int | None = None,
    error: str | None = None,
    provider: str | None = None,
    reverse_search_status: str | None = None,
    forensics_status: str | None = None,
    diagnostic_error: str | None = None,
) -> None:
    payload: dict[str, Any] = {
        "status": status,
        "completedAt": now_iso(),
    }
    if confidence is not None:
        payload["confidence"] = confidence
    if error:
        payload["error"] = error[:500]
    if provider:
        payload["provider"] = provider[:100]
    if reverse_search_status:
        payload["reverseSearchStatus"] = (
            "completed"
            if str(reverse_search_status).lower() in {"ok", "empty", "success", "completed"}
            else reverse_search_status[:100]
        )
    if forensics_status:
        payload["forensicsStatus"] = (
            "completed"
            if str(forensics_status).lower() in {"ok", "success", "completed"}
            else forensics_status[:100]
        )
    if diagnostic_error:
        payload["diagnosticError"] = diagnostic_error[:1500]
    analysis_requests_ref.document(request_id).set(payload, merge=True)
