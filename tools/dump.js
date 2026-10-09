/* Dumps every tunable constant straight out of the running engine, so the
   mechanics document can be checked against the code instead of memory.
     node tools/dump.js
*/
const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, "..");
const code = fs.readFileSync(path.join(root, "index.html"), "utf8").match(/<script>([\s\S]*)<\/script>/)[1];

const sb = { console, Math, JSON, Date, Array, Object, String, Number, Boolean, RegExp, Error, Set, Map,
  isNaN, parseInt, parseFloat, setTimeout, clearTimeout,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
sb.globalThis = sb;
const noopEl = { textContent: "", innerHTML: "", style: {}, classList: { toggle() {}, add() {}, remove() {} },
  querySelectorAll: () => [], querySelector: () => null, onclick: null };
sb.document = { getElementById: () => noopEl, querySelector: () => noopEl, addEventListener: () => {}, createElement: () => noopEl };
sb.window = sb;

vm.runInContext(code + "\nglobalThis.__api={START,BASE_UNSAID,VERBS,LED,NPCS,RIPPLES,TOPICS,OLDSCORES,ESCAPES,KEEPSAKES,ENDINGS,ENDING_ORDER,SECRET_OWNER,MOM_OPENS_UP,buildSchedule,buildPresSchedule,SPINE,T};",
  vm.createContext(sb), { filename: "game.js" });
const a = sb.__api;
const line = (s) => console.log(s);

line("START            " + JSON.stringify(a.START));
line("BASE_UNSAID      " + a.BASE_UNSAID);
line("");
line("VERBS  (" + Object.keys(a.VERBS).length + ")");
for (const [k, v] of Object.entries(a.VERBS))
  line("  " + k.padEnd(10) + v.en.padEnd(20) + v.zh.padEnd(12) +
    ["face", "filial", "self", "stress", "unsaid"].map(m => m[0] + (v.fx[m] >= 0 ? "+" : "") + v.fx[m]).join(" "));
line("");
line("LED (ledger weight per verb)");
line("  " + JSON.stringify(a.LED));
line("");
line("NPCS  (" + Object.keys(a.NPCS).length + ")");
for (const [k, v] of Object.entries(a.NPCS))
  line("  " + k.padEnd(8) + v.en.padEnd(18) + "clout " + v.clout + "  " + JSON.stringify(v.mult));
line("");
line("RIPPLES  (" + a.RIPPLES.length + ")");
a.RIPPLES.forEach(r => line("  " + JSON.stringify(r.if) + " -> " + JSON.stringify(r.then) + "   " + r.en));
line("");
const mines = {};
a.TOPICS.forEach(t => mines[t.mine] = (mines[t.mine] || 0) + 1);
const courses = {};
a.TOPICS.forEach(t => t.c.forEach(c => courses[c] = (courses[c] || 0) + 1));
line("TOPICS           " + a.TOPICS.length + "   mine levels " + JSON.stringify(mines) + "   by course " + JSON.stringify(courses));
line("OLDSCORES        " + a.OLDSCORES.length + "   " + a.OLDSCORES.map(o => o.id + (o.reveal ? "*" : "")).join(" "));
line("ESCAPES/secrets  " + Object.keys(a.ESCAPES).length + "   " + Object.keys(a.ESCAPES).join(" "));
line("KEEPSAKES        " + Object.keys(a.KEEPSAKES).length);
for (const [k, v] of Object.entries(a.KEEPSAKES)) line("  " + k.padEnd(10) + "unlocked by ending: " + v.how);
line("");
line("SECRET_OWNER     " + JSON.stringify(a.SECRET_OWNER));
line("MOM_OPENS_UP     " + JSON.stringify(a.MOM_OPENS_UP));
line("");
line("ENDINGS          " + a.ENDINGS.length + "   order: " + a.ENDING_ORDER.join(" > "));
a.ENDINGS.forEach(e => line("  " + e.id.padEnd(13) + (e.rare ? "RARE " : "     ") + e.n.en));
line("");
line("schedule         " + a.buildSchedule().map(s => s.t === "node" ? s.id : "draw(c" + s.c + ")").join(" > "));
line("classroom        " + a.buildPresSchedule().map(s => s.t === "node" ? s.id : "draw(c" + s.c + ")").join(" > "));
line("");
line("spine nodes      " + Object.keys(a.SPINE).length + "   " + Object.keys(a.SPINE).join(" "));
line("option count     " + [...Object.values(a.SPINE), ...a.TOPICS, ...a.OLDSCORES].reduce((n, o) => n + ((o.opts && o.opts.length) || 0), 0) +
  "   (cards " + [...a.TOPICS, ...a.OLDSCORES].reduce((n, o) => n + o.opts.length, 0) +
  " + spine " + Object.values(a.SPINE).reduce((n, o) => n + ((o.opts && o.opts.length) || 0), 0) + ")");
