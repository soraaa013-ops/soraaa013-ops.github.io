document.getElementById("year").textContent = new Date().getFullYear();
const header = document.querySelector(".site-header");
const updateHeader = () => header.classList.toggle("scrolled", window.scrollY > 16);
window.addEventListener("scroll", updateHeader, { passive: true }); updateHeader();

const hero = document.querySelector(".hero");
const portrait = hero.querySelector(".live-portrait");
const clampGaze = (value) => Math.max(-1, Math.min(1, value));

function sendGaze(x, y) {
  if (window.location.origin === "null") return;
  portrait.contentWindow?.postMessage({ type: "sora:gaze", x, y }, window.location.origin);
}

hero.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  const bounds = portrait.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  sendGaze(
    clampGaze(((event.clientX - bounds.left) / bounds.width) * 2 - 1),
    clampGaze(((event.clientY - bounds.top) / bounds.height) * 2 - 1)
  );
}, { passive: true });

hero.addEventListener("pointerleave", () => {
  sendGaze(0, 0);
});
