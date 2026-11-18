"""Grant or revoke the application admin claim on existing Firebase Auth users.

Run this script from the backend directory with trusted service-account
credentials. It is intentionally not exposed through the HTTP API.
"""

from __future__ import annotations

import argparse
from collections.abc import Iterable

from firebase_admin import auth
import firebase_config  # noqa: F401 — initializes the default Firebase app

MAX_APPLICATION_ADMINS = 5


def _normalise_emails(emails: Iterable[str]) -> list[str]:
    normalised = sorted({email.strip().lower() for email in emails if email.strip()})
    if not normalised:
        raise ValueError("At least one existing Firebase account email is required.")
    return normalised


def _existing_admin_uids() -> set[str]:
    admin_uids: set[str] = set()
    page = auth.list_users()
    while page:
        for user in page.users:
            if (user.custom_claims or {}).get("admin") is True:
                admin_uids.add(user.uid)
        page = page.get_next_page()
    return admin_uids


def _load_users(emails: Iterable[str]) -> list:
    selected_emails = _normalise_emails(emails)
    if len(selected_emails) > MAX_APPLICATION_ADMINS:
        raise ValueError(
            f"No more than {MAX_APPLICATION_ADMINS} administrator accounts may be designated."
        )
    selected_users = []
    for email in selected_emails:
        try:
            selected_users.append(auth.get_user_by_email(email))
        except auth.UserNotFoundError as exc:
            raise ValueError(f"No Firebase Authentication account exists for {email}.") from exc
    return selected_users


def grant_admin_claims(emails: Iterable[str]) -> list[str]:
    """Grant ``admin: true`` while preserving all other custom claims."""
    selected_users = _load_users(emails)
    selected_uids = {user.uid for user in selected_users}
    total_admins = _existing_admin_uids() | selected_uids
    if len(total_admins) > MAX_APPLICATION_ADMINS:
        raise ValueError(
            f"Granting these accounts would exceed the limit of "
            f"{MAX_APPLICATION_ADMINS} application administrators."
        )

    for user in selected_users:
        claims = dict(user.custom_claims or {})
        claims["admin"] = True
        auth.set_custom_user_claims(user.uid, claims)
    return [user.uid for user in selected_users]


def revoke_admin_claims(emails: Iterable[str]) -> list[str]:
    """Remove the ``admin`` claim while preserving all other custom claims."""
    selected_users = _load_users(emails)
    revoked: list[str] = []
    for user in selected_users:
        claims = dict(user.custom_claims or {})
        if "admin" not in claims:
            continue
        claims.pop("admin", None)
        auth.set_custom_user_claims(user.uid, claims or None)
        revoked.append(user.uid)
    return revoked


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Grant or revoke application administrator privileges for existing Firebase accounts."
    )
    parser.add_argument(
        "--email",
        action="append",
        required=True,
        help="Existing Firebase account email; repeat for multiple accounts (maximum five).",
    )
    parser.add_argument(
        "--revoke",
        action="store_true",
        help="Remove the admin claim instead of granting it.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    try:
        if args.revoke:
            uids = revoke_admin_claims(args.email)
            action = "Revoked application administrator privileges from"
        else:
            uids = grant_admin_claims(args.email)
            action = "Granted application administrator privileges to"
    except ValueError as exc:
        raise SystemExit(f"Error: {exc}") from exc
    print(f"{action} {len(uids)} existing account(s).")
    print("Users must refresh their Firebase ID token before the claim appears in requests.")


if __name__ == "__main__":
    main()
