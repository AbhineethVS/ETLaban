import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

from paths import scrape_path


BASE_URL = "https://cet.etlab.in"


def clean_text(value: str) -> str:
    return " ".join(value.replace("\xa0", " ").split())


class MaterialsTableParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_tbody = False
        self.in_row = False
        self.in_cell = False
        self.current_cell = []
        self.current_link = None
        self.current_row = []
        self.rows = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)

        if tag == "tbody":
            self.in_tbody = True
        elif self.in_tbody and tag == "tr":
            self.in_row = True
            self.current_row = []
        elif self.in_row and tag == "td":
            self.in_cell = True
            self.current_cell = []
            self.current_link = None
        elif self.in_cell and tag == "a":
            href = attrs.get("href")
            if href:
                self.current_link = urljoin(BASE_URL, href)

    def handle_endtag(self, tag):
        if tag == "td" and self.in_cell:
            text = clean_text("".join(self.current_cell))
            self.current_row.append({"text": text, "link": self.current_link})
            self.in_cell = False
        elif tag == "tr" and self.in_row:
            if self.current_row:
                self.rows.append(self.current_row)
            self.in_row = False
        elif tag == "tbody":
            self.in_tbody = False

    def handle_data(self, data):
        if self.in_cell:
            self.current_cell.append(data)


def row_to_material(row):
    if len(row) < 8:
        return None

    return {
        "subject": row[0]["text"],
        "semester": row[1]["text"],
        "title": row[2]["text"],
        "module": row[3]["text"],
        "details": row[4]["text"],
        "linkText": row[5]["text"],
        "linkUrl": row[5]["link"],
        "fileUrl": row[6]["link"],
        "created": row[7]["text"],
    }


def material_page_sort_key(path: Path):
    if path.name == "materials.html":
        return 1

    match = re.search(r"materials-page-(\d+)\.html$", path.name)
    if match:
        return int(match.group(1))

    return 999


def main():
    html_paths = [Path(path) for path in sys.argv[1:]]
    if not html_paths:
        html_paths = sorted(scrape_path().glob("materials*.html"), key=material_page_sort_key)

    output_path = scrape_path("materials.json")
    materials = []

    for html_path in html_paths:
        parser = MaterialsTableParser()
        parser.feed(html_path.read_text(encoding="utf-8", errors="replace"))

        for row in parser.rows:
            material = row_to_material(row)
            if material is not None:
                materials.append(material)

    seen = set()
    unique_materials = []
    for material in materials:
        key = (
            material["subject"],
            material["title"],
            material["fileUrl"],
            material["linkUrl"],
            material["created"],
        )
        if key in seen:
            continue
        seen.add(key)
        unique_materials.append(material)

    output_path.write_text(
        json.dumps(unique_materials, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    parsed_files = ", ".join(str(path) for path in html_paths)
    print(f"Parsed {len(unique_materials)} materials from {parsed_files} into {output_path}")


if __name__ == "__main__":
    main()
