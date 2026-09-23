# temp_images.py — temporary upload storage with hard 60s retention (FR-12 / BR-04)

from __future__ import annotations

import json
import shutil
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from config import MAX_TEMP_IMAGE_SECONDS, TEMP_UPLOAD_DIR
from helpers import generate_id, now_iso

_lock = threading.Lock()
_sweeper_started = False


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


def _dir() -> Path:
    root = Path(TEMP_UPLOAD_DIR)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _meta_path(image_id: str) -> Path:
    return _dir() / f"{image_id}.json"


def _file_path(image_id: str, filename: str) -> Path:
    safe = Path(filename or "upload.bin").name
    return _dir() / f"{image_id}__{safe}"


def store_temp_image(
    *,
    user_id: str,
    filename: str | None,
    content_type: str | None,
    data: bytes,
) -> dict:
    """Persist bytes only for analysis; schedule deletion within MAX_TEMP_IMAGE_SECONDS."""
    image_id = generate_id("IMG")
    stored_at = datetime.now(timezone.utc)
    delete_by = stored_at + timedelta(seconds=MAX_TEMP_IMAGE_SECONDS)
    path = _file_path(image_id, filename or "upload.bin")

    with _lock:
        path.write_bytes(data)
        meta = {
            "image_id": image_id,
            "user_id": user_id,
            "filename": filename or path.name,
            "content_type": content_type or "application/octet-stream",
            "size": len(data),
            "path": str(path),
            "stored_at": stored_at.isoformat(),
            "delete_by": delete_by.isoformat(),
            "deleted_at": None,
            "delete_reason": None,
        }
        _meta_path(image_id).write_text(json.dumps(meta), encoding="utf-8")

    # Hard deadline: delete even if the client never calls finish
    timer = threading.Timer(
        MAX_TEMP_IMAGE_SECONDS,
        lambda: delete_temp_image(image_id, reason="ttl_expired"),
    )
    timer.daemon = True
    timer.start()

    return {
        "image_id": image_id,
        "filename": meta["filename"],
        "size": meta["size"],
        "stored_at": meta["stored_at"],
        "delete_by": meta["delete_by"],
        "max_retention_seconds": MAX_TEMP_IMAGE_SECONDS,
    }


def get_temp_meta(image_id: str) -> dict | None:
    path = _meta_path(image_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def read_temp_bytes(image_id: str) -> bytes | None:
    meta = get_temp_meta(image_id)
    if not meta or meta.get("deleted_at"):
        return None
    path = Path(meta["path"])
    if not path.exists():
        return None
    return path.read_bytes()


def delete_temp_image(image_id: str, *, reason: str) -> dict:
    """
    Delete the temp file immediately. Safe to call more than once.
    Returns storage/deletion timestamps for verification.
    """
    with _lock:
        meta = get_temp_meta(image_id)
        if not meta:
            return {
                "image_id": image_id,
                "deleted": True,
                "already_gone": True,
                "stored_at": None,
                "deleted_at": now_iso(),
                "delete_reason": reason,
                "lifetime_seconds": None,
            }

        if meta.get("deleted_at"):
            return {
                "image_id": image_id,
                "deleted": True,
                "already_gone": True,
                "stored_at": meta.get("stored_at"),
                "deleted_at": meta.get("deleted_at"),
                "delete_reason": meta.get("delete_reason") or reason,
                "delete_by": meta.get("delete_by"),
                "lifetime_seconds": _lifetime_seconds(meta.get("stored_at"), meta.get("deleted_at")),
            }

        path = Path(meta.get("path") or "")
        try:
            if path.exists():
                path.unlink()
        except OSError:
            pass

        deleted_at = now_iso()
        meta["deleted_at"] = deleted_at
        meta["delete_reason"] = reason
        try:
            _meta_path(image_id).write_text(json.dumps(meta), encoding="utf-8")
        except OSError:
            pass

        return {
            "image_id": image_id,
            "deleted": True,
            "already_gone": False,
            "stored_at": meta.get("stored_at"),
            "deleted_at": deleted_at,
            "delete_by": meta.get("delete_by"),
            "delete_reason": reason,
            "lifetime_seconds": _lifetime_seconds(meta.get("stored_at"), deleted_at),
        }


def _lifetime_seconds(stored_at: str | None, deleted_at: str | None) -> float | None:
    start = _parse_iso(stored_at)
    end = _parse_iso(deleted_at)
    if not start or not end:
        return None
    return max(0.0, (end - start).total_seconds())


def purge_expired_temp_images() -> int:
    """Delete any temp images past delete_by (or missing deadline)."""
    removed = 0
    now = datetime.now(timezone.utc)
    root = _dir()
    for meta_file in root.glob("IMG*.json"):
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if meta.get("deleted_at"):
            continue
        deadline = _parse_iso(meta.get("delete_by")) or now
        if now >= deadline:
            delete_temp_image(meta.get("image_id") or meta_file.stem, reason="ttl_expired")
            removed += 1
    return removed


def start_temp_image_sweeper(interval_seconds: int = 15) -> None:
    """Background purge so abandoned uploads cannot outlive 60 seconds."""
    global _sweeper_started
    if _sweeper_started:
        return
    _sweeper_started = True

    def _loop() -> None:
        while True:
            try:
                purge_expired_temp_images()
            except Exception:
                pass
            threading.Event().wait(interval_seconds)

    thread = threading.Thread(target=_loop, name="temp-image-sweeper", daemon=True)
    thread.start()


def clear_temp_dir_for_tests() -> None:
    root = Path(TEMP_UPLOAD_DIR)
    if root.exists():
        shutil.rmtree(root, ignore_errors=True)
