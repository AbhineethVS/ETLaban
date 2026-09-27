# Security policy

ETLaban handles students' ETLab logins, so security problems matter a lot.
Thank you for helping keep it safe.

## Reporting a problem

**Please don't open a public issue for security problems.**

Report it privately instead:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**
   ([direct link](https://github.com/AbhineethVS/ETLaban/security/advisories/new)).
3. Describe what you found, how to reproduce it, and what someone could do with it.

Only the maintainer can see the report. You'll get a reply as soon as possible.
This is a student project, so please allow a few days.

## What counts as a security problem

For example:

- Seeing, changing or deleting **another student's** data or session.
- Getting a student's ETLab password or raw ETLab session from the app or server.
- Making the server request pages outside `cet.etlab.in`.
- Running your own script inside the app (XSS), or getting around the Content Security Policy.
- Forging or decrypting the `be_session` cookie (it may contain a password).
- Anything that makes the server log passwords or cookies.

These are **not** security problems here (a normal issue is fine):

- ETLab's own security. Report that to ETLab or the college, not here.
- Bugs that only affect your own data in your own browser.
- Missing rate limiting, unless you can show real harm from it.

## Please test responsibly

- Only test with **your own** ETLab account.
- Never try to access another student's account or data.
- Don't run heavy automated scans against the live site or against ETLab.

## How student data is protected

In short:

- Passwords are never logged and never stored on the server. By default they are
  sent to ETLab once and thrown away.
- ETLab sessions are encrypted into an `HttpOnly`, `Secure`, `SameSite=Lax`
  cookie in the student's own browser. The server keeps no sessions and no data.
- Only if a student ticks **Keep me signed in** is their password sealed into that
  same encrypted cookie, so the server can log back in to ETLab when the session ends.
  It can only be read with the server's `SESSION_SECRET`. Logging out, or ETLab
  rejecting the saved password, deletes it.
- The server only fetches `https://cet.etlab.in` pages.
- A strict Content Security Policy and other security headers are set on every response.

The full explanation is in [docs/how-it-works.md](docs/how-it-works.md).

## Supported versions

Only the latest version on the `main` branch (and its deployment) gets security fixes.
