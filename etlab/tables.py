import re
from html.parser import HTMLParser
from urllib.parse import urljoin

BASE_URL = "https://cet.etlab.in"
RATIO_RE = re.compile(r"(?P<present>\d+)\s*/\s*(?P<total>\d+)(?:\s*\((?P<percent>[^)]+)\))?")


def clean_text(value: str) -> str:
    return " ".join(value.replace("\xa0", " ").split())


def parse_ratio(value: str):
    match = RATIO_RE.search(value)
    if not match:
        return None

    present = int(match.group("present"))
    total = int(match.group("total"))
    percent = match.group("percent")

    return {
        "present": present,
        "total": total,
        "percentage": percent or (f"{round((present / total) * 100)}%" if total else None),
        "raw": clean_text(value),
    }


class TableParser(HTMLParser):
    """Collects every <table> as {"headers": [...], "rows": [[cell, ...], ...]}."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self.current_table = None
        self.current_section = None
        self.current_row = None
        self.current_cell = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)

        if tag == "table":
            self.current_table = {"headers": [], "rows": []}
        elif self.current_table is not None and tag in {"thead", "tbody"}:
            self.current_section = tag
        elif self.current_table is not None and tag == "tr":
            self.current_row = []
        elif self.current_row is not None and tag in {"th", "td"}:
            self.current_cell = {
                "tag": tag,
                "text_parts": [],
                "class": attrs.get("class", ""),
                "style": attrs.get("style", ""),
                "links": [],
            }
        elif self.current_cell is not None and tag == "a":
            self.current_cell["links"].append({
                "text": "",
                "href": urljoin(BASE_URL, attrs["href"]) if attrs.get("href") else None,
                "dataLoad": urljoin(BASE_URL, attrs["data-load"]) if attrs.get("data-load") else None,
                "dataTitle": attrs.get("data-title"),
            })

    def handle_endtag(self, tag):
        if tag in {"th", "td"} and self.current_cell is not None:
            self.current_cell["text"] = clean_text("".join(self.current_cell["text_parts"]))
            del self.current_cell["text_parts"]
            self.current_row.append(self.current_cell)
            self.current_cell = None
        elif tag == "tr" and self.current_row is not None:
            if self.current_section == "thead":
                self.current_table["headers"].extend(cell["text"] for cell in self.current_row)
            elif self.current_section == "tbody":
                self.current_table["rows"].append(self.current_row)
            self.current_row = None
        elif tag == "table" and self.current_table is not None:
            self.tables.append(self.current_table)
            self.current_table = None
            self.current_section = None

    def handle_data(self, data):
        if self.current_cell is not None:
            self.current_cell["text_parts"].append(data)
            if self.current_cell["links"]:
                self.current_cell["links"][-1]["text"] += data


def parse_tables(html: str):
    parser = TableParser()
    parser.feed(html)
    return parser.tables


def data_tables(html: str):
    """Tables that have both a header and at least one body row."""
    return [table for table in parse_tables(html) if table["headers"] and table["rows"]]


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "a" and attrs.get("href"):
            self.current = {"href": urljoin(BASE_URL, attrs["href"]), "parts": []}

    def handle_endtag(self, tag):
        if tag == "a" and self.current is not None:
            self.links.append({"href": self.current["href"], "text": clean_text("".join(self.current["parts"]))})
            self.current = None

    def handle_data(self, data):
        if self.current is not None:
            self.current["parts"].append(data)


def extract_links(html: str):
    parser = LinkParser()
    parser.feed(html)
    return parser.links
