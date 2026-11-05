const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- config ---------- */
const CONFIG = {
  minBPM: 30,
  maxBPM: 300,
  defaultBPM: 120,
  defaultBeats: 4,
  lookahead: 25,        // ms — how often the timer refills the queue
  scheduleAhead: 0.1,   // s — how far ahead notes are queued
};

const SUBDIVISIONS = [
  { key: "quarter", label: "♩", name: "四分", perBeat: 1 },
  { key: "eighth", label: "♪", name: "八分", perBeat: 2 },
  { key: "sixteenth", label: "♬", name: "十六分", perBeat: 4 },
  { key: "triplet", label: "♪³", name: "三连音", perBeat: 3 },
];

const TIMBRES = [
  { key: "classic", label: "经典" },
  { key: "beep", label: "电子" },
  { key: "wood", label: "木鱼" },
];

// [maxBPM, name, cn] — first match wins
const TEMPO_MARKS = [
  [60, "Largo", "广板"],
  [76, "Adagio", "柔板"],
  [108, "Andante", "行板"],
  [120, "Moderato", "中板"],
  [168, "Allegro", "快板"],
  [200, "Presto", "急板"],
  [Infinity, "Prestissimo", "最急板"],
];

/* ---------- state ---------- */
const state = {
  bpm: CONFIG.defaultBPM,
  beatsPerMeasure: CONFIG.defaultBeats,
  subdivKey: "quarter",
  timbre: "classic",
  accent: true,
  volume: 0.8,
  muted: false,
  running: false,
  compound: null,       // "6" | "9" | "12" | null
  nextNoteTime: 0,      // AudioContext-time anchor (seconds)
  currentNote: 0,       // monotonic subdivision counter
};

const notesInQueue = [];
let lastBeatTime = 0;   // audio time of the most recent scheduled beat (for pendulum)

/* ---------- dom ---------- */
const $ = (id) => document.getElementById(id);
const el = {
  year: $("year"),
  tempoMark: $("tempoMark"),
  minus: $("minusBtn"),
  plus: $("plusBtn"),
  bpmInput: $("bpmInput"),
  bpmSlider: $("bpmSlider"),
  pendulum: $("pendulum"),
  pendulumArm: $("pendulumArm"),
  beats: $("beats"),
  play: $("playBtn"),
  playIcon: $("playIcon"),
  tap: $("tapBtn"),
  beatSeg: $("beatSeg"),
  compoundRow: $("compoundRow"),
  subdivSeg: $("subdivSeg"),
  timbreSeg: $("timbreSeg"),
  accentSwitch: $("accentSwitch"),
  volSlider: $("volSlider"),
};

function subdivPerBeat() {
  return SUBDIVISIONS.find((s) => s.key === state.subdivKey).perBeat;
}

/* ---------- audio ---------- */
let ctx = null;
let master = null;
let limiter = null;
let noiseBuffer = null;

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  master = ctx.createGain();
  master.gain.value = state.muted ? 0 : state.volume;
  master.connect(limiter).connect(ctx.destination);
  return ctx;
}

function resumeAudio() {
  ensureCtx();
  if (ctx.state === "suspended") ctx.resume();
}

function setVolume(v) {
  state.volume = v;
  if (master) master.gain.setTargetAtTime(state.muted ? 0 : v, ctx.currentTime, 0.01);
}

function getNoiseBuffer() {
  if (noiseBuffer) return noiseBuffer;
  const len = Math.floor(ctx.sampleRate * 0.05);
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

// A single click voice. `accent` = downbeat, `soft` = subdivision offbeat.
function playClick(time, accent, soft) {
  const timbre = state.timbre;
  const out = ctx.createGain();
  out.connect(master);

  if (timbre === "wood") {
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = accent ? 2400 : 1800;
    bp.Q.value = 9;
    const peak = (accent ? 0.85 : soft ? 0.28 : 0.5);
    out.gain.setValueAtTime(0.0001, time);
    out.gain.linearRampToValueAtTime(peak, time + 0.001);
    out.gain.exponentialRampToValueAtTime(0.0001, time + (accent ? 0.05 : 0.035));
    src.connect(bp).connect(out);
    src.start(time);
    src.stop(time + 0.08);
    return;
  }

  const isBeep = timbre === "beep";
  const freq = isBeep
    ? (accent ? 1568 : 1175)
    : (accent ? 1000 : 800);
  const peak = accent ? 0.9 : soft ? 0.3 : 0.55;
  const decay = isBeep ? 0.07 : 0.045;

  const osc = ctx.createOscillator();
  osc.type = isBeep ? "sine" : "triangle";
  osc.frequency.setValueAtTime(freq, time);
  out.gain.setValueAtTime(0.0001, time);
  out.gain.linearRampToValueAtTime(peak, time + 0.003);
  out.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  osc.connect(out);
  osc.start(time);
  osc.stop(time + decay + 0.02);
}

/* ---------- scheduler ---------- */
let timer = null;

// A worker timer is not throttled the same way as a hidden-tab setInterval,
// so audio keeps flowing when the page is backgrounded.
function createTimer(cb) {
  try {
    const blob = new Blob(["setInterval(()=>postMessage(0),25)"], { type: "application/javascript" });
    const worker = new Worker(URL.createObjectURL(blob));
    let running = false;
    return {
      start() { running = true; worker.onmessage = cb; },
      stop() { running = false; worker.onmessage = null; },
      isRunning() { return running; },
    };
  } catch (e) {
    return {
      start() { timer = setInterval(cb, CONFIG.lookahead); },
      stop() { clearInterval(timer); },
      isRunning() { return timer != null; },
    };
  }
}

const scheduler = (() => {
  function tick() {
    const spb = 60 / state.bpm / subdivPerBeat();
    while (state.nextNoteTime < ctx.currentTime + CONFIG.scheduleAhead) {
      if (state.nextNoteTime < ctx.currentTime) state.nextNoteTime = ctx.currentTime + 0.05;
      const sub = state.currentNote % subdivPerBeat();
      const beat = Math.floor(state.currentNote / subdivPerBeat()) % state.beatsPerMeasure;
      const accent = state.accent && beat === 0 && sub === 0;
      const soft = sub !== 0;
      playClick(state.nextNoteTime, accent, soft);
      notesInQueue.push({ beat, accent, time: state.nextNoteTime });
      lastBeatTime = state.nextNoteTime;
      state.nextNoteTime += spb;
      state.currentNote++;
    }
  }
  return createTimer(tick);
})();

function start() {
  if (state.running) return;
  resumeAudio();
  state.currentNote = 0;
  notesInQueue.length = 0;
  lastBeatTime = ctx.currentTime;
  state.nextNoteTime = ctx.currentTime + 0.06;
  state.running = true;
  scheduler.start();
  setPlayUI(true);
  if (!REDUCED) requestAnimationFrame(rafLoop);
}

function stop() {
  if (!state.running) return;
  state.running = false;
  scheduler.stop();
  setPlayUI(false);
  clearBeatHighlight();
}

function toggle() {
  state.running ? stop() : start();
}

/* ---------- visuals ---------- */
function renderDots() {
  el.beats.innerHTML = "";
  for (let i = 0; i < state.beatsPerMeasure; i++) {
    const d = document.createElement("span");
    d.className = "beat-dot" + (i === 0 ? " accent" : "");
    el.beats.appendChild(d);
  }
}

let beatCursor = 0; // index of the beat most recently lit
let swingDir = -1;  // pendulum direction, flips each beat for a natural back-and-forth

function flashBeat(note) {
  swingDir = -swingDir;
  const dots = el.beats.children;
  if (!dots.length) return;
  for (const d of dots) d.classList.remove("active");
  beatCursor = note.beat % dots.length;
  dots[beatCursor].classList.add("active");
}

function clearBeatHighlight() {
  for (const d of el.beats.children) d.classList.remove("active");
}

function rafLoop() {
  if (!state.running) return;
  const now = ctx.currentTime;

  while (notesInQueue.length && notesInQueue[0].time < now) {
    flashBeat(notesInQueue.shift());
  }

  if (!REDUCED && el.pendulumArm) {
    const dur = 60 / state.bpm;
    const phase = Math.min(Math.max((now - lastBeatTime) / dur, 0), 1);
    // sweep −32..32, alternate direction each beat so it rocks back and forth
    const deg = swingDir < 0 ? -32 + phase * 64 : 32 - phase * 64;
    el.pendulumArm.style.transform = `rotate(${deg.toFixed(2)}deg)`;
  }

  requestAnimationFrame(rafLoop);
}

/* ---------- UI sync ---------- */
function setPlayUI(playing) {
  el.play.classList.toggle("playing", playing);
  el.play.setAttribute("aria-label", playing ? "停止" : "开始");
  el.play.setAttribute("aria-pressed", String(playing));
}

function renderTempoMark() {
  const mark = TEMPO_MARKS.find(([max]) => state.bpm <= max);
  el.tempoMark.textContent = `${mark[1]} · ${mark[2]}`;
}

function syncTempoUI() {
  el.bpmInput.value = String(state.bpm);
  el.bpmSlider.value = String(state.bpm);
  el.bpmInput.setAttribute("aria-valuenow", String(state.bpm));
  el.bpmInput.setAttribute("aria-valuetext", `${state.bpm} BPM`);
  renderTempoMark();
}

function setBPM(v) {
  const n = Math.round(v);
  if (!Number.isFinite(n)) return;
  state.bpm = Math.min(CONFIG.maxBPM, Math.max(CONFIG.minBPM, n));
  syncTempoUI();
}

/* ---------- control building ---------- */
function buildSeg(container, items, isActive, onPick) {
  items.forEach((item) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.dataset.key = item.key;
    b.innerHTML = item.html || item.name;
    b.addEventListener("click", () => onPick(item));
    container.appendChild(b);
  });
  return () => {
    for (const b of container.children) {
      const on = isActive(b.dataset.key);
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", String(on));
    }
  };
}

function refreshCompounds() {
  for (const c of el.compoundRow.children) {
    const on = state.compound === c.dataset.compound;
    c.classList.toggle("active", on);
    c.setAttribute("aria-checked", String(on));
  }
}

/* ---------- tap tempo ---------- */
const tapTimes = [];
function tapTempo() {
  resumeAudio();
  const now = performance.now();
  if (tapTimes.length && now - tapTimes[tapTimes.length - 1] > 2500) tapTimes.length = 0;
  tapTimes.push(now);
  if (tapTimes.length > 8) tapTimes.shift();

  el.tap.classList.add("punch");
  setTimeout(() => el.tap.classList.remove("punch"), 110);

  if (tapTimes.length >= 2) {
    let sum = 0;
    for (let i = 1; i < tapTimes.length; i++) sum += tapTimes[i] - tapTimes[i - 1];
    setBPM(60000 / (sum / (tapTimes.length - 1)));
  }
}

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", () => {
  el.year.textContent = new Date().getFullYear();

  // beats per measure 1..12
  const beatItems = Array.from({ length: 12 }, (_, i) => ({ key: String(i + 1), name: String(i + 1) }));
  const refreshBeats = buildSeg(el.beatSeg, beatItems,
    (k) => String(state.beatsPerMeasure) === k && !state.compound,
    (item) => {
      state.compound = null;
      state.beatsPerMeasure = Number(item.key);
      renderDots();
      refreshBeats();
      refreshCompounds();
    });

  // subdivisions
  const refreshSubdiv = buildSeg(el.subdivSeg,
    SUBDIVISIONS.map((s) => ({ key: s.key, html: `${s.label} <small>${s.name}</small>` })),
    (k) => state.subdivKey === k,
    (item) => { state.subdivKey = item.key; refreshSubdiv(); });

  // timbres
  const refreshTimbre = buildSeg(el.timbreSeg,
    TIMBRES.map((t) => ({ key: t.key, name: t.label })),
    (k) => state.timbre === k,
    (item) => { state.timbre = item.key; refreshTimbre(); });

  // compound presets
  for (const c of el.compoundRow.children) {
    c.addEventListener("click", () => {
      state.compound = c.dataset.compound;
      state.beatsPerMeasure = Number(c.dataset.compound);
      state.subdivKey = "triplet";
      renderDots();
      refreshBeats();
      refreshSubdiv();
      refreshCompounds();
    });
  }

  // tempo
  el.minus.addEventListener("click", () => { resumeAudio(); setBPM(state.bpm - 1); });
  el.plus.addEventListener("click", () => { resumeAudio(); setBPM(state.bpm + 1); });
  el.bpmSlider.addEventListener("input", () => setBPM(Number(el.bpmSlider.value)));
  el.bpmInput.addEventListener("focus", () => el.bpmInput.select());
  el.bpmInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commitBPM(); el.bpmInput.blur(); }
  });
  el.bpmInput.addEventListener("blur", commitBPM);
  function commitBPM() {
    const n = parseInt(el.bpmInput.value, 10);
    if (Number.isFinite(n)) setBPM(n);
    else syncTempoUI();
  }

  // transport
  el.play.addEventListener("click", () => { resumeAudio(); toggle(); });
  el.tap.addEventListener("click", tapTempo);

  // accent switch
  el.accentSwitch.addEventListener("click", () => {
    state.accent = !state.accent;
    el.accentSwitch.setAttribute("aria-checked", String(state.accent));
  });

  // keyboard
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
      if (e.key === " ") e.preventDefault(); // let input handle rest
      return;
    }
    switch (e.key) {
      case " ": e.preventDefault(); resumeAudio(); toggle(); break;
      case "ArrowUp": e.preventDefault(); setBPM(state.bpm + (e.shiftKey ? 10 : 1)); break;
      case "ArrowDown": e.preventDefault(); setBPM(state.bpm - (e.shiftKey ? 10 : 1)); break;
      case "+": case "=": e.preventDefault(); setBPM(state.bpm + 1); break;
      case "-": case "_": e.preventDefault(); setBPM(state.bpm - 1); break;
      case "t": case "T": tapTempo(); break;
      case "m": case "M": toggleMute(); break;
      default:
        if (/^[1-9]$/.test(e.key)) {
          const n = Math.min(12, Number(e.key));
          state.compound = null;
          state.beatsPerMeasure = n;
          renderDots(); refreshBeats(); refreshCompounds();
        }
    }
  });

  // volume slider initial + mute helper
  el.volSlider.addEventListener("input", () => setVolume(Number(el.volSlider.value) / 100));
  function toggleMute() {
    state.muted = !state.muted;
    setVolume(state.volume);
  }

  // spotlight glow (matches homepage)
  if (!REDUCED) {
    document.querySelectorAll(".spotlight").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    });
  }

  // reveal on load (single page, nothing to scroll to)
  document.querySelectorAll(".reveal").forEach((n) => n.classList.add("in"));

  // initial render
  renderDots();
  refreshBeats();
  refreshSubdiv();
  refreshTimbre();
  syncTempoUI();
  setVolume(Number(el.volSlider.value) / 100);

  // re-resume if the tab returns and the context went suspended
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && ctx && ctx.state === "suspended") ctx.resume();
  });
});

// resume on first user gesture anywhere (iOS/Safari autoplay policy)
window.addEventListener("pointerdown", resumeAudio, { once: true });
