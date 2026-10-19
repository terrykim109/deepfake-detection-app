# test/test_auth_session.py
# QA — authentication and session flows: account creation, login, logout,
# invalid credentials, duplicate accounts, and session timeout / token expiry.

import pytest

from config import SESSION_TIMEOUT_MINUTES
from conftest import EXPIRED_TOKEN, REVOKED_TOKEN

PASSWORD = "CorrectHorse#42"  # >= 12 chars


def signup(client, email="alice@example.com", password=PASSWORD, display_name=None):
    body = {"email": email, "password": password}
    if display_name is not None:
        body["display_name"] = display_name
    return client.post("/api/auth/signup", json=body)


def audit_events(db, event_type):
    return [d for d in db.docs("audit_logs").values() if d["event_type"] == event_type]


# ---------------------------------------------------------------------------
# Account creation
# ---------------------------------------------------------------------------

class TestAccountCreation:
    def test_signup_creates_user_and_returns_token(self, client, db):
        res = signup(client, display_name="Alice")
        assert res.status_code == 200
        body = res.json()

        assert body["token_type"] == "bearer"
        assert body["access_token"]
        user = body["user"]
        assert user["email"] == "alice@example.com"
        assert user["display_name"] == "Alice"
        assert user["auth_provider"] == "local"
        assert user["created_at"]

        stored = db.docs("users")[user["user_id"]]
        assert stored["email"] == "alice@example.com"
        assert "password" not in stored  # never persisted in Firestore
        assert len(audit_events(db, "auth_signup")) == 1

    def test_display_name_defaults_to_email_local_part(self, client):
        res = signup(client, email="bob.smith@example.com")
        assert res.status_code == 200
        assert res.json()["user"]["display_name"] == "bob.smith"

    def test_password_shorter_than_12_chars_is_rejected(self, client, db):
        res = signup(client, password="Short#1")
        assert res.status_code == 422
        assert db.docs("users") == {}

    @pytest.mark.parametrize("missing", ["email", "password"])
    def test_missing_required_field_is_rejected(self, client, missing):
        body = {"email": "alice@example.com", "password": PASSWORD}
        del body[missing]
        assert client.post("/api/auth/signup", json=body).status_code == 422


# ---------------------------------------------------------------------------
# Duplicate-account handling
# ---------------------------------------------------------------------------

class TestDuplicateAccounts:
    def test_second_signup_with_same_email_returns_409(self, client, db):
        assert signup(client).status_code == 200
        res = signup(client)

        assert res.status_code == 409
        assert "already exists" in res.json()["detail"]
        assert len(db.docs("users")) == 1

    def test_firebase_sync_is_idempotent(self, client, db):
        body = {"user_id": "uid-alice", "email": "alice@example.com", "display_name": "Alice Example"}
        first = client.post("/api/users/sync", json=body)
        second = client.post("/api/users/sync", json=body)

        assert first.status_code == second.status_code == 200
        assert len(db.docs("users")) == 1
        # Re-syncing must not reset the original creation time
        assert second.json()["created_at"] == first.json()["created_at"]
        assert second.json()["first_name"] == "Alice"
        assert second.json()["last_name"] == "Example"

    def test_sync_requires_user_id(self, client):
        res = client.post("/api/users/sync", json={"user_id": "  ", "email": "a@example.com"})
        assert res.status_code == 400


# ---------------------------------------------------------------------------
# Login and invalid credentials
# ---------------------------------------------------------------------------

class TestLogin:
    def test_login_existing_account(self, client, db):
        user_id = signup(client).json()["user"]["user_id"]

        res = client.post("/api/auth/login", json={"email": "alice@example.com", "password": PASSWORD})
        assert res.status_code == 200
        assert res.json()["user"]["user_id"] == user_id
        assert res.json()["access_token"]
        assert len(audit_events(db, "auth_login")) == 1

    def test_login_unknown_email_returns_401(self, client, db):
        res = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": PASSWORD})
        assert res.status_code == 401
        assert res.json()["detail"] == "Invalid email or password. Please try again."
        assert audit_events(db, "auth_login") == []

    def test_login_wrong_password_returns_401(self, client):
        signup(client)
        res = client.post("/api/auth/login", json={"email": "alice@example.com", "password": "WrongPassword#99"})
        assert res.status_code == 401

    def test_login_missing_fields_returns_422(self, client):
        assert client.post("/api/auth/login", json={"email": "alice@example.com"}).status_code == 422


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

class TestLogout:
    def test_logout_succeeds_and_is_audited(self, client, db):
        res = client.post("/api/auth/logout", params={"user_id": "uid-alice"})
        assert res.status_code == 200
        assert res.json()["message"] == "Logged out successfully"
        assert len(audit_events(db, "auth_logout")) == 1

    def test_logout_without_user_is_harmless(self, client, db):
        assert client.post("/api/auth/logout").status_code == 200
        assert audit_events(db, "auth_logout") == []

    def test_logout_as_sent_by_frontend_is_audited(self, client, db):
        client.post("/api/auth/logout", json={"user_id": "uid-alice"})
        assert len(audit_events(db, "auth_logout")) == 1

    def test_revoked_token_after_logout_is_rejected(self, client):
        res = client.get("/api/analysis/usage", headers={"Authorization": f"Bearer {REVOKED_TOKEN}"})
        assert res.status_code == 401
        assert res.json()["detail"] == "Token revoked"


# ---------------------------------------------------------------------------
# Session: protected-route token checks and timeout
# ---------------------------------------------------------------------------

class TestSession:
    def test_session_config_exposes_backend_timeout(self, client):
        res = client.get("/api/auth/session-config")
        assert res.status_code == 200
        assert res.json() == {"timeout_minutes": SESSION_TIMEOUT_MINUTES}
        assert SESSION_TIMEOUT_MINUTES == 30

    def test_valid_token_grants_access(self, client, auth_headers):
        res = client.get("/api/analysis/usage", headers=auth_headers)
        assert res.status_code == 200
        assert res.json()["user_id"] == "uid-alice"

    def test_first_authenticated_request_upserts_profile(self, client, db, auth_headers):
        client.get("/api/analysis/usage", headers=auth_headers)
        profile = db.docs("users")["uid-alice"]
        assert profile["email"] == "alice@example.com"
        assert profile["auth_provider"] == "password"

    def test_missing_token_returns_401(self, client):
        res = client.get("/api/analysis/usage")
        assert res.status_code == 401
        assert res.json()["detail"] == "Missing bearer token"

    def test_expired_session_token_returns_401(self, client):
        res = client.get("/api/analysis/usage", headers={"Authorization": f"Bearer {EXPIRED_TOKEN}"})
        assert res.status_code == 401
        assert res.json()["detail"] == "Token expired"

    def test_forged_token_returns_401(self, client):
        res = client.get("/api/analysis/usage", headers={"Authorization": "Bearer not-a-real-token"})
        assert res.status_code == 401
        assert res.json()["detail"] == "Invalid token"

    def test_mock_login_token_is_not_a_valid_session(self, client):
        token = signup(client).json()["access_token"]
        res = client.get("/api/analysis/usage", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 401

    def test_unverified_email_returns_403(self, client, make_token):
        headers = make_token("uid-new", email="new@example.com", verified=False)
        res = client.get("/api/analysis/usage", headers=headers)
        assert res.status_code == 403
        assert res.json()["detail"] == "Email not verified"

    def test_me_returns_profile_or_404(self, client):
        user_id = signup(client).json()["user"]["user_id"]
        assert client.get("/api/auth/me", params={"user_id": user_id}).json()["email"] == "alice@example.com"
        assert client.get("/api/auth/me", params={"user_id": "missing"}).status_code == 404
