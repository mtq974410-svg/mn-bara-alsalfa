/* ============================================================
   اللعب على جوال واحد
   ============================================================ */
const STORE_KEY = "bara_salfa_players";

let state = {
  players: loadPlayers(),
  category: RANDOM,
  roundCat: null, word: null, emoji: null, outsider: -1,
  turn: 0, shown: false, votes: [], caught: false, guessOptions: [],
  timerId: null, lastNew: -1
};

function loadPlayers() { try { return JSON.parse(LS.get(STORE_KEY)) || []; } catch { return []; } }
function savePlayers() { LS.set(STORE_KEY, JSON.stringify(state.players)); }
function stopTimer() { if (state.timerId) { clearInterval(state.timerId); state.timerId = null; } }
function catPill(cat) { return `<div class="pill">${CATEGORIES[cat].icon} ${esc(cat)}</div>`; }

function chipsHtml(active) {
  return `<div class="chips">${[RANDOM, ...Object.keys(CATEGORIES)].map(c =>
    `<button class="chip ${c === active ? "active" : ""}" data-cat="${esc(c)}" data-quiet="1">${catIcon(c)} ${esc(c)}</button>`).join("")}</div>`;
}

/* ---------- الإعداد ---------- */
function renderSetup() {
  stopTimer();
  Music.setMood("calm");
  setFloaters(HOME_FLOATERS);
  const p = state.players;
  const hasScores = p.some(x => x.score > 0);
  paint("setup", `
    <div class="topbar">
      <button class="icon-btn" id="homeBack" aria-label="رجوع">➜</button>
      <div class="title">📱 جوال واحد</div>
    </div>
    <div class="card">
      <div class="card-title">👥 اللاعبين <span class="badge">${p.length}</span></div>
      <div class="row">
        <input id="nameInput" placeholder="اكتب اسم اللاعب" maxlength="20" autocomplete="off">
        <button id="addBtn" data-quiet="1">إضافة</button>
      </div>
      <ul class="players">
        ${p.map((x, i) => `
          <li class="${i === state.lastNew ? "new" : ""}">
            ${avatar(x.name)}<span class="pname">${esc(x.name)}</span>
            ${x.score ? `<span class="pscore">${Number(x.score) || 0} ⭐</span>` : ""}
            <button class="x-btn" data-del="${i}" data-quiet="1" aria-label="حذف">✕</button>
          </li>`).join("")}
      </ul>
      ${p.length < 3 ? `<p class="hint">لازم 3 لاعبين على الأقل</p>` : ""}
    </div>
    <div class="card">
      <div class="card-title">📂 التصنيف</div>
      ${chipsHtml(state.category)}
    </div>
    <button class="big" id="startBtn" data-quiet="1" ${p.length < 3 ? "disabled" : ""}>ابدأ الجولة 🎲</button>
    ${hasScores ? `<button class="big ghost" id="resetBtn">تصفير النقاط 🔄</button>` : ""}
  `);
  state.lastNew = -1;
  const input = document.getElementById("nameInput");
  const add = () => {
    const name = cleanText(input.value, 20);
    if (!name) { shakeEl(input); SFX.wrong(); return; }
    if (p.some(x => x.name === name)) { shakeEl(input); SFX.wrong(); toast("الاسم موجود"); return; }
    p.push({ name, score: 0 }); savePlayers(); SFX.add();
    state.lastNew = p.length - 1;
    renderSetup();
    document.getElementById("nameInput").focus();
  };
  document.getElementById("addBtn").onclick = add;
  input.onkeydown = e => { if (e.key === "Enter") add(); };
  app.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { SFX.remove(); p.splice(+b.dataset.del, 1); savePlayers(); renderSetup(); });
  app.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { SFX.select(); state.category = b.dataset.cat; renderSetup(); });
  document.getElementById("startBtn").onclick = startRound;
  document.getElementById("homeBack").onclick = renderHome;
  const r = document.getElementById("resetBtn");
  if (r) r.onclick = () => { if (confirm("أكيد تبي تصفر النقاط؟")) { p.forEach(x => x.score = 0); savePlayers(); renderSetup(); } };
}

/* ---------- بداية الجولة ---------- */
function startRound() {
  SFX.start();
  Music.setMood("calm");
  const keys = Object.keys(CATEGORIES);
  state.roundCat = state.category === RANDOM ? keys[rand(keys.length)] : state.category;
  const words = CATEGORIES[state.roundCat].words;
  [state.word, state.emoji] = words[rand(words.length)];
  state.outsider = rand(state.players.length);
  state.turn = 0; state.shown = false; state.votes = [];
  setFloaters([CATEGORIES[state.roundCat].icon, "❓", "🤔", "🕵️"]);
  renderReveal();
}

/* ---------- كشف الأدوار ---------- */
function renderReveal() {
  const pl = state.players[state.turn];
  const isOut = state.turn === state.outsider;
  if (!state.shown) {
    paint("pass-" + state.turn, `
      ${catPill(state.roundCat)}
      <div class="card pass">
        <div class="muted">عطِ الجوال لـ</div>
        ${avatar(pl.name, "xl")}
        <div class="pass-name">${esc(pl.name)}</div>
        <div class="hint">لا تخلي أحد يشوف الشاشة 👀</div>
      </div>
      <button class="big" id="showBtn" data-quiet="1">اقلب الكرت 🃏</button>
      <p class="hint">${state.turn + 1} من ${state.players.length}</p>`);
    document.getElementById("showBtn").onclick = () => {
      state.shown = true;
      if (isOut) { SFX.outsider(); vibrate([120, 60, 120]); } else SFX.reveal();
      renderReveal();
    };
  } else {
    paint("role-" + state.turn, `
      <div class="title">${esc(pl.name)}</div>
      ${roleCardHtml(isOut, state.word, state.emoji)}
      <button class="big" id="nextBtn" data-quiet="1">تمام، خبّيها ✔️</button>`);
    document.getElementById("nextBtn").onclick = () => {
      SFX.hide();
      state.shown = false; state.turn++;
      if (state.turn >= state.players.length) renderQuestions(); else renderReveal();
    };
  }
}

/* ---------- الأسئلة ---------- */
function pairsHtml(pairs, nameOfKey) {
  return `<div class="card stagger">
    ${pairs.map(([a, b], i) => `
      <div class="pair" style="--i:${i}">
        ${avatar(a, "sm")}<b>${esc(nameOfKey(a))}</b><span class="asks">يسأل ←</span>${avatar(b, "sm")}<b>${esc(nameOfKey(b))}</b>
      </div>`).join("")}
  </div>`;
}

function renderQuestions() {
  Music.setMood("tense");
  const order = shuffle(state.players.map(p => p.name));
  const pairs = order.map((a, k) => [a, order[(k + 1) % order.length]]);
  const total = 180;
  let seconds = total;
  paint("questions-" + Math.random(), `
    <div class="title"><span class="wiggle">❓</span> وقت الأسئلة</div>
    ${catPill(state.roundCat)}
    ${timerHtml()}
    <p class="hint" style="margin:0 0 12px">كل واحد يسأل اللي بعده سؤال عن السالفة</p>
    ${pairsHtml(pairs, n => n)}
    <button class="big ghost" id="reshuffle">أسئلة جولة ثانية 🔄</button>
    <button class="big" id="voteBtn">يلا نصوّت 🗳️</button>`);
  stopTimer();
  updateTimer(seconds, total);
  state.timerId = setInterval(() => {
    seconds--;
    if (!updateTimer(seconds, total)) return stopTimer();
    if (seconds > 0 && seconds <= 10) { SFX.tick(); if (seconds <= 5) SFX.heartbeat(); }
    if (seconds <= 0) { SFX.timeUp(); stopTimer(); }
  }, 1000);
  document.getElementById("reshuffle").onclick = () => { SFX.whoosh(); renderQuestions(); };
  document.getElementById("voteBtn").onclick = () => { stopTimer(); SFX.vote(); state.turn = 0; state.shown = false; renderVote(); };
}

/* ---------- التصويت ---------- */
function renderVote() {
  const voter = state.players[state.turn];
  if (!state.shown) {
    paint("votepass-" + state.turn, `
      <div class="title">🗳️ التصويت</div>
      <div class="card pass">
        <div class="muted">دور</div>
        ${avatar(voter.name, "xl")}
        <div class="pass-name">${esc(voter.name)}</div>
        <div class="hint">صوّت بسرية 🤐</div>
      </div>
      <button class="big" id="readyBtn">جاهز</button>`);
    document.getElementById("readyBtn").onclick = () => { state.shown = true; renderVote(); };
    return;
  }
  paint("vote-" + state.turn, `
    <div class="title">${esc(voter.name)}، مين برا السالفة؟ 🕵️</div>
    <div class="grid stagger">
      ${state.players.map((x, i) => i === state.turn ? "" : `<button class="pick" data-v="${i}" data-quiet="1" style="--i:${i}">${avatar(x.name)}<span>${esc(x.name)}</span></button>`).join("")}
    </div>`);
  app.querySelectorAll("[data-v]").forEach(b => b.onclick = () => {
    SFX.vote();
    state.votes[state.turn] = +b.dataset.v;
    state.turn++; state.shown = false;
    if (state.turn >= state.players.length) renderSuspense(); else renderVote();
  });
}

function renderSuspense() {
  paint("suspense", suspenseHtml());
  SFX.drumroll();
  Music.duck(3.5);
  setTimeout(renderVoteResult, 2300);
}

function renderVoteResult() {
  Music.setMood("calm");
  const counts = state.players.map(() => 0);
  state.votes.forEach(v => counts[v]++);
  const max = Math.max(...counts);
  const top = counts.map((c, i) => c === max ? i : -1).filter(i => i >= 0);
  const caught = top.length === 1 && top[0] === state.outsider;
  state.caught = caught;
  const out = state.players[state.outsider];
  paint("result", `
    ${outsiderBoxHtml(caught, out)}
    <div class="card">
      <div class="card-title">📊 الأصوات</div>
      ${voteBarsHtml(state.players, counts, state.outsider, (_, i) => i)}
    </div>
    <button class="big" id="guessBtn">خلّ ${esc(out.name)} يخمّن السالفة 🤔</button>`);
  if (caught) { SFX.caught(); confetti(); vibrate([80, 40, 80, 40, 200]); }
  else { SFX.escaped(); confetti(50, ["😎", "💨", "🏃‍♂️"]); }
  document.getElementById("guessBtn").onclick = renderGuess;
}

/* ---------- تخمين برا السالفة ---------- */
function renderGuess() {
  state.guessOptions = makeGuessOptions(state.roundCat, state.word, state.emoji);
  paint("guess", `
    <div class="title">${esc(state.players[state.outsider].name)}، وش السالفة؟ 🤔</div>
    ${catPill(state.roundCat)}
    ${optionsHtml(state.guessOptions)}`);
  const buttons = app.querySelectorAll("[data-g]");
  buttons.forEach(b => b.onclick = () => {
    buttons.forEach(x => x.disabled = true);
    const guess = state.guessOptions[+b.dataset.g][0];
    const right = guess === state.word;
    buttons.forEach(x => { if (state.guessOptions[+x.dataset.g][0] === state.word) x.classList.add("right"); });
    if (right) { SFX.correct(); burstFrom(b, 70, [state.emoji, "✨"]); }
    else { b.classList.add("wrong", "shake"); SFX.wrong(); vibrate(300); }
    setTimeout(() => finishRound(guess), 1600);
  });
}

/* ---------- النقاط ونهاية الجولة ---------- */
function finishRound(guess) {
  const guessedRight = guess === state.word;
  const notes = [];
  state.players.forEach((p, i) => {
    if (i !== state.outsider && state.votes[i] === state.outsider) { p.score += 1; notes.push(`✅ ${p.name} +1 (صوّت صح)`); }
  });
  const out = state.players[state.outsider];
  if (!state.caught) { out.score += 2; notes.push(`😎 ${out.name} +2 (ما انكشف)`); }
  if (guessedRight) { out.score += 2; notes.push(`🧠 ${out.name} +2 (عرف السالفة)`); }
  savePlayers();

  paint("finish", `
    <div class="title ${guessedRight ? "pop" : "shake"}">${guessedRight ? "عرفها! 🔥" : "ما عرفها ❌"}</div>
    ${wordRevealHtml(state.word, state.emoji)}
    <div class="card">
      <div class="card-title">🏆 الترتيب</div>
      ${rankingHtml(state.players)}
    </div>
    <div class="card">
      <div class="card-title">✨ نقاط الجولة</div>
      ${notesHtml(notes)}
    </div>
    <button class="big" id="againBtn" data-quiet="1">جولة جديدة 🎲</button>
    <button class="big ghost" id="homeBtn">الإعدادات ⚙️</button>`);
  SFX.win();
  playCoins(notes.length);
  setTimeout(() => burstFrom(document.querySelector(".p1 .av"), 50, ["👑", "⭐"]), 900);
  document.getElementById("againBtn").onclick = startRound;
  document.getElementById("homeBtn").onclick = renderSetup;
}
