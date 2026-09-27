"""Seal each student's ETLab session into their own browser cookie.

The server keeps no session store. The ETLab cookie is encrypted with
SESSION_SECRET (Fernet: AES + HMAC), so a copied browser cookie can't be
turned back into a raw ETLab session, and it can't be forged or edited.

When a student ticks "Keep me signed in", their password is sealed into the
same cookie so the server can log back in to ETLab when that session ends.
It never leaves the cookie in readable form and is never stored server-side.
"""

import base64
import hashlib
import json
import os
import secrets
import time
from http.cookies import SimpleCookie
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

COOKIE_NAME = "be_session"
# ETLab usually expires sessions sooner. Then we log back in (if remembered) or ask the student to.
# Each renewal issues a fresh cookie, so a remembered login only ends after 30 days unused.
MAX_AGE = 30 * 24 * 60 * 60
LOCAL_SECRET_PATH = Path(__file__).resolve().parent.parent / ".session-secret"

_fernet = None


def _secret() -> str:
    secret = os.environ.get("SESSION_SECRET", "").strip()
    if secret:
        return secret
    if os.environ.get("VERCEL"):
        raise RuntimeError("SESSION_SECRET is not set. Add it in the Vercel project settings.")
    # Local development: keep a generated secret next to the code (gitignored).
    if not LOCAL_SECRET_PATH.exists():
        LOCAL_SECRET_PATH.write_text(secrets.token_urlsafe(48), encoding="utf-8")
    return LOCAL_SECRET_PATH.read_text(encoding="utf-8").strip()


def _box() -> Fernet:
    global _fernet
    if _fernet is None:
        key = base64.urlsafe_b64encode(hashlib.sha256(_secret().encode("utf-8")).digest())
        _fernet = Fernet(key)
    return _fernet


def seal(etlab_cookie: str, username: str, password: str = "") -> str:
    data = {"c": etlab_cookie, "u": username, "t": int(time.time())}
    if password:
        data["p"] = password
    payload = json.dumps(data, separators=(",", ":"))
    return _box().encrypt(payload.encode("utf-8")).decode("ascii")


def unseal(token: str):
    try:
        data = json.loads(_box().decrypt(token.encode("ascii"), ttl=MAX_AGE))
    except (InvalidToken, ValueError, UnicodeError):
        return None
    if not isinstance(data, dict) or not data.get("c"):
        return None
    return {
        "cookie": data["c"],
        "username": data.get("u") or "",
        "password": data.get("p") or "",
        "issuedAt": data.get("t"),
    }


def read(cookie_header: str):
    if not cookie_header:
        return None
    jar = SimpleCookie()
    try:
        jar.load(cookie_header)
    except Exception:
        return None
    morsel = jar.get(COOKIE_NAME)
    return unseal(morsel.value) if morsel else None


def set_cookie(token: str, secure: bool) -> str:
    return f"{COOKIE_NAME}={token}; Path=/; Max-Age={MAX_AGE}; HttpOnly; SameSite=Lax" + ("; Secure" if secure else "")


def clear_cookie(secure: bool) -> str:
    return f"{COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax" + ("; Secure" if secure else "")
