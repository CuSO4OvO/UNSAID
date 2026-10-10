/* Builds _preview.html: index.html + a harness that auto-drives the game so a
   headless browser can screenshot real states.
     node tools/mkpreview.js

   URL hash controls:
     #steps=9     advance 9 decisions
     &zh          switch to Chinese
     &pres        classroom mode
     &notice      advance until a ripple/misread notice is on screen
     &mode=true   set the subtitle layer (literal | polite | true)
    &tut         keep the first-boot tutorial on screen (it is skipped otherwise)
    &tutstep=N   open the tutorial directly at page N
*/
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "index.html"), "utf8");

const harness = `
<script>
(function(){
  var h = location.hash || "";
  var m = /steps=(\\d+)/.exec(h);
  var n = m ? parseInt(m[1], 10) : 0;
  var pres = /pres/.test(h);
  var wantNotice = /notice/.test(h);

  if(/zh/.test(h)){ try{ document.getElementById("k-lang").onclick(); }catch(e){} }
  if(/archive/.test(h)){ try{ document.getElementById("arch").onclick(); }catch(e){} document.title="ready"; return; }
  /* first boot shows the tutorial; keep it on screen only when &tut is given */
  if(!/tut/.test(h)){ try{ var sk=document.getElementById("tut-skip"); if(sk) sk.onclick(); }catch(e){} }
  /* &tutstep=N opens the tutorial straight at page N (for screenshots) */
  var ts = /tutstep=(\\d+)/.exec(h);
  if(ts){ try{ showTut(parseInt(ts[1],10)); }catch(e){} return; }
  /* &runs=N pretends the player has survived N years (opens the mindset gate) */
  var vr = /runs=(\\d+)/.exec(h);
  if(vr){ try{ META.runs = parseInt(vr[1],10); }catch(e){} }
  try{ document.getElementById(pres ? "pres" : "start").onclick(); }catch(e){}

  var pick = (/pick=(\w+)/.exec(h) || [])[1] || null;
  var guard = 0;
  while(guard++ < 80){
    if(n <= 0 && !wantNotice) break;
    if(wantNotice && document.getElementById("main").innerHTML.indexOf('class="notices"') >= 0) break;
    var b = document.querySelectorAll("#main .opt:not([disabled])");
    if(!b.length) break;
    var chosen = b[0];
    if(pick){ for(var j=0;j<b.length;j++){ if(b[j].dataset.v === pick){ chosen = b[j]; break; } } }
    chosen.click();
    if(n > 0) n--;
    if(document.getElementById("overlay").style.display === "flex") break;
  }

  var mm = /mode=(\\w+)/.exec(h);
  if(mm){
    var map = {literal:"Literal", polite:"Polite", true:"What she meant"};
    for(var k=0;k<3 && document.getElementById("mode-lbl").textContent !== map[mm[1]]; k++)
      document.getElementById("k-mode").onclick();
  }
  document.title = "ready";
})();
</script>
`;

fs.writeFileSync(path.join(root, "_preview.html"), src.replace("</body>", harness + "</body>"));
console.log("wrote _preview.html (" + Math.round(fs.statSync(path.join(root, "_preview.html")).size / 1024) + " KB)");
