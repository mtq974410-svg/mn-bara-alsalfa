/* ============================================================
   مكالمة صوتية داخل الغرفة (WebRTC مباشر بين الجوالات)
   - قناة Supabase تُستخدم بس عشان كل جوال يتعرّف على الثاني (signaling)
   - الصوت نفسه ما يمر على أي سيرفر
   - مين داخل الصوت ومين كاتم: من Presence
   ============================================================ */
const ICE_SERVERS = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
const VOICE_MAX = 8;   // اتصال مباشر بين الكل، فنحدّه عشان ما يثقل الجوال

const Voice = {
  on: false, muted: false, joining: false, stream: null,
  peers: new Map(),     // id -> { pc, audio, pending: [] }
  members: new Map(),   // id -> { muted }  (من Presence)
  missing: new Map(), watchTimer: null,
  meterCtx: null, meters: new Map(), meterTimer: null,

  supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection); },
  meta() { return { voice: this.on, muted: this.muted }; },
  _ch() {
    if (typeof AtOn !== "undefined" && AtOn.ch) return AtOn.ch;
    return On.ch;
  },
  _pkOf(id) {
    if (typeof AtOn !== "undefined" && AtOn.room) {
      const r = AtOn.room;
      const p = r.players.concat(r.waiting).find(x => x.id === id);
      if (p && p.pk) return p.pk;
    }
    return pkOf(id);
  },
  track() { const ch = this._ch(); if (ch) ch.track(this.meta()).catch(() => {}); },
  // رسائل الاتصال: "join" العامة بدون محتوى، والباقي مشفر بيني وبين الشخص نفسه
  send(msg, to = null) {
    const ch = this._ch();
    if (!ch) return;
    if (!to) { if (msg.type === "join") ch.send({ type: "broadcast", event: "rtc", payload: { type: "join", from: myId } }); return; }
    const pk = this._pkOf(to);
    if (!pk) return;
    Sec.pairKey(pk).then(k => Sec.seal(k, msg)).then(box => {
      if (ch === this._ch()) ch.send({ type: "broadcast", event: "rtc", payload: { from: myId, to, box } });
    }).catch(e => console.warn("voice send", e));
  },

  async join() {
    if (this.on || this.joining) return;
    if (!this.supported()) { toast("متصفحك ما يدعم المكالمات الصوتية 😕"); return; }
    if (this.members.size >= VOICE_MAX) { toast(`الصوت فيه ${VOICE_MAX} أشخاص، وهذا الحد`); return; }
    this.joining = true; this.updateUi();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (e) {
      this.joining = false; this.updateUi();
      toast("لازم تسمح بالمايك عشان تدخل الصوت 🎙️");
      return;
    }
    this.joining = false; this.on = true; this.muted = false;
    Music.stop();
    this.track();
    this.send({ type: "join" });
    this.startMeters();
    this.addMeter(myId, this.stream);
    clearInterval(this.watchTimer);
    this.watchTimer = setInterval(() => this.watchdog(), 2000);
    this.updateUi();
    SFX.join();
    toast("دخلت الصوت 🎧");
  },

  leave(silent = false) {
    if (!this.on) return;
    if (!silent) [...this.peers.keys()].forEach(id => this.send({ type: "leave" }, id));
    [...this.peers.keys()].forEach(id => this.closePeer(id));
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null; this.on = false; this.muted = false;
    clearInterval(this.watchTimer); this.watchTimer = null; this.missing.clear();
    this.stopMeters();
    if (!silent) { this.track(); SFX.hide(); }
    this.updateUi();
    if (Music.on) Music.start();
  },

  toggleMute() {
    if (!this.on || !this.stream) return;
    this.muted = !this.muted;
    this.stream.getAudioTracks().forEach(t => { t.enabled = !this.muted; });
    this.track();
    this.updateUi();
    SFX.pop();
    toast(this.muted ? "كتمت صوتك 🔇" : "صوتك شغال 🎤");
  },

  peer(id) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const entry = { pc, audio: null, pending: [] };
    this.peers.set(id, entry);
    if (this.stream) this.stream.getTracks().forEach(t => pc.addTrack(t, this.stream));
    pc.onicecandidate = e => { if (e.candidate) this.send({ type: "ice", data: e.candidate.toJSON() }, id); };
    pc.ontrack = e => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      if (!entry.audio) {
        entry.audio = document.createElement("audio");
        entry.audio.autoplay = true; entry.audio.playsInline = true;
        document.getElementById("voiceAudio").appendChild(entry.audio);
      }
      entry.audio.srcObject = stream;
      entry.audio.play().catch(() => {});
      this.addMeter(id, stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") entry.ok = true;
      if (pc.connectionState === "failed" && !entry.ok && !entry.warned) { entry.warned = true; toast(`نحاول نوصل صوت ${nameOf(id)}... 🔄`); }
    };
    return entry;
  },

  closePeer(id) {
    const e = this.peers.get(id);
    if (!e) return;
    this.peers.delete(id);
    try { e.pc.close(); } catch {}
    if (e.audio) { e.audio.srcObject = null; e.audio.remove(); }
    this.removeMeter(id);
  },

  async flush(entry) {
    const list = entry.pending.splice(0);
    for (const c of list) { try { await entry.pc.addIceCandidate(c); } catch {} }
  },

  // رسائل الاتصال من القناة (نتحقق منها لأنها جاية من برا)
  async onSignal(raw) {
    if (!this.on || !raw || typeof raw !== "object" || typeof raw.from !== "string" || raw.from === myId) return;
    if (raw.to && raw.to !== myId) return;
    // نقبل بس من لاعبين داخل الغرفة، والرسائل الخاصة لازم تنفك بمفتاحنا المشترك
    const pk = this._pkOf(raw.from);
    if (!pk) return;
    let p;
    if (raw.box) {
      try { p = await Sec.open(await Sec.pairKey(pk), raw.box); } catch { return; }
      if (!p || typeof p !== "object") return;
      p.from = raw.from;
    } else if (raw.type === "join") p = { type: "join", from: raw.from };
    else return;
    const validDesc = d => d && typeof d === "object" && (d.type === "offer" || d.type === "answer") && typeof d.sdp === "string" && d.sdp.length < 20000;
    try {
      switch (p.type) {
        case "join": {
          // واحد جديد دخل الصوت: أنا (اللي قبله) أبدأ الاتصال معه
          if (this.peers.size >= VOICE_MAX - 1) return;
          this.closePeer(p.from);
          const e = this.peer(p.from);
          await e.pc.setLocalDescription(await e.pc.createOffer());
          this.send({ type: "offer", data: { type: e.pc.localDescription.type, sdp: e.pc.localDescription.sdp } }, p.from);
          break;
        }
        case "offer": {
          if (!validDesc(p.data) || p.data.type !== "offer") return;
          this.closePeer(p.from);
          const e = this.peer(p.from);
          await e.pc.setRemoteDescription(p.data);
          await this.flush(e);
          await e.pc.setLocalDescription(await e.pc.createAnswer());
          this.send({ type: "answer", data: { type: e.pc.localDescription.type, sdp: e.pc.localDescription.sdp } }, p.from);
          break;
        }
        case "answer": {
          const e = this.peers.get(p.from);
          if (!e || !validDesc(p.data) || p.data.type !== "answer" || e.pc.signalingState !== "have-local-offer") return;
          await e.pc.setRemoteDescription(p.data);
          await this.flush(e);
          break;
        }
        case "ice": {
          const e = this.peers.get(p.from);
          if (!e || !p.data || typeof p.data.candidate !== "string" || p.data.candidate.length > 2000) return;
          if (e.pc.remoteDescription) { try { await e.pc.addIceCandidate(p.data); } catch {} }
          else e.pending.push(p.data);
          break;
        }
        case "leave": this.closePeer(p.from); break;
      }
    } catch (err) { console.warn("voice", err); this.closePeer(p.from); }
  },

  // Presence: مين داخل الصوت ومين كاتم
  onPresence(state) {
    this.members.clear();
    Object.entries(state || {}).forEach(([id, metas]) => {
      const m = Array.isArray(metas) && metas[metas.length - 1];
      if (m && m.voice) this.members.set(id, { muted: !!m.muted });
    });
    // ما نسكّر الاتصال هنا: Presence ممكن يختفي فيه أحد لحظة لما يحدّث حالته (مثلاً يكتم).
    // المراقب (watchdog) يسكّر بس اللي غاب فترة، ويعيد الاتصال لو انقطع.
    this.updateUi();
  },

  // مراقب كل ثانيتين: يعيد الاتصال المقطوع ويسكّر اللي طلع فعلاً
  watchdog() {
    if (!this.on) return;
    const now = Date.now();
    this.peers.forEach((e, id) => {
      if (this.members.has(id)) e.goneSince = 0;
      else {
        e.goneSince = e.goneSince || now;
        if (now - e.goneSince > 6000) this.closePeer(id);
        return;
      }
      const bad = ["failed", "disconnected"].includes(e.pc.connectionState) || e.pc.iceConnectionState === "failed";
      if (!bad) { e.badSince = 0; return; }
      e.badSince = e.badSince || now;
      // واحد بس من الطرفين يطلب إعادة الاتصال (صاحب الرقم الأصغر)
      if (now - e.badSince > 4000 && myId < id) { this.closePeer(id); this.send({ type: "join" }, id); }
    });
    this.members.forEach((m, id) => {
      if (id === myId || this.peers.has(id)) { this.missing.delete(id); return; }
      const since = this.missing.get(id) || now;
      this.missing.set(id, since);
      if (now - since > 3000 && myId < id) { this.missing.set(id, now); this.send({ type: "join" }, id); }
    });
  },

  /* ----- مؤشر الكلام: إطار أخضر على اللي يتكلم ----- */
  startMeters() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!this.meterCtx && AC) this.meterCtx = new AC();
      if (this.meterCtx && this.meterCtx.state === "suspended") this.meterCtx.resume();
    } catch { this.meterCtx = null; }
    clearInterval(this.meterTimer);
    this.meterTimer = setInterval(() => this.tickMeters(), 120);
  },
  stopMeters() {
    clearInterval(this.meterTimer); this.meterTimer = null;
    [...this.meters.keys()].forEach(id => this.removeMeter(id));
    document.querySelectorAll(".av.speaking").forEach(e => e.classList.remove("speaking"));
  },
  addMeter(id, stream) {
    if (!this.meterCtx) return;
    this.removeMeter(id);
    try {
      const src = this.meterCtx.createMediaStreamSource(stream);
      const an = this.meterCtx.createAnalyser(); an.fftSize = 256;
      src.connect(an);
      this.meters.set(id, { src, an, buf: new Uint8Array(an.fftSize), level: 0 });
    } catch {}
  },
  removeMeter(id) {
    const m = this.meters.get(id);
    if (m) { try { m.src.disconnect(); } catch {} this.meters.delete(id); }
    setSpeaking(id, false);
  },
  tickMeters() {
    this.meters.forEach((m, id) => {
      m.an.getByteTimeDomainData(m.buf);
      let sum = 0;
      for (let i = 0; i < m.buf.length; i++) { const v = (m.buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / m.buf.length);
      m.level = m.level * 0.6 + rms * 0.4;
      const talking = m.level > 0.035 && !(id === myId && this.muted) && !(this.members.get(id) || {}).muted;
      setSpeaking(id, talking);
    });
  },

  /* ----- الأزرار ----- */
  ensureUi() {
    if (!document.getElementById("voiceAudio")) {
      const box = document.createElement("div"); box.id = "voiceAudio"; box.hidden = true;
      document.body.appendChild(box);
    }
    if (document.getElementById("voiceFab")) return;
    const fab = document.createElement("button");
    fab.id = "voiceFab"; fab.className = "voice-fab"; fab.dataset.quiet = "1";
    fab.innerHTML = `<span class="voice-ico">🎙️</span><span class="unread voice-count" id="voiceCount"></span>`;
    const leave = document.createElement("button");
    leave.id = "voiceLeave"; leave.className = "voice-leave"; leave.dataset.quiet = "1";
    leave.setAttribute("aria-label", "اطلع من الصوت");
    leave.textContent = "📞";
    document.body.append(fab, leave);
    fab.onclick = () => { if (this.on) this.toggleMute(); else this.join(); };
    leave.onclick = () => this.leave();
    this.updateUi();
  },
  removeUi() {
    ["voiceFab", "voiceLeave"].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
  },
  updateUi() {
    const fab = document.getElementById("voiceFab"), leave = document.getElementById("voiceLeave"), count = document.getElementById("voiceCount");
    if (!fab) return;
    fab.classList.toggle("in", this.on);
    fab.classList.toggle("muted", this.on && this.muted);
    fab.classList.toggle("joining", this.joining);
    fab.querySelector(".voice-ico").textContent = this.joining ? "⏳" : !this.on ? "🎙️" : this.muted ? "🔇" : "🎤";
    fab.setAttribute("aria-label", !this.on ? "ادخل الصوت" : this.muted ? "شغّل صوتك" : "اكتم صوتك");
    leave.classList.toggle("show", this.on);
    const n = this.members.size;
    count.textContent = n;
    count.classList.toggle("show", n > 0);
  }
};

function setSpeaking(id, on) {
  document.querySelectorAll(`.av[data-k="${CSS.escape(id)}"]`).forEach(e => e.classList.toggle("speaking", on));
  if (id === myId) { const f = document.getElementById("voiceFab"); if (f) f.classList.toggle("talking", on); }
}

// علامة الصوت جنب اسم اللاعب
function voiceTag(id) {
  const m = Voice.members.get(id);
  return m ? `<span class="tag voice-tag">${m.muted ? "🔇" : "🎧"}</span>` : "";
}
