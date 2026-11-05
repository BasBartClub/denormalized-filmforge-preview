// Hover roll, letter by letter (WV-39).
//
// Put data-roll on anything whose text should roll over on hover. The element
// holds ordinary text — one copy, the real string — and this splits it into
// per-letter columns. The second copy of each glyph is a ::after fed by data-c,
// so nothing is duplicated in the DOM: textContent still reads the actual
// label, and a screen reader still reads it once.
//
// This replaces the Webflow arrangement it grew out of, where every label
// shipped as two stacked .og-text copies driven by a listener bound straight to
// the element. That forced three workarounds — cloning each node to shed the
// listener, an aria-label to undo the doubled text, and a flex-shrink guard —
// none of which are needed now that we own the markup.
(function () {
  var SEL = "[data-roll]";
  var STAGGER = 0.018;      // per letter
  var DURATION = 0.42;

  // The clip has to be VERTICAL only. overflow:hidden also cuts sideways, and a
  // glyph's ink can exceed its advance (2px on the F and e of "File a Case"), so
  // the letters were being shaved. clip-path can't do it either — inset() treats
  // negative values as invalid, so it clamps to the box. Instead the cell is
  // padded out sideways to give the ink room and pulled back by the same amount,
  // leaving the laid-out width exactly the measured advance. content-box, so the
  // pinned width still means the advance rather than advance-minus-padding.
  var CSS_CELL =
    ".lr-c{display:inline-block;vertical-align:top;white-space:pre;overflow:hidden;" +
    "box-sizing:content-box;padding:0 .35em;margin:0 -.35em}";

  var CSS =
    "[data-roll]{display:inline-block;white-space:nowrap}" +
    CSS_CELL +
    ".lr-m{display:block;position:relative;will-change:transform}" +
    ".lr-m::after{content:attr(data-c);position:absolute;left:0;top:100%}";

  function styles() {
    if (document.getElementById("lr-css")) return;
    var s = document.createElement("style");
    s.id = "lr-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // Split in two halves — measure every label, THEN rebuild every label — because
  // the two fight each other. Each replaceChild dirties layout, so a
  // measure/mutate/measure/mutate walk made every Range read force a fresh
  // relayout of the whole document: 18 labels meant 18 full relayouts, and it
  // was one of the page's longest startup tasks. Batched, the reads all land in
  // one already-clean layout and the writes flush once.

  // Reads only. Never touches the DOM.
  function measure(el) {
    var node = el.firstChild;
    if (!node || node.nodeType !== 3) return null;
    var text = node.nodeValue;
    if (!text.trim()) return null;

    // Measure each glyph where it actually sits, before taking the run apart.
    // Split into separate inline-blocks the letters are shaped alone and lose
    // their kerning pairs, which pulls the line in — 6.6px over the footer
    // address at display size. A Range reports the real advances, so pinning
    // each cell to its own keeps the line exactly as wide as it was set.
    var range = document.createRange();
    var advances = [];
    for (var m = 0; m < text.length; m++) {
      range.setStart(node, m);
      range.setEnd(node, m + 1);
      advances.push(range.getBoundingClientRect().width);
    }
    return { el: el, node: node, text: text, advances: advances };
  }

  // Writes only. Never reads layout.
  function apply(m) {
    var text = m.text, advances = m.advances;
    var frag = document.createDocumentFragment();
    var movers = [];
    for (var i = 0; i < text.length; i++) {
      var cell = document.createElement("span");
      cell.className = "lr-c";
      if (advances[i]) cell.style.width = advances[i].toFixed(3) + "px";
      var mover = document.createElement("span");
      mover.className = "lr-m";
      mover.textContent = text[i];
      mover.setAttribute("data-c", text[i]);   // the copy waiting a line below
      cell.appendChild(mover);
      frag.appendChild(cell);
      movers.push(mover);
    }
    m.el.replaceChild(frag, m.node);
    return movers;
  }

  function init() {
    var gsap = window.gsap;
    if (!gsap) return;

    // No hover, no roll. The whole mechanism hangs off mouseenter/mouseleave,
    // which touch never fires, so on a phone this was splitting 18 labels into
    // 228 pinned cells — 456 nodes — to build something the device cannot use.
    // Nothing is lost visually: each cell is pinned to its Range-measured
    // advance precisely so the split line matches the unsplit one (0.12px over
    // 18 labels), which means leaving it unsplit reads identically — with the
    // browser's own kerning, if anything more correct.
    // The trade is that a keyboard user on a touch device loses the focus roll.
    // It is decoration, and the label still reads and still focuses.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    styles();
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // The cell widths are pixels measured from the type as it is right now, and
    // the type moves twice: the brand face swaps in after first paint (Arial is
    // 737.5px against Regesto's 701.5 for the address — cells sized to one and
    // filled with the other collide), and the root font-size is fluid, so every
    // resize rescales the glyphs inside boxes that would otherwise stay put.
    // Keeping the original string means we can just rebuild whenever the
    // measurement goes stale.
    var items = Array.prototype.map.call(
      document.querySelectorAll(SEL),
      function (el) { return { el: el, text: el.textContent, movers: [], tween: null }; }
    );
    if (!items.length) return;

    function rebuildAll() {
      // 1. restore — every label back to one plain text node (writes)
      items.forEach(function (it) {
        if (it.tween) { it.tween.kill(); it.tween = null; }
        it.el.textContent = it.text;
      });
      // 2. measure — one relayout serves every label (reads)
      var measured = items.map(function (it) { return measure(it.el); });
      // 3. rebuild — all the cells, no reads in between (writes)
      measured.forEach(function (m, i) { items[i].movers = m ? apply(m) : []; });
    }
    rebuildAll();

    items.forEach(function (it) {
      if (!it.movers.length || reduced) return;

      // The hover target is whatever wraps it — the whole link, not just the
      // letters, so the roll doesn't stutter in the gaps between cells.
      var host = it.el.closest("a, button") || it.el;
      var run = function (to) {
        if (it.tween) it.tween.kill();
        it.tween = gsap.to(it.movers, {
          yPercent: to,
          duration: DURATION,
          ease: "power3.inOut",
          stagger: { each: STAGGER, from: "start" },
        });
      };
      host.addEventListener("mouseenter", function () { run(-100); });
      host.addEventListener("mouseleave", function () { run(0); });
      host.addEventListener("focus", function () { run(-100); });
      host.addEventListener("blur", function () { run(0); });
    });

    var t;
    window.addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        // A frame between restoring the text and measuring it: the root
        // font-size is fluid, and measuring in the same task as the restore
        // reads the OLD layout, which silently pinned nothing at all.
        requestAnimationFrame(rebuildAll);
      }, 150);
    });
  }

  // Measure only once the brand face is actually in use. Without this the first
  // paint's fallback metrics get baked into the cells.
  function start() {
    if (document.fonts && document.fonts.ready) {
      var done = false;
      var go = function () { if (!done) { done = true; init(); } };
      document.fonts.ready.then(go);
      setTimeout(go, 3000);              // never leave the labels unbuilt
    } else {
      init();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
