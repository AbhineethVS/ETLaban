import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from .client import Client, EtlabError, is_etlab_url
from .tables import data_tables, extract_links, parse_ratio, parse_tables

ATTENDANCE_URL = "/ktuacademics/student/attendance"
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
IST = timezone(timedelta(hours=5, minutes=30))
# Each day is a separate ETLab request; cap detail fetches so /api/attendance
# finishes inside Vercel's 60s limit (subject + month + N day pages).
MAX_DAY_DETAILS = 24
SUMMARY_KEYS = {
    "Duty Leave": "dutyLeave",
    "Total": "total",
    "Percentage": "percentage",
    "Duty Leave Percentage": "dutyLeavePercentage",
}


def _main_table(html: str):
    tables = data_tables(html)
    if not tables:
        raise EtlabError("ETLab's attendance page changed; couldn't find the table")
    return tables[0]


def parse_subject_summary(html: str):
    table = _main_table(html)
    headers = table["headers"]
    row = table["rows"][0]

    subjects, summary = [], {}
    for header, cell in zip(headers[3:], row[3:]):
        if header in SUMMARY_KEYS:
            summary[SUMMARY_KEYS[header]] = cell["text"]
        else:
            subjects.append({"code": header, "attendance": parse_ratio(cell["text"])})

    return {
        "student": {
            "universityRegisterNumber": row[0]["text"],
            "rollNumber": row[1]["text"],
            "name": row[2]["text"],
        },
        "subjects": subjects,
        "summary": summary,
    }


def parse_month_summary(html: str):
    table = _main_table(html)
    headers = table["headers"]
    row = table["rows"][0]

    days = []
    year_month = None
    for header, cell in zip(headers[2:-4], row[2:-4]):
        link = cell["links"][0] if cell["links"] else {}
        date_match = DATE_RE.search(link.get("dataTitle") or "")
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
            "detailsUrl": link.get("dataLoad"),
        })

    # Early in a month (e.g. the 1st) no day has a link yet, so nothing carries
    # a date. The report always shows the current month, so fall back to that.
    if year_month is None:
        year_month = datetime.now(IST).strftime("%Y-%m")
    for day in days:
        day["date"] = day["date"] or f"{year_month}-{day['day']:02d}"

    return {
        "student": {"rollNumber": row[0]["text"], "name": row[1]["text"]},
        "days": days,
        "summary": {
            "total": row[-4]["text"],
            "percentage": row[-3]["text"],
            "percentageTillMonth": row[-2]["text"],
            "percentageForSemester": row[-1]["text"],
        },
    }


def _status_from_style(style: str) -> str:
    normalized = style.lower().replace(" ", "")
    for colour, status in (("green", "present"), ("red", "absent"), ("yellow", "leave"), ("blue", "duty-leave")):
        if f"background-color:{colour}" in normalized or f"background:{colour}" in normalized:
            return status
    return "unknown"


def parse_day_detail(html: str, date: str):
    table = next((t for t in parse_tables(html) if len(t["rows"]) >= 2), None)
    if table is None:
        return None

    periods = []
    for period_cell, subject_cell in zip(table["rows"][0], table["rows"][1]):
        number = re.search(r"\d+", period_cell["text"])
        periods.append({
            "period": int(number.group(0)) if number else None,
            "subject": subject_cell["text"],
            "status": _status_from_style(subject_cell["style"]),
        })
    return {"date": date, "periods": periods}


def _find_report_links(html: str):
    wanted = {"attendance by month": "month", "attendance by subject": "subject"}
    found = {}
    for link in extract_links(html):
        key = wanted.get(link["text"].lower())
        if key and is_etlab_url(link["href"]):
            found[key] = link["href"]
    return found


def fetch(client: Client):
    links = _find_report_links(client.get(ATTENDANCE_URL))
    if "subject" not in links or "month" not in links:
        raise EtlabError("ETLab's attendance page changed; couldn't find the reports")

    with ThreadPoolExecutor(max_workers=2) as pool:
        subject_html, month_html = pool.map(client.get, (links["subject"], links["month"]))

    subject = parse_subject_summary(subject_html)
    month = parse_month_summary(month_html)

    days = [d for d in month["days"] if d["detailsUrl"] and d["date"] and is_etlab_url(d["detailsUrl"])]
    class_days = [
        d
        for d in days
        if d.get("status") == "attendance" or (d.get("attendance") or {}).get("total", 0) > 0
    ]
    detail_days = class_days or days
    detail_days.sort(key=lambda d: d["date"] or "")
    if len(detail_days) > MAX_DAY_DETAILS:
        detail_days = detail_days[-MAX_DAY_DETAILS:]
    pages = client.get_many([d["detailsUrl"] for d in detail_days], ajax=True)
    details = []
    for day, html in zip(detail_days, pages):
        detail = parse_day_detail(html, day["date"]) if html else None
        if detail:
            details.append(detail)

    for day in month["days"]:
        day.pop("detailsUrl", None)

    return {"subject": subject, "month": month, "dayDetails": details}
