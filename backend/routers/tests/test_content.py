"""Authorization and draft/published isolation for site content CMS."""

from __future__ import annotations

import sys
import types
from copy import deepcopy

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient


class _FakeSnapshot:
    def __init__(self, data: dict | None):
        self._data = data

    @property
    def exists(self) -> bool:
        return self._data is not None

    def to_dict(self):
        return deepcopy(self._data) if self._data is not None else None


class _FakeDocRef:
    def __init__(self, store: dict, doc_id: str):
        self._store = store
        self.id = doc_id

    def get(self):
        return _FakeSnapshot(self._store.get(self.id))

    def set(self, data: dict, merge: bool = False):
        if merge and self.id in self._store:
            current = deepcopy(self._store[self.id])
            current.update(deepcopy(data))
            self._store[self.id] = current
        else:
            self._store[self.id] = deepcopy(data)


class _FakeCollection:
    def __init__(self):
        self._docs: dict[str, dict] = {}

    def document(self, doc_id: str):
        return _FakeDocRef(self._docs, doc_id)

    def stream(self):
        return iter(())

    def add(self, doc: dict):
        self._docs[f"auto-{len(self._docs)}"] = deepcopy(doc)
        return None, _FakeDocRef(self._docs, f"auto-{len(self._docs) - 1}")


class _FakeDb:
    def __init__(self):
        self.collections: dict[str, _FakeCollection] = {}

    def collection(self, name: str):
        if name not in self.collections:
            self.collections[name] = _FakeCollection()
        return self.collections[name]


# Stub firebase before importing app modules that touch Firestore at import time.
fake_db = _FakeDb()
if "firebase_config" not in sys.modules:
    fake_firebase_config = types.ModuleType("firebase_config")
    fake_firebase_config.db = fake_db
    sys.modules["firebase_config"] = fake_firebase_config
else:
    sys.modules["firebase_config"].db = fake_db

from auth_dependency import get_current_user, require_admin
from content_defaults import LANDING_DEFAULT
from routers import admin as admin_router
from routers import content as content_router

import content_store
import helpers
import firebase_config

# Ensure modules use this test's fake db even if another test stubbed first.
firebase_config.db = fake_db
helpers.audit_logs_ref = fake_db.collection("audit_logs")
# content_store resolves db.collection(...) on each call.

app = FastAPI()
app.include_router(content_router.router, prefix="/api")
app.include_router(admin_router.router, prefix="/api")
client = TestClient(app)


def _as_admin():
    app.dependency_overrides[require_admin] = lambda: {
        "uid": "admin",
        "claims": {"admin": True},
    }


def _clear():
    app.dependency_overrides.clear()
    fake_db.collections.clear()
    firebase_config.db = fake_db
    helpers.audit_logs_ref = fake_db.collection("audit_logs")


def test_public_content_returns_defaults_when_unpublished():
    _clear()
    response = client.get("/api/content/landing")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "default"
    assert body["content"]["heroTitle"] == LANDING_DEFAULT["heroTitle"]
    assert "draft" not in body


def test_public_content_never_exposes_draft_fields():
    _clear()
    _as_admin()
    draft = deepcopy(LANDING_DEFAULT)
    draft["heroTitle"] = "Draft Only Title"
    save = client.put("/api/admin/content/landing/draft", json={"content": draft})
    assert save.status_code == 200
    _clear_overrides_keep_data()

    public = client.get("/api/content/landing")
    assert public.status_code == 200
    assert public.json()["content"]["heroTitle"] == LANDING_DEFAULT["heroTitle"]
    assert public.json()["source"] == "default"
    assert "Draft Only" not in public.text


def _clear_overrides_keep_data():
    app.dependency_overrides.clear()


def test_draft_save_requires_admin():
    _clear()
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "regular",
        "claims": {},
    }
    try:
        response = client.put(
            "/api/admin/content/landing/draft",
            json={"content": LANDING_DEFAULT},
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 403


def test_save_draft_then_publish_updates_public():
    _clear()
    _as_admin()
    draft = deepcopy(LANDING_DEFAULT)
    draft["heroTitle"] = "Published Hero"
    draft["heroTagline"] = "Updated tagline"

    save = client.put("/api/admin/content/landing/draft", json={"content": draft})
    assert save.status_code == 200
    assert save.json()["draft"]["heroTitle"] == "Published Hero"
    assert save.json()["status"] == "unpublished"

    # Still defaults publicly
    _clear_overrides_keep_data()
    assert client.get("/api/content/landing").json()["source"] == "default"

    _as_admin()
    published = client.post("/api/admin/content/landing/publish")
    assert published.status_code == 200
    assert published.json()["status"] == "published"
    assert published.json()["publishedAt"]

    _clear_overrides_keep_data()
    public = client.get("/api/content/landing").json()
    assert public["source"] == "published"
    assert public["content"]["heroTitle"] == "Published Hero"


def test_failed_validation_does_not_change_published():
    _clear()
    _as_admin()
    good = deepcopy(LANDING_DEFAULT)
    good["heroTitle"] = "Safe Published"
    assert client.put("/api/admin/content/landing/draft", json={"content": good}).status_code == 200
    assert client.post("/api/admin/content/landing/publish").status_code == 200

    bad = deepcopy(LANDING_DEFAULT)
    bad["heroCtaHref"] = "javascript:alert(1)"
    failed = client.put("/api/admin/content/landing/draft", json={"content": bad})
    assert failed.status_code == 400

    _clear_overrides_keep_data()
    public = client.get("/api/content/landing").json()
    assert public["content"]["heroTitle"] == "Safe Published"


def test_about_team_add_remove_in_draft():
    _clear()
    _as_admin()
    from content_defaults import ABOUT_DEFAULT

    draft = deepcopy(ABOUT_DEFAULT)
    draft["team"] = [
        {
            "id": "a1",
            "name": "Ada Example",
            "role": "Engineer",
            "contribution": "APIs",
            "photoSrc": "/assets/team/ada.jpg",
        }
    ]
    saved = client.put("/api/admin/content/about/draft", json={"content": draft})
    assert saved.status_code == 200
    assert len(saved.json()["draft"]["team"]) == 1
    assert saved.json()["draft"]["team"][0]["name"] == "Ada Example"

    draft["team"] = []
    cleared = client.put("/api/admin/content/about/draft", json={"content": draft})
    assert cleared.status_code == 200
    assert cleared.json()["draft"]["team"] == []


def test_admin_get_content_requires_admin():
    _clear()
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "regular",
        "claims": {},
    }
    try:
        response = client.get("/api/admin/content/about")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 403
