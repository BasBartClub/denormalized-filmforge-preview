// Live tuning panel for the paper fold. Activates ONLY with ?foldtune in the
// URL, so it never shows in production — same arrangement as ?morphtune on the
// home page.
//
// Play it, or drag the Scrub slider to hold the fold at any angle and study the
// shading. Nothing here submits the form, so you can iterate without filling in
// the sheet or posting anything to Notion.
(function () {
  if (!/[?&]foldtune\b/.test(location.search)) return;

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    var FOLD = window.__FOLD;
    var demo = window.__foldDemo;
    if (!FOLD || !demo) { console.warn("[foldtune] contact.js hasn't exposed the fold"); return; }

    var EASES = ["none", "sine.inOut", "power1.inOut", "power2.inOut", "power2.in", "power2.out",
      "power3.inOut", "power3.in", "power4.inOut", "expo.inOut", "circ.inOut", "back.in(1.4)"];

    // [label, key, min, max, step]
    var SLIDERS = [
      ["Fold time (s)", "fold", 0.2, 2, 0.02],
      ["Give at crease (°)", "give", 0, 20, 0.5],
      ["Settle time (s)", "settle", 0, 0.9, 0.02],
      ["Face dim", "dim", 0, 0.7, 0.01],
      ["Back lift", "backLift", 0, 0.5, 0.01],
      ["Cast shadow", "shadow", 0, 3, 0.05],
      ["Shadow head start", "shadowStart", 0, 0.8, 0.01],
      ["Crease", "crease", 0, 1.5, 0.05],
      ["Perspective (px)", "perspective", 500, 4000, 50],
      ["Lift before fly (px)", "lift", 0, 120, 2],
      ["Fly time (s)", "flyDur", 0.2, 2, 0.02],
      ["Fly X (%)", "flyX", 0, 260, 2],
      ["Fly Y (%)", "flyY", -160, 60, 2],
      ["Fly rotate (°)", "flyRot", -45, 45, 1],
      ["Fly scale", "flyScale", 0.2, 1.2, 0.02],
    ];

    var panel = document.createElement("div");
    panel.style.cssText =
      "position:fixed;top:12px;right:12px;z-index:2147483000;width:250px;max-height:94vh;overflow:auto;" +
      "background:rgba(12,12,12,.94);color:#fff;font:12px/1.35 ui-monospace,Menlo,monospace;" +
      "padding:12px 12px 10px;border-radius:10px;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);" +
      "box-shadow:0 12px 40px rgba(0,0,0,.5);user-select:none";

    var head = document.createElement("div");
    head.textContent = "PAPER FOLD";
    head.style.cssText = "font-weight:700;letter-spacing:.06em;margin-bottom:8px";
    panel.appendChild(head);

    function row(label, control) {
      var r = document.createElement("label");
      r.style.cssText = "display:block;margin:7px 0";
      var t = document.createElement("div");
      t.style.cssText = "display:flex;justify-content:space-between;opacity:.75;margin-bottom:2px";
      var n = document.createElement("span"); n.textContent = label;
      var v = document.createElement("span");
      t.appendChild(n); t.appendChild(v);
      r.appendChild(t); r.appendChild(control);
      return { r: r, val: v };
    }

    function slider(min, max, step, value) {
      var i = document.createElement("input");
      i.type = "range"; i.min = min; i.max = max; i.step = step; i.value = value;
      i.style.cssText = "width:100%;accent-color:#e72b25;margin:0";
      return i;
    }

    // --- Which dismissal are we looking at? -----------------------------------
    var CLOTH = window.__CLOTH;
    var cloth = window.__cloth;
    var paper = document.querySelector("#case-form");
    var mode = "fold";

    var modeWrap = document.createElement("div");
    modeWrap.style.cssText = "display:flex;gap:6px;margin:0 0 10px";
    function modeBtn(label, val) {
      var b = document.createElement("button");
      b.textContent = label;
      b.dataset.mode = val;
      b.style.cssText = "flex:1;border:0;border-radius:5px;padding:6px 4px;cursor:pointer;font:inherit;" +
        "background:" + (val === mode ? "#e72b25" : "#2a2a2a") + ";color:#fff";
      b.addEventListener("click", function () {
        mode = val;
        demo.reset(); if (cloth) cloth.reset(paper);
        scrubInput.value = 0; scrubRow.val.textContent = "0";
        [].forEach.call(modeWrap.children, function (o) {
          o.style.background = o.dataset.mode === mode ? "#e72b25" : "#2a2a2a";
        });
        [].forEach.call(panel.querySelectorAll("[data-only]"), function (el) {
          el.style.display = el.dataset.only === mode ? "" : "none";
        });
        scrubRow.val.textContent = "0";
      });
      return b;
    }
    modeWrap.appendChild(modeBtn("Fold", "fold"));
    modeWrap.appendChild(modeBtn("Cloth", "cloth"));
    panel.appendChild(modeWrap);

    // --- Scrub: hold the fold at any angle -----------------------------------
    var scrubInput = slider(0, 180, 1, 0);
    var scrubRow = row("Scrub (°)", scrubInput);
    scrubRow.val.textContent = "0";
    scrubRow.r.style.cssText += ";padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.15)";
    scrubInput.addEventListener("input", function () {
      var v = parseFloat(scrubInput.value);
      scrubRow.val.textContent = v.toFixed(0);
      if (mode === "cloth") cloth.scrub(paper, v / 180);   // 0–180 → 0–1 gather
      else demo.scrub(v);
    });
    panel.appendChild(scrubRow.r);

    // --- The numbers ---------------------------------------------------------
    SLIDERS.forEach(function (s) {
      var key = s[1];
      var input = slider(s[2], s[3], s[4], FOLD[key]);
      var built = row(s[0], input);
      built.val.textContent = (+FOLD[key]).toFixed(2);
      built.r.dataset.only = "fold";
      input.addEventListener("input", function () {
        FOLD[key] = parseFloat(input.value);
        built.val.textContent = parseFloat(input.value).toFixed(2);
        // Re-apply live if the fold is currently being held open.
        if (demo.rig) {
          if (key === "perspective") demo.rig.stage.style.perspective = FOLD.perspective + "px";
          demo.rig.setDeg(parseFloat(scrubInput.value));
        }
      });
      panel.appendChild(built.r);
    });

    // Cloth-only controls.
    var CLOTH_SLIDERS = [
      ["Creases", "folds", 1, 6, 0.25],
      ["Gather depth", "foldDepth", 0.05, 1.2, 0.01],
      ["Width squeeze", "squeeze", 0, 0.9, 0.01],
      ["Ripple at rest", "wave", 0, 4, 0.05],
      ["Ripple mid-gather", "waveOnFold", 0, 6, 0.05],
      ["Gather time (s)", "fold", 0.2, 2.5, 0.02],
      ["Carry-off starts at", "flyStart", 0, 1, 0.01],
      ["Carry-off time (s)", "flyDur", 0.2, 2, 0.02],
      ["Carry-off X", "flyX", 0, 4, 0.05],
      ["Carry-off Y", "flyY", -2, 2, 0.05],
      ["Carry-off shrink", "flyShrink", 0, 1, 0.01],
      ["Diffuse", "light", 0, 1, 0.01],
      ["Specular", "spec", 0, 0.6, 0.01],
      ["Crease shading", "creaseShade", 0, 1, 0.01],
    ];
    if (CLOTH) CLOTH_SLIDERS.forEach(function (s2) {
      var key = s2[1];
      var input = slider(s2[2], s2[3], s2[4], CLOTH[key]);
      var built = row(s2[0], input);
      built.val.textContent = (+CLOTH[key]).toFixed(2);
      built.r.dataset.only = "cloth";
      built.r.style.display = "none";
      input.addEventListener("input", function () {
        CLOTH[key] = parseFloat(input.value);
        built.val.textContent = parseFloat(input.value).toFixed(2);
        if (mode === "cloth" && cloth.rig) cloth.scrub(paper, parseFloat(scrubInput.value) / 180);
      });
      panel.appendChild(built.r);
    });

    var sel = document.createElement("select");
    sel.style.cssText = "width:100%;background:#1c1c1c;color:#fff;border:1px solid #333;border-radius:5px;padding:3px";
    EASES.forEach(function (e) {
      var o = document.createElement("option"); o.value = e; o.textContent = e;
      if (e === FOLD.ease) o.selected = true; sel.appendChild(o);
    });
    sel.addEventListener("change", function () { FOLD.ease = sel.value; });
    var er = row("Ease", sel); er.val.remove(); panel.appendChild(er.r);

    // --- Buttons -------------------------------------------------------------
    function button(txt, fn, full) {
      var b = document.createElement("button");
      b.textContent = txt;
      b.style.cssText = "background:#e72b25;color:#fff;border:0;border-radius:5px;padding:6px 4px;cursor:pointer;font:inherit;" +
        (full ? "width:100%;margin-top:6px" : "flex:1");
      b.addEventListener("click", fn); return b;
    }

    var btns = document.createElement("div");
    btns.style.cssText = "display:flex;gap:6px;margin-top:10px";
    btns.appendChild(button("Play ▶", function () {
      scrubInput.value = 0; scrubRow.val.textContent = "0";
      if (mode === "cloth") cloth.play(paper).catch(function (e) { console.error("[foldtune]", e.message); });
      else demo.play();
    }));
    // WV-41. The arrival is play() mirrored, so it is tuned by the same sliders
    // — there is nothing of its own to tune. This just replays it on demand,
    // since otherwise it can only be seen by reloading the page.
    btns.appendChild(button("◀ In", function () {
      scrubInput.value = 0; scrubRow.val.textContent = "0";
      if (mode === "cloth" && cloth.playIn) {
        cloth.playIn(paper).catch(function (e) { console.error("[foldtune]", e.message); });
      }
    }));
    btns.appendChild(button("Reset", function () {
      scrubInput.value = 0; scrubRow.val.textContent = "0";
      demo.reset(); if (cloth) cloth.reset(paper);
    }));
    panel.appendChild(btns);

    var copy = button("Copy config", function () {
      var srcCfg = mode === "cloth" && CLOTH ? CLOTH : FOLD;
      var cfg = { mode: mode };
      Object.keys(srcCfg).forEach(function (k) { cfg[k] = srcCfg[k]; });
      var txt = JSON.stringify(cfg, null, 2);
      if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(function () {});
      console.log("[foldtune] config:\n" + txt);
      copy.textContent = "Copied ✓";
      setTimeout(function () { copy.textContent = "Copy config"; }, 1200);
    }, true);
    panel.appendChild(copy);

    var hint = document.createElement("div");
    hint.style.cssText = "margin-top:8px;opacity:.5;line-height:1.4";
    hint.textContent = "Fold = CSS hinge. Cloth = WebGL fabric, gathered along vertical creases. Scrub holds it; Play ▶ runs it. Nothing is submitted.";
    panel.appendChild(hint);

    document.body.appendChild(panel);
    console.log("[foldtune] ready — Fold ▶ to play, Scrub to hold it mid-fold.");
  });
})();
