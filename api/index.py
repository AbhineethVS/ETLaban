"""Vercel serverless entry point. vercel.json rewrites /api/* here as ?path=<rest>."""

import os
import sys
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from etlab.api import MAX_BODY, handle  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def _dispatch(self, method):
        url = urlparse(self.path)
        rewritten = parse_qs(url.query).get("path", [""])[0]
        path = f"/api/{rewritten}" if rewritten else url.path

        length = int(self.headers.get("content-length") or 0)
        body = self.rfile.read(min(length, MAX_BODY + 1)) if length else b""

        response = handle(method, path, self.headers, body)
        self.send_response(response.status)
        for name, value in response.headers:
            self.send_header(name, value)
        self.send_header("Content-Length", str(len(response.body)))
        self.end_headers()
        self.wfile.write(response.body)

    def log_message(self, format, *args):
        # Keep request logs to method + path; never log bodies or cookies.
        sys.stderr.write(f"{self.command} {urlparse(self.path).path}\n")
