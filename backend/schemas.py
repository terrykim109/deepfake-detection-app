#backend/schemas.py

from pydantic import BaseModel, ConfigDict, Field
from typing import Any

# User creation schema
class UserCreate(BaseModel):
    email: str 
    password: str = Field(..., min_length=6)
    display_name: str | None = None

# User login schema
class UserLogin(BaseModel):
    email: str
    password: str

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