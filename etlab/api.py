"""HTTP API shared by the Vercel function (api/index.py) and the local server.

    POST /api/login        {username, password}  -> sets the session cookie
    POST /api/cookie       {cookie}              -> same, from a pasted ETLab cookie
    POST /api/logout                             -> clears it
    GET  /api/me                                 -> {loggedIn, username}
    GET  /api/attendance | /api/results | /api/materials   (fetched live from ETLab)
"""

import json
import traceback
from dataclasses import dataclass, field

from . import attendance, client, materials, results, session

MAX_BODY = 16 * 1024
DATA_ROUTES = {
    "/api/attendance": attendance.fetch,
    "/api/results": results.fetch,
    "/api/materials": materials.fetch,
}


@dataclass
class Response:
    status: int
    body: bytes
    headers: list = field(default_factory=list)


def _json(status: int, data, cookies=()):
    headers = [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Cache-Control", "private, no-store"),
        ("X-Content-Type-Options", "nosniff"),
    ]
    headers += [("Set-Cookie", cookie) for cookie in cookies]
    return Response(status, json.dumps(data, ensure_ascii=False).encode("utf-8"), headers)


def _error(status: int, message: str, cookies=(), **extra):
    return _json(status, {"error": message, **extra}, cookies)


def _is_secure(headers) -> bool:
    return (headers.get("x-forwarded-proto") or "").split(",")[0].strip() == "https"


def _read_json(body: bytes):
    if len(body) > MAX_BODY:
        raise ValueError("Request too large")
    data = json.loads(body or b"{}")
    if not isinstance(data, dict):
        raise ValueError("Expected a JSON object")
    return data


def _start_session(etlab_cookie: str, username: str, secure: bool):
    token = session.seal(etlab_cookie, username)
    return _json(200, {"ok": True, "username": username}, [session.set_cookie(token, secure)])


def handle(method: str, path: str, headers, body: bytes = b"") -> Response:
    """headers: any case-insensitive mapping with .get()."""
    path = "/" + path.strip("/")
    secure = _is_secure(headers)

    try:
        if path == "/api/health":
            return _json(200, {"ok": True})

        if method == "POST" and path in {"/api/login", "/api/cookie", "/api/logout"}:
            # JSON only: combined with SameSite=Lax this blocks cross-site form posts.
            if path != "/api/logout" and "application/json" not in (headers.get("content-type") or ""):
                return _error(415, "Send JSON")

            if path == "/api/logout":
                return _json(200, {"ok": True}, [session.clear_cookie(secure)])

            data = _read_json(body)
            if path == "/api/login":
                username = str(data.get("username") or "").strip()
                etlab_cookie = client.login(username, str(data.get("password") or ""))
                return _start_session(etlab_cookie, username, secure)

            etlab_cookie = client.normalise_cookie(str(data.get("cookie") or ""))
            if not client.verify(etlab_cookie):
                return _error(401, "That cookie isn't a valid ETLab session")
            return _start_session(etlab_cookie, "", secure)

        current = session.read(headers.get("cookie") or "")

        if method == "GET" and path == "/api/me":
            return _json(200, {"loggedIn": bool(current), "username": current["username"] if current else None})

        if method == "GET" and path in DATA_ROUTES:
            if not current:
                return _error(401, "Log in to continue", expired=False)
            return _json(200, DATA_ROUTES[path](client.Client(current["cookie"])))

        return _error(404, "Not found")

    except client.SessionExpired:
        return _error(401, "Your ETLab session expired. Log in again.", [session.clear_cookie(secure)], expired=True)
    except client.LoginFailed as error:
        return _error(401, str(error))
    except client.EtlabError as error:
        return _error(502, str(error))
    except (ValueError, json.JSONDecodeError) as error:
        return _error(400, str(error) or "Bad request")
    except Exception:  # Never leak internals (or credentials) in the response.
        traceback.print_exc()
        return _error(500, "Something went wrong on our side")
