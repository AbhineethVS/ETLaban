import json
import os
import re
import subprocess
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse, parse_qs
from urllib.request import Request, urlopen


BASE_URL = "https://cet.etlab.in"


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.current_link = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "a" and attrs.get("href"):
            self.current_link = {
                "href": urljoin(BASE_URL, attrs["href"]),
                "text_parts": [],
            }

    def handle_endtag(self, tag):
        if tag == "a" and self.current_link is not None:
            self.current_link["text"] = normalize_text("".join(self.current_link["text_parts"]))
            del self.current_link["text_parts"]
            self.links.append(self.current_link)
            self.current_link = None

    def handle_data(self, data):
        if self.current_link is not None:
            self.current_link["text_parts"].append(data)


def normalize_text(value: str) -> str:
    return " ".join(value.replace("\xa0", " ").split())


def request_headers(cookie: str, ajax=False):
    headers = {
        "Cookie": cookie,
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    if ajax:
        headers["X-Requested-With"] = "XMLHttpRequest"
    return headers


def fetch_html(url: str, cookie: str, ajax=False) -> str:
    request = Request(url, headers=request_headers(cookie, ajax=ajax))
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def save_html(url: str, output_path: str, cookie: str, ajax=False) -> str:
    print(f"Fetching {url} -> {output_path}")
    html = fetch_html(url, cookie, ajax=ajax)
    Path(output_path).write_text(html, encoding="utf-8")
    return html


def extract_links(html: str):
    parser = LinkParser()
    parser.feed(html)
    return parser.links


def material_page_number(url: str):
    query = parse_qs(urlparse(url).query)
    page_values = query.get("page")
    if not page_values:
        return None
    try:
        return int(page_values[0])
    except ValueError:
        return None


def fetch_materials(cookie: str):
    first_page_url = urljoin(BASE_URL, "/student/materials")
    first_page_html = save_html(first_page_url, "materials.html", cookie)

    material_links = extract_links(first_page_html)
    page_urls = {
        link["href"]
        for link in material_links
        if "/student/materials" in link["href"] and material_page_number(link["href"])
    }

    for page_url in sorted(page_urls, key=material_page_number):
        page_number = material_page_number(page_url)
        save_html(page_url, f"materials-page-{page_number}.html", cookie, ajax="ajax=" in page_url)


def find_attendance_links(html: str):
    links = extract_links(html)
    wanted = {
        "attendance by month": "attendance-month.html",
        "attendance by subject": "attendance-subject.html",
        "attendance by subject with dutyleave": "attendance-by-sub-with-duty-leave.html",
        "credit based attendance": "credit-based-attendance.html",
    }

    found = {}
    for link in links:
        text = link["text"].lower()
        for label, output_path in wanted.items():
            if text == label:
                found[output_path] = link["href"]

    return found


def fetch_attendance(cookie: str):
    attendance_url = urljoin(BASE_URL, "/ktuacademics/student/attendance")
    attendance_html = save_html(attendance_url, "attendance.html", cookie)

    attendance_links = find_attendance_links(attendance_html)
    for output_path, url in attendance_links.items():
        save_html(url, output_path, cookie)


def fetch_results(cookie: str):
    results_url = urljoin(BASE_URL, "/student/results")
    save_html(results_url, "results.html", cookie)


def run_parser(command):
    print(f"Running {' '.join(command)}")
    subprocess.run(command, check=True)


def fetch_day_details(cookie: str, force_refresh=False):
    month_json_path = Path("attendance-month.json")
    if not month_json_path.exists():
        return

    month_data = json.loads(month_json_path.read_text(encoding="utf-8"))
    for day in month_data.get("days", []):
        details_url = day.get("detailsUrl")
        date = day.get("date")
        if not details_url or not date:
            continue

        output_path = Path(f"attendance-day-{date}.html")
        if output_path.exists() and not force_refresh:
            print(f"Skipping existing {output_path}")
            continue

        if force_refresh and output_path.exists():
            print(f"Refreshing {output_path}")

        save_html(details_url, str(output_path), cookie, ajax=True)
        time.sleep(0.3)


def main():
    cookie = os.environ.get("ETLAB_COOKIE")
    if not cookie:
        print("Missing ETLAB_COOKIE environment variable.", file=sys.stderr)
        print("Example: export ETLAB_COOKIE='PHPSESSID=...; other_cookie=...'", file=sys.stderr)
        sys.exit(1)

    force_refresh = os.environ.get("ETLAB_FORCE_REFRESH", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }

    fetch_materials(cookie)
    fetch_attendance(cookie)
    fetch_results(cookie)

    run_parser([sys.executable, "parse_materials.py"])
    run_parser([sys.executable, "parse_attendance.py"])
    fetch_day_details(cookie, force_refresh=force_refresh)
    run_parser([sys.executable, "parse_attendance.py"])
    run_parser([sys.executable, "parse_results.py"])


if __name__ == "__main__":
    main()
