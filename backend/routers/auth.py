from fastapi import APIRouter, HTTPException, status, Request
from google.cloud.firestore_v1.base_query import FieldFilter
from firebase_config import db

from schemas import LogoutRequest, UserCreate, UserLogin, UserResponse, TokenResponse
from helpers import generate_id, hash_password, now_iso, log_event, user_from_doc, verify_password
from config import SESSION_TIMEOUT_MINUTES

router = APIRouter(tags=["auth"])

users_ref = db.collection("users")

@router.options("/auth/login")
async def options_login(request: Request):
    return {}

@router.options("/auth/signup")
async def options_signup(request: Request):
    return {}


@router.get("/auth/session-config")
async def session_config():
    """Expose inactivity timeout so the frontend can match the backend."""
    return {"timeout_minutes": SESSION_TIMEOUT_MINUTES}


@router.post("/auth/signup", response_model=TokenResponse)
async def signup(body: UserCreate):
    existing = users_ref.where(filter=FieldFilter("email", "==", body.email)).limit(1).get()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists. Please log in instead."
        )

    user_id = generate_id("U")
    user_doc = {
        "user_id": user_id,
        "email": body.email,
        "display_name": body.display_name or body.email.split("@")[0],
        "first_name": "",
        "last_name": "",
        "phone": "",
        "auth_provider": "local",
        "password_hash": hash_password(body.password),
        "created_at": now_iso(),
        "metadata": {"source": "signup"}
    }
    users_ref.document(user_id).set(user_doc)

    log_event("auth_signup", f"User {user_id} created", user_id)

    return TokenResponse(
        access_token=f"mock_token_{user_id}",
        user=user_from_doc(user_id, user_doc)
    )


@router.post("/auth/login", response_model=TokenResponse)
async def login(body: UserLogin):
    docs = users_ref.where(filter=FieldFilter("email", "==", body.email)).limit(1).get()
    user_doc = (docs[0].to_dict() or {}) if docs else {}
    # Same error for unknown email and wrong password; Firebase-only
    # accounts have no password_hash and must sign in through Firebase
    if not docs or not verify_password(body.password, user_doc.get("password_hash")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. Please try again."
        )

    snap = docs[0]
    # Use the Firestore document ID so later profile writes hit the same doc
    user_id = snap.id

    log_event("auth_login", f"User {user_id} logged in", user_id)

    return TokenResponse(
        access_token=f"mock_token_{user_id}",
        user=user_from_doc(user_id, {**user_doc, "user_id": user_id})
    )


@router.post("/auth/logout")
async def logout(body: LogoutRequest | None = None, user_id: str | None = None):
    user_id = user_id or (body.user_id if body else None)
    if user_id:
        log_event("auth_logout", f"User {user_id} logged out", user_id)
    return {"message": "Logged out successfully"}


@router.get("/auth/me", response_model=UserResponse)
async def get_current_user(user_id: str):
    doc = users_ref.document(user_id).get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    data = doc.to_dict() or {}
    return user_from_doc(doc.id, {**data, "user_id": doc.id})
