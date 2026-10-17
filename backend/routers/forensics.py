from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from auth_dependency import get_current_user
from forensics import run_forensics
from helpers import log_event
from upload_validation import validate_image_upload

router = APIRouter(tags=["forensics"])


# Backend image upload --> use to test 
@router.post("/forensics/run")
async def run_forensics_endpoint(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """
    Independent digital-image-forensics engine: metadata/EXIF, Error Level
    Analysis, noise analysis, and a C2PA content-credentials check.

    Works entirely in-memory from the uploaded bytes — no temp storage,
    no shared quota with /analysis/run, and no dependency on the
    deepfake-detection model.
    """
    uid = user["uid"]
    data = await file.read()
    filename = file.filename

    message = validate_image_upload(
        filename=filename,
        content_type=file.content_type,
        size=len(data),
        data=data,
    )
    if message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    try:
        forensics = run_forensics(data, filename)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="This request could not be completed. Please try again.",
        ) from exc

    try:
        log_event(
            "forensics_success",
            f"Forensics analysis completed for {filename or 'upload'}",
            uid,
            {"filename": filename},
        )
    except Exception:
        pass

    return {
        "ok": True,
        "status": "completed",
        "file_name": filename or "upload",
        "forensics": forensics,
    }
