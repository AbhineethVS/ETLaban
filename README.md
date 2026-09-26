# Better ETLab

A cleaner PWA dashboard for ETLab student data.

## Current Status

This is an early prototype. Backend mode is preferred:

- Login with ETLab username/password
- Sync attendance, results, and materials
- Serve a local PWA dashboard

The backend logs into ETLab, stores only the session cookie locally (never in git), then scrapes the pages into JSON for the app.

## Local Run

```bash
python backend_server.py
```

Open:

```text
http://localhost:8000/index.html
```

Then go to **Settings → ETLab Login**, sign in, and click **Sync ETLab**.

## API

```text
POST /api/login
POST /api/logout
GET  /api/me
GET  /api/status
POST /api/sync
POST /api/cookie   # advanced fallback
```

## Notes

- `.env` and `session.json` are gitignored
- passwords are not stored; only the session cookie is kept locally
- generated `.html` / `.json` scrape files are also ignored
