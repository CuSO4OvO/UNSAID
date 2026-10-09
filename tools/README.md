# tools/ — verification scripts

These exist because a game can pass every logic test and still be a blank page.
Run them from the project root after editing `index.html`.

```
node tools/dump.js       # prints every tunable constant out of the running engine
node tools/audit.js      # static HTML/CSS/JS contract audit
node tools/domtest.js    # parses the real markup, walks the whole user flow
node tools/mechanics.js  # proves each mechanic actually fires
node tools/fixes.js      # regression tests for the 18 defects in the QA report
node tools/balance.js    # ending distribution across 13 play strategies
node tools/mkpreview.js   # writes _preview.html for headless screenshots
```

## What each one catches

**`audit.js`** — compares the CSS in `<style>` against the classes and ids that
actually appear in the markup and in the JS templates. It reports:

1. a CSS class that no element ever carries,
2. a CSS id selector with no matching element,
3. an id the script reads that nothing defines,
4. **an element the script shows/hides that no CSS rule positions.**

Check 4 is the important one. It is what caught the original blank-page bug:
`#overlay` was found by id, `display:flex` was set on it, but the rule that
gives it `position:absolute; inset:0; z-index:20` was written as `.ov` and no
element carried that class. The overlay therefore stayed in normal document
flow, got pushed below the viewport by a `height:100%` sibling, and
`body{overflow:hidden}` clipped it. Nothing threw; the page just looked empty.

**`domtest.js`** — builds a small DOM from the *real* static markup, so
`getElementById` returns `null` for unknown ids exactly like a browser, then
asserts: the first boot opens the tutorial (dismissed via its Skip button), the
title screen renders, the Help button reopens the tutorial and returns, the
overlay is classified as on-screen, START hides it, a full evening reaches an
ending, 200 runs don't crash, the language toggle switches to Chinese and back,
and the presenter unlock grants all keepsakes and endings.

**`mkpreview.js`** — writes `_preview.html`, a copy of the game with a harness
appended that auto-clicks START and advances N decisions, so a headless browser
can screenshot real gameplay:

```
msedge --headless=new --window-size=1600,1000 --virtual-time-budget=5000 \
  --screenshot=shot.png "_preview.html#steps=9"
```

`#steps=N` advances N decisions; add `&zh` for Chinese. The first-boot tutorial
is skipped automatically; pass `&tut` to keep it on screen for screenshots.

## What none of them can catch

Layout and colour. Those need a real browser. Take a screenshot and look at it
before every presentation.

**`fixes.js`** — regression tests for the 18 defects found by the independent
test report (`UNSAID_测试问题报告.md`, A1–A18). Each assertion re-runs the
reproduction that report used: behavioural where the report was behavioural
(the flood no longer consumes a schedule slot, secret text reaches the screen,
k6 is collectable, an invalid save recovers, a complete evening draws all six
topic slots), static where it was static. Run it after touching the engine —
several of these bugs were silent, and two of them shipped twice before.

**`balance.js`** — plays the real engine thousands of times under 13 fixed
strategies (always agree, always stay silent, chase stress, drain yourself...)
and prints the ending each one produces, then a reachability summary. Run it
after changing any number, threshold or ending condition. A "MISS" line means
an ending has become unreachable, which is always a bug: every ending in the
Archive should be something a player could actually get.

**`dump.js`** — prints every constant (verbs, multipliers, weights, thresholds,
ending conditions, content counts) straight out of the running engine. This is
how `UNSAID_游戏机制总表.md` is kept honest: if the doc and the code disagree,
the doc is wrong.

**`mechanics.js`** — proves the mechanics that are easy to break silently:
weighted card draw, the `conf < 60` misread, the 2d6 skill check, keepsake-gated
options, the classroom vote panel, ripple notices, the ending recap and the
fatigue tiers. Each assertion is behavioural, not structural — it plays the game
and measures the outcome.
