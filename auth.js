const SIGNED_IN_KEY = "better-etlab-signed-in";

// Remembered so the public pages only hide themselves while checking the
// session when the visitor is likely to be redirected into the app.
export function rememberSignedIn(signedIn) {
  try {
    if (signedIn) {
      localStorage.setItem(SIGNED_IN_KEY, "1");
    } else {
      localStorage.removeItem(SIGNED_IN_KEY);
    }
  } catch {
    // Storage unavailable; the pages just skip the optimisation.
  }
}

export async function getSession() {
  try {
    const response = await fetch("/api/me", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Failed to read session");
    }

    const me = await response.json();
    const expired = Boolean(me.hasCookie && me.sessionValid === false);
    const loggedIn = Boolean(me.hasCookie && me.sessionValid !== false);
    rememberSignedIn(loggedIn);

    return {
      ...me,
      expired,
      loggedIn,
    };
  } catch {
    return {
      ok: false,
      hasCookie: false,
      loggedIn: false,
      expired: false,
    };
  }
}

export function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
