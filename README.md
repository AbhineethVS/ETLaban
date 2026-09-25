# Better ETLab

A cleaner PWA dashboard for ETLab student data.

## Current Status

This is an early prototype. It can run in two modes:

- Static mode: reads locally generated JSON files.
- Backend mode: serves the PWA and exposes JSON through `/api/*` endpoints.

It renders:

- Attendance summary and month view
- Day-wise period details
- Results
- Study materials
- Custom resources/Google Drive links

Full login/session handling is not part of the app yet. For now, `fetch_etlab.py` uses an active ETLab cookie from your local environment to fetch HTML pages, then the parser scripts convert them into JSON.

## Local Run

Backend mode is preferred:

```bash
python backend_server.py
```

Open:

```text
http://127.0.0.1:8000
```

Static mode also works:

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

You can also create a local `.env` file:

```bash
cp .env.example .env
```

Then edit `.env`:

```text
ETLAB_COOKIE='YII_CSRF_TOKEN=...; style=theme-grey; CETSESSIONID=...'
```

When running `backend_server.py`, the PWA's **Sync ETLab** button calls:

```text
POST /api/sync
```

That runs `fetch_etlab.py` and refreshes the generated JSON.

Generated `.html` and `.json` files are intentionally ignored by git because they may contain personal student data.
