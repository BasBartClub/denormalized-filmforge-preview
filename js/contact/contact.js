// Case Request form (contact.html).
//
// The sheet is a fill-in-the-blanks paragraph: every input grows with what you
// type, the needs/timing options are chips, and the brief is a ruled textarea
// with a countdown. On submit the sheet folds in half and posts itself off the
// screen, then the filed state takes its place.
//
// Depends on: gsap (loaded by the page). Degrades to an instant swap without it
// and under prefers-reduced-motion.
(function () {
  "use strict";

  // --- Where submissions go -------------------------------------------------
  // Our own serverless function (site/api/case.js). It files the request in
  // Notion and optionally emails it — both credentials live in Vercel env vars,
  // never here, because anything in this file is public.
  var ENDPOINT = "/api/case";
  var MAX = 450;
  var INK_RED = "#e72b25";     // --dn-red, inlined for the generated SVG

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var form = $("#case-form");
  if (!form) return;

  var lastRef = "";      // shared with the attribution note filed afterwards
  var lastPageId = "";   // the Notion row to hang "found us via" on

  // The nav's link columns ship in an open <details> so they render without JS
  // on desktop; on small screens they collapse behind the [Menu] summary.
  var menu = $(".ct-menu");
  if (menu) {
    var narrow = window.matchMedia("(max-width: 767px)");
    var sync = function (mq) { if (mq.matches) menu.removeAttribute("open"); else menu.setAttribute("open", ""); };
    sync(narrow);
    (narrow.addEventListener ? narrow.addEventListener.bind(narrow, "change") : narrow.addListener.bind(narrow))(sync);
  }

  // ---- Inline fields grow with their content ------------------------------
  function sizeField(input) {
    var wrap = input.closest(".ct-field");
    if (!wrap) return;
    var sizer = $(".ct-sizer", wrap);
    if (sizer) sizer.textContent = input.value || input.placeholder || "";
  }
  $$(".ct-field input").forEach(function (input) {
    sizeField(input);
    input.addEventListener("input", function () { sizeField(input); clearError(); });
  });

  // ---- Brief: an inline blank that flows with the sentence ----------------
  var brief = $("#f-brief");
  var count = $("#f-brief-count");
  var briefLabel = $("#f-brief-label");

  // WV-67 — the caret anchor is stripped here, so nothing downstream (the
  // counter, the submitted brief, the analytics length) ever sees it. See
  // markBlank().
  var ZWSP = /\u200B/g;
  function briefValue() { return brief ? brief.textContent.replace(ZWSP, "") : ""; }

  // An empty <span contenteditable> holds no text node, and an inline box with
  // no text has no line box — so the browser has nowhere to paint a caret and
  // clicking the brief blinked nothing. (Typing worked; it just looked dead.)
  // A zero-width space is the smallest thing that gives the caret somewhere to
  // stand, and unlike a <br> it does not push the filler onto the next line.
  //
  // It also means the blank is no longer `:empty`, so the state that draws the
  // underline is a class now rather than that selector.
  function markBlank() {
    if (!brief) return;
    var empty = !briefValue().trim();
    brief.classList.toggle("is-blank", empty);
    if (empty && brief.textContent !== "\u200B") {
      brief.textContent = "\u200B";
      if (document.activeElement === brief) caretToEnd(brief);
    }
  }

  function updateCount() {
    if (count) count.textContent = String(Math.max(0, MAX - briefValue().length));
  }

  // While empty, pad ::before with enough spaces to carry the underline to the
  // end of the line it starts on — measured, because that distance depends on
  // the label width and the sheet width.
  function padBlank() {
    if (!brief || briefValue()) return;
    var paper = brief.closest(".ct-paper");
    if (!paper) return;
    var avail = brief.parentNode.getBoundingClientRect().width;
    var used = briefLabel ? briefLabel.getBoundingClientRect().width : 0;
    var probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
    probe.textContent = " ".repeat(20);
    brief.parentNode.appendChild(probe);
    var per = probe.getBoundingClientRect().width / 20;
    probe.remove();
    if (!per) return;
    var tail = count ? count.getBoundingClientRect().width + 6 : 24;
    // `used` is the label's own width; the collapsed newline between it and the
    // blank costs another space on top. Miss it and the filler runs one space
    // too long — and since that very space is the break opportunity, the whole
    // blank drops onto a line of its own, which left its rule sitting nearer the
    // line below than the label it belongs to. Two spaces of slack: one for the
    // gap, one for rounding.
    var room = avail - used - tail - per * 2;
    brief.dataset.fill = " ".repeat(Math.max(6, Math.floor(room / per)));
  }

  function caretToEnd(el) {
    var r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  if (brief) {
    // plaintext-only isn't universal; fall back and sanitise on the way in.
    if (brief.contentEditable !== "plaintext-only") brief.setAttribute("contenteditable", "true");

    brief.addEventListener("input", function () {
      var t = brief.textContent;
      if (t.length > MAX) { brief.textContent = t.slice(0, MAX); caretToEnd(brief); }
      updateCount();
      markBlank();
      padBlank();
      clearError();
    });
    brief.addEventListener("paste", function (e) {
      e.preventDefault();
      var t = ((e.clipboardData || window.clipboardData).getData("text") || "").replace(/\s+/g, " ");
      var room = MAX - briefValue().length;
      document.execCommand("insertText", false, t.slice(0, Math.max(0, room)));
    });
    // Keep it a single flowing paragraph — Enter would inject block markup.
    brief.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });

    updateCount();
    markBlank();
    padBlank();
    window.addEventListener("resize", padBlank);
  }

  // ---- The hand-drawn loop around a chosen option -------------------------
  // Drawn per option at its real pixel size, so the viewBox matches the box and
  // the stroke keeps an even weight (stretching one path distorts it into
  // something that reads as a CSS ellipse). Every loop is a wobbling, slightly
  // off-centre orbit that overshoots where the pen crosses its own start, and a
  // per-option seed means no two are identical.
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function smooth(pts) {
    // Catmull-Rom through the sampled points, emitted as cubics.
    var d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += "C" + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + " " + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) +
           " " + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + " " + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) +
           " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1);
    }
    return d;
  }

  function loop(w, h, rand, laps, ox, oy) {
    var cx = ox + w / 2 + (rand() - 0.5) * w * 0.03;
    var cy = oy + h / 2 + (rand() - 0.5) * h * 0.08;
    var rx = w / 2 + 1, ry = h / 2 + 1;
    var start = -0.5 * Math.PI + (rand() - 0.5) * 1.2;
    var sweep = Math.PI * 2 * laps + 0.3 + rand() * 0.6;   // overshoot past the start
    var N = Math.round(18 * laps), pts = [];
    for (var i = 0; i <= N; i++) {
      var t = i / N, a = start + sweep * t;
      var wob = 1 + (rand() - 0.5) * 0.13;                 // the hand isn't a compass
      var drift = 1 + t * 0.05;                            // second lap rides slightly wide
      pts.push([
        cx + Math.cos(a) * rx * wob * drift,
        cy + Math.sin(a) * ry * wob * drift,
      ]);
    }
    return smooth(pts);
  }

  // The loop lives in its own inline <svg> (not a background image) for two
  // reasons: a background can't be trim-path animated, and it gets clipped at
  // the element's box — which is what was slicing the ends off. The svg is
  // padded out past the text box and overflows visibly, so the whole stroke
  // shows and can be drawn on.
  var PAD_X = 8, PAD_Y = 6;
  // The option's box now hugs its text on the sides (so the rows align to the
  // sheet's left edge and the gaps measure text-to-text), so the loop takes its
  // horizontal breathing room from here instead of from the option's padding.
  var GROW_X = 5;

  function removeLoop(el) {
    var old = el.querySelector(".ct-loop");
    if (old) old.remove();
    el.classList.remove("is-drawn");
  }

  function scribble(el, seed, animate) {
    removeLoop(el);
    var r = el.getBoundingClientRect();
    var w = Math.max(24, Math.round(r.width) + GROW_X * 2), h = Math.max(14, Math.round(r.height));
    var W = w + PAD_X * 2, H = h + PAD_Y * 2;
    var rand = rng(seed);
    var laps = rand() < 0.3 ? 2 : 1;                       // now and then it goes round twice

    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "ct-loop");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.setAttribute("aria-hidden", "true");
    svg.style.left = -PAD_X + "px";
    svg.style.top = -PAD_Y + "px";

    var path = document.createElementNS(NS, "path");
    path.setAttribute("d", loop(w, h, rand, laps, PAD_X - GROW_X, PAD_Y));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", INK_RED);
    path.setAttribute("stroke-width", "1.9");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    el.appendChild(svg);
    el.classList.add("is-drawn");

    if (animate === false || reduced) return;

    // Trim-path: hide the stroke, then let it out — the pen drawing the loop.
    var len = path.getTotalLength();
    path.style.strokeDasharray = len + " " + len;
    path.style.strokeDashoffset = len;
    path.getBoundingClientRect();                          // commit before transitioning
    path.style.transition = "stroke-dashoffset " + (laps > 1 ? 620 : 400) +
      "ms cubic-bezier(.3,.7,.4,1)";
    path.style.strokeDashoffset = "0";
  }

  function unscribble(el) {
    var svg = el.querySelector(".ct-loop");
    if (!svg) { el.classList.remove("is-drawn"); return; }
    var path = svg.firstChild;
    if (reduced || !path) { removeLoop(el); return; }
    // Draw it back off the way it came.
    var len = path.getTotalLength();
    path.style.transition = "stroke-dashoffset 230ms cubic-bezier(.6,0,.8,.4)";
    path.style.strokeDashoffset = len;
    el.classList.remove("is-drawn");
    setTimeout(function () { if (svg.parentNode === el) svg.remove(); }, 250);
  }

  // ---- Chips ---------------------------------------------------------------
  var allChips = [];
  $$(".ct-chips").forEach(function (group) {
    var multi = group.hasAttribute("data-multi");
    var chips = $$(".ct-chip", group);
    chips.forEach(function (chip) {
      chip.setAttribute("aria-pressed", "false");
      chip.dataset.seed = String(allChips.length * 977 + 13);
      allChips.push(chip);
      chip.addEventListener("click", function () {
        var on = chip.getAttribute("aria-pressed") === "true";
        if (!multi) {
          chips.forEach(function (c) { c.setAttribute("aria-pressed", "false"); unscribble(c); });
        }
        if (on) { chip.setAttribute("aria-pressed", "false"); unscribble(chip); }
        else {
          chip.setAttribute("aria-pressed", "true");
          // Re-seed on each pass so re-picking never redraws the identical loop.
          chip.dataset.seed = String((parseInt(chip.dataset.seed, 10) || 13) + 7919);
          scribble(chip, parseInt(chip.dataset.seed, 10));
        }
        clearError();
      });
    });
  });
  // The options are sized in vw, so a resize changes their box — redraw the
  // loops at the new size rather than letting the old ones stretch.
  var redrawTimer;
  window.addEventListener("resize", function () {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(function () {
      allChips.forEach(function (c) {
        if (c.getAttribute("aria-pressed") === "true") scribble(c, parseInt(c.dataset.seed, 10) || 13, false);
      });
    }, 120);
  });
  function chosen(group) {
    return $$('.ct-chip[aria-pressed="true"]', group).map(function (c) { return c.dataset.value; });
  }

  // ---- Validation ----------------------------------------------------------
  var errorEl = $("#ct-error");
  function showError(msg, focusEl) {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.hidden = false;
    if (focusEl) focusEl.focus();
  }
  function clearError() {
    if (errorEl && !errorEl.hidden) { errorEl.hidden = true; errorEl.textContent = ""; }
  }

  function collect() {
    var groups = $$(".ct-chips");
    return {
      name: $("#f-name").value.trim(),
      email: $("#f-email").value.trim(),
      company: $("#f-company").value.trim(),
      needs: groups[0] ? chosen(groups[0]) : [],
      brief: briefValue().trim(),
      when: groups[1] ? (chosen(groups[1])[0] || "") : "",
    };
  }

  // Third element is a stable reason CODE for analytics. The message is copy and
  // will be rewritten; the code is the thing a chart can be built on.
  function validate(d) {
    if (!d.name) return ["Add your name so we know who is asking.", $("#f-name"), "name_missing"];
    if (!d.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return ["That email does not look right.", $("#f-email"), "email_invalid"];
    if (!d.company) return ["Tell us who you represent.", $("#f-company"), "company_missing"];
    if (!d.needs.length) return ["Pick at least one thing you need.", null, "needs_empty"];
    if (d.brief.length < 20) return ["A couple of sentences about the case, please.", brief, "brief_too_short"];
    if (!d.when) return ["Choose when you would like to begin.", null, "timing_missing"];
    return null;
  }

  // ---- Delivery ------------------------------------------------------------
  function post(payload) {
    // Fire-and-forget: the filed state reflects the person's action, not our
    // network. Failures are logged, not surfaced mid-animation.
    try {
      // The chain has to be returned: the caller races it against a 1.5s timer
      // to pick up Notion's real case number and the row id the attribution
      // note hangs off. Without the return this resolved to undefined instantly,
      // so the number on screen was always the locally minted one and "how'd
      // you find us" had no row to attach itself to.
      return fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (res) {
          if (res && res.ok === false) {
            console.error("[case-form] not delivered:", res);
            // A lead lost to a broken pipe reads identically to a quiet week
            // unless this is recorded. No payload — only that it failed and why.
            if (window.dnTrack) window.dnTrack("case_submit_failed", {
              kind: payload && payload.kind ? payload.kind : "case",
              reason: (res && res.error) ? String(res.error).slice(0, 120) : "rejected",
            });
          }
          return res;
        })
        .catch(function (err) {
          console.error("[case-form] submit failed", err);
          if (window.dnTrack) window.dnTrack("case_submit_failed", {
            kind: payload && payload.kind ? payload.kind : "case",
            reason: "network",
          });
          return null;
        });
    } catch (err) {
      console.error("[case-form] submit failed", err);
      return Promise.resolve(null);
    }
  }

  function casePayload(d, ref) {
    return {
      kind: "case",
      name: d.name,
      email: d.email,
      company: d.company,
      needs: d.needs,
      when: d.when,
      brief: d.brief,
      ref: ref,
      company_website: $("#company_website") ? $("#company_website").value : "",
      // Time on page; the server treats anything under 4s as a script.
      elapsed: Math.round(performance.now()),
    };
  }

  // ---- Fold the sheet in half and post it off-screen ----------------------
  function cloneSheet(paper, rect, offsetY) {
    var c = paper.cloneNode(true);
    c.removeAttribute("id");
    c.style.position = "absolute";
    c.style.left = "0";
    c.style.top = offsetY + "px";
    c.style.width = rect.width + "px";
    c.style.height = rect.height + "px";
    c.style.margin = "0";
    c.style.minHeight = "0";
    // cloneNode copies attributes, not live values — carry them over by hand,
    // otherwise the sheet flies away showing empty placeholders.
    var src = $$("input, textarea", paper);
    $$("input, textarea", c).forEach(function (el, i) {
      var from = src[i];
      if (!from) return;
      if (el.tagName === "TEXTAREA") el.textContent = from.value;
      else el.setAttribute("value", from.value);
    });
    return c;
  }

  // Every number the fold is made of, in one place so the ?foldtune panel can
  // drive them live (js/contact/fold-tune.js).
  var FOLD = {
    perspective: 1800,   // px — lower = more dramatic 3D
    fold: 0.72,          // s, the main swing
    ease: "power2.inOut",
    give: 7,             // deg it springs back at the crease
    settle: 0.31,        // s for that give + return
    dim: 0.2,            // how much the face loses as it turns edge-on (0–1)
    backLift: 0.1,       // how much the blank reverse brightens as it lands
    shadow: 1.5,         // cast-shadow strength multiplier
    shadowStart: 0.14,   // how far up the sheet the shadow already reaches at 0
    crease: 0.85,        // contact shadow on the fold line
    lift: 26,            // px it rises before flying
    flyDur: 0.82,        // s
    flyX: 128, flyY: -52, flyRot: 13, flyScale: 0.78,
  };
  if (typeof window !== "undefined") window.__FOLD = FOLD;

  // Builds the folding rig over a sheet and hands back a handle. Split out from
  // the animation so the tuning panel can scrub it by hand.
  function buildFoldRig(paper) {
    var r = paper.getBoundingClientRect();
    var half = r.height / 2;

    var stage = document.createElement("div");
    stage.className = "ct-fold-stage";
    stage.setAttribute("aria-hidden", "true");
    stage.style.left = r.left + "px";
    stage.style.top = r.top + "px";
    stage.style.width = r.width + "px";
    stage.style.height = r.height + "px";
    stage.style.perspective = FOLD.perspective + "px";

    // Upper half — stays put; the flap comes over it.
    var top = document.createElement("div");
    top.className = "ct-fold-half";
    top.style.top = "0";
    top.style.height = half + "px";
    var topFace = document.createElement("div");
    topFace.className = "ct-fold-face";
    topFace.appendChild(cloneSheet(paper, r, 0));
    var shade = document.createElement("div");
    shade.className = "ct-fold-shade";
    topFace.appendChild(shade);
    var crease = document.createElement("div");
    crease.className = "ct-fold-crease";
    topFace.appendChild(crease);
    top.appendChild(topFace);

    // Lower half — hinged on its top edge, so it folds up and over.
    var bot = document.createElement("div");
    bot.className = "ct-fold-half";
    bot.style.top = half + "px";
    bot.style.height = half + "px";
    bot.style.transformOrigin = "top center";
    var front = document.createElement("div");
    front.className = "ct-fold-face";
    front.appendChild(cloneSheet(paper, r, -half));
    var back = document.createElement("div");   // blank reverse of the sheet
    back.className = "ct-fold-face ct-fold-back";
    bot.appendChild(front);
    bot.appendChild(back);

    stage.appendChild(top);
    stage.appendChild(bot);
    document.body.appendChild(stage);
    paper.style.visibility = "hidden";

    // Light the fold off the actual angle rather than off time, so the shading
    // stays true if the ease changes: the face turns away from the light as it
    // goes edge-on, and the blank reverse picks the light up as it comes down.
    function light(degOverride) {
      var deg = degOverride != null ? Math.abs(degOverride)
        : Math.abs(window.gsap ? window.gsap.getProperty(bot, "rotationX") : 0);
      var p = Math.min(1, deg / 180);
      var edge = Math.sin(p * Math.PI);          // peaks at 90°, where it's thinnest
      // Gentle: paper turning away loses a little light, it doesn't become a
      // grey card. The cast shadow below carries most of the depth.
      front.style.filter = "brightness(" + (1 - FOLD.dim * edge) + ")";
      back.style.filter = "brightness(" + ((1 - FOLD.backLift) + FOLD.backLift * p) + ")";
      shade.style.opacity = Math.min(1, p * FOLD.shadow);
      shade.style.transform = "scaleY(" + (FOLD.shadowStart + (1 - FOLD.shadowStart) * p) + ")";
      crease.style.opacity = String(edge * FOLD.crease);
    }

    return {
      stage: stage, bot: bot, light: light,
      // Put the fold at an arbitrary angle — what the scrubber uses.
      setDeg: function (deg) { bot.style.transform = "rotateX(" + -deg + "deg)"; light(deg); },
      destroy: function () { stage.remove(); paper.style.visibility = ""; },
    };
  }

  function foldAway(paper) {
    return new Promise(function (resolve) {
      if (reduced || !window.gsap) { paper.style.display = "none"; resolve(); return; }

      var rig = buildFoldRig(paper);
      var gsap = window.gsap;
      var light = rig.light;
      var bot = rig.bot;
      var stage = rig.stage;

      gsap.timeline({
        onComplete: function () { stage.remove(); paper.style.display = "none"; resolve(); },
      })
        .to(bot, { rotationX: -180, duration: FOLD.fold, ease: FOLD.ease, onUpdate: light }, 0)
        // Paper doesn't stop dead — it gives a little at the crease and settles.
        .to(bot, { rotationX: -180 + FOLD.give, duration: FOLD.settle * 0.35, ease: "sine.out", onUpdate: light })
        .to(bot, { rotationX: -180, duration: FOLD.settle * 0.65, ease: "sine.inOut", onUpdate: light })
        // Once folded it is a thicker object: let it cast its own shadow.
        .to(stage, { filter: "drop-shadow(0 14px 22px rgba(0,0,0,0.45))", duration: 0.25 }, FOLD.fold * 0.85)
        .to(stage, { y: -FOLD.lift, duration: 0.3, ease: "power2.out" }, "-=0.1")
        .to(stage, {
          xPercent: FOLD.flyX, yPercent: FOLD.flyY, rotation: FOLD.flyRot,
          scale: FOLD.flyScale, opacity: 0,
          duration: FOLD.flyDur, ease: "power2.in",
        });
    });
  }

  // The sheet's exit. Cloth is the one we shipped; the CSS fold stays as the
  // fallback for anything without WebGL, and for reduced-motion we just cut.
  function dismiss(paper) {
    if (reduced || !window.gsap) { paper.style.display = "none"; return Promise.resolve(); }
    if (window.__cloth) {
      return window.__cloth.play(paper)
        .then(function () { paper.style.display = "none"; })
        .catch(function (err) {
          console.warn("[case-form] cloth unavailable, folding instead:", err && err.message);
          return foldAway(paper);
        });
    }
    return foldAway(paper);
  }

  // Handles for the tuning panel: replay or scrub the fold without submitting.
  if (typeof window !== "undefined") {
    window.__foldDemo = {
      rig: null,
      build: function () {
        if (this.rig) this.rig.destroy();
        this.rig = buildFoldRig(form);
        return this.rig;
      },
      scrub: function (deg) { (this.rig || this.build()).setDeg(deg); },
      reset: function () { if (this.rig) { this.rig.destroy(); this.rig = null; } },
      play: function () {
        this.reset();
        var self = this;
        var rig = buildFoldRig(form);
        this.rig = rig;
        var gsap = window.gsap;
        gsap.timeline({ onComplete: function () { rig.destroy(); self.rig = null; } })
          .to(rig.bot, { rotationX: -180, duration: FOLD.fold, ease: FOLD.ease, onUpdate: rig.light }, 0)
          .to(rig.bot, { rotationX: -180 + FOLD.give, duration: FOLD.settle * 0.35, ease: "sine.out", onUpdate: rig.light })
          .to(rig.bot, { rotationX: -180, duration: FOLD.settle * 0.65, ease: "sine.inOut", onUpdate: rig.light })
          .to(rig.stage, { filter: "drop-shadow(0 14px 22px rgba(0,0,0,0.45))", duration: 0.25 }, FOLD.fold * 0.85)
          .to(rig.stage, { y: -FOLD.lift, duration: 0.3, ease: "power2.out" }, "-=0.1")
          .to(rig.stage, {
            xPercent: FOLD.flyX, yPercent: FOLD.flyY, rotation: FOLD.flyRot,
            scale: FOLD.flyScale, opacity: 0,
            duration: FOLD.flyDur, ease: "power2.in",
          });
      },
    };
  }

  // ---- Filed state ---------------------------------------------------------
  function pad(n) { return String(n).padStart(2, "0"); }

  function newRef() {
    return String(Math.floor(Date.now() / 1000) % 10000).padStart(4, "0");
  }

  function reveal(ref) {
    var now = new Date();
    var stamp = pad(now.getDate()) + "." + pad(now.getMonth() + 1) + "." + now.getFullYear();

    var filed = $("[data-filed-date]");
    if (filed) filed.textContent = stamp;
    var caseNo = $("[data-case-no]");
    if (caseNo) caseNo.textContent = ref;

    document.body.classList.add("is-filed");
    var success = $("#ct-success");
    if (success) success.hidden = false;
    var howd = $("#ct-howd");
    if (howd) howd.hidden = false;

    if (window.gsap && !reduced && success) {
      window.gsap.fromTo(success, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" });
    }
  }

  // ---- Submit --------------------------------------------------------------
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var d = collect();
    var bad = validate(d);
    if (bad) {
      showError(bad[0], bad[1]);
      // Which gate turned them away. Nothing else answers this.
      if (window.dnTrack) window.dnTrack("case_form_invalid", { reason: bad[2] });
      return;
    }
    clearError();

    // analytics-events.js listens for this instead of "submit". preventDefault
    // above does NOT stop propagation to a second listener on this element, so
    // a plain submit listener there counts every rejected attempt as a filing.
    try { form.dispatchEvent(new CustomEvent("dn:case-valid")); } catch (e) {}

    var btn = $(".ct-file", form);
    if (btn) btn.disabled = true;

    // One reference, minted before sending, so the number on screen is the same
    // one that lands in Notion.
    var ref = newRef();
    // Guarded so a delivery failure can never stop the sheet from being filed.
    var sent;
    try { sent = post(casePayload(d, ref)); }
    catch (err) { console.error("[case-form] delivery failed", err); sent = Promise.resolve(null); }

    // Notion mints the real case number ("Case ref" is an auto-increment id), so
    // show that if it comes back in time — but race it against a short timer so
    // a slow or dead network can never hold the filed screen hostage.
    var settled = Promise.race([
      sent,
      new Promise(function (r) { setTimeout(function () { r(null); }, 1500); }),
    ]);

    Promise.all([dismiss(form), settled]).then(function (out) {
      var res = out[1];
      // Notion's is a plain auto-increment ("5"); the sheet sets it as a
      // four-figure case number, same as the locally minted fallback.
      var finalRef = (res && res.ref) ? String(res.ref).padStart(4, "0") : ref;
      lastRef = finalRef;
      if (res && res.pageId) lastPageId = res.pageId;
      reveal(finalRef);
    });

    // Delivery is what the server actually said — NOT what arrived inside the
    // screen's 1.5s budget. This used to hang off `settled`, so a Notion write
    // that took longer than the race was recorded as undelivered while it
    // completed perfectly: "delivered" really meant "answered within 1.5s", and
    // the only real lead of the period read as lost. `sent` never rejects —
    // post() catches and resolves null — but the guard costs nothing.
    sent.then(function (res) {
      // If the race timed out first, the row id arrives here. Adopt it so the
      // "how'd you find us" note still has a row to attach itself to.
      if (res && res.pageId) lastPageId = res.pageId;
      try {
        form.dispatchEvent(new CustomEvent("dn:case-confirmed", {
          detail: { delivered: !!(res && res.ok === true) },
        }));
      } catch (e) {}
    }).catch(function () {});
  });

  // ---- "How'd you find us" -------------------------------------------------
  var howdForm = $("#ct-howd");
  if (howdForm) {
    howdForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = $("#f-howd");
      var val = input ? input.value.trim() : "";
      if (!val) return;
      try { howdForm.dispatchEvent(new CustomEvent("dn:attribution-valid")); } catch (e) {}
      post({ kind: "attribution", howd: val, ref: lastRef, pageId: lastPageId });
      howdForm.innerHTML = '<p style="margin:0">Noted — thank you. ✓</p>';
    });
  }

  // ---- Arrival (WV-41) -----------------------------------------------------
  // The sheet left as cloth and came back by simply existing. It now arrives the
  // way it leaves — window.__cloth.playIn is play() mirrored.
  //
  // Two things have to be true or the form must appear untouched, because a
  // sheet nobody can see is worse than a sheet with no entrance:
  //   · nothing here hides .ct-paper. __cloth.open() is the only thing that
  //     does, and only once it holds a rasterised texture to put in its place —
  //     so a missing WebGL context, a failed snapshot or a thrown promise all
  //     land on a page that just shows the form.
  //   · the timeline is capped. If playIn never settles, the failsafe clears the
  //     visibility the rig set and the form is there.
  //
  // Timing rides the page transition: js/transition.js holds a black overlay
  // over the whole page and stamps .dn-revealed on <html> when it starts opening
  // the ink. Starting then means the snapshot is prepared behind the black and
  // the sheet flies in as the page is uncovered, rather than performing to a
  // covered screen. Direct hits that never run a transition fall through the
  // same cap.
  (function arrival() {
    if (reduced || !window.gsap || !window.__cloth) return;
    var paper = $(".ct-paper");
    if (!paper) return;

    var started = false;
    function go() {
      if (started) return;
      started = true;
      clearTimeout(capT);
      if (mo) mo.disconnect();
      var failsafe = setTimeout(function () { paper.style.visibility = ""; }, 4000);
      window.__cloth.playIn(paper)
        .catch(function (err) {
          console.warn("[case-form] no cloth arrival:", err && err.message);
          window.__cloth.reset(paper);
        })
        .then(function () { clearTimeout(failsafe); paper.style.visibility = ""; });
    }

    var root = document.documentElement;
    if (root.classList.contains("dn-revealed") || !root.classList.contains("dn-anim")) { go(); return; }
    var mo = new MutationObserver(function () {
      if (root.classList.contains("dn-revealed")) go();
    });
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    // The inline bootstrap in contact.html gives up on the transition after
    // 2.5s; never wait longer than that for a reveal that may not come.
    var capT = setTimeout(go, 2600);
  })();

  // ---- Close ---------------------------------------------------------------
  // Prefer stepping back so the home page keeps its scroll position; the href
  // is the fallback when this page was opened directly.
  var close = $(".ct-close");
  if (close) {
    close.addEventListener("click", function (e) {
      if (document.referrer && document.referrer.indexOf(location.origin) === 0) {
        e.preventDefault();
        history.back();
      }
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !document.body.classList.contains("is-filed")) {
      if (close) close.click();
    }
  });
})();
