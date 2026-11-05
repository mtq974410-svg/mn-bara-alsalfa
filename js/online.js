/* ---------- اللعب أونلاين (غرف عبر Supabase Realtime) ----------
   صاحب الغرفة (الهوست) يحتفظ بحالة اللعبة ويرسلها للكل،
   وباقي اللاعبين يرسلون حركاتهم (دخول، تصويت، تخمين، دردشة) للهوست. */

// مفتاح publishable مصمم يكون ظاهر في كود المتصفح
const SB_URL = "https://hhstlsdnqvuhxzmtmdtm.supabase.co";
const SB_KEY = "sb_publishable_rPw-G-hp6wDLkGI-6oXB_w__M1Rfahw";

const PID_KEY = "bara_pid";
const NAME_KEY = "bara_name";
const HOST_PREFIX = "bara_host_";
const MAX_PLAYERS = 12;
const QUESTION_MS = 180000;

const myId = LS.get(PID_KEY) || (() => {
  const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);
  LS.set(PID_KEY, id);
  return id;
})();

const On = {
  sb: null, ch: null, code: null, isHost: false,
  room: null, online: new Set(),
  wasIn: false, joinTimer: null, timerId: null, lastJoinSent: 0,
  lastSig: null, lastPhase: null, chatCount: 0,
  ui: { shown: false, peek: false, resultShown: 0, finishShown: 0, timeUpFor: null }
};

function myName() { return cleanText(LS.get(NAME_KEY), 20); }
function shareLink(code) { return location.origin + location.pathname + "?room=" + code; }

/* ---------- الشاشة الرئيسية ---------- */
function renderHome() {
  leaveChannel();
  history.replaceState(null, "", location.pathname);
  setFloaters(HOME_FLOATERS);
  paint("home", `
    <h1><span class="wiggle">🕵️</span> مين برا السالفة؟</h1>
    <div class="card">
      <h3>👤 اسمك</h3>
      <input id="homeName" placeholder="اكتب اسمك" maxlength="20" value="${esc(myName())}">
    </div>
    <div class="card">
      <h3>🌐 العب أونلاين</h3>
      <button class="big" id="createBtn" data-quiet="1">سوّي غرفة جديدة ➕</button>
      <p class="muted center" style="margin:12px 0 6px">أو ادخل غرفة بالكود</p>
      <div class="row">
        <input id="codeInput" placeholder="كود الغرفة" maxlength="4" inputmode="numeric" style="text-align:center;letter-spacing:6px">
        <button id="joinBtn" data-quiet="1">ادخل</button>
      </div>
    </div>
    <button class="big ghost" id="localBtn">📱 العب على جوال واحد</button>
    <div class="card muted" style="margin-top:16px">
      <b>📖 طريقة اللعب:</b> كل اللاعبين يعرفون السالفة (كلمة سرية) إلا واحد "برا السالفة".
      تسألون بعض أسئلة عن السالفة بدون ما تفضحونها، وبعدها تصوّتون مين اللي برا السالفة.
      وبرا السالفة يحاول يعرف السالفة من الأسئلة ويخمّنها بالنهاية.
    </div>`);
  const nameEl = document.getElementById("homeName");
  const codeEl = document.getElementById("codeInput");
  const needName = () => {
    const n = cleanText(nameEl.value, 20);
    if (!n) { shakeEl(nameEl); SFX.wrong(); nameEl.focus(); return null; }
    LS.set(NAME_KEY, n);
    return n;
  };
  document.getElementById("createBtn").onclick = () => { if (needName()) { SFX.start(); createRoom(); } };
  const join = () => {
    const code = codeEl.value.replace(/\D/g, "");
    if (code.length !== 4) { shakeEl(codeEl); SFX.wrong(); return; }
    if (needName()) { SFX.select(); joinRoom(code); }
  };
  document.getElementById("joinBtn").onclick = join;
  codeEl.onkeydown = e => { if (e.key === "Enter") join(); };
  document.getElementById("localBtn").onclick = renderSetup;
}

// شاشة إدخال الاسم لما يفتح أحد رابط غرفة لأول مرة
function renderNameForRoom(code) {
  setFloaters(HOME_FLOATERS);
  paint("name-" + code, `
    <h1>🕵️ مين برا السالفة؟</h1>
    <div class="card center">
      <p>عزموك على الغرفة</p>
      <div class="room-code">${esc(code)}</div>
    </div>
    <div class="card">
      <h3>👤 اسمك</h3>
      <input id="roomName" placeholder="اكتب اسمك" maxlength="20">
    </div>
    <button class="big" id="goBtn" data-quiet="1">ادخل الغرفة 🚪</button>
    <button class="big ghost" id="backBtn">⬅️ الرئيسية</button>`);
  const el = document.getElementById("roomName");
  const go = () => {
    const n = cleanText(el.value, 20);
    if (!n) { shakeEl(el); SFX.wrong(); return; }
    LS.set(NAME_KEY, n); SFX.select(); joinRoom(code);
  };
  document.getElementById("goBtn").onclick = go;
  el.onkeydown = e => { if (e.key === "Enter") go(); };
  document.getElementById("backBtn").onclick = renderHome;
  el.focus();
}

/* ---------- الاتصال ---------- */
function createRoom() {
  const code = String(1000 + rand(9000));
  On.isHost = true;
  On.room = { code, hostId: myId, phase: "lobby", category: RANDOM, players: [{ id: myId, name: myName(), score: 0 }], waiting: [], round: null, chat: [], seq: 1 };
  sysChat(`${myName()} سوّى الغرفة 🎉`);
  saveHost();
  connect(code);
}

function joinRoom(code) {
  let saved = null;
  try { saved = JSON.parse(LS.get(HOST_PREFIX + code)); } catch {}
  if (saved && saved.hostId === myId) { On.isHost = true; On.room = saved; }
  else { On.isHost = false; On.room = null; }
  connect(code);
}

function connect(code) {
  leaveChannel();
  if (!window.supabase) { renderError("ما قدرنا نحمّل مكتبة الاتصال. تأكد من الإنترنت وجرب مرة ثانية."); return; }
  On.sb = On.sb || window.supabase.createClient(SB_URL, SB_KEY);
  On.code = code;
  On.wasIn = false; On.lastSig = null; On.lastPhase = null; On.chatCount = 0;
  On.ui = { shown: false, peek: false, resultShown: 0, suspenseFor: 0, finishShown: 0, timeUpFor: null };
  history.replaceState(null, "", "?room=" + code);

  const ch = On.sb.channel("bara:" + code, { config: { broadcast: { self: false }, presence: { key: myId } } });
  On.ch = ch;
  ch.on("broadcast", { event: "state" }, ({ payload }) => { if (!On.isHost) receiveState(payload); });
  ch.on("broadcast", { event: "action" }, ({ payload }) => { if (On.isHost) hostHandle(payload); });
  ch.on("broadcast", { event: "closed" }, () => { if (!On.isHost) { leaveChannel(); renderError("صاحب الغرفة قفل الغرفة 🚪"); } });
  ch.on("presence", { event: "sync" }, () => {
    On.online = new Set(Object.keys(ch.presenceState()));
    if (On.isHost) commit(); else renderOnline();
  });
  ch.subscribe(async status => {
    if (ch !== On.ch) return;
    if (status === "SUBSCRIBED") {
      await ch.track({ name: myName() });
      if (On.isHost) commit(); else sendJoin();
    }
  });

  if (On.isHost) renderOnline();
  else {
    paint("connecting", `
      <div class="card center" style="margin-top:80px">
        <div class="big-emoji spin">⏳</div>
        <h2>جاري الدخول للغرفة ${esc(code)}...</h2>
      </div>
      <button class="big ghost" id="cancelBtn">إلغاء</button>`);
    document.getElementById("cancelBtn").onclick = renderHome;
    On.joinTimer = setTimeout(() => {
      if (!On.room && ch === On.ch) { leaveChannel(); renderError(`ما لقينا الغرفة ${code} 😕<br><span class="muted">تأكد من الكود، أو إن صاحب الغرفة فاتح اللعبة.</span>`); }
    }, 8000);
  }
}

function leaveChannel() {
  if (On.ch && On.sb) On.sb.removeChannel(On.ch);
  On.ch = null;
  clearTimeout(On.joinTimer);
  clearInterval(On.timerId); On.timerId = null;
}

function renderError(msg) {
  history.replaceState(null, "", location.pathname);
  paint("error-" + Math.random(), `
    <div class="card center" style="margin-top:60px">
      <div class="big-emoji">🙈</div>
      <h2>${msg}</h2>
    </div>
    <button class="big" id="homeBtn">الرئيسية 🏠</button>`);
  SFX.wrong();
  document.getElementById("homeBtn").onclick = renderHome;
}

function sendAction(a) {
  const payload = { ...a, from: myId };
  if (On.isHost) hostHandle(payload);
  else if (On.ch) On.ch.send({ type: "broadcast", event: "action", payload });
}
function sendJoin() { On.lastJoinSent = Date.now(); sendAction({ type: "join", name: myName() }); }

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && On.ch && !On.isHost) sendAction({ type: "hello" });
});

/* ---------- جهة اللاعب: استقبال الحالة ---------- */
function receiveState(r) {
  if (!r || typeof r !== "object" || !Array.isArray(r.players) || !Array.isArray(r.waiting) || !Array.isArray(r.chat) || r.code !== On.code) return;
  if (r.category !== RANDOM && !CATEGORIES[r.category]) return;
  if (r.round && !CATEGORIES[r.round.cat]) return;
  if (On.room && (r.hostId !== On.room.hostId || r.seq < On.room.seq)) return;
  clearTimeout(On.joinTimer);
  On.room = r;
  const inRoom = r.players.some(p => p.id === myId) || r.waiting.some(p => p.id === myId);
  if (inRoom) On.wasIn = true;
  else if (On.wasIn) { leaveChannel(); renderError("صاحب الغرفة طلّعك من الغرفة 👋"); return; }
  else if (Date.now() - On.lastJoinSent > 3000) sendJoin();
  renderOnline();
}

/* ---------- جهة الهوست: منطق اللعبة ---------- */
function saveHost() { if (On.room) LS.set(HOST_PREFIX + On.room.code, JSON.stringify(On.room)); }

function commit() {
  const r = On.room; if (!r) return;
  r.seq++;
  saveHost();
  if (On.ch) On.ch.send({ type: "broadcast", event: "state", payload: r });
  renderOnline();
}

function sysChat(text) {
  const r = On.room;
  r.chat.push({ id: "sys", name: "", text, t: Date.now() });
  if (r.chat.length > 40) r.chat.splice(0, r.chat.length - 40);
}

function uniqueName(name, r) {
  const taken = new Set(r.players.concat(r.waiting).map(p => p.name));
  if (!taken.has(name)) return name;
  for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`)) return `${name} ${i}`;
}

function hostHandle(a) {
  const r = On.room;
  if (!r || !a || typeof a.from !== "string") return;
  const from = a.from;
  const p = r.players.find(x => x.id === from);
  const w = r.waiting.find(x => x.id === from);
  const rd = r.round;
  switch (a.type) {
    case "hello": break;
    case "join": {
      if (p || w) break;
      if (r.players.length + r.waiting.length >= MAX_PLAYERS) return;
      const entry = { id: from, name: uniqueName(cleanText(a.name, 20) || "لاعب", r), score: 0 };
      if (r.phase === "lobby") r.players.push(entry); else r.waiting.push(entry);
      sysChat(`${entry.name} دخل الغرفة 👋`);
      break;
    }
    case "leave": {
      if (w) r.waiting = r.waiting.filter(x => x.id !== from);
      else if (p && r.phase === "lobby") r.players = r.players.filter(x => x.id !== from);
      else return;
      sysChat(`${(p || w).name} طلع من الغرفة 🚶`);
      break;
    }
    case "ready":
      if (r.phase !== "roles" || !p) return;
      rd.ready[from] = true;
      if (r.players.every(x => rd.ready[x.id])) toQuestions();
      break;
    case "vote":
      if (r.phase !== "vote" || !p || a.target === from || !r.players.some(x => x.id === a.target)) return;
      rd.votes[from] = a.target;
      if (r.players.every(x => rd.votes[x.id])) tally();
      break;
    case "guess":
      if (r.phase !== "guess" || from !== rd.outsiderId || !rd.options.some(o => o[0] === a.word)) return;
      finishOnline(a.word);
      break;
    case "chat": {
      const text = cleanText(a.text, 200);
      const who = p || w;
      if (!text || !who) return;
      r.chat.push({ id: from, name: who.name, text, t: Date.now() });
      if (r.chat.length > 40) r.chat.splice(0, r.chat.length - 40);
      break;
    }
    default: return;
  }
  commit();
}

function hostStart() {
  const r = On.room;
  r.players.push(...r.waiting); r.waiting = [];
  if (r.players.length < 3) { toast("لازم 3 لاعبين على الأقل"); commit(); return; }
  const keys = Object.keys(CATEGORIES);
  const cat = r.category === RANDOM ? keys[rand(keys.length)] : r.category;
  const [word, emoji] = CATEGORIES[cat].words[rand(CATEGORIES[cat].words.length)];
  r.round = {
    n: ((r.round && r.round.n) || 0) + 1, q: 0,
    cat, word, emoji, outsiderId: r.players[rand(r.players.length)].id,
    ready: {}, votes: {}, pairs: [], endsAt: 0, caught: false, options: [], guess: null, notes: []
  };
  r.phase = "roles";
  commit();
}

function toQuestions() {
  const r = On.room, rd = r.round;
  const order = shuffle(r.players.map(p => p.id));
  rd.pairs = order.map((a, k) => [a, order[(k + 1) % order.length]]);
  rd.endsAt = Date.now() + QUESTION_MS;
  rd.q++;
  r.phase = "questions";
}

function tally() {
  const r = On.room, rd = r.round;
  const counts = {};
  Object.values(rd.votes).forEach(t => counts[t] = (counts[t] || 0) + 1);
  const max = Math.max(0, ...Object.values(counts));
  const top = Object.keys(counts).filter(k => counts[k] === max);
  rd.caught = max > 0 && top.length === 1 && top[0] === rd.outsiderId;
  rd.counts = counts;
  r.phase = "result";
}

function toGuess() {
  const r = On.room, rd = r.round;
  rd.options = makeGuessOptions(rd.cat, rd.word, rd.emoji);
  r.phase = "guess";
}

function finishOnline(guess) {
  const r = On.room, rd = r.round;
  rd.guess = guess;
  const right = guess === rd.word;
  const notes = [];
  r.players.forEach(p => {
    if (p.id !== rd.outsiderId && rd.votes[p.id] === rd.outsiderId) { p.score += 1; notes.push(`${p.name} +1 (صوّت صح) ✅`); }
  });
  const out = r.players.find(p => p.id === rd.outsiderId);
  if (out) {
    if (!rd.caught) { out.score += 2; notes.push(`${out.name} +2 (ما انكشف) 😎`); }
    if (right) { out.score += 2; notes.push(`${out.name} +2 (عرف السالفة) 🧠`); }
  }
  rd.notes = notes;
  r.phase = "finish";
}

const Host = {
  setCat(c) { On.room.category = c; commit(); },
  kick(id) {
    const r = On.room;
    const p = r.players.concat(r.waiting).find(x => x.id === id);
    if (!p || id === myId) return;
    if (r.phase !== "lobby" && r.players.some(x => x.id === id)) { toast("تقدر تطلّع اللاعبين بين الجولات بس"); return; }
    r.players = r.players.filter(x => x.id !== id);
    r.waiting = r.waiting.filter(x => x.id !== id);
    sysChat(`${p.name} طلع من الغرفة 🚶`);
    commit();
  },
  skipRoles() { if (On.room.phase === "roles") { toQuestions(); commit(); } },
  reshuffle() { if (On.room.phase === "questions") { toQuestions(); commit(); } },
  toVote() { if (On.room.phase === "questions") { On.room.phase = "vote"; commit(); } },
  skipVotes() { if (On.room.phase === "vote") { tally(); commit(); } },
  toGuess() { if (On.room.phase === "result") { toGuess(); commit(); } },
  lobby() {
    const r = On.room;
    r.players.push(...r.waiting); r.waiting = [];
    r.phase = "lobby"; commit();
  },
  resetScores() { On.room.players.forEach(p => p.score = 0); commit(); },
  close() {
    if (On.ch) On.ch.send({ type: "broadcast", event: "closed", payload: {} });
    LS.del(HOST_PREFIX + On.room.code);
    setTimeout(renderHome, 300);
  }
};

/* ---------- الرسم ---------- */
function ensureLayout() {
  if (document.getElementById("screen")) return;
  app.innerHTML = `
    <div id="screen"></div>
    <div class="card chat" id="chatBox">
      <div class="chat-head">💬 الدردشة</div>
      <div class="chat-list" id="chatList"></div>
      <div class="row">
        <input id="chatInput" placeholder="اكتب سؤالك أو جوابك..." maxlength="200">
        <button id="chatSend" data-quiet="1">إرسال</button>
      </div>
    </div>`;
  app.dataset.key = "online";
  const input = document.getElementById("chatInput");
  const send = () => {
    const text = cleanText(input.value, 200);
    if (!text) return;
    input.value = "";
    SFX.message();
    sendAction({ type: "chat", text });
  };
  document.getElementById("chatSend").onclick = send;
  input.onkeydown = e => { if (e.key === "Enter") send(); };
}

function renderChat() {
  const r = On.room, list = document.getElementById("chatList");
  if (!list) return;
  const sig = r.chat.length ? r.chat[r.chat.length - 1].t + ":" + r.chat.length : "0";
  if (list.dataset.sig === sig) return;
  const last = r.chat[r.chat.length - 1];
  if (list.dataset.sig && last && last.id !== myId && last.id !== "sys") SFX.message();
  list.dataset.sig = sig;
  list.innerHTML = r.chat.length
    ? r.chat.map(m => m.id === "sys"
        ? `<div class="msg sys">${esc(m.text)}</div>`
        : `<div class="msg ${m.id === myId ? "mine" : ""}"><b>${esc(m.name)}:</b> ${esc(m.text)}</div>`).join("")
    : `<div class="msg sys">ما فيه رسائل للحين</div>`;
  list.scrollTop = list.scrollHeight;
}

function nameOf(id) {
  const p = On.room.players.concat(On.room.waiting).find(x => x.id === id);
  return p ? p.name : "؟";
}
function dot(id) { return On.online.has(id) ? "🟢" : "⚪"; }

function renderOnline() {
  const r = On.room;
  if (!r) return;
  ensureLayout();
  renderChat();

  // الدردشة لها رسم منفصل، فما نعيد رسم الشاشة بسبب رسالة جديدة
  const sig = JSON.stringify([r.phase, [...On.online].sort(), On.ui.shown, On.ui.peek, On.ui.resultShown, On.ui.finishShown, r.players, r.waiting, r.category, r.round && { ...r.round }]);
  if (sig === On.lastSig) return;
  On.lastSig = sig;

  const screen = document.getElementById("screen");
  const rd = r.round;
  const phaseKey = r.phase + ":" + (rd ? rd.n + "." + rd.q : 0);
  if (phaseKey !== On.lastPhase) {
    if (On.lastPhase !== null) phaseSound(r.phase);
    On.lastPhase = phaseKey;
    On.ui.peek = false;
    if (r.phase === "roles") On.ui.shown = false;
  }
  clearInterval(On.timerId); On.timerId = null;

  const me = r.players.find(p => p.id === myId);
  const isOut = rd && rd.outsiderId === myId;
  const H = On.isHost;

  if (!me && r.phase !== "lobby") {
    setFloaters(["⏳", "🕵️", "🤫"]);
    paintEl(screen, "waiting", `
      <div class="card center" style="margin-top:40px">
        <div class="big-emoji bounce">⏳</div>
        <h2>الجولة شغالة</h2>
        <p>بتدخل معهم الجولة الجاية</p>
      </div>
      ${leaveBtnHtml()}`);
    bindLeave();
    return;
  }

  if (rd) setFloaters([CATEGORIES[rd.cat].icon, "❓", "🤔", "🕵️"]);
  else setFloaters(HOME_FLOATERS);

  switch (r.phase) {
    case "lobby": return renderLobby(screen);
    case "roles": return renderRolesOnline(screen, isOut);
    case "questions": return renderQuestionsOnline(screen, isOut);
    case "vote": return renderVoteOnline(screen, isOut);
    case "result": return renderResultOnline(screen);
    case "guess": return renderGuessOnline(screen, isOut);
    case "finish": return renderFinishOnline(screen);
  }
}

function phaseSound(phase) {
  if (phase === "roles") SFX.start();
  else if (phase === "questions") SFX.whoosh();
  else if (phase === "vote") SFX.vote();
  else if (phase === "guess") SFX.whoosh();
  else if (phase === "lobby") SFX.select();
}

function leaveBtnHtml() { return `<button class="big ghost" id="leaveBtn">${On.isHost ? "🔒 اقفل الغرفة" : "🚪 اطلع من الغرفة"}</button>`; }
function bindLeave() {
  const b = document.getElementById("leaveBtn");
  if (!b) return;
  b.onclick = () => {
    if (On.isHost) { if (confirm("أكيد تبي تقفل الغرفة؟ بتطلع الكل.")) Host.close(); }
    else if (confirm("أكيد تبي تطلع من الغرفة؟")) { sendAction({ type: "leave" }); setTimeout(renderHome, 300); }
  };
}

function peekHtml(isOut) {
  const rd = On.room.round;
  return `
    <button class="big ghost" id="peekBtn" data-quiet="1">${On.ui.peek ? "🙈 خبّ دوري" : "👁️ شوف دوري"}</button>
    ${On.ui.peek ? roleCardHtml(isOut, rd.word, rd.emoji) : ""}`;
}
function bindPeek() {
  const b = document.getElementById("peekBtn");
  if (b) b.onclick = () => { On.ui.peek = !On.ui.peek; On.ui.peek ? SFX.reveal() : SFX.hide(); renderOnline(); };
}

function pendingHtml(doneMap, label) {
  const r = On.room;
  const done = r.players.filter(p => doneMap[p.id]).length;
  const left = r.players.filter(p => !doneMap[p.id]);
  return `
    <div class="card center">
      <div class="big-emoji bounce">⏳</div>
      <h3>${label} ${done}/${r.players.length}</h3>
      ${left.length ? `<p class="muted">ننتظر: ${left.map(p => esc(p.name)).join("، ")}</p>` : ""}
    </div>`;
}

/* ----- اللوبي ----- */
function renderLobby(screen) {
  const r = On.room, H = On.isHost;
  const cats = [RANDOM, ...Object.keys(CATEGORIES)];
  const canShare = !!navigator.share;
  paintEl(screen, "lobby", `
    <h2>🌐 الغرفة</h2>
    <div class="card center">
      <div class="room-code">${esc(r.code)}</div>
      <p class="muted">ارسل الرابط للشباب أو قول لهم الكود</p>
      <div class="row" style="justify-content:center">
        <button class="ghost" id="copyBtn">📋 انسخ الرابط</button>
        ${canShare ? `<button class="ghost" id="shareBtn">📤 شارك</button>` : ""}
      </div>
    </div>
    <div class="card">
      <h3>👥 اللاعبين (${r.players.length})</h3>
      <ul class="players stagger">
        ${r.players.map((p, i) => `
          <li style="--i:${i}">
            <span>${dot(p.id)} ${p.id === r.hostId ? "👑 " : ""}${esc(p.name)}${p.id === myId ? " (أنت)" : ""}${p.score ? ` · ${Number(p.score) || 0} ⭐` : ""}</span>
            ${H && p.id !== myId ? `<button data-kick="${esc(p.id)}" data-quiet="1">✕</button>` : ""}
          </li>`).join("")}
      </ul>
      ${r.players.length < 3 ? `<p class="muted">لازم 3 لاعبين على الأقل</p>` : ""}
    </div>
    <div class="card">
      <h3>📂 التصنيف</h3>
      ${H
        ? `<div class="chips">${cats.map(c => `<button class="chip ${c === r.category ? "active" : ""}" data-cat="${esc(c)}" data-quiet="1">${catIcon(c)} ${esc(c)}</button>`).join("")}</div>`
        : `<p>${catIcon(r.category)} ${esc(r.category)}</p>`}
    </div>
    ${H
      ? `<button class="big" id="startBtn" ${r.players.length < 3 ? "disabled" : ""}>ابدأ الجولة 🎲</button>
         ${r.players.some(p => p.score) ? `<button class="big ghost" id="resetBtn">تصفير النقاط 🔄</button>` : ""}`
      : `<div class="card center"><span class="spin">⏳</span> استنى صاحب الغرفة يبدأ</div>`}
    ${leaveBtnHtml()}`);
  document.getElementById("copyBtn").onclick = () => copyText(shareLink(r.code), "تم نسخ الرابط ✅");
  const sh = document.getElementById("shareBtn");
  if (sh) sh.onclick = () => navigator.share({ title: "مين برا السالفة؟", text: `تعال العب معنا! كود الغرفة ${r.code}`, url: shareLink(r.code) }).catch(() => {});
  if (H) {
    screen.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { SFX.select(); Host.setCat(b.dataset.cat); });
    screen.querySelectorAll("[data-kick]").forEach(b => b.onclick = () => { if (confirm("تطلّع هذا اللاعب؟")) { SFX.remove(); Host.kick(b.dataset.kick); } });
    document.getElementById("startBtn").onclick = hostStart;
    const rs = document.getElementById("resetBtn");
    if (rs) rs.onclick = () => { if (confirm("أكيد تبي تصفر النقاط؟")) Host.resetScores(); };
  }
  bindLeave();
}

/* ----- كشف الأدوار ----- */
function renderRolesOnline(screen, isOut) {
  const rd = On.room.round, H = On.isHost;
  const ready = !!rd.ready[myId];
  let body;
  if (!On.ui.shown && !ready) {
    body = `
      <div class="card center">
        <div class="big-emoji bounce">🤫</div>
        <h3>تأكد ما أحد يشوف شاشتك 👀</h3>
      </div>
      <button class="big" id="showBtn" data-quiet="1">اضغط وشوف دورك 🔍</button>`;
  } else if (!ready) {
    body = `${roleCardHtml(isOut, rd.word, rd.emoji)}
      <button class="big" id="readyBtn" data-quiet="1">شفت دوري ✔️</button>`;
  } else {
    body = `${pendingHtml(rd.ready, "جاهزين")}${peekHtml(isOut)}`;
  }
  paintEl(screen, "roles-" + rd.n + (ready ? "r" : On.ui.shown ? "s" : ""), `
    <h2>${CATEGORIES[rd.cat].icon} التصنيف: ${esc(rd.cat)}</h2>
    ${body}
    ${H && ready ? `<button class="big ghost" id="skipBtn">كمّل بدون الباقين ⏭️</button>` : ""}`);
  const s = document.getElementById("showBtn");
  if (s) s.onclick = () => { On.ui.shown = true; if (isOut) { SFX.outsider(); vibrate([120, 60, 120]); } else SFX.reveal(); renderOnline(); };
  const rb = document.getElementById("readyBtn");
  if (rb) rb.onclick = () => { SFX.hide(); rb.disabled = true; sendAction({ type: "ready" }); };
  const sk = document.getElementById("skipBtn");
  if (sk) sk.onclick = () => Host.skipRoles();
  bindPeek();
}

/* ----- الأسئلة ----- */
function renderQuestionsOnline(screen, isOut) {
  const rd = On.room.round, H = On.isHost;
  paintEl(screen, "questions-" + rd.n + "." + rd.q, `
    <h2><span class="wiggle">❓</span> وقت الأسئلة</h2>
    <p class="center muted">${CATEGORIES[rd.cat].icon} التصنيف: ${esc(rd.cat)}، كل واحد يسأل اللي بعده سؤال عن السالفة (بالدردشة أو بالصوت)</p>
    <div class="card stagger">
      ${rd.pairs.map(([a, b], i) => `<div class="pair" style="--i:${i}">🗣️ <b>${esc(nameOf(a))}</b> يسأل <b>${esc(nameOf(b))}</b></div>`).join("")}
    </div>
    <div class="card"><div class="timer" id="timer">⏳</div></div>
    ${peekHtml(isOut)}
    ${H
      ? `<button class="big ghost" id="reshuffle">أسئلة جولة ثانية 🔄</button>
         <button class="big" id="voteBtn">يلا نصوّت 🗳️</button>`
      : `<p class="center muted">صاحب الغرفة يبدأ التصويت لما تخلصون</p>`}`);
  const tick = () => {
    const el = document.getElementById("timer");
    if (!el) return;
    const s = Math.ceil((rd.endsAt - Date.now()) / 1000);
    if (s > 0) {
      el.textContent = `⏳ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      el.classList.toggle("hurry", s <= 10);
      if (s <= 10) SFX.tick();
    } else {
      el.textContent = "انتهى الوقت ⏰";
      el.classList.remove("hurry");
      const key = rd.n + "." + rd.q;
      if (On.ui.timeUpFor !== key) { On.ui.timeUpFor = key; shakeEl(el); SFX.timeUp(); vibrate(400); }
      clearInterval(On.timerId); On.timerId = null;
    }
  };
  tick();
  On.timerId = setInterval(tick, 1000);
  if (H) {
    document.getElementById("reshuffle").onclick = Host.reshuffle;
    document.getElementById("voteBtn").onclick = Host.toVote;
  }
  bindPeek();
}

/* ----- التصويت ----- */
function renderVoteOnline(screen, isOut) {
  const r = On.room, rd = r.round, H = On.isHost;
  const voted = rd.votes[myId];
  paintEl(screen, "vote-" + rd.n + (voted ? "v" : ""), voted
    ? `<h2>🗳️ صوّت على ${esc(nameOf(voted))} ✅</h2>
       ${pendingHtml(rd.votes, "صوّتوا")}
       ${H ? `<button class="big ghost" id="skipBtn">اعرض النتيجة بدون الباقين ⏭️</button>` : ""}`
    : `<h2>مين تتوقع برا السالفة؟ 🕵️</h2>
       <p class="center muted">صوتك سري 🤐</p>
       <div class="grid stagger">
         ${r.players.filter(p => p.id !== myId).map((p, i) => `<button data-v="${esc(p.id)}" data-quiet="1" style="--i:${i}">👤 ${esc(p.name)}</button>`).join("")}
       </div>
       ${peekHtml(isOut)}`);
  screen.querySelectorAll("[data-v]").forEach(b => b.onclick = () => {
    SFX.vote();
    screen.querySelectorAll("[data-v]").forEach(x => x.disabled = true);
    sendAction({ type: "vote", target: b.dataset.v });
  });
  const sk = document.getElementById("skipBtn");
  if (sk) sk.onclick = () => Host.skipVotes();
  bindPeek();
}

/* ----- النتيجة ----- */
function renderResultOnline(screen) {
  const r = On.room, rd = r.round, H = On.isHost;
  if (On.ui.resultShown !== rd.n) {
    if (On.ui.suspenseFor !== rd.n) {
      On.ui.suspenseFor = rd.n;
      paintEl(screen, "suspense-" + rd.n, suspenseHtml());
      SFX.drumroll();
      const n = rd.n;
      setTimeout(() => { if (On.room && On.room.round && On.room.round.n === n) { On.ui.resultShown = n; showResultFx(); renderOnline(); } }, 2300);
    }
    return;
  }
  const out = nameOf(rd.outsiderId);
  const iAmOut = rd.outsiderId === myId;
  paintEl(screen, "result-" + rd.n, `
    <h2>📊 نتيجة التصويت</h2>
    <div class="card">${voteBarsHtml(r.players, rd.counts || {}, rd.outsiderId, p => p.id)}</div>
    ${outsiderBoxHtml(rd.caught, out)}
    ${H
      ? `<button class="big" id="guessBtn">خلّ ${esc(out)} يخمّن السالفة 🤔</button>`
      : iAmOut ? `<p class="center">جهّز نفسك، بتخمّن السالفة 🤔</p>` : `<p class="center muted">بعدها ${esc(out)} بيخمّن السالفة</p>`}`);
  const g = document.getElementById("guessBtn");
  if (g) g.onclick = Host.toGuess;
}
function showResultFx() {
  const rd = On.room.round;
  if (rd.caught) { SFX.caught(); confetti(); vibrate([80, 40, 80, 40, 200]); }
  else { SFX.escaped(); confetti(30, ["😎", "🏃‍♂️", "💨"]); }
}

/* ----- التخمين ----- */
function renderGuessOnline(screen, isOut) {
  const rd = On.room.round;
  if (!isOut) {
    paintEl(screen, "guess-wait-" + rd.n, `
      <div class="card center" style="margin-top:40px">
        <div class="big-emoji bounce">🤔</div>
        <h2>${esc(nameOf(rd.outsiderId))} يخمّن السالفة...</h2>
        <p class="muted">${CATEGORIES[rd.cat].icon} ${esc(rd.cat)}</p>
      </div>`);
    return;
  }
  paintEl(screen, "guess-" + rd.n, `
    <h2>وش السالفة؟ 🤔</h2>
    <p class="center muted">${CATEGORIES[rd.cat].icon} التصنيف: ${esc(rd.cat)}</p>
    <div class="grid stagger">
      ${rd.options.map(([w, e], i) => `<button data-g="${i}" data-quiet="1" style="--i:${i}">${esc(e)} ${esc(w)}</button>`).join("")}
    </div>`);
  const buttons = screen.querySelectorAll("[data-g]");
  buttons.forEach(b => b.onclick = () => {
    buttons.forEach(x => x.disabled = true);
    SFX.select();
    sendAction({ type: "guess", word: rd.options[+b.dataset.g][0] });
  });
}

/* ----- نهاية الجولة ----- */
function renderFinishOnline(screen) {
  const r = On.room, rd = r.round, H = On.isHost;
  const right = rd.guess === rd.word;
  if (On.ui.finishShown !== rd.n) {
    On.ui.finishShown = rd.n;
    if (right) { SFX.correct(); confetti(40, [String(rd.emoji), "✨"]); } else { SFX.wrong(); vibrate(300); }
  }
  const guessed = rd.guess ? (CATEGORIES[rd.cat].words.find(w => w[0] === rd.guess) || [rd.guess, "❔"]) : null;
  paintEl(screen, "finish-" + rd.n, `
    <h2 class="${right ? "pop" : "shake"}">${right ? "عرفها! 🔥" : "ما عرفها ❌"}</h2>
    ${guessed ? `<p class="center">${esc(nameOf(rd.outsiderId))} خمّن: ${esc(guessed[1])} ${esc(guessed[0])}</p>` : ""}
    <div class="role-box role-word pop">
      <div style="font-size:1rem;font-weight:400">السالفة كانت</div>
      <div class="big-emoji bounce">${esc(rd.emoji)}</div>
      <div>${esc(rd.word)}</div>
    </div>
    <div class="card">
      <h3>✨ نقاط الجولة</h3>
      <div class="stagger">
        ${rd.notes.length ? rd.notes.map((n, i) => `<div class="muted" style="--i:${i}">• ${esc(n)}</div>`).join("") : `<div class="muted">ما أحد أخذ نقاط 🤷</div>`}
      </div>
    </div>
    <div class="card">
      <h3>🏆 الترتيب</h3>
      <div class="stagger">${rankingHtml(r.players)}</div>
    </div>
    ${H
      ? `<button class="big" id="againBtn">جولة جديدة 🎲</button>
         <button class="big ghost" id="lobbyBtn">رجوع للغرفة 🏠</button>`
      : `<div class="card center"><span class="spin">⏳</span> استنى صاحب الغرفة</div>`}
    ${leaveBtnHtml()}`);
  if (H) {
    document.getElementById("againBtn").onclick = hostStart;
    document.getElementById("lobbyBtn").onclick = Host.lobby;
  }
  bindLeave();
}

/* ---------- البداية ---------- */
(function init() {
  const code = (new URLSearchParams(location.search).get("room") || "").replace(/\D/g, "").slice(0, 4);
  if (code.length === 4) {
    if (myName()) joinRoom(code); else renderNameForRoom(code);
  } else renderHome();
})();
