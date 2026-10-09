import re

from .client import Client
from .tables import data_tables, parse_ratio

RESULTS_URL = "/student/results"
SEMESTER_URL = "/ktuacademics/student/results?sem_position={}"
SEMESTER_COUNT = 8

CATEGORIES = [
    ("sessionalExams", "Sessional Exams"),
    ("moduleTests", "Module Test"),
    ("classProjects", "Class Projects"),
    ("assignments", "Assignments"),
    ("tutorials", "Tutorials"),
    ("seminars", "Seminars"),
    ("internalMarks", "Internal Marks"),
    ("labEvaluations", "Lab Evaluation"),
    ("labInternalTests", "Lab Internal Test"),
]

# Each assessment table names its columns differently; these give every
# record a common title / obtained / max.
TITLE_KEYS = ("exam", "classProject", "assignment", "title", "name", "experimentTopic", "date")
OBTAINED_KEYS = ("marksObtained", "marks")
MAX_KEYS = ("maximumMarks", "total")


def _camel_case(value: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", value)
    if not words:
        return "value"
    first, *rest = words
    return first[0].lower() + first[1:] + "".join(word[:1].upper() + word[1:] for word in rest)


def _clean_html(value: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", value).replace("&nbsp;", " ").split())


def _is_empty_row(row):
    return len(row) == 1 and ("empty" in row[0]["class"] or row[0]["text"].lower().startswith("no "))


def _first(record, keys):
    return next((record[key] for key in keys if record.get(key)), "")


def selected_semester(html: str):
    """The semester ETLab has selected in the results dropdown."""
    match = re.search(r'<option value="(\d+)"\s+selected', html)
    return int(match.group(1)) if match else None


def _parse_assessments(table):
    records = []
    for row in table["rows"]:
        if _is_empty_row(row):
            continue
        record = {}
        for header, cell in zip(table["headers"], row):
            key = _camel_case(header)
            record[key] = cell["text"]
            if cell["links"]:
                link = cell["links"][0]
                record[f"{key}Url"] = link["href"] or link["dataLoad"]
        record["title"] = _first(record, TITLE_KEYS)
        record["obtained"] = _first(record, OBTAINED_KEYS)
        record["max"] = _first(record, MAX_KEYS)
        records.append(record)
    return records


def _exam_sessions(html: str):
    """Headers of the exam sittings in the university table, e.g. "December 2025 Regular"."""
    start = html.find("Subject Code</th>")
    if start < 0:
        return []
    thead = html[html.rfind("<thead", 0, start) : html.find("</thead>", start)]
    rows = re.findall(r"<tr.*?</tr>", thead, re.S)
    if len(rows) < 2:
        return []
    return [_clean_html(cell) for cell in re.findall(r"<th[^>]*>(.*?)</th>", rows[1], re.S)]


def _parse_university(table, sessions):
    subjects = []
    summary = {"sgpa": None, "earnedCredits": None, "totalCredits": None, "status": None}

    for row in table["rows"]:
        texts = [cell["text"] for cell in row]
        joined = " ".join(texts)

        if "Earned Cumulative Credit" in joined:
            if match := re.search(r"Earned Cumulative Credit\s*:\s*([\d.]+)", joined):
                summary["earnedCredits"] = match.group(1)
            if match := re.search(r"Total Cumulative Credit\s*:\s*([\d.]+)", joined):
                summary["totalCredits"] = match.group(1)
            status = next((t for t in reversed(texts) if t.upper() in {"PASSED", "FAILED"}), None)
            summary["status"] = status.lower() if status else None
            continue

        if match := re.search(r"(?<!Average )SGPA\s*:\s*([\d.]+)", joined):
            summary["sgpa"] = match.group(1)
            continue

        if len(row) < 8 or _is_empty_row(row) or not texts[0]:
            continue

        # Columns after the final grade: one grade per exam sitting, then P/F.
        extra = texts[8:]
        attempts, result = [], None
        if extra:
            result = {"P": "passed", "F": "failed"}.get(extra[-1].upper(), extra[-1] or None)
            for index, grade in enumerate(extra[:-1]):
                exam = sessions[index] if index < len(sessions) else f"Attempt {index + 1}"
                attempts.append({"exam": exam, "grade": grade})

        subjects.append({
            "subjectCode": texts[0],
            "subjectName": texts[1],
            "attendance": parse_ratio(texts[2]),
            "attendancePercentage": texts[3],
            "earnedCredits": texts[4],
            "totalCredits": texts[5],
            "internalMarks": texts[6],
            "grade": texts[7],
            "attempts": attempts,
            "result": result,
        })

    return subjects, summary


def parse_page(html: str):
    tables = data_tables(html)
    assessments = {}
    for index, (key, label) in enumerate(CATEGORIES):
        table = tables[index] if index < len(tables) else {"headers": [], "rows": []}
        assessments[key] = {"label": label, "items": _parse_assessments(table)}

    university, summary = [], {}
    if len(tables) > len(CATEGORIES):
        university, summary = _parse_university(tables[len(CATEGORIES)], _exam_sessions(html))

    cgpa = re.search(r"CGPA Upto Current Semester\s*:\s*([\d.]+)", html)
    return {
        "assessmentResults": assessments,
        "universityResult": university,
        "summary": summary,
        "cgpa": cgpa.group(1) if cgpa else None,
    }


def fetch(client: Client):
    current_html = client.get(RESULTS_URL)
    current = selected_semester(current_html) or 1

    earlier_urls = [SEMESTER_URL.format(n) for n in range(1, current)]
    remaining = client.seconds_left() if hasattr(client, "seconds_left") else None
    if remaining is not None and remaining < 8:
        earlier = [None] * len(earlier_urls)
    else:
        earlier = client.get_many(earlier_urls)
    pages = {n: html for n, html in zip(range(1, current), earlier) if html}
    pages[current] = current_html

    semesters, cgpa = [], None
    for number in sorted(pages):
        page = parse_page(pages[number])
        cgpa = cgpa or page.pop("cgpa")
        page.pop("cgpa", None)
        semesters.append({"number": number, "current": number == current, **page})

    now = next(s for s in semesters if s["current"])
    return {
        "currentSemester": current,
        "semesterCount": max(SEMESTER_COUNT, current),
        "cgpa": cgpa,
        "semesters": semesters,
        # The current semester stays at the top level for the home screen.
        "assessmentResults": now["assessmentResults"],
        "universityResult": now["universityResult"],
    }
