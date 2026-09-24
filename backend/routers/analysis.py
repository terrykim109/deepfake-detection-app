from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from analysis_limits import (
    check_can_start,
    get_usage,
    mark_analysis_finished,
    mark_analysis_started,
)
from detection import DetectionError, get_detector
from helpers import generate_id, log_event, now_iso
from temp_images import delete_temp_image, get_temp_meta, store_temp_image
from upload_validation import validate_image_upload

router = APIRouter(tags=["analysis"])

_VALID_OUTCOMES = {"success", "failure", "cancelled"}


def _require_user(user_id: str | None) -> str:
    uid = (user_id or "").strip()
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please log in before uploading an image for analysis.",
        )
    return uid


@router.get("/analysis/usage")
async def analysis_usage(user_id: str):
    return get_usage(_require_user(user_id))


@router.post("/analysis/validate")
async def validate_upload(
    user_id: str = Form(...),
    file: UploadFile = File(...),
):
    """Validate one image + quota without storing or running the model."""
    uid = _require_user(user_id)
    data = await file.read()
    message = validate_image_upload(
        filename=file.filename,
        content_type=file.content_type,
        size=len(data),
        data=data,
    )
    if message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    limit_msg = check_can_start(uid)
    if limit_msg:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=limit_msg)

    return {
        "ok": True,
        "status": "validated",
        "filename": file.filename,
        "size": len(data),
        "content_type": file.content_type,
        "usage": get_usage(uid),
    }


@router.post("/analysis/run")
async def run_analysis(
    user_id: str = Form(...),
    file: UploadFile = File(...),
):
    """
    DFD-02 end-to-end: validate → temp store → detect → delete → return result.

    One request represents one analysis for the authenticated user.
    The temporary image is deleted on success, provider failure, or unexpected errors.
    """
    uid = _require_user(user_id)
    data = await file.read()
    filename = file.filename
    content_type = file.content_type

    message = validate_image_upload(
        filename=filename,
        content_type=content_type,
        size=len(data),
        data=data,
    )
    if message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    limit_msg = check_can_start(uid)
    if limit_msg:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=limit_msg)

    image_id: str | None = None
    try:
        mark_analysis_started(uid)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc

    try:
        stored = store_temp_image(
            user_id=uid,
            filename=filename,
            content_type=content_type,
            data=data,
        )
        image_id = stored["image_id"]
    except Exception as exc:
        mark_analysis_finished(uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "We could not prepare your image for analysis. "
                "Nothing was kept on our servers — please try uploading again in a moment."
            ),
        ) from exc

    detector = get_detector()
    try:
        detection = detector.analyze(
            image_bytes=data,
            filename=filename,
            content_type=content_type,
        )
    except DetectionError as exc:
        deletion = delete_temp_image(image_id, reason="analysis_failure")
        mark_analysis_finished(uid)
        try:
            log_event("analysis_failed", exc.message, uid, {"image_id": image_id, "provider": detector.name})
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                f"{exc.message} Your original image has been deleted. "
                "Please try uploading again when the service is available."
            ),
        ) from exc
    except Exception as exc:
        deletion = delete_temp_image(image_id, reason="analysis_failure")
        mark_analysis_finished(uid)
        try:
            log_event("analysis_failed", str(exc), uid, {"image_id": image_id})
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "The analysis service could not complete this request. "
                "Your original image has been deleted — please try uploading again."
            ),
        ) from exc

    deletion = delete_temp_image(image_id, reason="analysis_success")
    usage = mark_analysis_finished(uid)
    result_id = generate_id("R")

    try:
        log_event(
            "analysis_success",
            f"Analysis {result_id} completed via {detection.provider}",
            uid,
            {"image_id": image_id, "verdict": detection.verdict, "confidence": detection.confidence},
        )
    except Exception:
        pass

    return {
        "ok": True,
        "status": "completed",
        "result": {
            "id": result_id,
            "verdict": detection.verdict,
            "verdict_label": detection.verdict_label,
            "confidence": detection.confidence,
            "summary": detection.summary,
            "file_name": filename or "upload",
            "created_at": now_iso(),
            "provider": detection.provider,
        },
        "image": deletion,
        "privacy": {
            "image_deleted": True,
            "temporary_only": True,
            "message": (
                "Your original image has been deleted from our servers. "
                "Only the analysis result was kept for this screen — you can upload again anytime."
            ),
            "stored_at": deletion.get("stored_at"),
            "deleted_at": deletion.get("deleted_at"),
            "lifetime_seconds": deletion.get("lifetime_seconds"),
        },
        "usage": usage,
        "provider": detection.provider,
    }


@router.post("/analysis/start")
async def start_analysis(
    user_id: str = Form(...),
    file: UploadFile = File(...),
):
    """Validate, store temporarily, and mark analysis active (legacy/stepwise path)."""
    uid = _require_user(user_id)
    data = await file.read()
    message = validate_image_upload(
        filename=file.filename,
        content_type=file.content_type,
        size=len(data),
        data=data,
    )
    if message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    limit_msg = check_can_start(uid)
    if limit_msg:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=limit_msg)

    try:
        usage = mark_analysis_started(uid)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc

    try:
        stored = store_temp_image(
            user_id=uid,
            filename=file.filename,
            content_type=file.content_type,
            data=data,
        )
    except Exception as exc:
        mark_analysis_finished(uid)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "We could not store your image for analysis. "
                "Nothing was kept on our servers — please try uploading again in a moment."
            ),
        ) from exc

    return {
        "ok": True,
        "status": "processing",
        "usage": usage,
        "image": stored,
        "privacy": {
            "temporary_only": True,
            "max_retention_seconds": stored["max_retention_seconds"],
            "message": (
                "Your image is stored only for this analysis and will be deleted "
                "within 60 seconds — including if analysis fails or is cancelled."
            ),
        },
    }


@router.post("/analysis/finish")
async def finish_analysis(
    user_id: str = Form(...),
    image_id: str = Form(...),
    outcome: str = Form("success"),
):
    """End an analysis and delete the temporary image immediately."""
    uid = _require_user(user_id)
    iid = (image_id or "").strip()
    result = (outcome or "success").strip().lower()
    if result not in _VALID_OUTCOMES:
        result = "failure"

    if not iid:
        raise HTTPException(status_code=400, detail="Missing temporary image id.")

    meta = get_temp_meta(iid)
    if meta and meta.get("user_id") and meta["user_id"] != uid:
        raise HTTPException(status_code=403, detail="That image does not belong to this account.")

    deletion = delete_temp_image(iid, reason=f"analysis_{result}")
    usage = mark_analysis_finished(uid)

    privacy_message = (
        "Your original image has been deleted from our servers. "
        "Only the analysis result was kept for this screen — you can upload again anytime."
    )
    if result == "failure":
        privacy_message = (
            "Analysis could not be completed. Your original image has been deleted. "
            "Please try uploading again when the service is available."
        )
    elif result == "cancelled":
        privacy_message = (
            "Analysis was cancelled. Your original image has been deleted. "
            "You can upload another image whenever you are ready."
        )

    return {
        "ok": True,
        "status": result,
        "outcome": result,
        "usage": usage,
        "image": deletion,
        "privacy": {
            "image_deleted": True,
            "message": privacy_message,
            "stored_at": deletion.get("stored_at"),
            "deleted_at": deletion.get("deleted_at"),
            "lifetime_seconds": deletion.get("lifetime_seconds"),
        },
    }


@router.get("/analysis/temp/{image_id}")
async def temp_image_status(image_id: str, user_id: str):
    """Inspect temp-image timestamps (for deletion verification / debugging)."""
    uid = _require_user(user_id)
    meta = get_temp_meta(image_id)
    if not meta or (meta.get("user_id") and meta["user_id"] != uid):
        raise HTTPException(status_code=404, detail="Temporary image not found.")
    exists_on_disk = False
    try:
        from pathlib import Path

        exists_on_disk = Path(meta.get("path") or "").exists() and not meta.get("deleted_at")
    except OSError:
        exists_on_disk = False
    return {
        "image_id": meta.get("image_id"),
        "stored_at": meta.get("stored_at"),
        "delete_by": meta.get("delete_by"),
        "deleted_at": meta.get("deleted_at"),
        "delete_reason": meta.get("delete_reason"),
        "retrievable": exists_on_disk,
    }
