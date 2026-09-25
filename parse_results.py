import json
import re
from pathlib import Path

from parse_attendance import TableParser, parse_ratio


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


def camel_case(value: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", value)
    if not words:
        return "value"

    first, *rest = words
    return first[0].lower() + first[1:] + "".join(word[:1].upper() + word[1:] for word in rest)


def parse_tables(path: Path):
    parser = TableParser()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    return [table for table in parser.tables if table["headers"] and table["rows"]]


def is_empty_row(row):
    return len(row) == 1 and ("empty" in row[0]["class"] or row[0]["text"].lower().startswith("no "))


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

        records.append(record)

    return records


def parse_university_result_table(table):
    subjects = []

    for row in table["rows"]:
        if len(row) < 8 or is_empty_row(row):
            continue

        subjects.append({
            "subjectCode": row[0]["text"],
            "subjectName": row[1]["text"],
            "attendance": parse_ratio(row[2]["text"]),
            "attendancePercentage": row[3]["text"],
            "earnedCredits": row[4]["text"],
            "totalCredits": row[5]["text"],
            "internalMarks": row[6]["text"],
            "grade": row[7]["text"],
        })

    return subjects


def main():
    tables = parse_tables(Path("results.html"))

    assessment_results = {}
    for index, (key, label) in enumerate(RESULT_CATEGORIES):
        table = tables[index] if index < len(tables) else {"headers": [], "rows": []}
        assessment_results[key] = {
            "label": label,
            "items": parse_assessment_table(table),
        }

    university_table = tables[len(RESULT_CATEGORIES)] if len(tables) > len(RESULT_CATEGORIES) else None
    university_result = parse_university_result_table(university_table) if university_table else []

    output = {
        "assessmentResults": assessment_results,
        "universityResult": university_result,
    }

    Path("results.json").write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print("Wrote results.json")


if __name__ == "__main__":
    main()
