# Contributing to ETLaban

Thanks for wanting to help. This guide explains how to set things up, how the
code is organised, and what to check before you open a pull request.

## The golden rule: protect student data

- **Never** commit, paste or upload real ETLab pages, JSON, cookies, passwords,
  register numbers or screenshots with real data.
- ETLab pages you save while debugging go in `scrape/`. That folder is gitignored.
- If you need an example in an issue or pull request, change the names and numbers first.

## Ways to help

- **Report a bug.** Open an issue with the *Bug report* form.
- **Suggest an idea.** Open an issue with the *Feature request* form.
- **Fix something.** Look for open issues, or fix something that bothers you.
- **Keep up with ETLab.** When ETLab changes a page, the parsers need an update.
  See [below](#when-etlab-changes-a-page).

For bigger changes, please open an issue first so we can agree on the approach.

## Getting set up

You need Python 3.10 or newer and a CET ETLab account.

```bash
git clone https://github.com/AbhineethVS/better-etlab.git
cd better-etlab
pip install -r requirements.txt
python backend_server.py
```

Open http://127.0.0.1:8000 and log in. There is no build step: edit a file and
refresh the page.

## How the code is organised

- **Front end** (plain HTML, CSS and JavaScript modules, no framework):
  - `base.css` holds the design system: colours, type, buttons, form fields, motion.
    Reuse its tokens (`--bg`, `--panel`, `--text`, `--muted`, `--line`, `--brand`, …).
  - `public.css` is for the landing and login pages. `app.css` is for the app.
  - `app.js` holds the app: data loading, routing (`#attendance/calendar/2026-09-09`), and every view.
- **Back end** (Python standard library plus `cryptography`):
  - `etlab/client.py` talks to ETLab. `etlab/attendance.py`, `results.py` and
    `materials.py` turn pages into data. `etlab/api.py` holds the routes.
  - `api/index.py` (Vercel) and `backend_server.py` (local) both call `etlab/api.py`.

[docs/how-it-works.md](docs/how-it-works.md) explains the full flow.

## Style

- **Match the code around you.** Same naming, same comment style, same level of detail.
- **Keep the design calm.** No new colour palettes, heavy shadows, gradients or
  decorative badges. Status colour means only three things: fine (ink), close (orange), below target (red).
- **Mobile first.** Test at 360–390 px wide. Touch targets at least 44 px.
- **Motion** must respect `prefers-reduced-motion`. Hover effects go inside `@media (hover: hover)`.
- **No inline `<script>`.** The Content Security Policy only allows scripts from
  the app's own files.
- **Escape everything** that comes from ETLab or the user before putting it in HTML
  (use `escapeHtml` in `app.js`). Only allow `http(s)` links (use `safeUrl`).
- **The server stays stateless.** Don't write files, and don't add a database or
  logging that could capture passwords, cookies or student data.
- If you add a front-end file, also add it to `APP_SHELL` in `sw.js`.

## When ETLab changes a page

ETLab sometimes changes its HTML. When that happens, a section of the app goes
empty or shows odd values. To fix it:

1. Open the page on ETLab in your browser, press `Ctrl+S`, and save it into the
   `scrape/` folder.
2. Try the parser on it in Python:
   ```python
   from etlab import attendance, results, materials

   html = open("scrape/results.html", encoding="utf-8").read()
   print(results.parse_page(html))
   ```
3. Fix the parser in `etlab/` until the output looks right.
4. Run the app and check the affected screen.

The parse functions are `attendance.parse_subject_summary`,
`attendance.parse_month_summary`, `attendance.parse_day_detail`,
`results.parse_page` and `materials.parse_page`.

## Before you open a pull request

There are no automated tests yet, so please check by hand:

- [ ] Log in, sync, and open every tab: Home, Attendance (subjects and calendar),
      Results (switch semesters), Materials (search, filter, saved links), Settings.
- [ ] Check at phone size (about 390 px) and on a laptop.
- [ ] Check light and dark mode.
- [ ] Open the browser console: no errors and no Content Security Policy warnings.
- [ ] No real student data in your commits.

Then open the pull request and fill in the template. Keep it focused on one change,
and explain *why* as well as *what*.

## Code of conduct

Please be kind and respectful. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
