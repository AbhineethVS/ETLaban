const SIGNED_IN_KEY = "better-etlab-signed-in";
export const DATA_KEY = "better-etlab-data";

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

// ETLab data is cached on this device only. Clear it whenever the account changes.
export function clearCachedData() {
  try {
    localStorage.removeItem(DATA_KEY);
  } catch {
    // Nothing cached.
  }
}

export async function getSession() {
  try {
    const response = await fetch("/api/me", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) {
      throw new Error("Failed to read session");
    }

    const me = await response.json();
    const loggedIn = Boolean(me.loggedIn);
    rememberSignedIn(loggedIn);
    return { ...me, loggedIn, expired: false };
  } catch {
    return { loggedIn: false, expired: false, offline: true };
  }
}

export function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
