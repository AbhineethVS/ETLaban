import json
import mimetypes
import os
import subprocess
import sys
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from etlab_auth import (
    EtlabAuthError,
    clear_session,
    load_session_meta,
    login as etlab_login,
    save_session,
    verify_session,
)


ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", "8000"))

API_FILES = {
    "/api/materials": "materials.json",
    "/api/attendance/subject": "attendance-subject.json",
    "/api/attendance/month": "attendance-month.json",
    "/api/attendance/day-details": "attendance-day-details.json",
    "/api/attendance/with-duty-leave": "attendance-with-duty-leave.json",
    "/api/attendance/credit": "credit-based-attendance.json",
    "/api/results": "results.json",
}

STATIC_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/app.js": "app.js",
    "/styles.css": "styles.css",
    "/manifest.webmanifest": "manifest.webmanifest",
    "/sw.js": "sw.js",
    "/icon.svg": "icon.svg",
}


def read_json_file(file_name):
    path = ROOT / file_name
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def file_updated_at(file_name):
    path = ROOT / file_name
    if not path.exists():
        return None
    return datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds")


def count_records(data):
    if data is None:
        return 0
    if isinstance(data, list):
        return len(data)
    if isinstance(data, dict):
        if "subjects" in data:
            return len(data["subjects"])
        if "days" in data:
            return len(data["days"])
        if "universityResult" in data:
            assessments = data.get("assessmentResults", {})
            assessment_count = sum(
                len(section.get("items", [])) for section in assessments.values()
            )
            return assessment_count + len(data.get("universityResult", []))
    return 1


def load_cookie():
    env_cookie = os.environ.get("ETLAB_COOKIE")
    if env_cookie:
        return env_cookie, "environment"

    env_path = ROOT / ".env"
    if not env_path.exists():
        return None, None

    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        if key.strip() != "ETLAB_COOKIE":
            continue

        return value.strip().strip("'").strip('"'), ".env"

    return None, None


def build_status(verify=False):
    cookie, cookie_source = load_cookie()
    session = load_session_meta() or {}
    files = {}

    for endpoint, file_name in API_FILES.items():
        data = read_json_file(file_name)
        files[file_name] = {
            "endpoint": endpoint,
            "exists": data is not None,
            "count": count_records(data),
            "updatedAt": file_updated_at(file_name),
        }

    status = {
        "ok": True,
        "hasCookie": bool(cookie),
        "cookieSource": cookie_source,
        "username": session.get("username"),
        "loggedInAt": session.get("loggedInAt"),
        "sessionSource": session.get("source"),
        "files": files,
    }

    if verify and cookie:
        status["sessionValid"] = verify_session(cookie).get("loggedIn", False)
    elif "sessionValid" in session:
        status["sessionValid"] = bool(session.get("sessionValid"))

    return status


def read_json_body(handler):
    content_length = int(handler.headers.get("Content-Length", "0"))
    raw_body = handler.rfile.read(content_length).decode("utf-8") if content_length else "{}"
    return json.loads(raw_body)


class BetterEtlabHandler(BaseHTTPRequestHandler):
    server_version = "BetterETLab/0.2"

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            cookie, cookie_source = load_cookie()
            self.write_json(
                {
                    "ok": True,
                    "hasCookie": bool(cookie),
                    "cookieSource": cookie_source,
                }
            )
            return

        if path == "/api/status":
            query = parsed.query
            verify = "verify=1" in query or "verify=true" in query
            self.write_json(build_status(verify=verify))
            return

        if path == "/api/me":
            self.handle_me()
            return

        if path in API_FILES:
            data = read_json_file(API_FILES[path])
            if data is None:
                self.write_json(
                    {"error": f"{API_FILES[path]} not generated yet"},
                    status=HTTPStatus.NOT_FOUND,
                )
                return
            self.write_json(data)
            return

        self.serve_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/login":
            self.handle_login()
            return

        if path == "/api/logout":
            self.handle_logout()
            return

        if path == "/api/cookie":
            self.handle_save_cookie()
            return

        if path == "/api/sync":
            self.handle_sync()
            return

        self.write_json({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)

    def handle_login(self):
        try:
            body = read_json_body(self)
            result = etlab_login(body.get("username", ""), body.get("password", ""))
        except json.JSONDecodeError:
            self.write_json({"error": "Invalid JSON body"}, status=HTTPStatus.BAD_REQUEST)
            return
        except EtlabAuthError as error:
            self.write_json({"error": str(error)}, status=HTTPStatus.UNAUTHORIZED)
            return

        status = build_status()
        status["login"] = {
            "ok": True,
            "username": result["username"],
        }
        self.write_json(status)

    def handle_logout(self):
        clear_session()
        self.write_json(
            {
                "ok": True,
                "hasCookie": False,
                "message": "Logged out. Local session cookie cleared.",
            }
        )

    def handle_me(self):
        cookie, cookie_source = load_cookie()
        session = load_session_meta() or {}
        verification = verify_session(cookie) if cookie else {"ok": False, "loggedIn": False}
        self.write_json(
            {
                "ok": True,
                "hasCookie": bool(cookie),
                "cookieSource": cookie_source,
                "username": session.get("username"),
                "loggedInAt": session.get("loggedInAt"),
                "sessionSource": session.get("source"),
                "sessionValid": verification.get("loggedIn", False),
            }
        )

    def handle_save_cookie(self):
        try:
            body = read_json_body(self)
            cookie = str(body.get("cookie", ""))
            save_session(body.get("username") or "manual", cookie, source="manual-cookie")
        except json.JSONDecodeError:
            self.write_json({"error": "Invalid JSON body"}, status=HTTPStatus.BAD_REQUEST)
            return
        except EtlabAuthError as error:
            self.write_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        self.write_json(build_status())

    def handle_sync(self):
        cookie, cookie_source = load_cookie()
        if not cookie:
            self.write_json(
                {"error": "Please login first. No ETLab session cookie found."},
                status=HTTPStatus.BAD_REQUEST,
            )
            return

        verification = verify_session(cookie)
        if not verification.get("loggedIn"):
            clear_session()
            self.write_json(
                {
                    "error": "Session expired. Please login again.",
                    "sessionValid": False,
                },
                status=HTTPStatus.UNAUTHORIZED,
            )
            return

        try:
            body = {}
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length:
                body = read_json_body(self)
        except json.JSONDecodeError:
            body = {}

        force_refresh = bool(body.get("forceRefresh"))

        try:
            child_env = {
                **os.environ,
                "ETLAB_COOKIE": cookie,
                "ETLAB_FORCE_REFRESH": "1" if force_refresh else "0",
            }
            result = subprocess.run(
                [sys.executable, "fetch_etlab.py"],
                cwd=ROOT,
                env=child_env,
                check=True,
                capture_output=True,
                text=True,
            )
        except subprocess.CalledProcessError as error:
            combined = f"{error.stdout or ''}\n{error.stderr or ''}".lower()
            if "login" in combined and ("required" in combined or "user/login" in combined):
                clear_session()
                self.write_json(
                    {
                        "error": "Session expired during sync. Please login again.",
                        "stdout": error.stdout,
                        "stderr": error.stderr,
                        "sessionValid": False,
                    },
                    status=HTTPStatus.UNAUTHORIZED,
                )
                return

            self.write_json(
                {
                    "error": "Sync failed",
                    "stdout": error.stdout,
                    "stderr": error.stderr,
                },
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )
            return

        self.write_json(
            {
                "ok": True,
                "cookieSource": cookie_source,
                "forceRefresh": force_refresh,
                "stdout": result.stdout,
                "stderr": result.stderr,
            }
        )

    def serve_static(self, path):
        if path not in STATIC_FILES:
            self.write_json({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)
            return

        file_path = ROOT / STATIC_FILES[path]
        if not file_path.exists():
            self.write_json({"error": "File not found"}, status=HTTPStatus.NOT_FOUND)
            return

        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        if file_path.suffix == ".webmanifest":
            content_type = "application/manifest+json"

        content = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def write_json(self, data, status=HTTPStatus.OK):
        content = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format, *args):
        print(f"{self.address_string()} - {unquote(format % args)}")


def main():
    server = ThreadingHTTPServer((HOST, PORT), BetterEtlabHandler)
    print(f"Better ETLab backend running at http://{HOST}:{PORT}")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
