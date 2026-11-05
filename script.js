document.getElementById("year").textContent = new Date().getFullYear();

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- starfield: drifting particles + proximity links ---------- */
(() => {
  const canvas = document.getElementById("starfield");
  const ctx = canvas.getContext("2d", { alpha: true });

  const COLORS = [
    [255, 143, 199],
    [185, 150, 255],
    [110, 231, 255],
    [255, 255, 255],
  ];

  const pointer = { x: -9999, y: -9999, active: false };
  const LINK_DIST = 128;
  const POINTER_DIST = 168;

  let dpr = 1;
  let w = 0;
  let h = 0;
  let particles = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  function build() {
    const density = w < 640 ? 9000 : 13000;
    const count = Math.min(110, Math.max(26, Math.round((w * h) / density)));
    particles = Array.from({ length: count }, () => spawn());
  }

  function spawn() {
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.26,
      vy: (Math.random() - 0.5) * 0.26,
      r: Math.random() * 1.5 + 0.6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      twinkle: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.012 + Math.random() * 0.022,
    };
  }

  function step() {
    ctx.clearRect(0, 0, w, h);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.twinkle += p.twinkleSpeed;

      if (p.x < -20) p.x = w + 20;
      if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20;
      if (p.y > h + 20) p.y = -20;
    }

    // links
    ctx.lineWidth = 0.7;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > LINK_DIST * LINK_DIST) continue;
        const alpha = (1 - Math.sqrt(d2) / LINK_DIST) * 0.22;
        ctx.strokeStyle = `rgba(185, 150, 255, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // pointer links
    if (pointer.active) {
      for (const p of particles) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d > POINTER_DIST) continue;
        const alpha = (1 - d / POINTER_DIST) * 0.5;
        ctx.strokeStyle = `rgba(110, 231, 255, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(pointer.x, pointer.y);
        ctx.stroke();
      }
    }

    // dots
    for (const p of particles) {
      const glow = 0.45 + Math.sin(p.twinkle) * 0.35;
      const [r, g, b] = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${glow.toFixed(3)})`;
      ctx.fill();

      if (p.r > 1.3) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(glow * 0.1).toFixed(3)})`;
        ctx.fill();
      }
    }

    requestAnimationFrame(step);
  }

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener(
    "pointermove",
    (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    },
    { passive: true }
  );
  window.addEventListener("pointerleave", () => {
    pointer.active = false;
  });

  resize();
  if (REDUCED) {
    step();
  } else {
    requestAnimationFrame(step);
  }
})();

/* ---------- hero typing ---------- */
(() => {
  const el = document.getElementById("typed");
  const WORDS = ["音乐。", "数学。", "游戏。", "一点点代码。"];
  if (REDUCED) {
    el.textContent = WORDS[0];
    return;
  }

  let wordIndex = 0;
  let charIndex = 0;
  let deleting = false;

  function tick() {
    const word = WORDS[wordIndex];
    charIndex += deleting ? -1 : 1;
    el.textContent = word.slice(0, charIndex);

    let delay = deleting ? 55 : 120;

    if (!deleting && charIndex === word.length) {
      deleting = true;
      delay = 1600;
    } else if (deleting && charIndex === 0) {
      deleting = false;
      wordIndex = (wordIndex + 1) % WORDS.length;
      delay = 320;
    }

    setTimeout(tick, delay);
  }

  setTimeout(tick, 500);
})();

/* ---------- scroll reveal ---------- */
(() => {
  const targets = document.querySelectorAll(".reveal");
  if (REDUCED || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("in"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.14, rootMargin: "0px 0px -60px 0px" }
  );

  targets.forEach((el) => observer.observe(el));
})();

/* ---------- spotlight follows cursor ---------- */
(() => {
  if (REDUCED) return;

  document.querySelectorAll(".spotlight").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - rect.left}px`);
      card.style.setProperty("--my", `${e.clientY - rect.top}px`);
    });
  });
})();

/* ---------- nav state + scroll progress + to-top ---------- */
(() => {
  const nav = document.getElementById("nav");
  const progress = document.getElementById("progress");
  const toTop = document.getElementById("toTop");
  let ticking = false;

  function update() {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;

    nav.classList.toggle("scrolled", y > 12);
    progress.style.width = `${max > 0 ? (y / max) * 100 : 0}%`;
    toTop.hidden = y < 500;
    ticking = false;
  }

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true }
  );

  toTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" });
  });

  update();
})();
