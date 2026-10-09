/* Static contract audit for index.html
   Finds the class of bug a stubbed-DOM test can never see:
   CSS the JS/HTML never applies, ids the JS reads but nothing defines,
   and elements the JS positions but that carry no positioning class. */
const fs = require("fs");
const src = fs.readFileSync("index.html", "utf8");

/* ---------- 1. CSS selectors actually defined ---------- */
const styleM = src.match(/<style>([\s\S]*?)<\/style>/);
if (!styleM) { console.error("no <style>"); process.exit(1); }
let css = styleM[1];

// drop @media / @supports blocks (brace-matched), then all declaration blocks
function dropBlocks(text, opener) {
  let out = "", i = 0;
  for (;;) {
    const at = text.indexOf(opener, i);
    if (at < 0) { out += text.slice(i); break; }
    out += text.slice(i, at);
    let d = 0, j = text.indexOf("{", at);
    if (j < 0) { out += text.slice(at); break; }
    for (; j < text.length; j++) {
      if (text[j] === "{") d++;
      else if (text[j] === "}") { d--; if (d === 0) { j++; break; } }
    }
    i = j;
  }
  return out;
}
let selectorsOnly = dropBlocks(css, "@media");
selectorsOnly = dropBlocks(selectorsOnly, "@keyframes");
selectorsOnly += "\n" + (css.match(/(^|\n)(\.[\w-]+[^{}]*)\{/g) || []).join("\n");
selectorsOnly = selectorsOnly.replace(/\{[^{}]*\}/g, " ");

const cssClasses = new Set(), cssIds = new Set();
(selectorsOnly.match(/\.(-?[_a-zA-Z][\w-]*)/g) || []).forEach(c => cssClasses.add(c.slice(1)));
(selectorsOnly.match(/#(-?[_a-zA-Z][\w-]*)/g) || []).forEach(c => cssIds.add(c.slice(1)));

/* ---------- 2. Everything the HTML + JS templates actually use ---------- */
const script = src.match(/<script>([\s\S]*)<\/script>/)[1];
/* A class counts as "used" if it appears in a class attribute, OR as a quoted
   string literal in the script (classList.toggle("x"), `${cond?'x':''}`). */
const usedClasses = new Set(), usedIds = new Set();
(src.match(/class="([^"]*)"/g) || []).forEach(m => {
  // A class attribute may be built from a template: class="who${cond?" narr":""}"
  // Strip the ${...} expressions first, or 'who' is never seen as a class.
  const raw = m.slice(7, -1).replace(/\$\{[^}]*\}/g, " ");
  raw.split(/[^\w-]+/).filter(Boolean).forEach(c => usedClasses.add(c));
});
(script.match(/"([a-zA-Z][\w-]*)"/g) || []).forEach(m => usedClasses.add(m.slice(1, -1)));
(script.match(/'([a-zA-Z][\w-]*)'/g) || []).forEach(m => usedClasses.add(m.slice(1, -1)));
(src.match(/\bid="([^"]*)"/g) || []).forEach(m => usedIds.add(m.slice(4, -1)));

/* ---------- 3. id / selector references from the script ---------- */
const refs = [];
const reRef = /\$\(\s*"([^"]+)"\s*\)|getElementById\(\s*"([^"]+)"\s*\)|querySelector(?:All)?\(\s*"([^"]+)"\s*\)/g;
let m;
while ((m = reRef.exec(script))) refs.push(m[1] || m[2] || m[3]);
const uniqueRefs = [...new Set(refs)];

/* ---------- report ---------- */
let problems = 0;
const flag = (t, d) => { problems++; console.log("  [" + t + "] " + d); };

console.log("=== 1. CSS CLASSES DEFINED BUT NEVER USED (the overlay bug class) ===");
const orphan = [...cssClasses].filter(c => !usedClasses.has(c));
if (!orphan.length) console.log("  (none)");
orphan.forEach(c => flag("orphan-css", "." + c + " is styled but nothing ever carries it"));

console.log("\n=== 2. CSS ID SELECTORS WITH NO MATCHING ELEMENT ===");
const orphanIds = [...cssIds].filter(i => !usedIds.has(i));
if (!orphanIds.length) console.log("  (none)");
orphanIds.forEach(i => flag("orphan-id", "#" + i + " is styled but no element has that id"));

console.log("\n=== 3. EVERY id THE SCRIPT READS ===");
uniqueRefs.filter(r => /^[\w-]+$/.test(r)).forEach(id => {
  const ok = usedIds.has(id);
  console.log("  " + (ok ? "ok   " : "MISS ") + "#" + id + (ok ? "" : "   <- script reads this id but nothing defines it"));
  if (!ok) problems++;
});

console.log("\n=== 4. ELEMENTS THE SCRIPT SHOWS/HIDES, AND WHAT POSITIONS THEM ===");
const positioned = new Set();
(css.match(/([^{}]+)\{([^{}]*)\}/g) || []).forEach(rule => {
  const k = rule.indexOf("{");
  const sel = rule.slice(0, k), body = rule.slice(k);
  if (/position\s*:\s*(absolute|fixed)/.test(body)) sel.split(",").forEach(s => positioned.add(s.trim()));
});
console.log("  rules providing positioning: " + [...positioned].join("  "));
["overlay", "main", "meters", "ledger", "web", "keeps"].forEach(id => {
  const hasClassRule = [...positioned].some(sel => {
    const cls = (sel.match(/^\.([\w-]+)$/) || [])[1];
    return cls && usedClasses.has(cls) && new RegExp('class="[^"]*\\b' + cls + '\\b').test(src);
  });
  const idRule = [...positioned].some(sel => sel === "#" + id);
  if (id === "overlay" && !idRule) {
    const styled = cssClasses.has("ov");
    console.log("  #" + id + ": positioning via id-rule=" + idRule +
      " | a .ov class rule exists=" + styled +
      " | but does any element carry class 'ov'? " + usedClasses.has("ov"));
    if (styled && !usedClasses.has("ov")) { flag("unpositioned", "#overlay is shown/hidden by JS but no CSS positions it (missing class)"); }
  }
});

console.log("\n=== 4b. classList.toggle/add/remove TARGETS ===");
const clsToggles = [...new Set((script.match(/classList\.(?:toggle|add|remove)\(\s*"([^"]+)"/g) || [])
  .map(s => s.match(/"([^"]+)"/)[1]))];
clsToggles.forEach(c => {
  const hasCss = cssClasses.has(c);
  console.log("  " + (hasCss ? "ok   " : "DEAD ") + '"' + c + '"' + (hasCss ? "" : "  <- toggled by JS but no CSS rule uses it"));
  if (!hasCss) problems++;
});

console.log("\n=== 5. i18n KEY ALIGNMENT (en vs zh) ===");
{
  // Editing one language block and not the other is a silent failure: t("x")
  // returns undefined, the template renders nothing, and no error is thrown.
  const enM = script.match(/en:\{([\s\S]*?)\n  \},\n  zh:/);
  const zhM = script.match(/zh:\{([\s\S]*?)\n  \}\n\};/);
  if (enM && zhM) {
    const keysOf = s => new Set((s.match(/(^|,)\s*([A-Za-z_]\w*)\s*:/g) || [])
      .map(x => x.replace(/[,:]/g, "").trim()));
    const en = keysOf(enM[1]), zh = keysOf(zhM[1]);
    const missingZh = [...en].filter(k => !zh.has(k));
    const missingEn = [...zh].filter(k => !en.has(k));
    console.log("  en keys: " + en.size + " | zh keys: " + zh.size);
    if (!missingZh.length && !missingEn.length) console.log("  ok   every key exists in both languages");
    missingZh.forEach(k => flag("i18n", "key '" + k + "' is in en but not zh"));
    missingEn.forEach(k => flag("i18n", "key '" + k + "' is in zh but not en"));
  } else console.log("  (could not isolate the two language blocks)");
}

console.log("\n=== 6. SUMMARY ===");
console.log("  css classes: " + cssClasses.size + " | used in markup/templates: " + usedClasses.size);
console.log("  ids defined: " + usedIds.size + " | ids referenced by script: " + uniqueRefs.filter(r => /^[\w-]+$/.test(r)).length);
console.log(problems ? "\n  PROBLEMS: " + problems : "\n  no contract violations found");
process.exit(problems ? 1 : 0);
