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


class _FakeDocRef:
    def __init__(self, store: dict, doc_id: str):
        self._store = store
        self.id = doc_id

    def get(self):
        data = self._store.get(self.id)

        class _Snap:
            def __init__(self, payload):
                self._payload = payload

            @property
            def exists(self):
                return self._payload is not None

            def to_dict(self):
                return dict(self._payload) if self._payload is not None else None

        return _Snap(data)

    def set(self, data: dict, merge: bool = False):
        if merge and self.id in self._store:
            current = dict(self._store[self.id])
            current.update(data)
            self._store[self.id] = current
        else:
            self._store[self.id] = dict(data)


class _FakeCollection:
    def __init__(self, documents=None):
        self.documents = documents or []
        self._by_id = {doc.id: doc.to_dict() for doc in self.documents}

    def stream(self):
        return iter(self.documents)

    def document(self, doc_id: str):
        return _FakeDocRef(self._by_id, doc_id)

    def add(self, doc: dict):
        doc_id = f"auto-{len(self._by_id)}"
        self._by_id[doc_id] = dict(doc)
        return None, _FakeDocRef(self._by_id, doc_id)


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
                            "diagnosticError": "openai/model: HTTP 429: rate limit",
                        },
                    )
                ]
            ),
            "users": _FakeCollection(),
            "audit_logs": _FakeCollection(),
            "site_content": _FakeCollection(),
        }

    def collection(self, name):
        if name not in self.collections:
            self.collections[name] = _FakeCollection()
        return self.collections[name]


_FAKE_DB = _FakeDb()
if "firebase_config" not in sys.modules:
    fake_firebase_config = types.ModuleType("firebase_config")
    sys.modules["firebase_config"] = fake_firebase_config
sys.modules["firebase_config"].db = _FAKE_DB

from auth_dependency import get_current_user, require_admin
from routers import admin as admin_module
import analysis_tracking

# Rebind import-time Firestore handles onto this module's seeded fake.
admin_module.db = _FAKE_DB
analysis_tracking.analysis_requests_ref = _FAKE_DB.collection("analysis_requests")
admin_module.analysis_requests_ref = analysis_tracking.analysis_requests_ref
router = admin_module.router

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


def test_admin_analysis_detail_returns_record():
    app.dependency_overrides[require_admin] = lambda: {
        "uid": "admin",
        "claims": {"admin": True},
    }
    try:
        response = client.get("/api/admin/analyses/a1")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()["requestId"] == "a1"
    assert "HTTP 429" in response.json()["diagnosticError"]


def test_admin_analysis_detail_returns_404_for_unknown_id():
    app.dependency_overrides[require_admin] = lambda: {
        "uid": "admin",
        "claims": {"admin": True},
    }
    try:
        response = client.get("/api/admin/analyses/missing")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 404
