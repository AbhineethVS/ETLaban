# Better ETLab

A calm, fast, installable app for CET students' ETLab data: attendance (with a
month calendar and "can I miss this class?" maths), results for every semester,
and study materials. Unofficial; it reads the same pages you see on ETLab.

## How it works

- You log in with your normal ETLab username and password. The password is sent
  to ETLab once and never stored.
- The ETLab session cookie is encrypted with the server's `SESSION_SECRET` and
  kept only in your browser, as an `HttpOnly` cookie. The server keeps no
  sessions, no database and no copies of anyone's data.
- Each sync fetches your pages from ETLab and turns them into JSON on the fly.
  The result is cached on your device so the app opens instantly (and offline),
  and is cleared when you log out.

```text
browser ── /api/* ──> Python function (etlab/) ──> cet.etlab.in
   └─ caches data locally           └─ stateless: session comes from the request cookie
```

## Deploy on Vercel

1. Import this GitHub repo in Vercel (framework preset: **Other**, no build command).
2. Add an environment variable **`SESSION_SECRET`**: a long random string, e.g.
   `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
   Changing it later logs everyone out.
3. Deploy. `vercel.json` sets up the `/api` function (Mumbai region), clean URLs
   and security headers.

## Run locally (PC + phone on the same Wi-Fi)

```bash
pip install -r requirements.txt
python backend_server.py
```

Open `http://127.0.0.1:8000/`, or the Phone URL it prints. A local
`.session-secret` is generated automatically. If the phone can't connect, allow
Python through Windows Firewall for private networks.

## API

```text
POST /api/login        {username, password}   sets the session cookie
POST /api/cookie       {cookie}               same, from a pasted ETLab cookie
POST /api/logout                              clears it
GET  /api/me                                  {loggedIn, username}
GET  /api/attendance   subject totals, month calendar, per-period day details
GET  /api/results      every semester so far: marks, grades, SGPA, CGPA
GET  /api/materials    notes and files
```

## Layout

- `index.html`, `login.html`, `app.html` + `base.css` / `public.css` / `app.css`: the front end
- `app.js`, `landing.js`, `login.js`, `auth.js`, `ui.js`, `theme-init.js`, `sw.js`: front-end logic and PWA
- `etlab/`: login, fetching and parsing (shared by both servers)
- `api/index.py`: the Vercel function; `backend_server.py`: the local server
