from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth
from firebase_config import db
from helpers import now_iso

_bearer = HTTPBearer(auto_error=False)

async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    print(f"[auth] scheme={creds.scheme if creds else None} token_len={len(creds.credentials) if creds else 0}")
   
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    try:
        decoded = auth.verify_id_token(creds.credentials, check_revoked=True)
    except auth.ExpiredIdTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except auth.RevokedIdTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token revoked")
    except auth.InvalidIdTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token verification failed")

    uid = decoded["uid"]

    # Enforce email verification if you want it server-side too
    if not decoded.get("email_verified", False):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Email not verified")

    # Idempotent profile upsert so downstream code always finds a user doc
    user_ref = db.collection("users").document(uid)
    if not user_ref.get().exists:
        user_ref.set({
            "user_id": uid,
            "email": decoded.get("email", ""),
            "display_name": decoded.get("name") or decoded.get("email", "").split("@")[0],
            "auth_provider": decoded.get("firebase", {}).get("sign_in_provider", "firebase"),
            "created_at": now_iso(),
            "metadata": {"source": "token_verify_upsert"},
        }, merge=True)

    return {"uid": uid, "claims": decoded}