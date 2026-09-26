import { clearCachedData, getSession, registerServiceWorker, rememberSignedIn } from "./auth.js";
import { initPublicUi, revealPage } from "./ui.js";

registerServiceWorker();
initPublicUi();

const form = document.querySelector("#login-form");
const usernameInput = form.querySelector("#username");
const passwordInput = form.querySelector("#password");
const submitButton = form.querySelector("button[type='submit']");
const passwordToggle = document.querySelector("#password-toggle");
const capsHint = document.querySelector("#caps-hint");
const errorEl = document.querySelector("#login-error");
const statusEl = document.querySelector("#login-status");
const noteEl = document.querySelector("#login-note");
const params = new URLSearchParams(window.location.search);

function setMessage(element, text) {
  element.hidden = !text;
  element.querySelector("span").textContent = text || "";
}

function showError(text, field) {
  setMessage(errorEl, text);
  [usernameInput, passwordInput].forEach((input) => {
    input.setAttribute("aria-invalid", String(input === field || (!field && Boolean(text))));
  });
  if (!text) return;

  form.classList.remove("shake");
  void form.offsetWidth; // restart the animation
  form.classList.add("shake");
  (field || passwordInput).focus();
}

function setBusy(state) {
  submitButton.dataset.state = state;
  submitButton.disabled = state !== "idle";
  usernameInput.disabled = state !== "idle";
  passwordInput.disabled = state !== "idle";
  passwordToggle.disabled = state !== "idle";
  statusEl.textContent = { idle: "", busy: "Signing in", done: "Signed in. Opening dashboard." }[state];
}

form.addEventListener("animationend", (event) => {
  if (event.animationName === "shake") form.classList.remove("shake");
});

[usernameInput, passwordInput].forEach((input) => {
  input.addEventListener("input", () => {
    if (input.getAttribute("aria-invalid") === "true") {
      input.setAttribute("aria-invalid", "false");
      if (usernameInput.getAttribute("aria-invalid") !== "true" && passwordInput.getAttribute("aria-invalid") !== "true") {
        setMessage(errorEl, "");
      }
    }
  });
});

passwordToggle.addEventListener("click", () => {
  const show = passwordInput.type === "password";
  passwordInput.type = show ? "text" : "password";
  passwordToggle.setAttribute("aria-pressed", String(show));
  passwordToggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
  passwordInput.focus({ preventScroll: true });
});

function updateCapsHint(event) {
  if (typeof event.getModifierState !== "function") return;
  capsHint.classList.toggle("is-on", event.getModifierState("CapsLock"));
}

passwordInput.addEventListener("keydown", updateCapsHint);
passwordInput.addEventListener("keyup", updateCapsHint);
passwordInput.addEventListener("blur", () => capsHint.classList.remove("is-on"));

if (params.get("expired") === "1") {
  setMessage(noteEl, "Your ETLab session expired. Log in again to pick up where you left off.");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username) {
    showError("Enter your ETLab username.", usernameInput);
    return;
  }
  if (!password) {
    showError("Enter your password.", passwordInput);
    return;
  }

  showError("");
  setBusy("busy");

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || "Login failed. Check your details and try again.");
    }

    // A new login may be a different student on this device.
    clearCachedData();
    rememberSignedIn(true);
    setBusy("done");
    setTimeout(() => window.location.replace("/app?sync=1"), 450);
  } catch (error) {
    setBusy("idle");
    const offline = error instanceof TypeError;
    showError(offline ? "Can't reach the Better ETLab server. Is it running?" : error.message);
  }
});

const session = await getSession();
if (session.loggedIn) {
  window.location.replace("/app");
} else {
  revealPage();
  const desktop = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (desktop && document.activeElement === document.body) {
    usernameInput.focus({ preventScroll: true });
  }
}
