# Upload / analysis limits (SDS FR-06–08, FR-16–17)
# Temporary image retention (SDS FR-12 / BR-04)
# Detection provider (DFD-02)

from pathlib import Path

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
TEMP_UPLOAD_DIR = str(Path(__file__).resolve().parent / "tmp_uploads")

# Detection: "stub" now; swap to a pretrained provider adapter later
DETECTION_PROVIDER = "stub"
