from fastapi import APIRouter, HTTPException
from firebase_config import db
from helpers import now_iso, log_event, user_from_doc
from schemas import ProfileUpdate, UserResponse, UserSync

router = APIRouter(tags=["users"])
users_ref = db.collection("users")


@router.post("/users/sync", response_model=UserResponse)
async def sync_user(body: UserSync):
    """Create or refresh a Firestore profile for a Firebase Auth user."""
    user_id = (body.user_id or "").strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    doc_ref = users_ref.document(user_id)
    existing = doc_ref.get()
    existing_data = existing.to_dict() if existing.exists else {}

    names = (body.display_name or "").strip().split(" ", 1)
    first_name = existing_data.get("first_name") or (names[0] if names and names[0] else "")
    last_name = existing_data.get("last_name") or (names[1] if len(names) > 1 else "")
    email = (body.email or "").strip() or existing_data.get("email") or ""
    display_name = (
        (body.display_name or "").strip()
        or existing_data.get("display_name")
        or email.split("@")[0]
        or user_id
    )

    payload = {
        "user_id": user_id,
        "email": email,
        "display_name": display_name,
        "first_name": first_name,
        "last_name": last_name,
        "phone": existing_data.get("phone") or existing_data.get("phone_number") or "",
        "auth_provider": body.auth_provider or existing_data.get("auth_provider") or "firebase",
        "updated_at": now_iso(),
    }
    if not existing.exists:
        payload["created_at"] = now_iso()
        payload["metadata"] = {"source": "firebase_auth_sync"}

    try:
        doc_ref.set(payload, merge=True)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to sync user: {exc}") from exc

    try:
        log_event("user_sync", f"Synced Firestore profile for {user_id}", user_id)
    except Exception:
        pass

    fresh = doc_ref.get().to_dict() or {**existing_data, **payload}
    return user_from_doc(user_id, {**fresh, "user_id": user_id})


@router.put("/users/{user_id}/profile", response_model=UserResponse)
async def update_profile(user_id: str, body: ProfileUpdate):
    """Update user profile fields in Firestore (creates the doc if missing)."""
    doc_ref = users_ref.document(user_id)
    doc = doc_ref.get()
    existing = doc.to_dict() if doc.exists else {}

    first_name = (body.first_name or "").strip()
    last_name = (body.last_name or "").strip()
    display_name = f"{first_name} {last_name}".strip() or existing.get("display_name", "")

    phone = (body.phone or "").strip() or existing.get("phone") or ""
    email = (body.email or "").strip() or existing.get("email") or ""

    update_data = {
        "user_id": user_id,
        "first_name": first_name,
        "last_name": last_name,
        "email": email,
        "phone": phone,
        "phone_number": phone,
        "display_name": display_name,
        "auth_provider": existing.get("auth_provider") or "firebase",
        "updated_at": now_iso(),
    }
    if not doc.exists:
        update_data["created_at"] = now_iso()
        update_data["metadata"] = {"source": "profile_upsert"}

    try:
        doc_ref.set(update_data, merge=True)
        print(f"[profile] saved {user_id} phone_len={len(phone)} email_set={bool(email)}")
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to save profile: {exc}") from exc

    try:
        log_event("profile_update", f"User {user_id} updated profile", user_id, {"phone": update_data["phone"]})
    except Exception:
        pass

    fresh = doc_ref.get().to_dict() or {**existing, **update_data}
    return user_from_doc(user_id, {**fresh, "user_id": user_id})
