# helpers.py

from datetime import datetime, timezone
import hashlib
import hmac
import os
import uuid

from firebase_config import db
from schemas import UserResponse

audit_logs_ref = db.collection("audit_logs")

def now_iso() -> str:
    """Return current UTC time as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()

def generate_id(prefix: str) -> str:
    """Generate a short unique ID with a prefix (e.g., U001, R001)."""
    return f"{prefix}{uuid.uuid4().hex[:8].upper()}"

def hash_password(password: str) -> str:
    """Return a salted PBKDF2-SHA256 hash as 'pbkdf2_sha256$iterations$salt$hash'."""
    iterations = 600_000
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    """Check a password against hash_password() output; False if no hash is stored."""
    try:
        scheme, iterations, salt, expected = (stored or "").split("$")
        if scheme != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt), int(iterations)
        )
    except ValueError:
        return False
    return hmac.compare_digest(digest.hex(), expected)


def user_from_doc(doc_id: str, data: dict | None = None) -> UserResponse:
    """Build a UserResponse from a Firestore user document."""
    data = data or {}
    return UserResponse(
        id=doc_id,
        user_id=data.get("user_id") or doc_id,
        email=data.get("email") or "",
        display_name=data.get("display_name"),
        first_name=data.get("first_name") or "",
        last_name=data.get("last_name") or "",
        phone=data.get("phone") or data.get("phone_number") or data.get("phoneNumber") or "",
        auth_provider=data.get("auth_provider") or "local",
        created_at=data.get("created_at") or "",
        metadata=data.get("metadata") or {},
    )


def log_event(
    event_type: str,
    description: str,
    user_id: str | None = None,
    meta: dict | None = None
) -> None:
    """Write an entry to the audit log collection."""
    doc = {
        "log_id": generate_id("L"),
        "user_id": user_id,
        "event_type": event_type,
        "event_description": description,
        "timestamp": now_iso(),
        "metadata": meta or {}
    }
    audit_logs_ref.add(doc)