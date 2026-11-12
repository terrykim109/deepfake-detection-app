import sys
import types

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient


class _FakeDocument:
    def __init__(self, doc_id: str, data: dict):
        self.id = doc_id
        self._data = data

    def to_dict(self):
        return dict(self._data)


class _FakeCollection:
    def __init__(self, documents=None):
        self.documents = documents or []

    def stream(self):
        return iter(self.documents)


class _FakeDb:
    def __init__(self):
        self.collections = {
            "adminMetrics": _FakeCollection(),
            "analysis_requests": _FakeCollection(
                [
                    _FakeDocument(
                        "a1",
                        {
                            "createdAt": "2026-01-05T00:00:00+00:00",
                            "status": "success",
                        },
                    )
                ]
            ),
            "users": _FakeCollection(),
            "audit_logs": _FakeCollection(),
        }

    def collection(self, name):
        return self.collections[name]


if "firebase_config" not in sys.modules:
    fake_firebase_config = types.ModuleType("firebase_config")
    fake_firebase_config.db = _FakeDb()
    sys.modules["firebase_config"] = fake_firebase_config

from auth_dependency import get_current_user, require_admin
from routers.admin import router


app = FastAPI()
app.include_router(router, prefix="/api")
client = TestClient(app)


def test_admin_usage_requires_admin():
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "regular",
        "claims": {},
    }
    try:
        response = client.get("/api/admin/usage")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 403


def test_admin_usage_reads_analysis_records_for_daily_interval():
    app.dependency_overrides[require_admin] = lambda: {
        "uid": "admin",
        "claims": {"admin": True},
    }
    try:
        response = client.get("/api/admin/usage?interval=daily")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()["totals"]["totalAnalyses"] == 1


def test_admin_usage_rejects_invalid_interval():
    app.dependency_overrides[require_admin] = lambda: {
        "uid": "admin",
        "claims": {"admin": True},
    }
    try:
        response = client.get("/api/admin/usage?interval=yearly")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 400


def test_admin_analyses_returns_metadata_records():
    app.dependency_overrides[require_admin] = lambda: {
        "uid": "admin",
        "claims": {"admin": True},
    }
    try:
        response = client.get("/api/admin/analyses")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()["analyses"][0]["requestId"] == "a1"
