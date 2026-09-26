import json
import re
from datetime import datetime, timezone
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener


BASE_URL = "https://cet.etlab.in"
LOGIN_URL = f"{BASE_URL}/user/login"
DASHBOARD_URL = f"{BASE_URL}/user/dashboard"
SESSION_PATH = Path(__file__).resolve().parent / "session.json"
ENV_PATH = Path(__file__).resolve().parent / ".env"
USER_AGENT = "Mozilla/5.0"


class EtlabAuthError(Exception):
    pass


def _opener(jar=None):
    jar = jar or CookieJar()
    return build_opener(HTTPCookieProcessor(jar)), jar


def _request(opener, url, data=None, headers=None):
    request_headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    if headers:
        request_headers.update(headers)
    request = Request(url, data=data, headers=request_headers)
    return opener.open(request, timeout=30)


def cookie_header_from_jar(jar):
    pairs = []
    for cookie in jar:
        pairs.append(f"{cookie.name}={cookie.value}")
    return "; ".join(pairs)


def extract_csrf_token(html: str):
    match = re.search(r'"YII_CSRF_TOKEN"\s*:\s*"([^"]+)"', html)
    if not match:
        raise EtlabAuthError("Could not find ETLab CSRF token")
    return match.group(1)


def save_env_cookie(cookie: str):
    cookie = cookie.strip()
    if cookie.lower().startswith("cookie:"):
        cookie = cookie.split(":", 1)[1].strip()
    if not cookie or "=" not in cookie:
        raise EtlabAuthError("Cookie value is invalid")
    ENV_PATH.write_text(f"ETLAB_COOKIE={cookie}\n", encoding="utf-8")


def save_session(username: str, cookie: str, source: str = "login"):
    save_env_cookie(cookie)
    payload = {
        "username": username,
        "loggedInAt": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "hasCookie": True,
    }
    SESSION_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def clear_session():
    if ENV_PATH.exists():
        ENV_PATH.unlink()
    if SESSION_PATH.exists():
        SESSION_PATH.unlink()


def load_session_meta():
    if not SESSION_PATH.exists():
        return None
    try:
        return json.loads(SESSION_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def login(username: str, password: str):
    username = (username or "").strip()
    password = password or ""
    if not username or not password:
        raise EtlabAuthError("Username and password are required")

    opener, jar = _opener()
    try:
        login_html = _request(opener, LOGIN_URL).read().decode("utf-8", errors="replace")
        csrf = extract_csrf_token(login_html)
        body = urlencode(
            {
                "LoginForm[username]": username,
                "LoginForm[password]": password,
                "YII_CSRF_TOKEN": csrf,
                "yt0": "",
            }
        ).encode("utf-8")
        response = _request(
            opener,
            LOGIN_URL,
            data=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": LOGIN_URL,
                "Origin": BASE_URL,
            },
        )
        html = response.read().decode("utf-8", errors="replace")
        final_url = response.geturl()
    except HTTPError as error:
        raise EtlabAuthError(f"ETLab login request failed ({error.code})") from error
    except URLError as error:
        raise EtlabAuthError(f"Could not reach ETLab: {error.reason}") from error

    if "Invalid username or password" in html or 'id="login-form"' in html:
        raise EtlabAuthError("Invalid username or password")

    cookie = cookie_header_from_jar(jar)
    if "CETSESSIONID=" not in cookie:
        raise EtlabAuthError("Login appeared to succeed but no session cookie was returned")

    # Confirm the session can open the dashboard.
    try:
        dash = _request(opener, DASHBOARD_URL).read().decode("utf-8", errors="replace")
    except Exception as error:
        raise EtlabAuthError("Logged in, but dashboard check failed") from error

    if 'id="login-form"' in dash or "etlab | login" in dash.lower():
        raise EtlabAuthError("Login failed: still redirected to login page")

    session = save_session(username, cookie, source="login")
    return {
        "ok": True,
        "username": username,
        "finalUrl": final_url,
        "session": session,
    }


def verify_session(cookie: str):
    if not cookie:
        return {"ok": False, "loggedIn": False}

    opener, jar = _opener()
    # Seed jar from cookie header.
    for part in cookie.split(";"):
        part = part.strip()
        if "=" not in part:
            continue
        name, value = part.split("=", 1)
        from http.cookiejar import Cookie

        jar.set_cookie(
            Cookie(
                version=0,
                name=name.strip(),
                value=value.strip(),
                port=None,
                port_specified=False,
                domain="cet.etlab.in",
                domain_specified=True,
                domain_initial_dot=False,
                path="/",
                path_specified=True,
                secure=True,
                expires=None,
                discard=True,
                comment=None,
                comment_url=None,
                rest={},
                rfc2109=False,
            )
        )

    try:
        html = _request(opener, DASHBOARD_URL).read().decode("utf-8", errors="replace")
    except Exception:
        return {"ok": False, "loggedIn": False}

    logged_in = 'id="login-form"' not in html and "etlab | login" not in html.lower()
    return {"ok": True, "loggedIn": logged_in}
