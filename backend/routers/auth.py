from fastapi import APIRouter, Depends, HTTPException, status
from firebase_config import db

from schemas import UserResponse
from helpers import log_event, user_from_doc
from config import SESSION_TIMEOUT_MINUTES
from auth_dependency import get_current_user

router = APIRouter(tags=["auth"])

users_ref = db.collection("users")


@router.get("/auth/session-config")
async def session_config():
    """Expose inactivity timeout so the frontend can match the backend."""
    return {"timeout_minutes": SESSION_TIMEOUT_MINUTES}


@router.post("/auth/logout")
async def logout(user_id: str | None = None):
    if user_id:
        log_event("auth_logout", f"User {user_id} logged out", user_id)
    return {"message": "Logged out successfully"}


@router.get("/auth/me", response_model=UserResponse)
async def read_me(user: dict = Depends(get_current_user)):
    """Return the Firestore profile for the authenticated Firebase user."""
    user_id = user["uid"]
    doc = users_ref.document(user_id).get()
    if not doc.exists:
        # get_current_user normally upserts; rebuild a minimal profile if needed.
        claims = user.get("claims") or {}
        email = (claims.get("email") or "").strip()
        return user_from_doc(
            user_id,
            {
                "user_id": user_id,
                "email": email,
                "display_name": claims.get("name") or (email.split("@")[0] if email else user_id),
                "auth_provider": "firebase",
                "created_at": "",
            },
        )
    data = doc.to_dict() or {}
    return user_from_doc(doc.id, {**data, "user_id": doc.id})
