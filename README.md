# Better ETLab

A cleaner PWA dashboard for ETLab student data.

## Current Status

This is an early static prototype. It reads locally generated JSON files and renders:

- Attendance summary and month view
- Day-wise period details
- Results
- Study materials
- Custom resources/Google Drive links

Login/session handling is not part of the PWA yet. For now, `fetch_etlab.py` uses an active ETLab cookie from your local environment to fetch HTML pages, then the parser scripts convert them into JSON.

## Local Run

```bash
python -m http.server 5173
```

Open:

```text
http://localhost:5173/index.html
```

## Fetch Latest ETLab Data

Set your active logged-in ETLab cookie:

```bash
export ETLAB_COOKIE='PASTE_COOKIE_HEADER_VALUE_HERE'
python fetch_etlab.py
```

Generated `.html` and `.json` files are intentionally ignored by git because they may contain personal student data.
