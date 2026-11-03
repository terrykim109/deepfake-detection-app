import sys
import types

import pytest
from fastapi import Depends, FastAPI


class _FakeCollection:
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

from fastapi.testclient import TestClient

from auth_dependency import get_current_user, require_admin


app = FastAPI()


@app.get("/admin")
async def admin_route(user: dict = Depends(require_admin)):
    return {"uid": user["uid"]}


client = TestClient(app)


def test_admin_dependency_rejects_missing_token():
    response = client.get("/admin")

    assert response.status_code == 401


def test_admin_dependency_rejects_regular_user():
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "regular-user",
        "claims": {"admin": False},
    }
    try:
        response = client.get("/admin")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


def test_admin_dependency_accepts_admin_user():
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "admin-user",
        "claims": {"admin": True},
    }
    try:
        response = client.get("/admin")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"uid": "admin-user"}


@pytest.mark.parametrize("admin_claim", [False, "true", 1, None])
def test_admin_dependency_requires_boolean_true(admin_claim):
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "not-an-admin",
        "claims": {"admin": admin_claim},
    }
    try:
        response = client.get("/admin")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


def test_invalid_bearer_token_is_unauthorized(monkeypatch):
    import auth_dependency

    def reject_token(*args, **kwargs):
        raise auth_dependency.auth.InvalidIdTokenError("invalid")

    monkeypatch.setattr(auth_dependency.auth, "verify_id_token", reject_token)
    response = client.get("/admin", headers={"Authorization": "Bearer invalid-token"})

    assert response.status_code == 401
