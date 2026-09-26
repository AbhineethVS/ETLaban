import re
from concurrent.futures import ThreadPoolExecutor
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen

from .tables import BASE_URL

LOGIN_URL = f"{BASE_URL}/user/login"
DASHBOARD_URL = f"{BASE_URL}/user/dashboard"
USER_AGENT = "Mozilla/5.0 (compatible; ETLaban)"
TIMEOUT = 20
MAX_PARALLEL = 6


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
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    headers.update(extra or {})
    return headers


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

        try:
            with urlopen(Request(url, headers=_headers(extra)), timeout=TIMEOUT) as response:
                html = response.read().decode("utf-8", errors="replace")
                final_url = response.geturl()
        except HTTPError as error:
            if error.code in (401, 403):
                raise SessionExpired("Your ETLab session expired") from error
            raise EtlabError(f"ETLab returned an error ({error.code})") from error
        except (URLError, TimeoutError, OSError) as error:
            raise EtlabError("Could not reach ETLab") from error

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

    def open_page(url, data=None, headers=None):
        request = Request(url, data=data, headers=_headers(headers))
        with opener.open(request, timeout=TIMEOUT) as response:
            return response.read().decode("utf-8", errors="replace")

    try:
        csrf = _extract_csrf_token(open_page(LOGIN_URL))
        body = urlencode({
            "LoginForm[username]": username,
            "LoginForm[password]": password,
            "YII_CSRF_TOKEN": csrf,
            "yt0": "",
        }).encode("utf-8")
        html = open_page(
            LOGIN_URL,
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": LOGIN_URL, "Origin": BASE_URL},
        )
    except HTTPError as error:
        raise EtlabError(f"ETLab login failed ({error.code})") from error
    except (URLError, TimeoutError, OSError) as error:
        raise EtlabError("Could not reach ETLab") from error

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
