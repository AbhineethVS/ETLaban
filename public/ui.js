// Shared behaviour: theme (toggle + preference), public nav state, scroll reveals.
// The initial theme is set by the inline script in each page's <head> so there is no flash.

const THEME_KEY = "better-etlab-theme";
const THEME_COLORS = { light: "#f7f5f0", dark: "#0f0f0e" };

const root = document.documentElement;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");

function storedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
  });
}

function systemTheme() {
  return darkScheme.matches ? "dark" : "light";
}

// "light" | "dark" | "system" — missing preference defaults to light.
export function getThemePreference() {
  const stored = storedTheme();
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "light";
}

export function setThemePreference(preference, origin) {
  try {
    localStorage.setItem(THEME_KEY, preference);
  } catch {
    // Private mode: the switch still works for this page.
  }
  transitionTo(preference === "system" ? systemTheme() : preference, origin);
}

function switchTheme(button) {
  setThemePreference(root.dataset.theme === "dark" ? "light" : "dark", button);
}

function transitionTo(next, origin) {
  if (next === root.dataset.theme) return;

  if (!origin || !document.startViewTransition || reducedMotion.matches) {
    applyTheme(next);
    return;
  }

  // Reveal the new theme as a circle growing out of the control that was pressed.
  const rect = origin.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  root.classList.add("theme-switching");
  const transition = document.startViewTransition(() => applyTheme(next));
  transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 620, easing: "cubic-bezier(0.65, 0, 0.35, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {});
  transition.finished.finally(() => root.classList.remove("theme-switching"));
}

export function initTheme() {
  applyTheme(root.dataset.theme === "dark" ? "dark" : "light");

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => switchTheme(button));
  });

  // Follow the OS setting only when Auto is explicitly selected.
  darkScheme.addEventListener("change", (event) => {
    if (storedTheme() === "system") applyTheme(event.matches ? "dark" : "light");
  });
}

function initNav() {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  const update = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
  update();
  window.addEventListener("scroll", update, { passive: true });
}

function initReveal() {
  const items = document.querySelectorAll("[data-reveal]");
  if (!items.length) return;

  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-in"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.15 },
  );
  items.forEach((item) => observer.observe(item));
}

export function initPublicUi() {
  initTheme();
  initNav();
  initReveal();
}

export function revealPage() {
  root.classList.remove("is-checking");
}
