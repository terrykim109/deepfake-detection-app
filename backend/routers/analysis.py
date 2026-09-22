from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from analysis_limits import (
    check_can_start,
    get_usage,
    mark_analysis_finished,
    mark_analysis_started,
)
from upload_validation import validate_image_upload

router = APIRouter(tags=["analysis"])


@router.get("/analysis/usage")
async def analysis_usage(user_id: str):
    if not (user_id or "").strip():
        raise HTTPException(status_code=400, detail="Sign in to analyze images.")
    return get_usage(user_id.strip())


@router.post("/analysis/validate")
async def validate_upload(
    user_id: str = Form(...),
    file: UploadFile = File(...),
):
    """
    Validate one image upload and quota rules before analysis/provider work.
    Does not start an analysis or consume a quota slot.
    """
    uid = (user_id or "").strip()
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please log in before uploading an image for analysis.",
        )

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

    usage = get_usage(uid)
    return {
        "ok": True,
        "filename": file.filename,
        "size": len(data),
        "content_type": file.content_type,
        "usage": usage,
    }


@router.post("/analysis/start")
async def start_analysis(user_id: str = Form(...)):
    uid = (user_id or "").strip()
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please log in before uploading an image for analysis.",
        )
    try:
        usage = mark_analysis_started(uid)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    return {"ok": True, "usage": usage}


@router.post("/analysis/finish")
async def finish_analysis(user_id: str = Form(...)):
    uid = (user_id or "").strip()
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please log in before uploading an image for analysis.",
        )
    usage = mark_analysis_finished(uid)
    return {"ok": True, "usage": usage}
