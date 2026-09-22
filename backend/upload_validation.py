# upload_validation.py — shared file checks before analysis/provider submission

from pathlib import Path

from config import (
    ALLOWED_IMAGE_EXTENSIONS,
    ALLOWED_IMAGE_MIME_TYPES,
    FORMAT_HELP,
    MAX_UPLOAD_BYTES,
)

# MIME types browsers sometimes send for JPEG
_MIME_ALIASES = {
    "image/jpg": "image/jpeg",
}


def normalize_mime(content_type: str | None) -> str:
    raw = (content_type or "").split(";")[0].strip().lower()
    return _MIME_ALIASES.get(raw, raw)


def extension_of(filename: str | None) -> str:
    return Path(filename or "").suffix.lower()


def looks_like_jpeg(data: bytes) -> bool:
    return len(data) >= 3 and data[:3] == b"\xff\xd8\xff"


def looks_like_png(data: bytes) -> bool:
    return len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n"


def looks_like_webp(data: bytes) -> bool:
    return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"


def magic_matches(mime: str, data: bytes) -> bool:
    if mime == "image/jpeg":
        return looks_like_jpeg(data)
    if mime == "image/png":
        return looks_like_png(data)
    if mime == "image/webp":
        return looks_like_webp(data)
    return False


def validate_image_upload(
    *,
    filename: str | None,
    content_type: str | None,
    size: int,
    data: bytes,
) -> str | None:
    """
    Return a plain-language error message, or None if the upload is acceptable.
    Rejects before any provider/analysis work.
    """
    if size <= 0 or not data:
        return f"That file looks empty. {FORMAT_HELP}"

    if size > MAX_UPLOAD_BYTES:
        return (
            "That image is larger than 10 MB. "
            "Please choose a smaller JPG, JPEG, PNG, or WEBP file and try again."
        )

    ext = extension_of(filename)
    mime = normalize_mime(content_type)

    if ext not in ALLOWED_IMAGE_EXTENSIONS and mime not in ALLOWED_IMAGE_MIME_TYPES:
        return f"That file type is not supported. {FORMAT_HELP}"

    if ext and ext not in ALLOWED_IMAGE_EXTENSIONS:
        return f"That file type is not supported. {FORMAT_HELP}"

    if mime and mime not in ALLOWED_IMAGE_MIME_TYPES:
        # Some browsers send application/octet-stream; fall back to extension + magic
        if mime != "application/octet-stream":
            return f"That file type is not supported. {FORMAT_HELP}"

    inferred = None
    if looks_like_jpeg(data):
        inferred = "image/jpeg"
    elif looks_like_png(data):
        inferred = "image/png"
    elif looks_like_webp(data):
        inferred = "image/webp"

    if inferred is None:
        return (
            "We could not read that image. "
            "It may be damaged or not a real image file. "
            f"{FORMAT_HELP}"
        )

    if ext in ALLOWED_IMAGE_EXTENSIONS:
        expected = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
        }[ext]
        if inferred != expected:
            return (
                "That file does not match its type. "
                f"{FORMAT_HELP}"
            )

    if mime in ALLOWED_IMAGE_MIME_TYPES and not magic_matches(mime, data):
        return (
            "We could not read that image. "
            "It may be damaged or not a real image file. "
            f"{FORMAT_HELP}"
        )

    return None
