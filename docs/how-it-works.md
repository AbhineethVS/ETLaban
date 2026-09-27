# How ETLaban works

This page explains what happens behind the screen: how you log in, where your
data goes, and what is stored where. It is written for curious students and for
developers.

## The big picture

```text
 Your phone                      ETLaban server                    ETLab
 ───────────                     ──────────────                    ─────
 app (HTML, CSS, JS)  ── /api ─▶  Python function (etlab/)  ──▶  cet.etlab.in
 keeps a copy of your data        keeps nothing                  has your data
 keeps your encrypted cookie
```

There are three parts:

1. **The app** runs in your browser. It shows your data and keeps a copy on your device.
2. **The server** is a small Python function. It logs in to ETLab for you, fetches
   pages, and turns them into data. It does not remember anything between requests.
3. **ETLab** is where your data really lives. ETLaban only reads from it.

## Logging in

When you press **Log in**:

1. Your browser sends your username and password to `/api/login` over HTTPS.
2. The server opens ETLab's login page, fills in the form, and submits it,
   just like you would. It also asks ETLab to remember the login, so the session
   may last longer if ETLab supports it.
3. If ETLab accepts it, ETLab gives back a *session cookie*. This is ETLab's way
   of remembering that you are logged in.
4. The server checks that the session works by opening your ETLab dashboard.
5. The server **encrypts** that ETLab cookie and sends it back to your browser as
   a cookie called `be_session`.
6. Your password is never written to logs. Unless you ticked **Keep me signed in**
   (see below), it is not saved anywhere.

### The encrypted cookie

The `be_session` cookie holds your ETLab session, your username, the time
you logged in and, only if you chose *Keep me signed in*, your password. It is encrypted with [Fernet](https://cryptography.io/en/latest/fernet/)
(AES encryption plus a signature), using a key made from the server's `SESSION_SECRET`.

This means:

- Only the server can read it, so a copied cookie can't be turned back into a raw ETLab session.
- It can't be edited or forged. Any change makes it invalid.
- It is marked `HttpOnly`, so scripts on the page can't read it.
- It is marked `SameSite=Lax`, so other websites can't use it to make requests for you.
- On HTTPS it is marked `Secure`, so it is never sent over an unencrypted connection.
- It expires after 30 days. ETLab usually ends sessions sooner; when that happens,
  the app either signs you back in (with *Keep me signed in*) or asks you to log in again.

Because each student's session lives in their own browser, the server never
needs a database, and one student can never see another student's data.

### Keep me signed in

ETLab ends its sessions after a few hours. Without help, that means typing your
password again several times a day. The **Keep me signed in** box on the login
page fixes that. It is off unless you tick it.

When it is on:

1. The server puts your password inside the encrypted `be_session` cookie, next to
   your ETLab session. It is **not** stored on the server, in a database or in the
   app's storage, and scripts on the page can't read it.
2. When ETLab ends your session, the data routes answer `401` with
   `"expired": true, "renewable": true` and keep your cookie.
3. The app calls `/api/renew` once. The server decrypts the cookie, logs in to ETLab
   with your saved username and password, and sends back a fresh cookie.
4. The app retries whatever failed. You don't see a login page.

Each renewal gives you a new cookie, so you stay signed in until you log out, or until
you don't open the app for 30 days. If ETLab rejects the saved password (for example
because you changed it), the cookie is deleted and you are asked to log in again.

**The trade-off.** Your password now lives in your browser, encrypted. Someone who
copies the cookie from your browser can keep using ETLaban as you until you log out
or change your ETLab password. They still can't read your password unless they also
have the server's `SESSION_SECRET`. If that ever leaks, changing `SESSION_SECRET`
makes every existing cookie useless. Leave the box unticked on shared or public
computers.

## Syncing your data

When you tap sync (or open the app with data more than 3 hours old), the app
calls three routes at the same time:

| Route             | ETLab pages it reads                                                                 |
| ----------------- | ------------------------------------------------------------------------------------ |
| `/api/attendance` | The attendance page, then *Attendance by subject*, *Attendance by month*, and the period details for every class day this month |
| `/api/results`    | Your current semester's results, then the same page for each earlier semester (`?sem_position=1`, `2`, …) |
| `/api/materials`  | The study materials page and any extra pages of it                                  |

For each request, the server:

1. Decrypts your `be_session` cookie to get your ETLab session.
2. Fetches the pages from ETLab. Where it needs several pages, it fetches up to six at once.
3. Reads the HTML tables and turns them into JSON.
4. Sends the JSON to your browser and forgets everything.

The server only ever requests pages on `https://cet.etlab.in`. Links found
inside ETLab pages are checked before they are followed.

### When your ETLab session expires

If ETLab sends the server back to its login page, the server answers `401` with
`"expired": true` and clears your `be_session` cookie. The app then shows the
login page with a short note.

With *Keep me signed in*, the server keeps the cookie and adds `"renewable": true`,
and the app signs you back in instead (see [Keep me signed in](#keep-me-signed-in)).
The app renews once for all three routes, so ETLab only sees one new login.

### When something fails

The three routes are independent. If one fails (say ETLab is slow for results),
the app keeps your old results, updates the rest, and tells you which part
could not refresh.

## What is stored where

| Where                 | What                                                                  | How long                         |
| --------------------- | --------------------------------------------------------------------- | -------------------------------- |
| Your browser (cookie) | `be_session`: your encrypted ETLab session (and, only with *Keep me signed in*, your password) | Until you log out, or 30 days (unused, with *Keep me signed in*) |
| Your browser (storage)| A copy of your attendance, results and materials, and when it was saved | Until you log out or someone else logs in on that browser |
| Your browser (storage)| Your settings: theme, attendance target, saved links                  | Until you clear them             |
| Your browser (cache)  | The app's own files (HTML, CSS, JS, icons), so it opens offline       | Replaced on each new version     |
| The server            | Nothing                                                               | —                                |
| ETLab                 | Your real data, as always                                             | —                                |

Your saved links (Drive folders, playlists and so on) never leave your device.

## The attendance maths

For a subject where you attended `present` out of `total` classes, with a target
`t` (for example 0.75):

- **Classes you can miss** and still stay at or above the target:
  `floor(present / t − total)`
- **Classes you need to attend in a row** to get back to the target:
  `ceil((t × total − present) / (1 − t))`

Each subject gets one of three states:

- **Safe**: at least 5 points above the target (shown in black).
- **Close**: above the target, but by less than 5 points (shown in orange).
- **Below**: under the target (shown in red).

## Offline and installing

The app is a [Progressive Web App](https://web.dev/explore/progressive-web-apps).
A service worker (`sw.js`) saves the app's files, so the app opens even without
internet and shows your last synced data. The service worker never saves `/api`
responses. Your data copy lives in the browser's storage, as described above.

## Security headers

Every response carries these headers (set in `vercel.json`, and copied by the
local server):

- **Content-Security-Policy**: only scripts from the app itself can run, and the
  page can only talk to itself and Google Fonts. This blocks most injected-script attacks.
- **Strict-Transport-Security**: browsers always use HTTPS for the site.
- **X-Content-Type-Options**, **Referrer-Policy**, **Permissions-Policy**, and
  `frame-ancestors 'none'`, which stops other sites from embedding the app.

## Known limits

- The calendar shows the **current month**, because that is what ETLab's monthly
  report gives.
- ETLaban reads ETLab's HTML. If ETLab changes a page, that part may break
  until the parser is updated. See [CONTRIBUTING.md](../CONTRIBUTING.md#when-etlab-changes-a-page).
- It is built for CET's ETLab (`cet.etlab.in`). Other colleges use different addresses and layouts.
