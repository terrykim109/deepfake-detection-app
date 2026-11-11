import sys
import types

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


class _Snap:
    def __init__(self, data):
        self.exists = data is not None
        self._data = data

    def to_dict(self):
        return dict(self._data) if self._data is not None else None


class _Doc:
    def __init__(self, store, path):
        self.store = store
        self.path = path

    def get(self, transaction=None):
        return _Snap(self.store.get(self.path))

    def set(self, data, merge=False):
        base = self.store.get(self.path, {}) if merge else {}
        self.store[self.path] = {**base, **data}


class _Collection:
    def __init__(self, store, name):
        self.store = store
        self.name = name

    def document(self, doc_id):
        return _Doc(self.store, f"{self.name}/{doc_id}")


class _Db:
    def __init__(self, store=None):
        self.store = {} if store is None else store

    def collection(self, name):
        return _Collection(self.store, name)


class _Txn:
    """Applies writes straight to the store, enough to check _claim's decisions."""

    def set(self, doc, data, merge=False):
        doc.set(data, merge=merge)

    def delete(self, doc):
        doc.store.pop(doc.path, None)


if "firebase_config" not in sys.modules:
    fake_firebase_config = types.ModuleType("firebase_config")
    fake_firebase_config.db = _Db()
    sys.modules["firebase_config"] = fake_firebase_config

import usernames  # noqa: E402
from auth_dependency import get_current_user  # noqa: E402
from routers import users as users_router  # noqa: E402


@pytest.fixture
def store(monkeypatch):
    data = {}
    monkeypatch.setattr(usernames, "db", _Db(data))
    return data


def claim(user_id, name, profile=None):
    # Run the transactional body directly with a fake transaction
    usernames._claim.to_wrap(_Txn(), user_id, name, profile or {})


@pytest.mark.parametrize("name", ["Alex", "alex", "a.b_c", "abc", "A" * 20, "user.name_42"])
def test_valid_usernames(name):
    assert usernames.is_valid_username(name)


@pytest.mark.parametrize("name", ["", "al", "A" * 21, "alex smith", "alex-1", "ünï", "alex@home"])
def test_invalid_usernames(name):
    assert not usernames.is_valid_username(name)


def test_claim_free_name(store):
    claim("u1", "Alex", {"email": "a@example.com"})

    assert store["usernames/u_Alex"]["user_id"] == "u1"
    assert store["users/u1"]["username"] == "Alex"
    assert store["users/u1"]["display_name"] == "Alex"
    assert store["users/u1"]["email"] == "a@example.com"


def test_claim_is_case_sensitive(store):
    claim("u1", "Alex")
    claim("u2", "alex")

    assert store["usernames/u_Alex"]["user_id"] == "u1"
    assert store["usernames/u_alex"]["user_id"] == "u2"


def test_claim_taken_name_raises_and_writes_nothing(store):
    claim("u1", "Alex")
    before = dict(store)

    with pytest.raises(usernames.UsernameTaken):
        claim("u2", "Alex")

    assert store == before


def test_rename_frees_old_name(store):
    claim("u1", "Alex")
    claim("u1", "Alex2")

    assert "usernames/u_Alex" not in store
    assert store["usernames/u_Alex2"]["user_id"] == "u1"
    assert store["users/u1"]["username"] == "Alex2"
    claim("u2", "Alex")
    assert store["usernames/u_Alex"]["user_id"] == "u2"


def test_resaving_own_name_keeps_it(store):
    claim("u1", "Alex")
    claim("u1", "Alex", {"email": "new@example.com"})

    assert store["usernames/u_Alex"]["user_id"] == "u1"
    assert store["users/u1"]["email"] == "new@example.com"


app = FastAPI()
app.include_router(users_router.router, prefix="/api")
client = TestClient(app)


@pytest.fixture
def signed_in(monkeypatch):
    monkeypatch.setattr(users_router, "users_ref", _Db().collection("users"))
    monkeypatch.setattr(users_router, "log_event", lambda *a, **k: None)
    app.dependency_overrides[get_current_user] = lambda: {"uid": "u1", "claims": {}}
    yield
    app.dependency_overrides.clear()


def test_username_available_rejects_invalid_name():
    res = client.get("/api/users/username-available", params={"username": "a b"})

    assert res.status_code == 200
    assert res.json() == {"available": False, "detail": usernames.USERNAME_RULE}


@pytest.mark.parametrize("free", [True, False])
def test_username_available_reports_taken(monkeypatch, free):
    monkeypatch.setattr(users_router, "is_username_free", lambda name: free)

    res = client.get("/api/users/username-available", params={"username": "Alex"})

    assert res.json()["available"] is free


def test_profile_rejects_invalid_username(signed_in):
    res = client.put("/api/users/u1/profile", json={"username": "no spaces", "email": "a@example.com"})

    assert res.status_code == 400
    assert res.json()["detail"] == usernames.USERNAME_RULE


def test_profile_reports_taken_username(signed_in, monkeypatch):
    def taken(*args, **kwargs):
        raise usernames.UsernameTaken("Alex")

    monkeypatch.setattr(users_router, "claim_username", taken)

    res = client.put("/api/users/u1/profile", json={"username": "Alex", "email": "a@example.com"})

    assert res.status_code == 409
    assert res.json()["detail"] == usernames.USERNAME_TAKEN


def test_profile_saves_username(signed_in, monkeypatch):
    calls = []

    def fake_claim(user_id, name, profile=None):
        calls.append((user_id, name, profile))
        users_router.users_ref.document(user_id).set({**profile, "username": name, "display_name": name}, merge=True)

    monkeypatch.setattr(users_router, "claim_username", fake_claim)

    res = client.put("/api/users/u1/profile", json={"username": "Alex", "email": "a@example.com"})

    assert res.status_code == 200
    assert res.json()["username"] == "Alex"
    assert calls[0][:2] == ("u1", "Alex")
    assert "phone" not in calls[0][2]


def test_sync_claims_signup_username_once(signed_in, monkeypatch):
    calls = []
    monkeypatch.setattr(users_router, "claim_username", lambda uid, name, profile=None: calls.append(name))

    client.post("/api/users/sync", json={"email": "a@example.com", "display_name": "Alex"})
    assert calls == ["Alex"]

    # Full names from older sign-ups aren't valid usernames, so nothing is claimed
    calls.clear()
    client.post("/api/users/sync", json={"email": "a@example.com", "display_name": "Biz Owner"})
    assert calls == []
