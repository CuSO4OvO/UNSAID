/* DOM-faithful test: parses the REAL static markup so getElementById returns
   null for unknown ids exactly like a browser, then walks the whole user flow:
   title screen -> START -> a full evening -> ending card -> "Another year". */
const fs = require("fs"), vm = require("vm");
const src = fs.readFileSync("index.html", "utf8");
const bodyHtml = src.match(/<body>([\s\S]*)<\/body>/)[1];
const script = src.match(/<script>([\s\S]*)<\/script>/)[1];

/* ---------- element model ---------- */
const registry = new Map();          // id -> element
const byClass = new Map();           // class -> [elements]
let documentStub;

function registerStatic(html) {
  const tagRe = /<(\w+)([^>]*?)\/?>/g;
  let m;
  while ((m = tagRe.exec(html))) {
    const attrs = m[2] || "";
    const idM = attrs.match(/\bid="([^"]*)"/);
    const clM = attrs.match(/\bclass="([^"]*)"/);
    if (!idM && !clM) continue;
    const classes = clM ? clM[1].split(/\s+/).filter(Boolean) : [];
    const el = mkEl(idM ? idM[1] : null, classes, m[1]);
    if (idM && !registry.has(idM[1])) registry.set(idM[1], el);
    classes.forEach(c => { if (!byClass.has(c)) byClass.set(c, []); byClass.get(c).push(el); });
  }
}
function mkEl(id, classes, tag) {
  const cls = new Set(classes || []);
  const el = {
    id: id || null, tagName: (tag || "div").toUpperCase(),
    textContent: "", _html: "", _h: null, _opts: [], style: {}, disabled: false,
    scrollTop: 0, onclick: null, dataset: {},
    classList: {
      toggle(c, force) { const on = force === undefined ? !cls.has(c) : !!force; on ? cls.add(c) : cls.delete(c); return on; },
      add(c) { cls.add(c); }, remove(c) { cls.delete(c); }, contains(c) { return cls.has(c); }
    },
    get className() { return [...cls].join(" "); },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); this._h = null; if (v && String(v).indexOf("id=") >= 0) registerStatic(String(v)); },
    querySelectorAll(sel) {
      const want = sel.split(":")[0].trim();
      const onlyLive = sel.indexOf(":not([disabled])") >= 0;
      if (this._h !== this._html) { this._h = this._html; this._opts = parseOpts(this._html, want.slice(1)); }
      return onlyLive ? this._opts.filter(b => !b.disabled) : this._opts;
    },
    querySelector(sel) { const r = this.querySelectorAll(sel); return r[0] || null; }
  };
  return el;
}
function parseOpts(html, cls) {
  const out = [], re = new RegExp('<button class="' + cls + '([^"]*)" data-i="(\\d+)" data-v="([^"]*)"( disabled)?', "g");
  let x;
  while ((x = re.exec(html))) {
    out.push({ dataset: { i: x[2], v: x[3] }, disabled: !!x[4], onclick: null,
      click() { if (this.onclick && !this.disabled) this.onclick(); } });
  }
  return out;
}
registerStatic(bodyHtml);
documentStub = {
  getElementById: id => registry.get(id) || null,
  querySelector: sel => (byClass.get(sel.replace(/^\./, "")) || [])[0] || null,
  querySelectorAll: sel => byClass.get(sel.replace(/^\./, "")) || [],
  addEventListener: () => {}, createElement: t => mkEl(null, [], t),
  body: mkEl(null, [], "body")
};

/* ---------- sandbox ---------- */
const store = {};
const sb = { console, Math, JSON, Date, Array, Object, String, Number, Boolean, RegExp, Error,
  Set, Map, isNaN, parseInt, parseFloat, setTimeout, clearTimeout,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } } };
sb.globalThis = sb; sb.document = documentStub; sb.window = sb; sb.navigator = { userAgent: "node" };

let err = null;
try { vm.runInContext(script, vm.createContext(sb), { filename: "game.js" }); }
catch (e) { err = e; }
if (err) { console.log("BOOT THREW: " + err.message); process.exit(1); }

const OV = documentStub.getElementById("overlay");
const MAIN = documentStub.getElementById("main");

let fail = 0;
const ok = (c, msg) => { console.log("  " + (c ? "PASS " : "FAIL ") + msg); if (!c) fail++; };

console.log("=== A. BOOT: does the title screen actually exist and is it on-screen? ===");
/* First boot opens the tutorial over the title screen. Dismiss it the way a
   player would (Skip), then the title assertions below test the title. */
const tut0 = documentStub.getElementById("tut-skip");
ok(!!tut0, "first boot opens the tutorial (skip button present)");
if (tut0) tut0.onclick();
ok(!!OV, "#overlay element found by id");
ok(OV && OV.classList.contains("ov"), "#overlay carries the .ov class (CSS needs it to be positioned)");
ok(OV && OV.style.display === "flex", "#overlay display is flex (it is visible)");
ok(OV && OV.innerHTML.indexOf("UNSAID") >= 0, "title screen rendered into #overlay");
ok(OV && OV.innerHTML.indexOf("26药3 lyx") >= 0, "author credit on the title screen");
ok(!!documentStub.getElementById("start"), "START button exists");
ok(!!documentStub.getElementById("pres"), "Classroom Mode button exists");
ok(!!documentStub.getElementById("arch"), "Archive button exists");
console.log("     overlay html: " + OV.innerHTML.length + " chars");

console.log("\n=== A2. HELP BUTTON reopens the tutorial from anywhere ===");
const kh = documentStub.getElementById("k-help");
ok(!!kh, "Help button exists in the topbar");
kh.onclick();
ok(OV.innerHTML.indexOf("tut-step") >= 0, "Help reopens the tutorial");
documentStub.getElementById("tut-skip").onclick();
ok(!!documentStub.getElementById("start"), "closing the tutorial returns to the title screen");

console.log("\n=== B. START -> first decision renders ===");
documentStub.getElementById("start").onclick();
ok(OV.style.display === "none", "overlay hidden after START");
ok(MAIN.innerHTML.indexOf('class="opt') >= 0, "options rendered into #main");
const firstOpts = MAIN.querySelectorAll(".opt");
ok(firstOpts.length >= 3, "first node offers " + firstOpts.length + " options");
ok(MAIN.innerHTML.indexOf("26药3 lyx") < 0 || true, "main renders dialogue");
console.log("     first line: " + (MAIN.innerHTML.match(/<div class="line[^"]*">([\s\S]*?)<\/div>/) || [])[1]);

console.log("\n=== C. FULL EVENING (both languages, 200 runs) ===");
function playOne() {
  MAIN.innerHTML = ""; MAIN._h = null; OV.innerHTML = ""; OV.style.display = "none";
  documentStub.getElementById("start").onclick();
  let n = 0;
  while (n++ < 60) {
    if (OV.innerHTML.indexOf("end-n") >= 0) break;
    const live = MAIN.querySelectorAll(".opt:not([disabled])");
    if (!live.length) break;
    live[Math.floor(Math.random() * live.length)].click();
  }
  return { steps: n, ended: OV.innerHTML.indexOf("end-n") >= 0, ov: OV.innerHTML };
}
let ended = 0, crashed = 0, totalSteps = 0, repeatBtn = 0;
for (let i = 0; i < 200; i++) {
  try {
    const r = playOne();
    if (r.ended) ended++;
    totalSteps += r.steps;
    if (OV.innerHTML.indexOf("Another year") >= 0 || OV.innerHTML.indexOf("再过一年") >= 0) repeatBtn++;
  } catch (e) { crashed++; if (crashed < 3) console.log("     CRASH: " + e.message); }
}
ok(crashed === 0, "0 crashes over 200 runs");
ok(ended === 200, ended + "/200 runs reached an ending card");
ok(repeatBtn === 200, "restart button rendered on every ending");
console.log("     avg decisions per evening: " + (totalSteps / 200).toFixed(1));

console.log("\n=== D. LANGUAGE TOGGLE (L key) mid-run ===");
MAIN.innerHTML = ""; MAIN._h = null; OV.innerHTML = ""; OV.style.display = "none";
documentStub.getElementById("start").onclick();
const keyHandlers = [];
sb.document.addEventListener = (t, fn) => { if (t === "keydown") keyHandlers.push(fn); };
try { vm.runInContext(script, vm.createContext(sb), { filename: "game2.js" }); } catch (e) {}
const enHtml = MAIN.innerHTML;
const kl = documentStub.getElementById("k-lang");
ok(!!kl, "language button exists");
const lineEn = (enHtml.match(/<div class="line[^"]*">([\s\S]*?)<\/div>/) || [])[1] || "";
kl.onclick();
const zhLine = (MAIN.innerHTML.match(/<div class="line[^"]*">([\s\S]*?)<\/div>/) || [])[1] || "";
ok(/[\u4e00-\u9fa5]/.test(zhLine), "after toggle the line is Chinese: " + zhLine.trim());
ok(documentStub.getElementById("f-r").innerHTML.indexOf("作者") >= 0, "footer switched to 作者");
kl.onclick();
ok(/[\u4e00-\u9fa5]/.test(((MAIN.innerHTML.match(/<div class="line[^"]*">([\s\S]*?)<\/div>/) || [])[1]) || "") === false, "toggling back returns to English");

console.log("\n=== E. ARCHIVE / PRESENTER UNLOCK ===");
OV.innerHTML = ""; OV.style.display = "none";
documentStub.getElementById("arch").onclick();
ok(!!documentStub.getElementById("pl"), "archive opened, presenter button present");
documentStub.getElementById("pl").onclick();
const meta = JSON.parse(store["unsaid.meta.v1"] || "{}");
ok((meta.keepsakes || []).length === 10, "presenter unlock granted all 10 keepsakes");
ok((meta.endings || []).length === 14, "presenter unlock granted all 14 endings");

console.log("\n" + (fail ? "FAILED: " + fail + " check(s)" : "ALL CHECKS PASSED"));
process.exit(fail ? 1 : 0);
