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


# ─── Public site content (Landing / About CMS) ───
# Text-only / URL references — no raw image bytes in Firestore.


def _safe_href(value: str) -> str:
    text = (value or "").strip()
    if not text:
        return "/"
    lowered = text.lower()
    if lowered.startswith(("javascript:", "data:", "vbscript:")):
        raise ValueError("unsafe link destination")
    if text.startswith("/") or lowered.startswith(("https://", "http://", "mailto:")):
        return text
    raise ValueError("link must be a relative path or http(s) URL")


def _safe_asset_ref(value: str) -> str:
    text = (value or "").strip()
    if not text:
        return ""
    lowered = text.lower()
    if lowered.startswith(("javascript:", "data:", "vbscript:")):
        raise ValueError("unsafe asset reference")
    if text.startswith("/") or lowered.startswith(("https://", "http://")):
        return text
    raise ValueError("asset must be a relative path or http(s) URL")


class LandingStepContent(BaseModel):
    model_config = ConfigDict(extra="ignore")

    icon: str = Field(default="image", max_length=40)
    label: str = Field(..., min_length=1, max_length=200)


class LandingContent(BaseModel):
    """Editable fields for the existing Landing page layout."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    hero_title: str = Field(..., alias="heroTitle", min_length=1, max_length=200)
    hero_tagline: str = Field(..., alias="heroTagline", max_length=500)
    hero_cta_label: str = Field(..., alias="heroCtaLabel", min_length=1, max_length=80)
    hero_cta_href: str = Field(..., alias="heroCtaHref", max_length=500)
    hero_image_src: str = Field(..., alias="heroImageSrc", max_length=1000)
    hero_visible: bool = Field(default=True, alias="heroVisible")
    explainer_lead: str = Field(..., alias="explainerLead", max_length=2000)
    explainer_steps: list[LandingStepContent] = Field(
        ..., alias="explainerSteps", min_length=1, max_length=6
    )
    explainer_cta_label: str = Field(..., alias="explainerCtaLabel", min_length=1, max_length=80)
    explainer_cta_href: str = Field(..., alias="explainerCtaHref", max_length=500)
    explainer_visible: bool = Field(default=True, alias="explainerVisible")
    footer_disclaimer: str = Field(..., alias="footerDisclaimer", max_length=300)
    footer_copyright: str = Field(..., alias="footerCopyright", max_length=200)

    def model_post_init(self, __context: Any) -> None:
        object.__setattr__(self, "hero_cta_href", _safe_href(self.hero_cta_href))
        object.__setattr__(self, "explainer_cta_href", _safe_href(self.explainer_cta_href))
        object.__setattr__(self, "hero_image_src", _safe_asset_ref(self.hero_image_src) or "/")


class AboutTeamMember(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: str = Field(..., min_length=1, max_length=80)
    name: str = Field(..., min_length=1, max_length=120)
    role: str = Field(default="", max_length=200)
    contribution: str = Field(default="", max_length=500)
    photo_src: str = Field(default="", alias="photoSrc", max_length=1000)

    def model_post_init(self, __context: Any) -> None:
        object.__setattr__(self, "photo_src", _safe_asset_ref(self.photo_src))


class AboutContent(BaseModel):
    """Editable fields for the existing About page layout."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    intro_heading: str = Field(..., alias="introHeading", min_length=1, max_length=200)
    intro_description: str = Field(..., alias="introDescription", max_length=2000)
    intro_visible: bool = Field(default=True, alias="introVisible")
    purpose_heading: str = Field(..., alias="purposeHeading", min_length=1, max_length=200)
    purpose_description: str = Field(..., alias="purposeDescription", max_length=2000)
    purpose_visible: bool = Field(default=True, alias="purposeVisible")
    access_heading: str = Field(..., alias="accessHeading", min_length=1, max_length=200)
    access_description: str = Field(..., alias="accessDescription", max_length=2000)
    access_description_secondary: str = Field(
        default="", alias="accessDescriptionSecondary", max_length=2000
    )
    try_it_label: str = Field(..., alias="tryItLabel", min_length=1, max_length=80)
    try_it_href: str = Field(..., alias="tryItHref", max_length=500)
    membership_label: str = Field(..., alias="membershipLabel", min_length=1, max_length=80)
    membership_note: str = Field(..., alias="membershipNote", max_length=1000)
    access_visible: bool = Field(default=True, alias="accessVisible")
    team_heading: str = Field(..., alias="teamHeading", min_length=1, max_length=200)
    team_description: str = Field(..., alias="teamDescription", max_length=2000)
    team_visible: bool = Field(default=True, alias="teamVisible")
    team: list[AboutTeamMember] = Field(default_factory=list, max_length=30)
    footer_disclaimer: str = Field(..., alias="footerDisclaimer", max_length=300)
    footer_copyright: str = Field(..., alias="footerCopyright", max_length=200)

    def model_post_init(self, __context: Any) -> None:
        object.__setattr__(self, "try_it_href", _safe_href(self.try_it_href))


class SiteContentDraftBody(BaseModel):
    """Admin save-draft payload: page-shaped content object (camelCase)."""

    model_config = ConfigDict(extra="forbid")

    content: dict[str, Any]
