// Runs before first paint (loaded without defer): apply the saved theme so
// there's no flash, and on public pages hide the body while we check whether
// a signed-in visitor should be sent to /app.
(() => {
  const root = document.documentElement;
  const checkSession = document.currentScript?.hasAttribute("data-check-session");
  let theme = null;
  let signedIn = false;
  try {
    theme = localStorage.getItem("better-etlab-theme");
    signedIn = localStorage.getItem("better-etlab-signed-in") === "1";
  } catch {
    // Storage blocked: fall back to the system theme.
  }
  if (theme !== "light" && theme !== "dark") {
    theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  root.dataset.theme = theme;
  root.classList.add("js");
  if (checkSession && signedIn) root.classList.add("is-checking");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0f0f0e" : "#f7f5f0");
})();
