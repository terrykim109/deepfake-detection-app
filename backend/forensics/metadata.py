from __future__ import annotations

import io
from typing import Any

import exifread
from PIL import ExifTags, Image


def extract_metadata(image_bytes: bytes) -> dict[str, Any]:
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            file_info = {
                "format": img.format,
                "width": img.width,
                "height": img.height,
                "mode": img.mode,
            }

            exif_tags: dict[str, Any] = {}
            for tag_id, value in img.getexif().items():
                tag_name = ExifTags.TAGS.get(tag_id, str(tag_id))
                exif_tags[tag_name] = _coerce(value)

        extra_tags, has_gps = _read_with_exifread(image_bytes)
        for tag_name, value in extra_tags.items():
            exif_tags.setdefault(tag_name, value)

        return {
            "available": True,
            "file_info": file_info,
            "exif": exif_tags,
            "has_gps": has_gps,
            "software": exif_tags.get("Software"),
            "camera_make": exif_tags.get("Make"),
            "camera_model": exif_tags.get("Model"),
            "date_taken": exif_tags.get("DateTimeOriginal") or exif_tags.get("DateTime"),
        }
    except Exception as exc:
        return {"available": False, "error": str(exc)}


def _read_with_exifread(image_bytes: bytes) -> tuple[dict[str, Any], bool]:
    try:
        tags = exifread.process_file(io.BytesIO(image_bytes), details=False)
    except Exception:
        return {}, False

    result: dict[str, Any] = {}
    has_gps = False
    for key, value in tags.items():
        if key in ("JPEGThumbnail", "TIFFThumbnail"):
            continue
        if key.startswith("GPS"):
            has_gps = True
        tag_name = key.split(" ", 1)[-1]
        result[tag_name] = _coerce(str(value))
    return result, has_gps


def _coerce(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.decode(errors="replace")
    if isinstance(value, (list, tuple)):
        return [_coerce(v) for v in value]
    if isinstance(value, (int, float, str)) or value is None:
        return value
    return str(value)
