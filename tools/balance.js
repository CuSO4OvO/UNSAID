/* Ending-distribution simulation. Runs the real engine headlessly N times per
   strategy and prints which endings come out. Use after touching any number,
   threshold or ending condition.
     node tools/balance.js            (4000 random runs + 8 targeted strategies)
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
const exported = code + "\nglobalThis.__api={startRun,VERBS,ENDINGS,KEEPSAKES,setMeta:v=>{META=v},getS:()=>S};";
vm.runInContext(exported, vm.createContext(sb), { filename: "game.js" });
const api = sb.__api;
if (!api) { console.error("export failed"); process.exit(1); }

const emptyMeta = () => ({ runs: 0, keepsakes: [], endings: [], secrets: [] });
function play(pick, meta) {
  els.main.innerHTML = ""; els.main._h = null; els.overlay.innerHTML = "";
  api.setMeta(meta || emptyMeta());
  api.startRun(false);
  let n = 0;
  while (n++ < 80) {
    if (els.overlay.innerHTML.indexOf("end-n") >= 0) break;
    const live = els.main.querySelectorAll(".opt:not([disabled])");
    if (!live.length) break;
    live[pick(live)].click();
  }
  const m = els.overlay.innerHTML.match(/<div class="end-n">([^<]*)<\/div>/);
  return m ? m[1] : "(none)";
}
const rnd = n => Math.floor(Math.random() * n);
const anyOf = live => rnd(live.length);
const firstOf = (...vs) => live => { const i = live.findIndex(b => vs.includes(b.dataset.v)); return i < 0 ? 0 : i; };
const topBy = key => live => {
  let best = 0;
  live.forEach((b, i) => { if ((api.VERBS[b.dataset.v].fx[key] || 0) > (api.VERBS[live[best].dataset.v].fx[key] || 0)) best = i; });
  return best;
};
/* drops the self the fastest, but never picks PUSH BACK (which kills FILIAL first) */
const drainSelf = live => {
  const pool = live.filter(b => b.dataset.v !== "confront");
  const use = pool.length ? pool : live;
  let best = 0;
  use.forEach((b, i) => { if ((api.VERBS[b.dataset.v].fx.self || 0) < (api.VERBS[use[best].dataset.v].fx.self || 0)) best = i; });
  return live.indexOf(use[best]);
};
/* chases stress while protecting face — the only route to FLATLINE */
const stressFace = live => {
  let best = 0;
  live.forEach((b, i) => {
    const f = v => (api.VERBS[v].fx.stress || 0) * 2 + (api.VERBS[v].fx.face || 0);
    if (f(b.dataset.v) > f(live[best].dataset.v)) best = i;
  });
  return best;
};
const VETERAN = { runs: 9, keepsakes: ["letter", "permit", "tin", "photo", "award"], endings: [], secrets: [] };

const strategies = [
  ["random", anyOf, 4000, null],
  ["random, VETERAN (wheel open)", anyOf, 2000, VETERAN],
  ["always AGREE", firstOf("agree"), 300, null],
  ["always SAY NOTHING", firstOf("silence"), 300, null],
  ["always PUSH BACK", firstOf("confront"), 300, null],
  ["SAY THE UNSAID when offered", firstOf("unsaid", "silence"), 300, null],
  ["SOFTEN / POUR A DRINK", firstOf("soften", "ritual"), 300, null],
  ["SIDEWAYS / VICTIM", firstOf("passive", "victim", "dumb"), 300, null],
  ["SUPPRESSED: silence + victim, alternating", firstOf("silence", "victim"), 300, null],
  ["JOKE through it", firstOf("joke", "deflect"), 300, null],
  ["max STRESS", topBy("stress"), 300, null],
  ["max SELF", topBy("self"), 300, null],
  ["DRAIN SELF (never push back)", drainSelf, 300, null],
  ["STRESS + FACE (route to FLATLINE)", stressFace, 1500, null]
];

const all = {};
for (const [name, pick, N, meta] of strategies) {
  const tally = {};
  for (let i = 0; i < N; i++) { const e = play(pick, meta); tally[e] = (tally[e] || 0) + 1; }
  console.log("\n--- " + name + "  (n=" + N + ") ---");
  Object.entries(tally).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => { console.log("   " + k.padEnd(30) + String(v).padStart(5) + "  " + (v / N * 100).toFixed(1) + "%"); all[k] = (all[k] || 0) + v; });
}

console.log("\n============ REACHABILITY ============");
let miss = 0;
api.ENDINGS.forEach(e => {
  const c = all[e.n.en] || 0;
  if (!c) miss++;
  console.log("  " + (c ? "HIT  " : "MISS ") + e.n.en.padEnd(30) + String(c).padStart(6));
});
console.log(miss ? "\n  " + miss + " ending(s) never reached" : "\n  every ending is reachable");
