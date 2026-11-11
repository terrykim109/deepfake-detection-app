from fastapi import APIRouter, Depends, HTTPException, status
from firebase_config import db
from helpers import now_iso, log_event, user_from_doc
from schemas import ProfileUpdate, UserResponse, UserSync
from auth_dependency import get_current_user
from usernames import (
    USERNAME_RULE,
    USERNAME_TAKEN,
    UsernameTaken,
    claim_username,
    is_username_free,
    is_valid_username,
)

router = APIRouter(tags=["users"])
users_ref = db.collection("users")


@router.post("/users/sync", response_model=UserResponse)
async def sync_user(body: UserSync, user: dict = Depends(get_current_user)):
    """Create or refresh a Firestore profile for the authenticated Firebase user."""
    user_id = user["uid"]
    body_uid = (body.user_id or "").strip()
    if body_uid and body_uid != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot sync a different user's profile",
        )

    doc_ref = users_ref.document(user_id)
    existing = doc_ref.get()
    existing_data = existing.to_dict() if existing.exists else {}

    names = (body.display_name or "").strip().split(" ", 1)
    first_name = existing_data.get("first_name") or (names[0] if names and names[0] else "")
    last_name = existing_data.get("last_name") or (names[1] if len(names) > 1 else "")
    email = (body.email or "").strip() or existing_data.get("email") or ""
    display_name = (
        existing_data.get("username")
        or (body.display_name or "").strip()
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

    # The sign-up form puts the chosen username in the Firebase display name.
    # Claim it on the first verified sync; if someone took it in the meantime,
    # the user picks another on Profile.
    candidate = (body.display_name or "").strip()
    if not existing_data.get("username") and is_valid_username(candidate):
        try:
            claim_username(user_id, candidate)
        except UsernameTaken:
            pass
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"Failed to sync user: {exc}") from exc

    try:
        log_event("user_sync", f"Synced Firestore profile for {user_id}", user_id)
    except Exception:
        pass

    fresh = doc_ref.get().to_dict() or {**existing_data, **payload}
    return user_from_doc(user_id, {**fresh, "user_id": user_id})


@router.get("/users/username-available")
async def username_available(username: str):
    """Public check for the sign-up form, which runs before the user has a token."""
    name = username.strip()
    if not is_valid_username(name):
        return {"available": False, "detail": USERNAME_RULE}
    try:
        free = is_username_free(name)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to check username: {exc}") from exc
    return {"available": free, "detail": "" if free else USERNAME_TAKEN}


@router.put("/users/{user_id}/profile", response_model=UserResponse)
async def update_profile(
    user_id: str,
    body: ProfileUpdate,
    user: dict = Depends(get_current_user),
):
    """Update user profile fields in Firestore (creates the doc if missing)."""
    if user_id != user["uid"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update a different user's profile",
        )

    doc_ref = users_ref.document(user_id)
    doc = doc_ref.get()
    existing = doc.to_dict() if doc.exists else {}

    username = (body.username or "").strip()
    if not is_valid_username(username):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=USERNAME_RULE)

    email = (body.email or "").strip() or existing.get("email") or ""

    update_data = {
        "user_id": user_id,
        "email": email,
        "auth_provider": existing.get("auth_provider") or "firebase",
        "updated_at": now_iso(),
    }
    if not doc.exists:
        update_data["created_at"] = now_iso()
        update_data["metadata"] = {"source": "profile_upsert"}

    try:
        claim_username(user_id, username, update_data)
    except UsernameTaken:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=USERNAME_TAKEN)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to save profile: {exc}") from exc

    try:
        log_event("profile_update", f"User {user_id} updated profile", user_id, {"username": username})
    except Exception:
        pass

    fresh = doc_ref.get().to_dict() or {**existing, **update_data}
    return user_from_doc(user_id, {**fresh, "user_id": user_id})
