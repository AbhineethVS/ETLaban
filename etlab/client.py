import random
import re
import time
from concurrent.futures import ThreadPoolExecutor
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen

from .tables import BASE_URL

LOGIN_URL = f"{BASE_URL}/user/login"
DASHBOARD_URL = f"{BASE_URL}/user/dashboard"
# Real mobile Chrome UA: ETLab sits behind Cloudflare and often challenges bot-like clients.
USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36"
)
TIMEOUT = 25
MAX_RETRIES = 4
RETRY_STATUS = {408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524}
MAX_PARALLEL = 4


class EtlabError(Exception):
    """ETLab could not be reached or answered with an error."""


class SessionExpired(EtlabError):
    """The ETLab session is no longer valid; the student has to log in again."""


class LoginFailed(EtlabError):
    """Username/password rejected, or login did not produce a session."""


def looks_like_login_page(html: str, url: str = "") -> bool:
    return 'id="login-form"' in html or "etlab | login" in html.lower() or "/user/login" in url


def is_etlab_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == "https" and parsed.hostname == urlparse(BASE_URL).hostname


def _headers(extra=None):
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }
    headers.update(extra or {})
    return headers


def _cloudflare_block(html: str, status: int) -> bool:
    if status not in (403, 503):
        return False
    lower = html.lower()
    return "cloudflare" in lower or "cf-ray" in lower or "attention required" in lower


def _retry_delay(attempt: int) -> None:
    time.sleep(min(8.0, (0.5 * (2**attempt)) + random.uniform(0, 0.3)))


def _raise_http_error(body: str, url: str, code: int, *, login: bool = False):
    if _cloudflare_block(body, code):
        raise EtlabError("ETLab's firewall blocked the server. Wait a minute and try again.")

    if login:
        raise EtlabError(f"ETLab login failed ({code})")

    if code in (401, 403) and looks_like_login_page(body, url):
        raise SessionExpired("Your ETLab session expired")

    if code == 403:
        raise EtlabError("ETLab blocked the request. Wait a minute and try again.")

    raise EtlabError(f"ETLab returned an error ({code})")


def _fetch(url, data=None, extra_headers=None, opener=None, *, login: bool = False):
    """GET or POST with retries on timeouts and transient HTTP errors."""
    method = "POST" if data is not None else "GET"
    last_network = None

    for attempt in range(MAX_RETRIES):
        request = Request(url, data=data, headers=_headers(extra_headers), method=method)
        try:
            open_fn = opener.open if opener else urlopen
            with open_fn(request, timeout=TIMEOUT) as response:
                html = response.read().decode("utf-8", errors="replace")
                return html, response.geturl()
        except HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            url = error.geturl() or ""
            if error.code in RETRY_STATUS or _cloudflare_block(body, error.code):
                if attempt + 1 < MAX_RETRIES:
                    _retry_delay(attempt)
                    continue
            _raise_http_error(body, url, error.code, login=login)
        except (URLError, TimeoutError, OSError) as error:
            last_network = error
            if attempt + 1 < MAX_RETRIES:
                _retry_delay(attempt)
                continue
            raise EtlabError("Could not reach ETLab. ETLab may be down or busy — try again in a minute.") from error

    if last_network:
        raise EtlabError("Could not reach ETLab. ETLab may be down or busy — try again in a minute.") from last_network
    raise EtlabError("Could not reach ETLab. ETLab may be down or busy — try again in a minute.")


class Client:
    """Fetches ETLab pages with one student's session cookie."""

    def __init__(self, cookie: str):
        self.cookie = cookie

    def get(self, path_or_url: str, ajax: bool = False) -> str:
        url = urljoin(BASE_URL, path_or_url)
        if not is_etlab_url(url):
            raise EtlabError("Refusing to fetch a non-ETLab URL")

        extra = {"Cookie": self.cookie}
        if ajax:
            extra["X-Requested-With"] = "XMLHttpRequest"

        html, final_url = _fetch(url, extra_headers=extra)

        if looks_like_login_page(html, final_url):
            raise SessionExpired("Your ETLab session expired")
        return html

    def get_many(self, urls, ajax: bool = False):
        """Fetch several pages in parallel. Failed pages come back as None."""

        def fetch(url):
            try:
                return self.get(url, ajax=ajax)
            except SessionExpired:
                raise
            except EtlabError:
                return None

        urls = list(urls)
        if not urls:
            return []
        with ThreadPoolExecutor(max_workers=min(MAX_PARALLEL, len(urls))) as pool:
            return list(pool.map(fetch, urls))


def _extract_csrf_token(html: str) -> str:
    match = re.search(r'"YII_CSRF_TOKEN"\s*:\s*"([^"]+)"', html)
    if not match:
        raise EtlabError("ETLab's login page changed; couldn't find its CSRF token")
    return match.group(1)


def login(username: str, password: str) -> str:
    """Log in to ETLab and return the session cookie header. The password is not kept."""
    username = (username or "").strip()
    if not username or not password:
        raise LoginFailed("Enter your ETLab username and password")

    jar = CookieJar()
    opener = build_opener(HTTPCookieProcessor(jar))

    try:
        html, _ = _fetch(LOGIN_URL, opener=opener)
        csrf = _extract_csrf_token(html)
        body = urlencode({
            "LoginForm[username]": username,
            "LoginForm[password]": password,
            "LoginForm[rememberMe]": "1",  # Ask ETLab for a longer session; ignored if unsupported.
            "YII_CSRF_TOKEN": csrf,
            "yt0": "",
        }).encode("utf-8")
        html, _ = _fetch(
            LOGIN_URL,
            data=body,
            extra_headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": LOGIN_URL,
                "Origin": BASE_URL,
            },
            opener=opener,
            login=True,
        )
    except EtlabError:
        raise

    if "Invalid username or password" in html or 'id="login-form"' in html:
        raise LoginFailed("Invalid username or password")

    cookie = "; ".join(f"{c.name}={c.value}" for c in jar)
    if "CETSESSIONID=" not in cookie:
        raise LoginFailed("ETLab didn't start a session. Try again.")

    # Make sure the new session can actually open the dashboard.
    try:
        Client(cookie).get(DASHBOARD_URL)
    except SessionExpired as error:
        raise LoginFailed("ETLab sent you back to the login page. Try again.") from error
    return cookie


def normalise_cookie(value: str) -> str:
    cookie = (value or "").strip()
    if cookie.lower().startswith("cookie:"):
        cookie = cookie.split(":", 1)[1].strip()
    if "=" not in cookie:
        raise LoginFailed("That doesn't look like a cookie")
    return cookie


def verify(cookie: str) -> bool:
    try:
        Client(cookie).get(DASHBOARD_URL)
        return True
    except SessionExpired:
        return False
