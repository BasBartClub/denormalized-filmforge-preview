// Record match-cut: clicking an insights article launches the vinyl record off
// the right edge; on the destination page (article.html) the 3D turntable record
// slides in from the left (turntable.js reads the same flag). A transient fixed
// stage layered above the ink page transition. Self-contained (own rAF tween +
// injected styles) so it works on every page regardless of GSAP / main stylesheet.
//
// Layering: the record clone sits BEHIND a static clone of the cover (the sleeve),
// both on a stage above the ink. The record slides out from behind the sleeve's
// right edge and escapes right — so it never pops ON TOP of the cover.
(function () {
  var FLAG = "dnRecFly";

  // Shared easing with the ink page transition (js/transition.js).
  function bezier(x1, y1, x2, y2) {
    function A(a, b) { return 1 - 3 * b + 3 * a; }
    function B(a, b) { return 3 * b - 6 * a; }
    function C(a) { return 3 * a; }
    function calc(t, a, b) { return ((A(a, b) * t + B(a, b)) * t + C(a)) * t; }
    function slope(t, a, b) { return 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a); }
    function solve(x) {
      var t = x;
      for (var i = 0; i < 6; i++) { var s = slope(t, x1, x2); if (s === 0) break; var e = calc(t, x1, x2) - x; t -= e / s; }
      return t;
    }
    return function (t) { if (t <= 0) return 0; if (t >= 1) return 1; return calc(solve(t), y1, y2); };
  }
  var easeOutBez = bezier(0.704, 0.051, 1, 0.075);   // ink OUT stage
  var easeInBez = bezier(0.259, 0.537, 0.551, 0.983); // ink IN stage

  function ensureStyle() {
    if (document.getElementById("dn-flyrecord-css")) return;
    var s = document.createElement("style"); s.id = "dn-flyrecord-css";
    s.textContent =
      ".dn-recfly-stage{position:fixed;inset:0;z-index:2147483600;pointer-events:none;overflow:visible}" +
      ".dn-flyrecord{position:fixed;pointer-events:none;will-change:transform}" +
      ".dn-flyrecord .d{width:100%;height:100%;border-radius:50%;display:flex;align-items:center;justify-content:center;" +
      "background:radial-gradient(circle at 50% 40%,rgba(255,255,255,.1),transparent 55%)," +
      "repeating-radial-gradient(circle at 50% 50%,#0d0d0d 0 1.5px,#1c1c1c 1.5px 3px);" +
      "box-shadow:0 30px 70px rgba(0,0,0,.5),inset 0 0 60px rgba(0,0,0,.7)}" +
      ".dn-flyrecord .l{width:32%;height:32%;border-radius:50%;" +
      "background:radial-gradient(circle at 50% 50%,#0a0a0a 0 8%,#e72b25 9% 100%)}" +
      ".dn-flycover{position:fixed;background-size:cover;background-position:50% 50%;will-change:transform}";
    document.head.appendChild(s);
  }

  function drive(el, dur, ease, apply, onDone) {
    var t0 = performance.now(), raf, done = false, sf;
    function fin() { if (done) return; done = true; cancelAnimationFrame(raf); clearTimeout(sf); apply(1); if (onDone) onDone(); }
    function frame(now) { if (done) return; var t = Math.min(1, (now - t0) / dur); apply(ease(t)); if (t < 1) raf = requestAnimationFrame(frame); else fin(); }
    apply(0); raf = requestAnimationFrame(frame); sf = setTimeout(fin, dur + 500);
  }

  // OUT — insights article click → record slides out from behind the sleeve and
  // escapes right, over the ink, with the ink's OUT easing.
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest(".is-abs-blog");
    if (!a || !a.getAttribute("href")) return;
    var cover = a.querySelector(".blog-image_contant");
    var vinyl = a.querySelector(".dn-vinyl");
    if (!cover) return;
    var cr = cover.getBoundingClientRect();
    var vr = vinyl ? vinyl.getBoundingClientRect() : cr;
    var size = Math.round(vr.width);

    sessionStorage.setItem(FLAG, "1");
    sessionStorage.setItem(FLAG + "Y", Math.round(vr.top));
    sessionStorage.setItem(FLAG + "S", size);

    ensureStyle();
    var stage = document.createElement("div"); stage.className = "dn-recfly-stage"; stage.setAttribute("aria-hidden", "true");

    var rec = document.createElement("div"); rec.className = "dn-flyrecord";
    rec.style.left = vr.left + "px"; rec.style.top = vr.top + "px";
    rec.style.width = size + "px"; rec.style.height = size + "px"; rec.style.zIndex = "1";
    rec.innerHTML = '<div class="d"><span class="l"></span></div>';

    var cov = document.createElement("div"); cov.className = "dn-flycover";
    cov.style.left = cr.left + "px"; cov.style.top = cr.top + "px";
    cov.style.width = cr.width + "px"; cov.style.height = cr.height + "px"; cov.style.zIndex = "2";
    var cs = getComputedStyle(cover);
    cov.style.backgroundImage = cs.backgroundImage;
    cov.style.borderRadius = cs.borderRadius;
    cov.style.transform = cover.style.transform || "";  // preserve the hover shift if any

    stage.appendChild(rec); stage.appendChild(cov);
    document.body.appendChild(stage);

    // hide the real (in-swiper) sleeve so we don't see a double
    var wrap = cover.closest(".dn-cover-wrap"); if (wrap) wrap.style.visibility = "hidden";

    var xEnd = window.innerWidth - vr.left + size;  // clear the right edge fully
    drive(rec, 640, easeOutBez, function (p) {
      rec.style.transform = "translateX(" + (xEnd * p) + "px) rotate(" + (440 * p) + "deg)";
    }, function () { stage.remove(); });
  }, false);

  // IN — fallback for any non-article destination (article.html handles its own
  // 3D record). A flat record flies in from the left to centre and fades.
  function flyIn() {
    if (sessionStorage.getItem(FLAG) !== "1") return;
    // WV-32: placeholder pages have no record to match-cut into — consume the flag
    // and show nothing, so no stray record flies in.
    if (/placeholder/i.test(location.pathname)) { sessionStorage.removeItem(FLAG); return; }
    if (document.querySelector(".ar-record")) return;   // article handles its own record
    sessionStorage.removeItem(FLAG);
    ensureStyle();
    var size = parseFloat(sessionStorage.getItem(FLAG + "S")) || Math.round(window.innerHeight * 0.5);
    var y = parseFloat(sessionStorage.getItem(FLAG + "Y"));
    if (isNaN(y)) y = window.innerHeight / 2 - size / 2;
    var stage = document.createElement("div"); stage.className = "dn-recfly-stage";
    var rec = document.createElement("div"); rec.className = "dn-flyrecord";
    rec.style.top = y + "px"; rec.style.width = size + "px"; rec.style.height = size + "px";
    rec.innerHTML = '<div class="d"><span class="l"></span></div>';
    stage.appendChild(rec); document.body.appendChild(stage);
    var x0 = -size * 1.5, x1 = window.innerWidth / 2 - size / 2;
    rec.style.left = x0 + "px";
    drive(rec, 950, easeInBez, function (p) {
      rec.style.transform = "translateX(" + ((x1 - x0) * p) + "px) rotate(" + (-320 + 320 * p) + "deg)";
    }, function () {
      drive(rec, 520, easeInBez, function (p) { rec.style.opacity = String(1 - p); }, function () { stage.remove(); });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", flyIn);
  else flyIn();

  // WV-25: the OUT click hides the clicked cover-wrap (visibility:hidden) so the
  // flying clone isn't doubled. On browser BACK the page is restored from bfcache
  // with that inline style intact → the cover stays invisible. Un-hide on every
  // pageshow (harmless when nothing is hidden).
  window.addEventListener("pageshow", function () {
    var wraps = document.querySelectorAll(".dn-cover-wrap");
    for (var i = 0; i < wraps.length; i++) wraps[i].style.visibility = "";
  });
})();
