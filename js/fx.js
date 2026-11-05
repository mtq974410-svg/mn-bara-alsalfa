/* ---------- أدوات عامة ---------- */
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function rand(n) { return Math.floor(Math.random() * n); }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function cleanText(s, max) { return String(s || "").replace(/\s+/g, " ").trim().slice(0, max); }

const app = document.getElementById("app");

// يرسم داخل عنصر، ويشغّل أنيميشن الدخول فقط لما تتغير الشاشة
function paintEl(el, key, html) {
  el.innerHTML = html;
  if (el.dataset.key !== key) {
    el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter");
    el.dataset.key = key;
    window.scrollTo(0, 0);
  }
}
function paint(key, html) { paintEl(app, key, html); }

function shakeEl(el) { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); }
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
function copyText(text, msg) {
  const fallback = () => window.prompt("انسخ:", text);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast(msg), fallback);
  else fallback();
}

/* ---------- محرك الصوت (Web Audio، بدون ملفات) ---------- */
const SOUND_KEY = "bara_salfa_sound";
const Sound = {
  ctx: null,
  on: LS.get(SOUND_KEY) !== "off",
  get() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },
  tone(freq, dur, o = {}) {
    if (!this.on) return;
    const c = this.get(); if (!c) return;
    const { type = "sine", vol = 0.18, delay = 0, slide = 0 } = o;
    const t = c.currentTime + delay;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t); osc.stop(t + dur + 0.05);
  },
  noise(dur, o = {}) {
    if (!this.on) return;
    const c = this.get(); if (!c) return;
    const { vol = 0.15, delay = 0, freq = 1000, q = 1, type = "bandpass" } = o;
    const t = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t); src.stop(t + dur + 0.02);
  }
};
const notes = (seq, o = {}) => seq.forEach(([f, d, delay]) => Sound.tone(f, d, { ...o, delay }));
const SFX = {
  click:    () => Sound.tone(520, 0.07, { type: "triangle", vol: 0.1 }),
  add:      () => notes([[523, .12, 0], [784, .18, .08]], { type: "triangle" }),
  remove:   () => Sound.tone(420, 0.18, { type: "square", vol: 0.06, slide: -250 }),
  select:   () => Sound.tone(880, 0.1, { type: "triangle", vol: 0.12, slide: 300 }),
  message:  () => Sound.tone(1250, 0.07, { vol: 0.08 }),
  start:    () => notes([[523, .15, 0], [659, .15, .1], [784, .15, .2], [1047, .35, .3]], { type: "triangle", vol: .16 }),
  whoosh:   () => Sound.noise(0.35, { freq: 1200, q: 0.7, vol: 0.12 }),
  reveal:   () => { SFX.whoosh(); notes([[880, .25, .15], [1320, .45, .25]], { vol: .12 }); },
  outsider: () => { SFX.whoosh(); notes([[196, .5, .1], [185, .5, .45], [147, .9, .8]], { type: "sawtooth", vol: .08 }); },
  hide:     () => Sound.tone(700, 0.15, { type: "sine", vol: 0.1, slide: -400 }),
  tick:     () => Sound.tone(1100, 0.05, { type: "square", vol: 0.05 }),
  timeUp:   () => notes([[880, .2, 0], [880, .2, .3], [880, .5, .6]], { type: "square", vol: .1 }),
  vote:     () => notes([[660, .08, 0], [990, .15, .07]], { type: "triangle", vol: .14 }),
  drumroll: () => {
    for (let i = 0; i < 26; i++) Sound.noise(0.06, { delay: i * 0.08, freq: 250 + i * 8, q: 1.5, vol: 0.05 + i * 0.007 });
    Sound.noise(1.2, { delay: 2.1, freq: 7000, type: "highpass", vol: 0.18 });
    Sound.tone(110, 0.4, { delay: 2.1, vol: 0.25 });
  },
  caught:   () => notes([[523, .15, 0], [659, .15, .12], [784, .15, .24], [1047, .2, .36], [784, .12, .56], [1047, .6, .68]], { type: "triangle", vol: .16 }),
  escaped:  () => notes([[392, .3, 0], [370, .3, .3], [349, .3, .6], [330, .8, .9]], { type: "sawtooth", vol: .07 }),
  correct:  () => notes([[784, .1, 0], [988, .1, .08], [1175, .1, .16], [1568, .45, .24]], { vol: .15 }),
  wrong:    () => Sound.tone(140, 0.6, { type: "sawtooth", vol: 0.12, slide: -40 })
};
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }

/* ---------- تأثيرات بصرية ---------- */
function confetti(n = 70, emojis = ["🎉", "✨", "🎊", "⭐"]) {
  const colors = ["#ffcc00", "#ff5e78", "#3ddc97", "#7597de", "#ffffff", "#c084fc"];
  for (let i = 0; i < n; i++) {
    const d = document.createElement("div");
    d.className = "confetti";
    if (Math.random() < 0.35) d.textContent = emojis[rand(emojis.length)];
    else { d.classList.add("piece"); d.style.background = colors[rand(colors.length)]; }
    d.style.left = Math.random() * 100 + "vw";
    d.style.animationDuration = 2 + Math.random() * 2 + "s";
    d.style.animationDelay = Math.random() * 0.6 + "s";
    d.style.setProperty("--rot", (rand(720) - 360) + "deg");
    d.style.setProperty("--drift", (rand(200) - 100) + "px");
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 5000);
  }
}
function setFloaters(emojis) {
  const layer = document.getElementById("bg");
  layer.innerHTML = "";
  for (let i = 0; i < 14; i++) {
    const s = document.createElement("span");
    s.textContent = emojis[i % emojis.length];
    s.style.left = Math.random() * 95 + "vw";
    s.style.fontSize = 24 + rand(28) + "px";
    s.style.animationDuration = 14 + Math.random() * 12 + "s";
    s.style.animationDelay = -Math.random() * 20 + "s";
    layer.appendChild(s);
  }
}
const HOME_FLOATERS = Object.values(CATEGORIES).map(c => c.icon).concat(["🕵️", "🤫", "❓"]);

/* ---------- كارت الدور (مشترك بين الوضعين) ---------- */
function roleCardHtml(isOut, word, emoji) {
  return isOut
    ? `<div class="role-box role-out glow-red">
         <div class="big-emoji wiggle">🕵️</div>
         <div>أنت برا السالفة 🤫</div>
         <div style="font-size:1rem;font-weight:400;margin-top:10px">حاول تعرف السالفة وما تنكشف</div>
       </div>`
    : `<div class="role-box role-word flip">
         <div style="font-size:1rem;font-weight:400">السالفة هي</div>
         <div class="big-emoji bounce">${esc(emoji)}</div>
         <div>${esc(word)}</div>
       </div>`;
}

/* ---------- صوت الأزرار وزر الكتم ---------- */
document.addEventListener("click", e => {
  const b = e.target.closest("button");
  if (b && !b.disabled && !b.dataset.quiet) SFX.click();
}, true);

const muteBtn = document.getElementById("muteBtn");
function updateMute() { muteBtn.textContent = Sound.on ? "🔊" : "🔇"; }
muteBtn.onclick = () => {
  Sound.on = !Sound.on;
  LS.set(SOUND_KEY, Sound.on ? "on" : "off");
  updateMute();
  if (Sound.on) SFX.select();
};
updateMute();
