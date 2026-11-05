// Live tuning panel for the hero ink-morph. Activates ONLY with ?morphtune in the
// URL, so it never shows in production. Reads/writes window.__INK (set by wordmark.js)
// and drives real hovers so you feel speed + easing too.
(function () {
  if (!/[?&]morphtune\b/.test(location.search)) return;

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    var INK = window.__INK;
    if (!INK) { console.warn("[morphtune] window.__INK not found — is the wordmark on this page?"); return; }

    // [label, key, min, max, step]
    var SLIDERS = [
      ["Radius (letters)", "reach", 0.6, 3, 0.1],
      ["Hardness", "hardness", 0, 1, 0.05],
      ["Chase (viscosity)", "chase", 0.03, 0.6, 0.01],
      ["Push apart", "push", 0, 1, 0.05],
      ["Push reach", "pushWidth", 0.3, 2, 0.05],
      ["Melt (blur)", "gooBlur", 0, 30, 0.5],
      ["Blob fatness", "gooOffset", -16, -2, 0.1],
      ["Edge sharpen", "gooContrast", 6, 30, 0.5],
      ["Wiggle", "warp", 0, 16, 0.5],
      ["Wiggle scale", "freq", 0.05, 0.5, 0.01],
      ["Ink flow", "flow", 0, 2, 0.05],
      ["Endpoint ink", "hold", 0, 0.6, 0.02],
    ];

    var panel = document.createElement("div");
    panel.style.cssText =
      "position:fixed;top:12px;right:12px;z-index:2147483000;width:236px;" +
      "background:rgba(12,12,12,.92);color:#fff;font:12px/1.35 ui-monospace,Menlo,monospace;" +
      "padding:12px 12px 10px;border-radius:10px;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);" +
      "box-shadow:0 12px 40px rgba(0,0,0,.5);user-select:none";
    var head = document.createElement("div");
    head.textContent = "INK MORPH";
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

    SLIDERS.forEach(function (s) {
      var key = s[1];
      var input = document.createElement("input");
      input.type = "range"; input.min = s[2]; input.max = s[3]; input.step = s[4];
      input.value = INK[key];
      input.style.cssText = "width:100%;accent-color:#e72b25;margin:0";
      var built = row(s[0], input);
      built.val.textContent = (+INK[key]).toFixed(2);
      input.addEventListener("input", function () {
        INK[key] = parseFloat(input.value);
        built.val.textContent = parseFloat(input.value).toFixed(2);
      });
      panel.appendChild(built.r);
    });

    // Smart-push toggle: per-glyph shove weighting (M/Z get more room, O less).
    var tog = document.createElement("label");
    tog.style.cssText = "display:flex;align-items:center;gap:7px;margin:9px 0 2px;cursor:pointer";
    var cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = !!INK.pushSmart;
    cb.style.cssText = "accent-color:#e72b25;width:15px;height:15px;margin:0";
    var tl = document.createElement("span"); tl.textContent = "Smart push (per-glyph room)";
    tog.appendChild(cb); tog.appendChild(tl);
    cb.addEventListener("change", function () { INK.pushSmart = cb.checked; });
    panel.appendChild(tog);

    function button(txt, fn, full) {
      var b = document.createElement("button");
      b.textContent = txt;
      b.style.cssText = "background:#e72b25;color:#fff;border:0;border-radius:5px;padding:6px 4px;cursor:pointer;font:inherit;" +
        (full ? "width:100%;margin-top:6px" : "flex:1");
      b.addEventListener("click", fn); return b;
    }
    var wm = function () { return document.querySelector(".nh-wordmark"); };

    var btns = document.createElement("div");
    btns.style.cssText = "display:flex;gap:6px;margin-top:10px";
    // Sweep a synthetic cursor left→right across the word so you can feel reach,
    // core and viscosity without moving the mouse.
    btns.appendChild(button("Sweep ▶", function () {
      var el = wm(); if (!el) return;
      var r = el.getBoundingClientRect(), y = r.top + r.height / 2, steps = 70;
      for (var i = 0; i <= steps; i++) {
        (function (i) {
          setTimeout(function () {
            var x = r.left + (r.width * i) / steps;
            el.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, pointerType: "mouse", bubbles: true }));
            if (i === steps) setTimeout(function () { el.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true })); }, 450);
          }, i * 28);
        })(i);
      }
    }));
    btns.appendChild(button("Reset", function () {
      var el = wm(); if (el) el.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    }));
    panel.appendChild(btns);

    var copy = button("Copy config", function () {
      var cfg = {};
      ["reach", "hardness", "chase", "push", "pushWidth", "pushSmart", "warp", "freq", "flow", "edge", "gooBlur", "gooContrast", "gooOffset", "hold"]
        .forEach(function (k) { cfg[k] = INK[k]; });
      var txt = JSON.stringify(cfg, null, 2);
      if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(function () {});
      console.log("[morphtune] config:\n" + txt);
      copy.textContent = "Copied ✓"; setTimeout(function () { copy.textContent = "Copy config"; }, 1200);
    }, true);
    panel.appendChild(copy);

    document.body.appendChild(panel);

    // --- Live radius ring: shows the influence zone (outer = radius, inner = the
    // full-Hawk core implied by Hardness) following the cursor over the wordmark. ---
    function ringEl(dash) {
      var d = document.createElement("div");
      d.style.cssText = "position:fixed;left:0;top:0;border-radius:50%;pointer-events:none;" +
        "z-index:2147482000;transform:translate(-50%,-50%);opacity:0;transition:opacity .15s;" +
        "border:1px " + dash + " rgba(231,43,37,.9)";
      document.body.appendChild(d); return d;
    }
    var ringOuter = ringEl("dashed"), ringInner = ringEl("solid");
    function unit() {
      var wmEl = document.querySelector(".nh-wordmark");
      return wmEl ? (parseFloat(wmEl.style.fontSize) || 120) : 120;
    }
    document.addEventListener("pointermove", function (e) {
      var wmEl = document.querySelector(".nh-wordmark");
      if (!wmEl) return;
      var b = wmEl.getBoundingClientRect();
      var on = e.clientX >= b.left - 40 && e.clientX <= b.right + 40 &&
               e.clientY >= b.top - 120 && e.clientY <= b.bottom + 120;
      var u = unit(), far = INK.reach * u * 2, near = far * Math.min(0.98, INK.hardness);
      [[ringOuter, far], [ringInner, near]].forEach(function (p) {
        p[0].style.width = p[1] + "px"; p[0].style.height = p[1] + "px";
        p[0].style.left = e.clientX + "px"; p[0].style.top = e.clientY + "px";
        p[0].style.opacity = on ? "1" : "0";
      });
    });
    document.addEventListener("pointerleave", function () {
      ringOuter.style.opacity = ringInner.style.opacity = "0";
    });

    console.log("[morphtune] panel ready — drag Radius/Hardness, hit Sweep ▶, Copy config when happy.");
  });
})();
