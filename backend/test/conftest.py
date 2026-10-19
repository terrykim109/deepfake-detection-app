# test/conftest.py — shared QA fixtures
#
# The backend talks to Firebase Auth + Firestore at import time. These tests
# replace both with in-memory fakes so the suite runs offline, needs no
# serviceAccountKey.json, and never touches real project data.

from __future__ import annotations

import copy
import sys
import tempfile
import types
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


# ---------------------------------------------------------------------------
# In-memory Firestore
# ---------------------------------------------------------------------------

class FakeSnapshot:
    def __init__(self, doc_id: str, data: dict | None):
        self.id = doc_id
        self._data = copy.deepcopy(data) if data is not None else None

    @property
    def exists(self) -> bool:
        return self._data is not None

    def to_dict(self) -> dict | None:
        return copy.deepcopy(self._data)


class FakeDocument:
    def __init__(self, store: dict, doc_id: str):
        self._store = store
        self.id = doc_id

    def get(self) -> FakeSnapshot:
        return FakeSnapshot(self.id, self._store.get(self.id))

    def set(self, data: dict, merge: bool = False) -> None:
        if merge and self.id in self._store:
            self._store[self.id].update(copy.deepcopy(data))
        else:
            self._store[self.id] = copy.deepcopy(data)


class FakeQuery:
    def __init__(self, store: dict, filters=(), limit_n: int | None = None):
        self._store = store
        self._filters = list(filters)
        self._limit = limit_n

    def where(self, *args, filter=None, **kwargs) -> "FakeQuery":
        if filter is None:
            field, op, value = args
        else:
            field, op, value = filter.field_path, filter.op_string, filter.value
        assert op == "==", f"fake Firestore only supports '==' (got {op})"
        return FakeQuery(self._store, [*self._filters, (field, value)], self._limit)

    def limit(self, n: int) -> "FakeQuery":
        return FakeQuery(self._store, self._filters, n)

    def get(self) -> list[FakeSnapshot]:
        hits = [
            FakeSnapshot(doc_id, data)
            for doc_id, data in self._store.items()
            if all(data.get(f) == v for f, v in self._filters)
        ]
        return hits[: self._limit] if self._limit is not None else hits


class FakeCollection(FakeQuery):
    def __init__(self, store: dict):
        super().__init__(store)
        self._counter = 0

    def document(self, doc_id: str) -> FakeDocument:
        return FakeDocument(self._store, doc_id)

    def add(self, data: dict):
        self._counter += 1
        doc_id = f"auto{self._counter}"
        self._store[doc_id] = copy.deepcopy(data)
        return None, FakeDocument(self._store, doc_id)


class FakeFirestore:
    def __init__(self):
        self._data: dict[str, dict] = {}
        self._collections: dict[str, FakeCollection] = {}

    def collection(self, name: str) -> FakeCollection:
        # Same object every time: routers hold module-level collection refs
        if name not in self._collections:
            self._data[name] = {}
            self._collections[name] = FakeCollection(self._data[name])
        return self._collections[name]

    def docs(self, name: str) -> dict[str, dict]:
        return self._data.setdefault(name, {})

    def reset(self) -> None:
        for store in self._data.values():
            store.clear()


FAKE_DB = FakeFirestore()


# ---------------------------------------------------------------------------
# Fake firebase_admin (auth token verification)
# ---------------------------------------------------------------------------

class InvalidIdTokenError(Exception):
    pass


# Mirrors firebase_admin: expired/revoked are subclasses of invalid
class ExpiredIdTokenError(InvalidIdTokenError):
    pass


class RevokedIdTokenError(InvalidIdTokenError):
    pass


# token string -> decoded claims; populated per test via the `tokens` fixture
TOKENS: dict[str, dict] = {}
EXPIRED_TOKEN = "expired-token"
REVOKED_TOKEN = "revoked-token"


def _verify_id_token(token: str, check_revoked: bool = False) -> dict:
    if token == EXPIRED_TOKEN:
        raise ExpiredIdTokenError("Token expired")
    if token == REVOKED_TOKEN:
        raise RevokedIdTokenError("Token revoked")
    if token not in TOKENS:
        raise InvalidIdTokenError("Invalid token")
    return copy.deepcopy(TOKENS[token])


def _install_firebase_stubs() -> None:
    fb = types.ModuleType("firebase_admin")
    fb._apps = {}
    fb.initialize_app = lambda *a, **k: fb._apps.setdefault("[DEFAULT]", object())

    credentials = types.ModuleType("firebase_admin.credentials")
    credentials.Certificate = lambda path: path

    firestore = types.ModuleType("firebase_admin.firestore")
    firestore.client = lambda: FAKE_DB

    auth = types.ModuleType("firebase_admin.auth")
    auth.verify_id_token = _verify_id_token
    auth.InvalidIdTokenError = InvalidIdTokenError
    auth.ExpiredIdTokenError = ExpiredIdTokenError
    auth.RevokedIdTokenError = RevokedIdTokenError

    fb.credentials, fb.firestore, fb.auth = credentials, firestore, auth
    sys.modules.update({
        "firebase_admin": fb,
        "firebase_admin.credentials": credentials,
        "firebase_admin.firestore": firestore,
        "firebase_admin.auth": auth,
    })

    try:
        from google.cloud.firestore_v1.base_query import FieldFilter  # noqa: F401
    except ImportError:
        class FieldFilter:
            def __init__(self, field_path, op_string, value=None):
                self.field_path, self.op_string, self.value = field_path, op_string, value

        for name in ("google", "google.cloud", "google.cloud.firestore_v1"):
            sys.modules.setdefault(name, types.ModuleType(name))
        base_query = types.ModuleType("google.cloud.firestore_v1.base_query")
        base_query.FieldFilter = FieldFilter
        sys.modules["google.cloud.firestore_v1.base_query"] = base_query


_install_firebase_stubs()

# Keep temp uploads out of the repo and stop main.py's background sweeper
import temp_images  # noqa: E402

temp_images.TEMP_UPLOAD_DIR = tempfile.mkdtemp(prefix="dfd-qa-")
temp_images._sweeper_started = True

import detection.stub  # noqa: E402
import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    """Fresh database, tokens, and temp dir for every test; no fake latency."""
    FAKE_DB.reset()
    TOKENS.clear()
    monkeypatch.setattr(temp_images, "TEMP_UPLOAD_DIR", str(tmp_path / "tmp_uploads"))
    monkeypatch.setattr(detection.stub, "LATENCY_SECONDS", 0)
    yield
    FAKE_DB.reset()
    TOKENS.clear()


@pytest.fixture
def db() -> FakeFirestore:
    return FAKE_DB


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


@pytest.fixture
def make_token():
    """Register a Firebase ID token and return its Authorization header."""

    def _make(uid: str = "uid-alice", *, email: str = "alice@example.com", verified: bool = True):
        token = f"token-{uid}"
        TOKENS[token] = {
            "uid": uid,
            "email": email,
            "email_verified": verified,
            "name": "Alice Example",
            "firebase": {"sign_in_provider": "password"},
        }
        return {"Authorization": f"Bearer {token}"}

    return _make


@pytest.fixture
def auth_headers(make_token) -> dict:
    return make_token()


# Minimal byte payloads that pass magic-number checks in upload_validation
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 256
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 256
WEBP_BYTES = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 256


@pytest.fixture
def jpeg_file():
    return {"file": ("photo.jpg", JPEG_BYTES, "image/jpeg")}
