import os
from pathlib import Path

from dotenv import load_dotenv

# Load gitignored .env files into the process environment.
_BACKEND_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND_DIR.parent
load_dotenv(_BACKEND_DIR / ".env")
load_dotenv(_REPO_ROOT / ".env")
# Also accept a key kept next to the Vite env file during local dev.
load_dotenv(_REPO_ROOT / "frontend" / ".env")

SESSION_TIMEOUT_MINUTES = 30

AUTH_PROVIDERS = ["local", "google"]

# File validation
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}

# Analysis quotas
MAX_ACTIVE_ANALYSES_PER_USER = 1
MAX_ANALYSES_PER_24H = 20

FORMAT_HELP = "Please choose a JPG, JPEG, PNG, or WEBP image under 10 MB."

# Temporary image handling — never retain longer than this
MAX_TEMP_IMAGE_SECONDS = 60


def _default_temp_upload_dir() -> str:
    """Local: backend/tmp_uploads. Vercel/serverless: writable /tmp only."""
    explicit = (os.getenv("TEMP_UPLOAD_DIR") or "").strip()
    if explicit:
        return explicit
    if os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
        import tempfile

        return str(Path(tempfile.gettempdir()) / "dfd_tmp_uploads")
    return str(Path(__file__).resolve().parent / "tmp_uploads")


TEMP_UPLOAD_DIR = _default_temp_upload_dir()

# Detection: OpenRouter ensemble only
DETECTION_PROVIDER = os.getenv("DETECTION_PROVIDER", "openrouter")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
SCRAPPA_API_KEY = os.getenv("SCRAPPA_API_KEY", "")
SCRAPPA_LENS_URL = os.getenv("SCRAPPA_LENS_URL", "https://scrappa.co/api/google/lens")
# Optional fallback origin if temporary HTTPS upload hosting fails
PUBLIC_BASE_URL = (os.getenv("PUBLIC_BASE_URL") or "").rstrip("/")
OPENROUTER_MODELS = [
    # "minimax/minimax-m3.1-flash:free",
    "dots-studio/dots-3-note-preview:free", # this might be the best one.
    "nvidia/nemotron-3.5-super-vl:free",
    # "google/gemma-4-26b-a4b-it:free",
    "google/gemma-4-31b-it:free",
    "openrouter/free",
]