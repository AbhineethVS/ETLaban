import { getSession, registerServiceWorker } from "./auth.js";
import { initPublicUi, revealPage } from "./ui.js";

registerServiceWorker();
initPublicUi();
initTilt();

let session;
try {
  session = await getSession();
} finally {
  if (!session?.loggedIn) revealPage();
}
if (session.loggedIn) {
  window.location.replace("/app");
}

// Gentle 3D tilt on the product preview, desktop pointers only.
function initTilt() {
  const hero = document.querySelector(".hero");
  const preview = document.querySelector(".preview");
  const canTilt =
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!hero || !preview || !canTilt) return;

  let frame = 0;
  hero.addEventListener("pointermove", (event) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const rect = preview.getBoundingClientRect();
      const x = (event.clientX - (rect.left + rect.width / 2)) / window.innerWidth;
      const y = (event.clientY - (rect.top + rect.height / 2)) / window.innerHeight;
      preview.style.setProperty("--ry", `${(x * 10).toFixed(2)}deg`);
      preview.style.setProperty("--rx", `${(-y * 8).toFixed(2)}deg`);
    });
  });
  hero.addEventListener("pointerleave", () => {
    cancelAnimationFrame(frame);
    preview.style.setProperty("--rx", "0deg");
    preview.style.setProperty("--ry", "0deg");
  });
}
