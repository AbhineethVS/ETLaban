import json
import re
from pathlib import Path

from parse_attendance import TableParser, parse_ratio
from paths import scrape_path


SEMESTER_COUNT = 8

RESULT_CATEGORIES = [
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

# Each assessment table names its columns differently; these give every record
# a common title / obtained / max.
TITLE_KEYS = ("exam", "classProject", "assignment", "title", "name", "experimentTopic", "date")
OBTAINED_KEYS = ("marksObtained", "marks")
MAX_KEYS = ("maximumMarks", "total")


def camel_case(value: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", value)
    if not words:
        return "value"

    first, *rest = words
    return first[0].lower() + first[1:] + "".join(word[:1].upper() + word[1:] for word in rest)


def clean_text(value: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", value).replace("&nbsp;", " ").split())


def selected_semester(html: str):
    """The semester ETLab has selected in the results page dropdown."""
    match = re.search(r'<option value="(\d+)"\s+selected', html)
    return int(match.group(1)) if match else None


def parse_tables(html: str):
    parser = TableParser()
    parser.feed(html)
    return [table for table in parser.tables if table["headers"] and table["rows"]]


def is_empty_row(row):
    return len(row) == 1 and ("empty" in row[0]["class"] or row[0]["text"].lower().startswith("no "))


def first_value(record, keys):
    for key in keys:
        if record.get(key):
            return record[key]
    return ""


def parse_assessment_table(table):
    records = []
    headers = table["headers"]

    for row in table["rows"]:
        if is_empty_row(row):
            continue

        record = {}
        for header, cell in zip(headers, row):
            key = camel_case(header)
            record[key] = cell["text"]

            if cell["links"]:
                link = cell["links"][0]
                record[f"{key}Url"] = link["href"] or link["dataLoad"]

        record["title"] = first_value(record, TITLE_KEYS)
        record["obtained"] = first_value(record, OBTAINED_KEYS)
        record["max"] = first_value(record, MAX_KEYS)
        records.append(record)

    return records


def exam_session_labels(html: str):
    """Headers of the exam sittings in the university table, e.g. "December 2025 Regular"."""
    start = html.find("Subject Code</th>")
    if start < 0:
        return []
    thead_start = html.rfind("<thead", 0, start)
    thead_end = html.find("</thead>", start)
    rows = re.findall(r"<tr.*?</tr>", html[thead_start:thead_end], re.S)
    if len(rows) < 2:
        return []
    return [clean_text(cell) for cell in re.findall(r"<th[^>]*>(.*?)</th>", rows[1], re.S)]


def parse_university_result_table(table, session_labels):
    subjects = []
    summary = {"sgpa": None, "earnedCredits": None, "totalCredits": None, "status": None}

    for row in table["rows"]:
        texts = [cell["text"] for cell in row]
        joined = " ".join(texts)

        if "Earned Cumulative Credit" in joined:
            for text in texts:
                if match := re.search(r"Earned Cumulative Credit\s*:\s*([\d.]+)", text):
                    summary["earnedCredits"] = match.group(1)
                if match := re.search(r"Total Cumulative Credit\s*:\s*([\d.]+)", text):
                    summary["totalCredits"] = match.group(1)
            status = next((t for t in reversed(texts) if t.upper() in {"PASSED", "FAILED"}), None)
            summary["status"] = status.lower() if status else None
            continue

        if match := re.search(r"(?<!Average )SGPA\s*:\s*([\d.]+)", joined):
            summary["sgpa"] = match.group(1)
            continue

        if len(row) < 8 or is_empty_row(row) or not texts[0]:
            continue

        # Columns after the final grade: one grade per exam sitting, then P/F.
        extra = texts[8:]
        attempts = []
        result = None
        if extra:
            result = {"P": "passed", "F": "failed"}.get(extra[-1].upper(), extra[-1] or None)
            for index, grade in enumerate(extra[:-1]):
                label = session_labels[index] if index < len(session_labels) else f"Attempt {index + 1}"
                attempts.append({"exam": label, "grade": grade})

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


def parse_results_page(html: str):
    tables = parse_tables(html)

    assessment_results = {}
    for index, (key, label) in enumerate(RESULT_CATEGORIES):
        table = tables[index] if index < len(tables) else {"headers": [], "rows": []}
        assessment_results[key] = {
            "label": label,
            "items": parse_assessment_table(table),
        }

    university_result, summary = [], {}
    if len(tables) > len(RESULT_CATEGORIES):
        university_result, summary = parse_university_result_table(
            tables[len(RESULT_CATEGORIES)], exam_session_labels(html)
        )

    cgpa = re.search(r"CGPA Upto Current Semester\s*:\s*([\d.]+)", html)
    return {
        "assessmentResults": assessment_results,
        "universityResult": university_result,
        "summary": summary,
        "cgpa": cgpa.group(1) if cgpa else None,
    }


def main():
    current_html = scrape_path("results.html").read_text(encoding="utf-8", errors="replace")
    current_number = selected_semester(current_html) or 1

    semesters = []
    cgpa = None
    for number in range(1, current_number + 1):
        if number == current_number:
            html = current_html
        else:
            path = scrape_path(f"results-sem-{number}.html")
            if not path.exists():
                continue
            html = path.read_text(encoding="utf-8", errors="replace")

        page = parse_results_page(html)
        cgpa = cgpa or page.pop("cgpa")
        page.pop("cgpa", None)
        semesters.append({"number": number, "current": number == current_number, **page})

    current = next(s for s in semesters if s["current"])
    output = {
        "currentSemester": current_number,
        "semesterCount": max(SEMESTER_COUNT, current_number),
        "cgpa": cgpa,
        "semesters": semesters,
        # The current semester stays at the top level for the home screen.
        "assessmentResults": current["assessmentResults"],
        "universityResult": current["universityResult"],
    }

    output_path = scrape_path("results.json")
    output_path.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {output_path} ({len(semesters)} semesters)")


if __name__ == "__main__":
    main()
