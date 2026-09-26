from html.parser import HTMLParser
from urllib.parse import parse_qs, urljoin, urlparse

from .client import Client, is_etlab_url
from .tables import BASE_URL, clean_text, extract_links

MATERIALS_URL = "/student/materials"


class _MaterialsTableParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_tbody = self.in_row = self.in_cell = False
        self.cell, self.link, self.row, self.rows = [], None, [], []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "tbody":
            self.in_tbody = True
        elif self.in_tbody and tag == "tr":
            self.in_row, self.row = True, []
        elif self.in_row and tag == "td":
            self.in_cell, self.cell, self.link = True, [], None
        elif self.in_cell and tag == "a" and attrs.get("href"):
            self.link = urljoin(BASE_URL, attrs["href"])

    def handle_endtag(self, tag):
        if tag == "td" and self.in_cell:
            self.row.append({"text": clean_text("".join(self.cell)), "link": self.link})
            self.in_cell = False
        elif tag == "tr" and self.in_row:
            if self.row:
                self.rows.append(self.row)
            self.in_row = False
        elif tag == "tbody":
            self.in_tbody = False

    def handle_data(self, data):
        if self.in_cell:
            self.cell.append(data)


def parse_page(html: str):
    parser = _MaterialsTableParser()
    parser.feed(html)
    materials = []
    for row in parser.rows:
        if len(row) < 8:
            continue
        materials.append({
            "subject": row[0]["text"],
            "semester": row[1]["text"],
            "title": row[2]["text"],
            "module": row[3]["text"],
            "details": row[4]["text"],
            "linkText": row[5]["text"],
            "linkUrl": row[5]["link"],
            "fileUrl": row[6]["link"],
            "created": row[7]["text"],
        })
    return materials


def _page_number(url: str):
    try:
        return int(parse_qs(urlparse(url).query).get("page", [""])[0])
    except ValueError:
        return None


def fetch(client: Client):
    first = client.get(MATERIALS_URL)
    page_urls = sorted(
        {
            link["href"]
            for link in extract_links(first)
            if MATERIALS_URL in link["href"] and is_etlab_url(link["href"]) and (_page_number(link["href"]) or 0) > 1
        },
        key=_page_number,
    )
    plain = [url for url in page_urls if "ajax=" not in url]
    ajax = [url for url in page_urls if "ajax=" in url]
    pages = [first] + [html for html in client.get_many(plain) + client.get_many(ajax, ajax=True) if html]

    seen, materials = set(), []
    for html in pages:
        for material in parse_page(html):
            key = (material["subject"], material["title"], material["fileUrl"], material["linkUrl"], material["created"])
            if key not in seen:
                seen.add(key)
                materials.append(material)
    return materials
