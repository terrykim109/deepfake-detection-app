# backend/usernames.py
"""Unique, case-sensitive usernames ("Alex" and "alex" are different people).

Every taken name has its own doc in the `usernames` collection. Claiming a name
writes that doc and the user's profile in one transaction, so two people saving
the same name at the same moment can't both get it.
"""

import re

from firebase_admin import firestore

from firebase_config import db
from helpers import now_iso

USERNAME_RULE = "Usernames are 3 to 20 characters: letters, numbers, _ and ."
USERNAME_TAKEN = "That username is taken. Try another one."

_PATTERN = re.compile(r"[A-Za-z0-9_.]{3,20}")


class UsernameTaken(Exception):
    pass


def is_valid_username(name: str) -> bool:
    return bool(_PATTERN.fullmatch(name))


def _name_doc(name: str):
    # The prefix keeps names like "__x__" clear of Firestore's reserved doc IDs
    return db.collection("usernames").document(f"u_{name}")


def is_username_free(name: str) -> bool:
    return not _name_doc(name).get().exists


@firestore.transactional
def _claim(transaction, user_id: str, name: str, profile: dict) -> None:
    user_doc = db.collection("users").document(user_id)
    name_doc = _name_doc(name)

    # Firestore transactions need every read before the first write
    user_snap = user_doc.get(transaction=transaction)
    name_snap = name_doc.get(transaction=transaction)
    owner = (name_snap.to_dict() or {}).get("user_id") if name_snap.exists else None
    if owner and owner != user_id:
        raise UsernameTaken(name)

    old = (user_snap.to_dict() or {}).get("username") if user_snap.exists else None
    old_doc = _name_doc(old) if old and old != name else None
    old_owned = False
    if old_doc is not None:
        old_snap = old_doc.get(transaction=transaction)
        old_owned = old_snap.exists and (old_snap.to_dict() or {}).get("user_id") == user_id

    if old_owned:
        transaction.delete(old_doc)
    if owner is None:
        transaction.set(name_doc, {"user_id": user_id, "username": name, "created_at": now_iso()})
    # display_name mirrors the username so the admin list and token fallbacks match
    transaction.set(user_doc, {**profile, "username": name, "display_name": name}, merge=True)


def claim_username(user_id: str, name: str, profile: dict | None = None) -> None:
    """Give `name` to user_id, free their previous name, and merge `profile` into their doc.

    Raises UsernameTaken if someone else already owns the name.
    """
    _claim(db.transaction(), user_id, name, profile or {})
