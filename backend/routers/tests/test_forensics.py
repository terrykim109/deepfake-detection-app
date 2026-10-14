import os
import sys
import types

# routers/forensics.py -> auth_dependency -> firebase_config calls
# firestore.client() at import time, which requires real Firebase
# credentials. Stub the module out so this test can run without them —
# the forensics endpoint itself never touches Firestore except for a
# best-effort audit log that's already wrapped in try/except.
class _FakeCollection:
    def add(self, *args, **kwargs):
        pass

    def document(self, *args, **kwargs):
        return self

    def get(self, *args, **kwargs):
        return types.SimpleNamespace(exists=False)

    def set(self, *args, **kwargs):
        pass


class _FakeDb:
    def collection(self, *args, **kwargs):
        return _FakeCollection()


if "firebase_config" not in sys.modules:
    fake_firebase_config = types.ModuleType("firebase_config")
    fake_firebase_config.db = _FakeDb()
    sys.modules["firebase_config"] = fake_firebase_config

from fastapi import FastAPI
from fastapi.testclient import TestClient

from auth_dependency import get_current_user
from routers.forensics import router as forensics_router

SAMPLES_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "ml", "model_1")

app = FastAPI()
app.include_router(forensics_router, prefix="/api")
app.dependency_overrides[get_current_user] = lambda: {"uid": "test-user", "claims": {}}

client = TestClient(app)


def _sample_path(filename: str) -> str:
    return os.path.join(SAMPLES_DIR, filename)


def test_forensics_run_returns_all_sections():
    with open(_sample_path("sample_image_real.jpg"), "rb") as f:
        response = client.post(
            "/api/forensics/run",
            files={"file": ("sample_image_real.jpg", f, "image/jpeg")},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert set(body["forensics"].keys()) == {"metadata", "ela", "noise", "c2pa"}
    assert body["forensics"]["metadata"]["available"] is True


def test_forensics_run_rejects_invalid_upload():
    response = client.post(
        "/api/forensics/run",
        files={"file": ("not-an-image.txt", b"hello world", "text/plain")},
    )

    assert response.status_code == 400
