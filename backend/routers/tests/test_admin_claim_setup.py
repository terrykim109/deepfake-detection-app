import sys
import types

import pytest


if "firebase_config" not in sys.modules:
    fake_firebase_config = types.ModuleType("firebase_config")
    fake_firebase_config.db = types.SimpleNamespace()
    sys.modules["firebase_config"] = fake_firebase_config

from scripts import set_admin_claim


class _User:
    def __init__(self, uid, email, claims=None):
        self.uid = uid
        self.email = email
        self.custom_claims = claims or {}


class _Page:
    def __init__(self, users, next_page=None):
        self.users = users
        self._next_page = next_page

    def get_next_page(self):
        return self._next_page


def test_grant_preserves_existing_claims_and_sets_admin(monkeypatch):
    selected = _User("uid-1", "admin@example.com", {"team": "ops"})
    calls = []

    monkeypatch.setattr(set_admin_claim.auth, "get_user_by_email", lambda email: selected)
    monkeypatch.setattr(
        set_admin_claim.auth,
        "list_users",
        lambda: _Page([_User("uid-2", "other@example.com")]),
    )
    monkeypatch.setattr(
        set_admin_claim.auth,
        "set_custom_user_claims",
        lambda uid, claims: calls.append((uid, claims)),
    )

    assert set_admin_claim.grant_admin_claims([" ADMIN@example.com "]) == ["uid-1"]
    assert calls == [("uid-1", {"team": "ops", "admin": True})]


def test_grant_rejects_unknown_account(monkeypatch):
    monkeypatch.setattr(
        set_admin_claim.auth,
        "get_user_by_email",
        lambda email: (_ for _ in ()).throw(set_admin_claim.auth.UserNotFoundError("missing")),
    )

    with pytest.raises(ValueError, match="No Firebase Authentication account"):
        set_admin_claim.grant_admin_claims(["missing@example.com"])


def test_grant_rejects_more_than_five_total_admins(monkeypatch):
    selected = _User("uid-6", "sixth@example.com")
    current_admins = [_User(f"uid-{index}", f"{index}@example.com", {"admin": True}) for index in range(1, 6)]
    monkeypatch.setattr(set_admin_claim.auth, "get_user_by_email", lambda email: selected)
    monkeypatch.setattr(
        set_admin_claim.auth,
        "list_users",
        lambda: _Page(current_admins),
    )

    with pytest.raises(ValueError, match="exceed the limit"):
        set_admin_claim.grant_admin_claims(["sixth@example.com"])
