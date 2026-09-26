# Better ETLab

A cleaner PWA dashboard for ETLab student data.

## Current Status

This is an early prototype. Backend mode is preferred:

- Login with ETLab username/password
- Sync attendance, results, and materials
- Serve a local PWA dashboard on PC and phone (same Wi-Fi)

The backend logs into ETLab, stores only the session cookie locally (never in git), then scrapes the pages into JSON for the app.

## Local Run

```bash
python backend_server.py
```

On this PC:

```text
http://127.0.0.1:8000/
```

On your phone (same Wi-Fi), use the Phone URL printed by the server, for example:

```text
http://192.168.x.x:8000/
```

Then:

1. Open that URL in Chrome/Safari
2. Log in with your ETLab username and password
3. Wait for the first sync on the dashboard
4. Install as app / Add to Home Screen if you want

If the phone cannot connect, allow Python through Windows Firewall for private networks.

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
- generated scrape dumps live in `scrape/` (HTML + JSON) and are gitignored
- phone access requires the PC backend to keep running on the same Wi-Fi
