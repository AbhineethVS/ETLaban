# Deployment guide

ETLaban has two ways to run:

- **On Vercel**, so anyone with the link can use it.
- **On your own computer**, for development, or for your phone on the same Wi-Fi.

Both run exactly the same code from the `etlab/` folder.

## Deploying to Vercel

### 1. Create a session secret

The server uses a secret to encrypt everyone's session cookies. It must be long
and random. Don't use your name or a sentence. Generate one:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Copy the output. Keep it private: don't commit it or paste it anywhere else.

### 2. Import the project

1. Go to [vercel.com/new](https://vercel.com/new) and import this GitHub repository.
2. **Framework Preset:** Other.
3. **Build Command:** leave empty. **Output Directory:** leave as it is.
4. Open **Environment Variables** and add:

   | Name             | Value                        |
   | ---------------- | ---------------------------- |
   | `SESSION_SECRET` | the value from step 1        |

5. Click **Deploy**.

### 3. Check that it works

1. Open `https://<your-project>.vercel.app/api/health`. You should see `{"ok": true}`.
2. Open the site, log in with your ETLab account, and wait for the first sync.
3. Try it on your phone and tap **Install**.

### What `vercel.json` sets up

- **`/api/*`** goes to one Python function, `api/index.py`.
- The function runs in **Mumbai (`bom1`)**, in India, close to students and (most likely) to ETLab.
- Each request can take up to **60 seconds**. A normal sync takes a few seconds.
- **Clean URLs**, so `/login` and `/app` work without `.html`.
- **Security headers** on every response (see [How it works](how-it-works.md#security-headers)).

Vercel installs the one Python dependency, `cryptography`, from `requirements.txt`.

### Updating

Push to `main`. Vercel builds and deploys it automatically. Users get the new
version the next time they open the app.

### Changing the session secret

Change `SESSION_SECRET` in **Project → Settings → Environment Variables**, then
redeploy. Everyone is logged out once and simply logs in again. Do this if you
think the secret has leaked.

### Custom domain

In **Project → Settings → Domains**, add your domain and follow Vercel's DNS
steps. Nothing in the code needs to change.

## Troubleshooting

| What you see                                          | Likely cause and fix                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| *"Something went wrong on our side"* when logging in | `SESSION_SECRET` is missing. Add it and redeploy. The function logs say *SESSION_SECRET is not set*. |
| *"Could not reach ETLab"*                             | ETLab is down, slow, or Cloudflare throttled the server after a traffic spike. The app retries automatically; wait a minute and try again. If it never works on Vercel but works locally, ETLab is probably blocking cloud servers — contact your college IT. |
| `/api/renew` 504 / function timeout                    | ETLab was too slow to finish a remembered login inside 60s. Login/renew now stop by ~20s and return 502 instead of hanging. Tap Sync. |
| `/api/results` 504 / function timeout                  | Fetching every semester retried too long. Data routes now stop by ~42s and return what they have (current semester, attendance without extra day pages). Tap Sync. |
| All three data routes return 502 together              | ETLab or Cloudflare stalled while the app started three simultaneous fetches. Sync now fetches one source at a time and stops after the first upstream failure, so one outage does not create three retries per student. |
| Everyone got logged out                               | `SESSION_SECRET` changed. Expected: just log in again.                               |
| *"Your ETLab session expired"* often                   | ETLab ends sessions on its side, for example when you log in to ETLab somewhere else. Log in again. |
| Old version still showing after a deploy              | Close and reopen the app. The service worker updates in the background.              |
| A section is empty or wrong after ETLab changed       | ETLab's page layout changed. See [CONTRIBUTING.md](../CONTRIBUTING.md#when-etlab-changes-a-page). |

To see errors, open **Project → Logs** in Vercel. The logs only show the method
and path of each request, never passwords or cookies.

## Running on your computer

You need Python 3.10 or newer.

```bash
pip install -r requirements.txt
python backend_server.py
```

Open **http://127.0.0.1:8000**.

- A `.session-secret` file is created automatically the first time you log in.
  It is gitignored. You don't need to set `SESSION_SECRET` locally.
- To use a different port or address, set `PORT` or `HOST`:
  ```bash
  PORT=9000 python backend_server.py
  ```
  (On Windows PowerShell: `$env:PORT=9000; python backend_server.py`.)

### Using it on your phone

1. Connect the phone to the **same Wi-Fi** as the computer.
2. Open the **Phone** address the server prints, like `http://192.168.1.5:8000`.
3. If it doesn't load on Windows, allow Python through Windows Defender Firewall
   for **private networks**.

Over plain `http://` on your Wi-Fi, the session cookie is sent without the
`Secure` flag, because there is no HTTPS locally. That's fine at home. Use the
Vercel deployment on public networks.
