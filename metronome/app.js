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

// common time signatures → beats per measure
const SIG_PRESETS = [
  { label: "4/4", beats: 4 },
  { label: "3/4", beats: 3 },
  { label: "2/4", beats: 2 },
  { label: "6/8", beats: 6 },
  { label: "2/2", beats: 2 },
  { label: "5/4", beats: 5 },
];

const SWING_DEG = 17;   // rod amplitude (degrees from center)

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
  sig: "4/4",           // active preset label, or "custom"
  nextNoteTime: 0,      // AudioContext-time anchor (seconds)
  currentNote: 0,       // monotonic subdivision counter
};

const notesInQueue = [];
let swingAnchor = 0;      // audio time of a beat tick — rod phase reference
let swingAnchorPhase = 0; // 0 or 1 — which extreme the rod hits at the anchor

function subdivPerBeat() {
  return SUBDIVISIONS.find((s) => s.key === state.subdivKey).perBeat;
}

function isCompound() {
  return state.beatsPerMeasure % 3 === 0 && state.beatsPerMeasure > 3;
}

/* ---------- dom ---------- */
const $ = (id) => document.getElementById(id);
const el = {
  year: $("year"),
  tempoMark: $("tempoMark"),
  minus: $("minusBtn"),
  plus: $("plusBtn"),
  bpmInput: $("bpmInput"),
  bpmSlider: $("bpmSlider"),
  mRod: $("mRod"),
  mWeight: $("mWeight"),
  beats: $("beats"),
  play: $("playBtn"),
  tap: $("tapBtn"),
  sigSeg: $("sigSeg"),
  custMinus: $("custMinus"),
  custPlus: $("custPlus"),
  custVal: $("custVal"),
  subdivSeg: $("subdivSeg"),
  timbreSeg: $("timbreSeg"),
  accentSwitch: $("accentSwitch"),
  volSlider: $("volSlider"),
};

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

// A single click voice. kind: "accent" (downbeat) · "sub" (compound 2nd accent) ·
// "normal" (plain beat) · "soft" (subdivision offbeat).
function playClick(time, kind) {
  const timbre = state.timbre;
  const out = ctx.createGain();
  out.connect(master);
  const isAccent = kind === "accent";
  const isSub = kind === "sub";

  if (timbre === "wood") {
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = isAccent ? 2400 : isSub ? 2100 : 1800;
    bp.Q.value = 9;
    const peak = isAccent ? 0.85 : isSub ? 0.62 : kind === "soft" ? 0.28 : 0.5;
    out.gain.setValueAtTime(0.0001, time);
    out.gain.linearRampToValueAtTime(peak, time + 0.001);
    out.gain.exponentialRampToValueAtTime(0.0001, time + (isAccent ? 0.05 : 0.035));
    src.connect(bp).connect(out);
    src.start(time);
    src.stop(time + 0.08);
    return;
  }

  const isBeep = timbre === "beep";
  let freq;
  if (isAccent) freq = isBeep ? 1568 : 1000;
  else if (isSub) freq = isBeep ? 1318 : 900;
  else freq = isBeep ? 1175 : 800;
  const peak = isAccent ? 0.9 : isSub ? 0.66 : kind === "soft" ? 0.3 : 0.55;
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
    const per = subdivPerBeat();
    const spb = 60 / state.bpm / per;
    while (state.nextNoteTime < ctx.currentTime + CONFIG.scheduleAhead) {
      if (state.nextNoteTime < ctx.currentTime) state.nextNoteTime = ctx.currentTime + 0.05;
      const sub = state.currentNote % per;
      const beatIndex = Math.floor(state.currentNote / per);
      const beat = beatIndex % state.beatsPerMeasure;
      const accent = state.accent && beat === 0 && sub === 0;
      const subAccent = state.accent && isCompound() && sub === 0 && beat % 3 === 0 && beat !== 0;
      playClick(state.nextNoteTime, accent ? "accent" : subAccent ? "sub" : sub !== 0 ? "soft" : "normal");
      if (sub === 0) {
        notesInQueue.push({ beat, accent, subAccent, time: state.nextNoteTime });
        swingAnchor = state.nextNoteTime;
        swingAnchorPhase = beatIndex % 2;
      }
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
  swingAnchor = ctx.currentTime + 0.06;
  swingAnchorPhase = 0;
  state.nextNoteTime = ctx.currentTime + 0.06;
  state.running = true;
  scheduler.start();
  setPlayUI(true);
  rafLoop();
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
  const n = state.beatsPerMeasure;
  const compound = n % 3 === 0 && n > 3;
  for (let i = 0; i < n; i++) {
    const d = document.createElement("span");
    let cls = "beat-dot";
    if (i === 0) cls += " accent";
    else if (compound && i % 3 === 0) cls += " sub";
    d.className = cls;
    el.beats.appendChild(d);
  }
}

function flashBeat(note) {
  const dots = el.beats.children;
  if (!dots.length) return;
  for (const d of dots) d.classList.remove("active");
  dots[note.beat % dots.length].classList.add("active");
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

  if (!REDUCED) {
    // rod phase is derived from the audio clock: the cosine extremes land exactly
    // on each beat, so the rod stays in sync with the sound with zero drift.
    let phase = swingAnchorPhase + (now - swingAnchor) * (state.bpm / 60);
    phase -= 2 * Math.floor(phase / 2);
    const deg = SWING_DEG * Math.cos(Math.PI * phase);
    el.mRod.style.transform = `rotate(${deg.toFixed(2)}deg)`;
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
  updateWeight();
}

// the sliding weight rides high for slow tempi, low for fast — like a real metronome
// (a real metronome: weight higher = longer pendulum = slower)
function updateWeight() {
  if (!el.mWeight) return;
  const t = (state.bpm - CONFIG.minBPM) / (CONFIG.maxBPM - CONFIG.minBPM);
  el.mWeight.style.top = `${(24 + t * 72).toFixed(1)}px`;
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

let refreshSubdiv = () => {}; // assigned during boot; referenced by applySig

function refreshSig() {
  for (const b of el.sigSeg.children) {
    const on = state.sig === b.dataset.key;
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", String(on));
  }
  el.custVal.textContent = String(state.beatsPerMeasure);
}

// pick a signature preset (also resets to its natural subdivision feel)
function applySig(label, beats, subdivKey) {
  state.sig = label;
  state.beatsPerMeasure = beats;
  if (subdivKey) state.subdivKey = subdivKey;
  renderDots();
  refreshSig();
  if (subdivKey) refreshSubdiv();
}

function setCustomBeats(n) {
  state.sig = "custom";
  state.beatsPerMeasure = Math.min(16, Math.max(1, n));
  renderDots();
  refreshSig();
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

  refreshSubdiv = buildSeg(el.subdivSeg,
    SUBDIVISIONS.map((s) => ({ key: s.key, html: `${s.label} <small>${s.name}</small>` })),
    (k) => state.subdivKey === k,
    (item) => { state.subdivKey = item.key; refreshSubdiv(); });

  buildSeg(el.sigSeg,
    SIG_PRESETS.map((p) => ({ key: p.label, name: p.label, beats: p.beats })),
    (k) => state.sig === k,
    (p) => applySig(p.key, p.beats));

  // custom beats stepper
  el.custMinus.addEventListener("click", () => setCustomBeats(state.beatsPerMeasure - 1));
  el.custPlus.addEventListener("click", () => setCustomBeats(state.beatsPerMeasure + 1));

  // timbres
  const refreshTimbre = buildSeg(el.timbreSeg,
    TIMBRES.map((t) => ({ key: t.key, name: t.label })),
    (k) => state.timbre === k,
    (item) => { state.timbre = item.key; refreshTimbre(); });

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
        if (/^[1-9]$/.test(e.key)) setCustomBeats(Number(e.key));
    }
  });

  // volume slider initial + mute helper
  el.volSlider.addEventListener("input", () => setVolume(Number(el.volSlider.value) / 100));
  function toggleMute() {
    state.muted = !state.muted;
    setVolume(state.volume);
  }

  // initial render
  renderDots();
  refreshSig();
  refreshSubdiv();
  refreshTimbre();
  syncTempoUI();
  updateWeight();
  setVolume(Number(el.volSlider.value) / 100);

  // re-resume if the tab returns and the context went suspended
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && ctx && ctx.state === "suspended") ctx.resume();
  });
});

// resume on first user gesture anywhere (iOS/Safari autoplay policy)
window.addEventListener("pointerdown", resumeAudio, { once: true });
