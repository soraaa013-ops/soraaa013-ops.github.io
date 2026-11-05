document.getElementById("year").textContent = new Date().getFullYear();

const PETAL_CHARS = ["🌸", "🌸", "✿", "❀", "💮"];
const petalLayer = document.getElementById("petals");
const petalCount = window.innerWidth < 640 ? 14 : 26;

for (let i = 0; i < petalCount; i++) {
  const petal = document.createElement("span");
  petal.className = "petal";
  petal.textContent = PETAL_CHARS[Math.floor(Math.random() * PETAL_CHARS.length)];
  petal.style.left = `${Math.random() * 100}%`;
  petal.style.fontSize = `${12 + Math.random() * 14}px`;
  petal.style.animationDuration = `${8 + Math.random() * 10}s`;
  petal.style.animationDelay = `${-Math.random() * 16}s`;
  petalLayer.appendChild(petal);
}

const revealTargets = document.querySelectorAll(".section, .project, .card, .hero");
revealTargets.forEach((el) => {
  el.style.opacity = "0";
  el.style.transform = "translateY(18px)";
  el.style.transition = "opacity 0.7s ease, transform 0.7s ease";
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = "1";
        entry.target.style.transform = "translateY(0)";
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);

revealTargets.forEach((el) => observer.observe(el));
