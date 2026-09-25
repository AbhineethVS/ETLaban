import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin


BASE_URL = "https://cet.etlab.in"
RATIO_RE = re.compile(r"(?P<present>\d+)\s*/\s*(?P<total>\d+)(?:\s*\((?P<percent>[^)]+)\))?")
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


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
            link = {
                "text": "",
                "href": urljoin(BASE_URL, attrs["href"]) if attrs.get("href") else None,
                "dataLoad": urljoin(BASE_URL, attrs["data-load"]) if attrs.get("data-load") else None,
                "dataTitle": attrs.get("data-title"),
            }
            self.current_cell["links"].append(link)

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


def load_main_table(path: Path):
    parser = TableParser()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))

    for table in parser.tables:
        if table["headers"] and table["rows"]:
            return table

    raise ValueError(f"No data table found in {path}")


def parse_subject_summary(path: Path, includes_duty_leave=False):
    table = load_main_table(path)
    headers = table["headers"]
    row = table["rows"][0]

    student = {
        "universityRegisterNumber": row[0]["text"],
        "rollNumber": row[1]["text"],
        "name": row[2]["text"],
    }

    summary_headers = {"Duty Leave", "Total", "Percentage", "Duty Leave Percentage"}
    subjects = []
    summary = {}

    for header, cell in zip(headers[3:], row[3:]):
        if header in summary_headers:
            key = {
                "Duty Leave": "dutyLeave",
                "Total": "total",
                "Percentage": "percentage",
                "Duty Leave Percentage": "dutyLeavePercentage",
            }[header]
            summary[key] = cell["text"]
            continue

        subjects.append({
            "code": header,
            "attendance": parse_ratio(cell["text"]),
        })

    return {
        "type": "subject-with-duty-leave" if includes_duty_leave else "subject",
        "student": student,
        "subjects": subjects,
        "summary": summary,
    }


def parse_month_summary(path: Path):
    table = load_main_table(path)
    headers = table["headers"]
    row = table["rows"][0]

    student = {
        "rollNumber": row[0]["text"],
        "name": row[1]["text"],
    }

    days = []
    year_month = None
    for header, cell in zip(headers[2:-4], row[2:-4]):
        links = cell["links"]
        data_title = links[0]["dataTitle"] if links else None
        data_load = links[0]["dataLoad"] if links else None
        date_match = DATE_RE.search(data_title or "")
        if date_match and year_month is None:
            year_month = date_match.group(0)[:7]

        attendance = parse_ratio(cell["text"])
        status = "attendance"
        if "holiday" in cell["class"]:
            status = "holiday"
        elif attendance and attendance["total"] == 0:
            status = "no-class"

        days.append({
            "day": int(header),
            "date": date_match.group(0) if date_match else None,
            "status": status,
            "attendance": attendance,
            "detailsUrl": data_load,
        })

    if year_month:
        for day in days:
            if day["date"] is None:
                day["date"] = f"{year_month}-{day['day']:02d}"

    return {
        "type": "month",
        "student": student,
        "days": days,
        "summary": {
            "total": row[-4]["text"],
            "percentage": row[-3]["text"],
            "percentageTillMonth": row[-2]["text"],
            "percentageForSemester": row[-1]["text"],
        },
    }


def status_from_style(style: str):
    normalized = style.lower().replace(" ", "")

    if "background-color:green" in normalized or "background:green" in normalized:
        return "present"
    if "background-color:red" in normalized or "background:red" in normalized:
        return "absent"
    if "background-color:yellow" in normalized or "background:yellow" in normalized:
        return "leave"
    if "background-color:blue" in normalized or "background:blue" in normalized:
        return "duty-leave"

    return "unknown"


def parse_day_detail(path: Path):
    parser = TableParser()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    table = next((table for table in parser.tables if len(table["rows"]) >= 2), None)
    if table is None:
        raise ValueError(f"No day-detail table found in {path}")

    if len(table["rows"]) < 2:
        raise ValueError(f"Expected period header and subject rows in {path}")

    date_match = DATE_RE.search(path.name)
    date = date_match.group(0) if date_match else None
    period_cells = table["rows"][0]
    subject_cells = table["rows"][1]

    periods = []
    for period_cell, subject_cell in zip(period_cells, subject_cells):
        period_match = re.search(r"\d+", period_cell["text"])
        periods.append({
            "period": int(period_match.group(0)) if period_match else None,
            "subject": subject_cell["text"],
            "status": status_from_style(subject_cell["style"]),
        })

    return {
        "date": date,
        "periods": periods,
    }


def write_json(path: Path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {path}")


def main():
    outputs = {
        "attendance-subject.json": parse_subject_summary(Path("attendance-subject.html")),
        "attendance-with-duty-leave.json": parse_subject_summary(
            Path("attendance-by-sub-with-duty-leave.html"),
            includes_duty_leave=True,
        ),
        "credit-based-attendance.json": parse_subject_summary(Path("credit-based-attendance.html")),
        "attendance-month.json": parse_month_summary(Path("attendance-month.html")),
    }

    day_detail_paths = sorted(Path(".").glob("attendance-day-*.html"))
    if day_detail_paths:
        outputs["attendance-day-details.json"] = [
            parse_day_detail(path) for path in day_detail_paths
        ]

    for output_path, data in outputs.items():
        write_json(Path(output_path), data)


if __name__ == "__main__":
    main()
