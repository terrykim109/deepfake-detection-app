#backend/firebase_config.py
import json
import os
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(_BACKEND_DIR / ".env")
load_dotenv(_BACKEND_DIR.parent / ".env")


def _certificate_from_env() -> credentials.Certificate | None:
    """Load a service-account cert from env (Vercel / serverless friendly)."""
    raw = (
        os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY")
        or os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
        or ""
    ).strip()
    if not raw:
        return None
    try:
        info = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            "FIREBASE_SERVICE_ACCOUNT_KEY is set but is not valid JSON"
        ) from exc
    return credentials.Certificate(info)


def _certificate_from_file() -> credentials.Certificate | None:
    """Load a service-account cert from a local file path (local dev)."""
    candidates = []
    env_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if env_path:
        candidates.append(env_path)
    candidates.extend(
        [
            str(_BACKEND_DIR / "serviceAccountKey.json"),
            str(Path.cwd() / "serviceAccountKey.json"),
            "serviceAccountKey.json",
        ]
    )
    for path in candidates:
        if path and os.path.exists(path):
            return credentials.Certificate(path)
    return None


if not firebase_admin._apps:
    cert = _certificate_from_env() or _certificate_from_file()
    if cert is not None:
        firebase_admin.initialize_app(cert)
    else:
        # Last resort (e.g. GCP ADC). On Vercel this will fail later without
        # FIREBASE_SERVICE_ACCOUNT_JSON — prefer setting that env var.
        firebase_admin.initialize_app()

db = firestore.client()
