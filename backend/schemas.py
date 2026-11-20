#backend/schemas.py

from pydantic import BaseModel, ConfigDict, Field
from typing import Any


# User creation schema
class UserCreate(BaseModel):
    email: str
    password: str = Field(..., min_length=12)
    display_name: str | None = None


# User login schema
class UserLogin(BaseModel):
    email: str
    password: str


# Profile update schema
class ProfileUpdate(BaseModel):
    username: str = ""
    email: str = ""


# Sync Firebase Auth user into Firestore profiles.
# Identity comes from the verified bearer token; client-supplied user_id is ignored.
class UserSync(BaseModel):
    user_id: str | None = None
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
    username: str = ""
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


# OpenRouter vision-model structured output.
# Soft schema only: ignore extras, allow missing/nullable fields. Parser dumps with exclude_unset=True so missing keys stay missing (original
# data.get("verdict", "") behaviour). Verdict/confidence/summary/findings
# semantics remain in detection.openrouter._parse_model_payload / _parse_findings.
class FindingOutput(BaseModel):
    """One suspicious image region suggested by a vision model."""

    model_config = ConfigDict(extra="ignore")

    label: Any = None
    explanation: Any = None
    x: Any = None
    y: Any = None
    w: Any = None
    h: Any = None


class ModelAnalysisOutput(BaseModel):
    """JSON shape expected from each OpenRouter vision model (lenient)."""

    model_config = ConfigDict(extra="ignore")

    verdict: Any = None
    confidence: Any = None
    summary: Any = None
    findings: Any = None
