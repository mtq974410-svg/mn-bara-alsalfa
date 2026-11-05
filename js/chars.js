/* ============================================================
   شخصيات كرتونية مضحكة مرسومة بالكود (SVG)
   كل اسم أو لاعب يطلع له نفس الشخصية دايماً.
   فيها: شماغ وعقال، غترة، حجاب، كاب، طاقية، أفرو، أصلع،
   عيون جاحظة ونظارات وشنب ولحية وتعابير مضحكة.
   ============================================================ */
const CHAR_CACHE = new Map();

function seededRand(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = v => Math.max(0, Math.min(255, v + amt));
  return "#" + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map(v => v.toString(16).padStart(2, "0")).join("");
}

function charSvg(key) {
  const k = String(key);
  if (CHAR_CACHE.has(k)) return CHAR_CACHE.get(k);
  const r = seededRand(hashStr(k) ^ 0x9e3779b9);
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const weighted = list => {
    let x = r() * list.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of list) { if ((x -= w) < 0) return v; }
    return list[0][0];
  };
  const uid = "c" + (hashStr(k) % 1e7);   // معرف فريد للنقشة داخل الصفحة

  const skin = pick(["#ffdcb8", "#f5c49a", "#e8ad7a", "#c98a55", "#9a6136"]);
  const skinDark = shade(skin, -28);
  const hairC = pick(["#22160f", "#3b2414", "#111111", "#6b3f1d", "#a8742f", "#7a7a7a"]);
  const shirt = pick(["#ff5c8a", "#ffb020", "#22c3ee", "#8b5cf6", "#2ee59d", "#ff7a45", "#4c6ef5", "#f06595"]);
  const head = weighted([["hair", 20], ["shemagh", 15], ["ghutra", 14], ["hijab", 18], ["cap", 10], ["taqiyah", 7], ["bald", 7], ["afro", 9]]);
  const covered = head === "hijab";
  const eyes = weighted([["googly", 30], ["dots", 18], ["happy", 14], ["sleepy", 10], ["shades", 10], ["nerd", 10], ["wink", 8]]);
  const mouth = weighted([["grin", 22], ["laugh", 20], ["tongue", 16], ["oh", 12], ["smirk", 14], ["gap", 16]]);
  const brows = weighted([["none", 25], ["up", 30], ["angry", 20], ["uni", 25]]);
  const facial = covered ? "none" : weighted([["none", 40], ["stache", 25], ["beard", 22], ["goatee", 13]]);
  const bigNose = r() < 0.3;

  /* ----- غطاء الراس والشعر ----- */
  let back = "", top = "", ears = true;
  const cloth = fill => `<path d="M21 54C19 25 37 13 50 13S81 25 79 54L84 86C73 80 67 72 67 60 67 44 33 44 33 60 33 72 27 80 16 86Z" fill="${fill}"/>`;
  const band = fill => `<path d="M27 41C29 25 71 25 73 41 64 34 36 34 27 41Z" fill="${fill}"/>`;
  const agal = `<path d="M27 33Q50 21 73 33" stroke="#151515" stroke-width="3.6" fill="none" stroke-linecap="round"/><path d="M28 28.5Q50 17 72 28.5" stroke="#151515" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  switch (head) {
    case "hair":
      top = `<path d="M28 45C25 22 40 15 50 15S75 22 72 45C69 34 61 29 50 29S31 34 28 45Z" fill="${hairC}"/>`;
      if (r() < 0.5) top += `<path d="M36 24l6-9 4 9 6-10 4 10 6-8 3 10" fill="${hairC}"/>`;
      break;
    case "afro":
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.95 + i * 0.14);
        back += `<circle cx="${(50 + Math.cos(a) * 24).toFixed(1)}" cy="${(38 + Math.sin(a) * 20).toFixed(1)}" r="11" fill="${hairC}"/>`;
      }
      back += `<circle cx="50" cy="22" r="14" fill="${hairC}"/>`;
      break;
    case "shemagh":
      ears = false;
      back = `<defs><pattern id="${uid}" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#e03131"/><path d="M0 3H6M3 0V6" stroke="#fff" stroke-width="1.3"/></pattern></defs>${cloth(`url(#${uid})`)}`;
      top = band(`url(#${uid})`) + agal;
      break;
    case "ghutra":
      ears = false;
      back = cloth("#ffffff");
      top = band("#f1f3f5") + `<path d="M30 39C38 33 62 33 70 39" stroke="#d6dae2" stroke-width="1.2" fill="none"/>` + agal;
      break;
    case "hijab": {
      ears = false;
      const hc = pick(["#7048e8", "#e64980", "#1c7ed6", "#0ca678", "#495057", "#f08c00", "#212529"]);
      back = `<path d="M21 53C19 24 37 13 50 13S81 24 79 53C79 67 73 75 66 79L75 100H25L34 79C27 75 21 67 21 53Z" fill="${hc}"/>`;
      top = `<path d="M29 41C33 25 67 25 71 41 62 33 38 33 29 41Z" fill="${shade(hc, -18)}"/>`;
      break;
    }
    case "cap": {
      const cc = pick(["#e03131", "#1971c2", "#2f9e44", "#f59f00", "#212529"]);
      top = `<path d="M27 39C27 18 73 18 73 39Z" fill="${cc}"/><path d="M52 37H84C86 37 86 42 84 42H52Z" fill="${shade(cc, -25)}"/><circle cx="50" cy="20" r="2.4" fill="${shade(cc, -25)}"/>`;
      break;
    }
    case "taqiyah":
      top = `<path d="M29 35C30 22 70 22 71 35Z" fill="#fff" stroke="#dee2e6"/><path d="M33 31H67M35 27H65" stroke="#ced4da" stroke-dasharray="2 2"/>`;
      break;
    case "bald":
      top = `<ellipse cx="42" cy="28" rx="6" ry="3" fill="#fff" opacity=".45" transform="rotate(-20 42 28)"/>`;
      break;
  }

  /* ----- العيون ----- */
  const ex = 41, ex2 = 59, ey = 46;
  const pdx = r() * 4 - 2, pdy = r() * 3 - 1, cross = r() < 0.25;
  let eyesSvg = "";
  switch (eyes) {
    case "googly":
      eyesSvg = `<circle cx="${ex}" cy="${ey}" r="7.5" fill="#fff" stroke="#222" stroke-width="1.3"/><circle cx="${ex2}" cy="${ey}" r="7.5" fill="#fff" stroke="#222" stroke-width="1.3"/>`
        + `<circle cx="${(ex + (cross ? 3 : pdx)).toFixed(1)}" cy="${(ey + pdy).toFixed(1)}" r="3.3" fill="#1a1a1a"/><circle cx="${(ex2 + (cross ? -3 : pdx)).toFixed(1)}" cy="${(ey + pdy).toFixed(1)}" r="3.3" fill="#1a1a1a"/>`
        + `<circle cx="${ex + 1.5}" cy="${ey - 2}" r="1" fill="#fff"/><circle cx="${ex2 + 1.5}" cy="${ey - 2}" r="1" fill="#fff"/>`;
      break;
    case "dots":
      eyesSvg = `<circle cx="${ex}" cy="${ey}" r="3" fill="#1a1a1a"/><circle cx="${ex2}" cy="${ey}" r="3" fill="#1a1a1a"/>`;
      break;
    case "happy":
      eyesSvg = `<path d="M${ex - 5} ${ey + 1}Q${ex} ${ey - 5} ${ex + 5} ${ey + 1}M${ex2 - 5} ${ey + 1}Q${ex2} ${ey - 5} ${ex2 + 5} ${ey + 1}" stroke="#1a1a1a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
      break;
    case "sleepy":
      eyesSvg = `<circle cx="${ex}" cy="${ey}" r="6" fill="#fff" stroke="#222"/><circle cx="${ex2}" cy="${ey}" r="6" fill="#fff" stroke="#222"/><circle cx="${ex}" cy="${ey + 2}" r="2.6" fill="#1a1a1a"/><circle cx="${ex2}" cy="${ey + 2}" r="2.6" fill="#1a1a1a"/>`
        + `<path d="M${ex - 6.5} ${ey}A6.5 6.5 0 0 1 ${ex + 6.5} ${ey}ZM${ex2 - 6.5} ${ey}A6.5 6.5 0 0 1 ${ex2 + 6.5} ${ey}Z" fill="${skinDark}" stroke="#222"/>`;
      break;
    case "shades":
      eyesSvg = `<rect x="31" y="40" width="17" height="11" rx="4" fill="#111"/><rect x="52" y="40" width="17" height="11" rx="4" fill="#111"/><path d="M48 44H52M31 43L26 41M69 43L74 41" stroke="#111" stroke-width="2"/><path d="M34 43h5M55 43h5" stroke="#fff" stroke-width="1.5" opacity=".6"/>`;
      break;
    case "nerd":
      eyesSvg = `<circle cx="${ex}" cy="${ey}" r="2.6" fill="#1a1a1a"/><circle cx="${ex2}" cy="${ey}" r="2.6" fill="#1a1a1a"/><circle cx="${ex}" cy="${ey}" r="8" fill="#fff" fill-opacity=".25" stroke="#222" stroke-width="2.4"/><circle cx="${ex2}" cy="${ey}" r="8" fill="#fff" fill-opacity=".25" stroke="#222" stroke-width="2.4"/><path d="M49 46H51" stroke="#222" stroke-width="2.4"/>`;
      break;
    case "wink":
      eyesSvg = `<circle cx="${ex}" cy="${ey}" r="3.2" fill="#1a1a1a"/><path d="M${ex2 - 5} ${ey}Q${ex2} ${ey + 4} ${ex2 + 5} ${ey}" stroke="#1a1a1a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
      break;
  }
  // رموش للحجاب
  if (covered && (eyes === "dots" || eyes === "googly" || eyes === "wink"))
    eyesSvg += `<path d="M${ex - 6} ${ey - 5}l-2 -2M${ex - 3} ${ey - 7}l-1 -2.5M${ex2 + 6} ${ey - 5}l2 -2M${ex2 + 3} ${ey - 7}l1 -2.5" stroke="#1a1a1a" stroke-width="1.4" stroke-linecap="round"/>`;

  const browSvg = {
    none: "",
    up: `<path d="M34 35Q41 30 47 34M53 34Q59 30 66 35" stroke="${hairC}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    angry: `<path d="M34 34L47 38M53 38L66 34" stroke="${hairC}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    uni: `<path d="M33 36Q42 31 50 35Q58 31 67 36" stroke="${hairC}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`
  }[eyes === "shades" ? "none" : brows];

  const nose = bigNose
    ? `<circle cx="50" cy="54" r="4.6" fill="${shade(skin, -40)}"/><circle cx="48.5" cy="52.5" r="1.4" fill="#fff" opacity=".5"/>`
    : `<path d="M50 50Q46.5 56 51 57" stroke="${skinDark}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;

  const lip = covered ? "#c2255c" : "#7a1f1f";
  const mouthSvg = {
    grin: `<path d="M38 60Q50 73 62 60Z" fill="${lip}"/><path d="M39.5 60.5H60.5L59 63H41Z" fill="#fff"/>`,
    laugh: `<ellipse cx="50" cy="63" rx="8.5" ry="7" fill="${lip}"/><ellipse cx="50" cy="66.5" rx="5" ry="3" fill="#ff8fab"/><path d="M42.5 59.5H57.5" stroke="#fff" stroke-width="2.4"/>`,
    tongue: `<path d="M40 61Q50 68 60 61" stroke="${lip}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M47 64Q47 72 51 72Q55 72 54 64Z" fill="#ff6b8b" stroke="${lip}" stroke-width="1"/>`,
    oh: `<ellipse cx="50" cy="63" rx="4.5" ry="5.5" fill="${lip}"/>`,
    smirk: `<path d="M41 63Q51 67 59 59" stroke="${lip}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    gap: `<path d="M39 60Q50 71 61 60Z" fill="${lip}"/><rect x="42" y="60" width="7" height="4" fill="#fff"/><rect x="51" y="60" width="7" height="4" fill="#fff"/>`
  }[mouth];

  const facialSvg = {
    none: "",
    stache: `<path d="M37 58C41 53 47 55 50 58 53 55 59 53 63 58 59 61 54 60 50 59 46 60 41 61 37 58Z" fill="${hairC}"/>`,
    beard: `<path d="M28 49C28 73 41 79 50 79S72 73 72 49C68 63 61 67 50 67S32 63 28 49Z" fill="${hairC}"/><path d="M39 58C43 55 47 56 50 58 53 56 57 55 61 58 57 60 53 60 50 59 47 60 43 60 39 58Z" fill="${hairC}"/>`,
    goatee: `<path d="M45 69Q50 78 55 69Q50 72 45 69Z" fill="${hairC}"/>`
  }[facial];

  const blushOp = covered ? 0.4 : 0.28;
  const blush = `<circle cx="34" cy="56" r="4.5" fill="#ff6b8b" opacity="${blushOp}"/><circle cx="66" cy="56" r="4.5" fill="#ff6b8b" opacity="${blushOp}"/>`;
  const faceRx = covered ? 19 : 22, faceRy = covered ? 22 : 24, faceCy = covered ? 48 : 47;

  const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${back}`
    + `<path d="M14 100C16 80 31 73 50 73S84 80 86 100Z" fill="${shirt}"/><path d="M40 73L50 86 60 73Z" fill="${shade(shirt, -22)}"/>`
    + `<rect x="44" y="62" width="12" height="14" rx="4" fill="${skinDark}"/>`
    + (ears ? `<circle cx="28" cy="49" r="5.5" fill="${skin}"/><circle cx="72" cy="49" r="5.5" fill="${skin}"/>` : "")
    + `<ellipse cx="50" cy="${faceCy}" rx="${faceRx}" ry="${faceRy}" fill="${skin}"/>`
    + top + blush + facialSvg + browSvg + eyesSvg + nose + mouthSvg
    + `</svg>`;
  CHAR_CACHE.set(k, svg);
  return svg;
}
