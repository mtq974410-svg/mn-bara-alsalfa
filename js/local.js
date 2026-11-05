/* ---------- اللعب على جوال واحد ---------- */
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

/* ---------- شاشة الإعداد ---------- */
function renderSetup() {
  stopTimer();
  setFloaters(HOME_FLOATERS);
  const p = state.players;
  const cats = [RANDOM, ...Object.keys(CATEGORIES)];
  const hasScores = p.some(x => x.score > 0);
  paint("setup", `
    <h1>📱 جوال واحد</h1>
    <div class="card">
      <h3>👥 اللاعبين (${p.length})</h3>
      <div class="row">
        <input id="nameInput" placeholder="اكتب اسم اللاعب" maxlength="20">
        <button id="addBtn" data-quiet="1">إضافة</button>
      </div>
      <ul class="players">
        ${p.map((x, i) => `<li class="${i === state.lastNew ? "new" : ""}"><span>${esc(x.name)}${x.score ? ` · ${x.score} ⭐` : ""}</span><button data-del="${i}" data-quiet="1">✕</button></li>`).join("")}
      </ul>
      ${p.length < 3 ? `<p class="muted">لازم 3 لاعبين على الأقل</p>` : ""}
    </div>
    <div class="card">
      <h3>📂 التصنيف</h3>
      <div class="chips">
        ${cats.map(c => `<button class="chip ${c === state.category ? "active" : ""}" data-cat="${esc(c)}" data-quiet="1">${catIcon(c)} ${esc(c)}</button>`).join("")}
      </div>
    </div>
    <button class="big" id="startBtn" data-quiet="1" ${p.length < 3 ? "disabled" : ""}>ابدأ الجولة 🎲</button>
    ${hasScores ? `<button class="big ghost" id="resetBtn">تصفير النقاط 🔄</button>` : ""}
    <button class="big ghost" id="homeBack">⬅️ رجوع</button>
  `);
  state.lastNew = -1;
  const input = document.getElementById("nameInput");
  const add = () => {
    const name = cleanText(input.value, 20);
    if (!name) { shakeEl(input); SFX.wrong(); return; }
    if (p.some(x => x.name === name)) { SFX.wrong(); alert("الاسم موجود"); return; }
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
  const cat = state.roundCat;
  if (!state.shown) {
    paint("pass-" + state.turn, `
      <h2>${CATEGORIES[cat].icon} التصنيف: ${esc(cat)}</h2>
      <div class="card center">
        <div class="big-emoji bounce">📱</div>
        <p>عطِ الجوال لـ</p>
        <h1 class="pop">${esc(pl.name)}</h1>
        <p class="muted">لا تخلي أحد يشوف الشاشة 👀</p>
      </div>
      <button class="big" id="showBtn" data-quiet="1">اضغط وشوف دورك 🔍</button>`);
    document.getElementById("showBtn").onclick = () => {
      state.shown = true;
      if (isOut) { SFX.outsider(); vibrate([120, 60, 120]); } else SFX.reveal();
      renderReveal();
    };
  } else {
    paint("role-" + state.turn, `
      <h2>${esc(pl.name)}</h2>
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
function renderQuestions() {
  const order = shuffle(state.players.map((_, i) => i));
  const pairs = order.map((a, k) => [a, order[(k + 1) % order.length]]);
  let seconds = 180;
  paint("questions-" + Math.random(), `
    <h2><span class="wiggle">❓</span> وقت الأسئلة</h2>
    <p class="center muted">${CATEGORIES[state.roundCat].icon} التصنيف: ${esc(state.roundCat)}، كل واحد يسأل اللي بعده سؤال عن السالفة</p>
    <div class="card stagger">
      ${pairs.map(([a, b], i) => `<div class="pair" style="--i:${i}">🗣️ <b>${esc(state.players[a].name)}</b> يسأل <b>${esc(state.players[b].name)}</b></div>`).join("")}
    </div>
    <div class="card"><div class="timer" id="timer">⏳ 3:00</div></div>
    <button class="big ghost" id="reshuffle">أسئلة جولة ثانية 🔄</button>
    <button class="big" id="voteBtn">يلا نصوّت 🗳️</button>`);
  stopTimer();
  state.timerId = setInterval(() => {
    seconds--;
    const el = document.getElementById("timer");
    if (!el) return stopTimer();
    if (seconds > 0) {
      el.textContent = `⏳ ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      if (seconds <= 10) { el.classList.add("hurry"); SFX.tick(); }
    } else {
      el.textContent = "انتهى الوقت ⏰";
      el.classList.remove("hurry"); el.classList.add("shake");
      SFX.timeUp(); vibrate(400);
      stopTimer();
    }
  }, 1000);
  document.getElementById("reshuffle").onclick = renderQuestions;
  document.getElementById("voteBtn").onclick = () => { stopTimer(); state.turn = 0; state.shown = false; renderVote(); };
}

/* ---------- التصويت ---------- */
function renderVote() {
  const voter = state.players[state.turn];
  if (!state.shown) {
    paint("votepass-" + state.turn, `
      <h2>🗳️ التصويت</h2>
      <div class="card center">
        <div class="big-emoji bounce">🤔</div>
        <p>دور</p><h1 class="pop">${esc(voter.name)}</h1>
        <p class="muted">صوّت بسرية 🤐</p>
      </div>
      <button class="big" id="readyBtn">جاهز</button>`);
    document.getElementById("readyBtn").onclick = () => { state.shown = true; renderVote(); };
    return;
  }
  paint("vote-" + state.turn, `
    <h2>${esc(voter.name)}، مين تتوقع برا السالفة؟ 🕵️</h2>
    <div class="grid stagger">
      ${state.players.map((x, i) => i === state.turn ? "" : `<button data-v="${i}" data-quiet="1" style="--i:${i}">👤 ${esc(x.name)}</button>`).join("")}
    </div>`);
  app.querySelectorAll("[data-v]").forEach(b => b.onclick = () => {
    SFX.vote();
    state.votes[state.turn] = +b.dataset.v;
    state.turn++; state.shown = false;
    if (state.turn >= state.players.length) renderSuspense(); else renderVote();
  });
}

function suspenseHtml() {
  return `
    <div class="card center" style="margin-top:80px">
      <div class="big-emoji bounce">🥁</div>
      <h2>واللي برا السالفة هو...</h2>
      <div class="big-emoji spin" style="font-size:2.5rem">⏳</div>
    </div>`;
}

function renderSuspense() {
  paint("suspense", suspenseHtml());
  SFX.drumroll();
  setTimeout(renderVoteResult, 2300);
}

function voteBarsHtml(players, counts, outsiderIndexOrId, keyOf) {
  const n = players.length;
  return players.map((x, i) => {
    const k = keyOf(x, i);
    const c = Number(counts[k]) || 0;
    return `
      <div class="vote-row">
        <div class="score-row"><span>${k === outsiderIndexOrId ? "🕵️ " : "👤 "}${esc(x.name)}</span><span>${c} صوت</span></div>
        <div class="bar-wrap"><div class="bar" style="--w:${(c / Math.max(1, n - 1)) * 100}%"></div></div>
      </div>`;
  }).join("");
}

function outsiderBoxHtml(caught, name) {
  return `
    <div class="role-box ${caught ? "role-word glow-green" : "role-out glow-red"}">
      <div style="font-size:1rem;font-weight:400">اللي برا السالفة هو</div>
      <div class="big-emoji ${caught ? "bounce" : "wiggle"}">${caught ? "🎯" : "😎"}</div>
      <div>${esc(name)}</div>
      <div style="font-size:1.1rem;margin-top:10px">${caught ? "انكشف! 🎉" : "فلت منكم! 🏃‍♂️💨"}</div>
    </div>`;
}

function renderVoteResult() {
  const counts = state.players.map(() => 0);
  state.votes.forEach(v => counts[v]++);
  const max = Math.max(...counts);
  const top = counts.map((c, i) => c === max ? i : -1).filter(i => i >= 0);
  const caught = top.length === 1 && top[0] === state.outsider;
  state.caught = caught;
  const out = state.players[state.outsider];
  paint("result", `
    <h2>📊 نتيجة التصويت</h2>
    <div class="card">${voteBarsHtml(state.players, counts, state.outsider, (_, i) => i)}</div>
    ${outsiderBoxHtml(caught, out.name)}
    <button class="big" id="guessBtn">خلّ ${esc(out.name)} يخمّن السالفة 🤔</button>`);
  if (caught) { SFX.caught(); confetti(); vibrate([80, 40, 80, 40, 200]); }
  else { SFX.escaped(); confetti(30, ["😎", "🏃‍♂️", "💨"]); }
  document.getElementById("guessBtn").onclick = renderGuess;
}

/* ---------- تخمين برا السالفة ---------- */
function makeGuessOptions(cat, word, emoji) {
  const others = shuffle(CATEGORIES[cat].words.filter(w => w[0] !== word)).slice(0, 7);
  return shuffle([[word, emoji], ...others]);
}

function renderGuess() {
  state.guessOptions = makeGuessOptions(state.roundCat, state.word, state.emoji);
  paint("guess", `
    <h2>${esc(state.players[state.outsider].name)}، وش السالفة؟ 🤔</h2>
    <p class="center muted">${CATEGORIES[state.roundCat].icon} التصنيف: ${esc(state.roundCat)}</p>
    <div class="grid stagger">
      ${state.guessOptions.map(([w, e], i) => `<button data-g="${i}" data-quiet="1" style="--i:${i}">${e} ${esc(w)}</button>`).join("")}
    </div>`);
  const buttons = app.querySelectorAll("[data-g]");
  buttons.forEach(b => b.onclick = () => {
    buttons.forEach(x => x.disabled = true);
    const guess = state.guessOptions[+b.dataset.g][0];
    const right = guess === state.word;
    buttons.forEach(x => { if (state.guessOptions[+x.dataset.g][0] === state.word) { x.classList.add("right", "pop"); x.style.opacity = 1; } });
    if (right) { SFX.correct(); confetti(40, [state.emoji, "✨"]); }
    else { b.classList.add("wrong", "shake"); b.style.opacity = 1; SFX.wrong(); vibrate(300); }
    setTimeout(() => finishRound(guess), 1500);
  });
}

/* ---------- النقاط ونهاية الجولة ---------- */
function rankingHtml(players) {
  const ranking = players.slice().sort((a, b) => b.score - a.score);
  const medals = ["🥇", "🥈", "🥉"];
  return ranking.map((p, i) => `<div class="score-row" style="--i:${i}"><span>${i === 0 ? `<span class="wiggle">👑</span> ` : (medals[i] || "▫️") + " "}${esc(p.name)}</span><span>${Number(p.score) || 0} ⭐</span></div>`).join("");
}

function finishRound(guess) {
  const guessedRight = guess === state.word;
  const notes = [];
  state.players.forEach((p, i) => {
    if (i !== state.outsider && state.votes[i] === state.outsider) { p.score += 1; notes.push(`${p.name} +1 (صوّت صح) ✅`); }
  });
  const out = state.players[state.outsider];
  if (!state.caught) { out.score += 2; notes.push(`${out.name} +2 (ما انكشف) 😎`); }
  if (guessedRight) { out.score += 2; notes.push(`${out.name} +2 (عرف السالفة) 🧠`); }
  savePlayers();

  paint("finish", `
    <h2>${guessedRight ? "عرفها! 🔥" : "ما عرفها ❌"}</h2>
    <div class="role-box role-word pop">
      <div style="font-size:1rem;font-weight:400">السالفة كانت</div>
      <div class="big-emoji bounce">${state.emoji}</div>
      <div>${esc(state.word)}</div>
    </div>
    <div class="card">
      <h3>✨ نقاط الجولة</h3>
      <div class="stagger">
        ${notes.length ? notes.map((n, i) => `<div class="muted" style="--i:${i}">• ${esc(n)}</div>`).join("") : `<div class="muted">ما أحد أخذ نقاط 🤷</div>`}
      </div>
    </div>
    <div class="card">
      <h3>🏆 الترتيب</h3>
      <div class="stagger">${rankingHtml(state.players)}</div>
    </div>
    <button class="big" id="againBtn" data-quiet="1">جولة جديدة 🎲</button>
    <button class="big ghost" id="homeBtn">الرئيسية 🏠</button>`);
  document.getElementById("againBtn").onclick = startRound;
  document.getElementById("homeBtn").onclick = renderSetup;
}
