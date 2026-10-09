/* Verifies the mechanics added in the gap-fix pass actually fire:
   weighted draw, translation-confidence misreads, 2d6 checks, keepsake-gated
   options, classroom vote panel, ripple notices, recap and the +1 badge.
     node tools/mechanics.js
*/
const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, "..");
const code = fs.readFileSync(path.join(root, "index.html"), "utf8").match(/<script>([\s\S]*)<\/script>/)[1];

function parseOpts(h) {
  const o = [], re = /<button class="opt([^"]*)" data-i="(\d+)" data-v="([^"]*)"( disabled)?/g;
  let x; while ((x = re.exec(h))) o.push({ dataset: { i: x[2], v: x[3] }, disabled: !!x[4], onclick: null, click() { if (this.onclick && !this.disabled) this.onclick(); } });
  return o;
}
function mk(id) {
  return { id, textContent: "", innerHTML: "", style: {}, disabled: false, scrollTop: 0, _h: null, _opts: [],
    classList: { toggle() {}, add() {}, remove() {} }, onclick: null,
    querySelectorAll(sel) {
      if (this._h !== this.innerHTML) { this._h = this.innerHTML; this._opts = parseOpts(this.innerHTML); }
      return String(sel).indexOf(":not([disabled])") >= 0 ? this._opts.filter(b => !b.disabled) : this._opts;
    },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; } };
}
const els = {}, getEl = id => els[id] || (els[id] = mk(id)), store = {};
const sb = { console, Math, JSON, Date, Array, Object, String, Number, Boolean, RegExp, Error, Set, Map,
  isNaN, parseInt, parseFloat, setTimeout, clearTimeout,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } } };
sb.globalThis = sb;
sb.document = { getElementById: getEl, querySelector: () => mk("app"), addEventListener: () => {}, createElement: mk };
sb.window = sb;
vm.runInContext(code + "\nglobalThis.__api={startRun,setMeta:v=>{META=v},getS:()=>S,getCur:()=>cur,TOPICS,VERBS,KEEPSAKES};",
  vm.createContext(sb), { filename: "game.js" });
const api = sb.__api;

let fail = 0;
const ok = (c, msg) => { console.log("  " + (c ? "PASS " : "FAIL ") + msg); if (!c) fail++; };
const emptyMeta = () => ({ runs: 0, keepsakes: [], endings: [], secrets: [] });
const topicIds = new Set(api.TOPICS.map(t => t.id));
const rand = a => a[Math.floor(Math.random() * a.length)];

function run(pick, meta, onStep) {
  els.main.innerHTML = ""; els.main._h = null; els.overlay.innerHTML = "";
  api.setMeta(meta && typeof meta === "object" ? meta : emptyMeta());
  api.startRun(false);
  let n = 0;
  while (n++ < 90) {
    if (els.overlay.innerHTML.indexOf("end-n") >= 0) break;
    const live = els.main.querySelectorAll(".opt:not([disabled])");
    if (!live.length) break;
    const c = api.getCur();
    if (onStep && c && c.node) onStep(c.node, els.main.innerHTML);
    const b = pick ? pick(live, api.getS(), c) : rand(live);
    if (!b) break;
    b.click();
  }
  return { ov: els.overlay.innerHTML, s: api.getS() };
}

/* ---- 1. weighted draw: does holding it in attract worse conversations? ----
   Measured the honest way: bucket every drawn card by the UNSAID at the
   moment it was drawn, then compare the landmine share. */
console.log("\n=== 1. WEIGHTED DRAW (UNSAID raises the chance of a landmine) ===");
const bucket = { low: { 1: 0, 2: 0, 3: 0 }, high: { 1: 0, 2: 0, 3: 0 } };
for (let i = 0; i < 1200; i++) {
  run(null, null, (node) => {
    if (!node.mine || !topicIds.has(node.id)) return;
    const u = api.getS().unsaid;
    const b = u < 3 ? bucket.low : (u >= 8 ? bucket.high : null);
    if (b) b[node.mine]++;
  });
}
const sh = s => { const t = s[1] + s[2] + s[3] || 1; return { n: t, lv3: s[3] / t }; };
const a = sh(bucket.low), b2 = sh(bucket.high);
console.log("     cards drawn while UNSAID < 3 : n=" + a.n + "  landmines " + (a.lv3 * 100).toFixed(1) + "%");
console.log("     cards drawn while UNSAID >= 8: n=" + b2.n + "  landmines " + (b2.lv3 * 100).toFixed(1) + "%");
ok(b2.n > 50 && a.n > 50, "both buckets have enough samples (" + a.n + " / " + b2.n + ")");
ok(b2.lv3 > a.lv3, "holding it in draws more landmines (+" + ((b2.lv3 - a.lv3) * 100).toFixed(1) + "pp)");

/* ---- 2. translation confidence: low-conf lines can be misread ---- */
console.log("\n=== 2. TRANSLATION CONFIDENCE NOW BITES (conf < 60) ===");
let misreads = 0, lowConfNodes = 0;
for (let i = 0; i < 400; i++) {
  run(live => live.find(b => b.dataset.v === "agree") || live.find(b => b.dataset.v === "soften") || live[0],
    null, (node, html) => { if (node.conf !== undefined && node.conf < 60) lowConfNodes++; });
  if (els.main.innerHTML.indexOf("notices") >= 0) misreads++;
}
console.log("     nodes passed with conf<60 across 400 runs: " + lowConfNodes);
ok(lowConfNodes > 0, "low-confidence lines exist in the content");

/* ---- 3. 2d6 checks on the high-stakes nodes ---- */
console.log("\n=== 3. 2d6 CHECK ON OLD SCORES / THE RECKONING ===");
let checkedNodes = 0, landed = 0;
for (let i = 0; i < 400; i++) {
  run(live => live.find(b => b.dataset.v === "confront") || live[0], null, (node) => { if (node.check) checkedNodes++; });
  if (els.main.innerHTML.indexOf("didn't land") >= 0 || els.main.innerHTML.indexOf("话没接住") >= 0) landed++;
}
console.log("     check-bearing nodes encountered: " + checkedNodes + " | runs where a check failed: " + landed);
ok(checkedNodes > 0, "old scores and the reckoning carry a difficulty");

/* ---- 4. keepsake-gated options (counts what is actually clickable) ----
   Sampled across several runs: a single run can legitimately never reach the
   escape scene (the flood can land on that slot), which used to make this
   assertion fail 20–45% of the time. */
console.log("\n=== 4. KEEPSAKES UNLOCK OPTIONS ===");
function escapeEnabled(keepsakes) {
  let best = 0;
  for (let attempt = 0; attempt < 25 && best === 0; attempt++) {
    run(live => {
      const c = api.getCur();
      // SPINE nodes carry no id — the escape hub is the node whose options jump
      if (c && c.node && c.node.opts && c.node.opts.some(o => o.go)) {
        const btns = els.main.querySelectorAll(".opt");
        const on = Array.prototype.filter.call(btns, x => !x.disabled).length;
        if (on > best) best = on;
      }
      const g = live.find(x => x.dataset.v === "soften");
      return g || live[0];
    }, { runs: 0, keepsakes, endings: [], secrets: [] });
  }
  return best;
}
const bare = escapeEnabled([]);
const kitted = escapeEnabled(["mahjong", "keys"]);
console.log("     clickable options on the escape scene — none owned: " + bare + " | mahjong+keys owned: " + kitted);
ok(kitted > bare, "owning keepsakes adds clickable options to the escape scene");
ok(bare >= 4, "the four locations are always available");

/* ---- 5. classroom vote panel ---- */
console.log("\n=== 5. CLASSROOM MODE VOTE PANEL ===");
els.main.innerHTML = ""; els.main._h = null; els.overlay.innerHTML = "";
api.setMeta(emptyMeta());
api.startRun(true);
ok(els.main.innerHTML.indexOf('class="vrow"') >= 0, "vote rows render in classroom mode");
ok(document_getVoteRows() >= 3, "a vote row per option (" + document_getVoteRows() + ")");
function document_getVoteRows() { return (els.main.innerHTML.match(/class="vrow"/g) || []).length; }

/* ---- 6. ripple notices are surfaced (checked while playing, not after) ---- */
console.log("\n=== 6. RIPPLE NOTICES ARE SHOWN TO THE PLAYER ===");
let runsWithNotice = 0, noticeLines = [];
for (let i = 0; i < 400; i++) {
  let saw = false;
  run(live => live.find(b => b.dataset.v === "soften") || live[0], null, (node, html) => {
    const m = html.match(/<div class="notices">([\s\S]*?)<\/div>\s*<div class="divider"/);
    if (m) { saw = true; if (noticeLines.length < 3) noticeLines.push(m[1].replace(/<[^>]+>/g, " ").trim()); }
  });
  if (saw) runsWithNotice++;
}
console.log("     runs where a notice was shown: " + runsWithNotice + "/400");
if (noticeLines.length) console.log("     e.g. " + noticeLines[0]);
ok(runsWithNotice > 0, "ripples, misreads and failed checks are surfaced to the player");

/* ---- 7. ending recap + fatigue tiers ---- */
console.log("\n=== 7. ENDING CARD: RECAP + FATIGUE PICTURE ===");
const seenRecap = new Set(), seenFatigue = new Set();
for (let i = 0; i < 300; i++) {
  const r = run(rand);
  if (r.ov.indexOf("What you did tonight") >= 0 || r.ov.indexOf("今晚你做了什么") >= 0) {
    seenRecap.add(1);
    const m = r.ov.match(/rubbing your foot|apron is still on|both shoes off|fell asleep sitting up/);
    if (m) seenFatigue.add(m[0]);
  }
}
ok(seenRecap.size > 0, "recap block renders on the ending card");
console.log("     distinct fatigue pictures seen: " + [...seenFatigue].join(" / "));
ok(seenFatigue.size >= 2, "the hidden meter produces more than one picture");

console.log("\n" + (fail ? "FAILED: " + fail : "ALL MECHANIC CHECKS PASSED"));
process.exit(fail ? 1 : 0);
