#backend/schemas.py

from pydantic import BaseModel, ConfigDict, Field
from typing import Any, Literal

# User creation schema
class UserCreate(BaseModel):
    email: str 
    password: str = Field(..., min_length=12)
    display_name: str | None = None

# User login schema
class UserLogin(BaseModel):
    email: str
    password: str

# Logout schema (frontend sends user_id in the JSON body)
class LogoutRequest(BaseModel):
    user_id: str | None = None

# Profile update schema
class ProfileUpdate(BaseModel):
    first_name: str = ""
    last_name: str = ""
    email: str = ""
    phone: str = ""


# Sync Firebase Auth user into Firestore profiles
class UserSync(BaseModel):
    user_id: str
    email: str = ""
    display_name: str | None = None
    auth_provider: str = "firebase"


# User response schema
class UserResponse(BaseModel):
    """Response body for authenticated user data."""
    model_config = ConfigDict(extra="ignore")

    id: str
    user_id: str
    email: str
    display_name: str | None = None
    first_name: str = ""
    last_name: str = ""
    phone: str = ""
    auth_provider: str
    created_at: str
    metadata: dict[str, Any] = Field(default_factory=dict)

# Token response schema
class TokenResponse(BaseModel):
    """Response body for successful login/signup."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ---------------------------------------------------------------------------
# Analysis result contract (consumed by frontend/src/api/client.ts
# AnalysisRunResponse and mapped to detection/detector.ts Detection)
# ---------------------------------------------------------------------------

# Result state of a completed analysis:
#   real = likely authentic, warn = inconclusive, fake = likely manipulated.
# A failed analysis never produces a result; it returns an HTTP error instead.
ResultState = Literal["real", "warn", "fake"]


class AnalysisResult(BaseModel):
    """One completed analysis, as shown on the Results screen."""
    model_config = ConfigDict(extra="forbid")

    id: str
    verdict: ResultState
    verdict_label: str = Field(..., min_length=1)
    confidence: int = Field(..., ge=0, le=100)  # percent, 0–100
    summary: str = Field(..., min_length=1)  # plain-language explanation
    file_name: str
    created_at: str
    provider: str


class AnalysisUsage(BaseModel):
    """Per-user quota snapshot (analysis_limits.get_usage)."""
    user_id: str
    active: bool
    request_timestamps: list[str]
    count_24h: int
    max_24h: int
    remaining_24h: int


class AnalysisPrivacy(BaseModel):
    """Confirms the original image was deleted after analysis."""
    image_deleted: bool
    temporary_only: bool
    message: str
    stored_at: str | None = None
    deleted_at: str | None = None
    lifetime_seconds: float | None = None


class AnalysisRunResponse(BaseModel):
    """Response body for POST /api/analysis/run."""
    ok: Literal[True] = True
    status: Literal["completed"] = "completed"
    result: AnalysisResult
    image: dict[str, Any]
    privacy: AnalysisPrivacy
    usage: AnalysisUsage
    provider: str
