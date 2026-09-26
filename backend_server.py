"""Run ETLaban locally (PC + phone on the same Wi-Fi).

Same API as the Vercel deployment (see etlab/api.py), plus the static files.
Each browser gets its own sealed session cookie; nothing is written to disk
except a generated .session-secret for local development.
"""

import json
import mimetypes
import os
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from etlab.api import MAX_BODY, handle

HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8000"))
ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"

PAGES = {"/": "index.html", "/login": "login.html", "/app": "app.html"}
STATIC_TYPES = {".html", ".css", ".js", ".svg", ".png", ".webmanifest"}


def load_vercel_headers():
    """Send the same security headers locally as vercel.json does in production."""
    try:
        config = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    rules = {}
    for rule in config.get("headers", []):
        source = {"/(.*)": "*"}.get(rule["source"], rule["source"])
        rules.setdefault(source, []).extend((h["key"], h["value"]) for h in rule["headers"])
    return rules


HEADER_RULES = load_vercel_headers()


class EtlabanHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")

    def _route(self, method):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            length = int(self.headers.get("content-length") or 0)
            body = self.rfile.read(min(length, MAX_BODY + 1)) if length else b""
            response = handle(method, path, self.headers, body)
            self._send(response.status, response.body, response.headers)
        elif method == "GET":
            self._serve_static(path)
        else:
            self._send(405, b"Method not allowed", [("Content-Type", "text/plain")])

    def _serve_static(self, path):
        name = PAGES.get(path.rstrip("/") or "/", path.lstrip("/"))
        file_path = (PUBLIC / name).resolve()
        # Only files directly inside public/, never anything else on disk.
        if file_path.parent != PUBLIC or file_path.suffix not in STATIC_TYPES or not file_path.is_file():
            self._send(404, b"Not found", [("Content-Type", "text/plain")])
            return

        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        if file_path.suffix == ".webmanifest":
            content_type = "application/manifest+json"
        self._send(200, file_path.read_bytes(), [("Content-Type", content_type), ("Cache-Control", "no-cache")])

    def _send(self, status, body, headers):
        self.send_response(status)
        path = urlparse(self.path).path
        overrides = HEADER_RULES.get("*", []) + HEADER_RULES.get(path, [])
        names = {name.lower() for name, _ in overrides}
        for name, value in [h for h in headers if h[0].lower() not in names] + overrides:
            self.send_header(name, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        # Method + path only; never bodies or cookies.
        print(f"{self.address_string()} {self.command} {unquote(urlparse(self.path).path)}")


def lan_ips():
    ips = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, family=socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except OSError:
        pass
    return ips


def main():
    server = ThreadingHTTPServer((HOST, PORT), EtlabanHandler)
    print(f"ETLaban running on {HOST}:{PORT}")
    print(f"Local:  http://127.0.0.1:{PORT}/")
    for ip in lan_ips():
        print(f"Phone:  http://{ip}:{PORT}/")
    print("Same Wi-Fi required. Allow Python through Windows Firewall if the phone can't connect.")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
