// Page transition — WebGL ink. Coverage grows from the click point, its front
// broken into fingers + wisps by domain-warped fbm noise (viscous-fingering /
// surface-tension imitation) with a soft feathered edge. OUT: ink blooms from
// the click point to pitch black. IN: a clear hole opens FROM the same point and
// grows (u_reveal flips the front). Self-driven rAF (no GSAP dependency) so it's
// consistent on every page. Falls back to an instant cover if WebGL is missing
// or for prefers-reduced-motion.
(function () {
  var overlay, canvas, gl, prog, loc = {}, buf;
  var W = 0, H = 0, dpr = 1, busy = false, ok = false, revealMode = false;
  var origin = [0.5, 0.5], maxr = 1.5, seed = 1;

  var VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}";
  var FRAG =
    "precision highp float;" +
    "uniform vec2 u_res;uniform vec2 u_origin;uniform float u_progress;uniform float u_maxr;uniform float u_seed;uniform float u_reveal;" +
    "vec2 h2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return -1.0+2.0*fract(sin(p)*43758.5453123);}" +
    "float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.0-2.0*f);" +
    "return mix(mix(dot(h2(i),f),dot(h2(i+vec2(1.0,0.0)),f-vec2(1.0,0.0)),u.x)," +
    "mix(dot(h2(i+vec2(0.0,1.0)),f-vec2(0.0,1.0)),dot(h2(i+vec2(1.0,1.0)),f-vec2(1.0,1.0)),u.x),u.y);}" +
    "float fbm(vec2 p){float s=0.0,a=0.5;for(int i=0;i<5;i++){s+=a*n(p);p=p*2.02;a*=0.5;}return s;}" +
    // ridged fbm — sharp crests (1-|n|)^2 → spiky tendrils/filaments, not smooth blobs
    "float rf(vec2 p){float s=0.0,a=0.5,t=0.0;for(int i=0;i<5;i++){float v=1.0-abs(n(p));v*=v;s+=a*v;t+=a;p=p*2.1+1.7;a*=0.5;}return s/t;}" +
    "void main(){" +
    "vec2 px=vec2(gl_FragCoord.x,u_res.y-gl_FragCoord.y);float mn=min(u_res.x,u_res.y);" +   // top-down, matches click coords
    "vec2 uv=(px-u_origin)/mn;float r=length(uv);" +
    "vec2 q=uv*2.4+u_seed;vec2 w=vec2(fbm(q),fbm(q+5.2))*0.5;" +          // warp for organic curl
    "float ang=atan(uv.y,uv.x);" +
    "float bend=fbm(uv*1.6+u_seed*1.3)*0.6*(0.5+r*0.7);" +               // curve 0.6
    "vec2 dir=vec2(cos(ang+bend),sin(ang+bend));" +
    "float rays=pow(rf(dir*6.1+uv*0.6+u_seed),2.4);" +                    // rayFreq 6.1 / rayPow 2.4
    "float fila=rf((uv+w)*15.4-u_seed*1.3);" +                           // filaFreq 15.4
    "float sc=0.23+0.77*u_progress;" +                                   // scBase 0.23
    "float field=r-(rays*0.46+fila*0.155)*sc;" +                         // rayWeight 0.46 / filaWeight 0.155
    "float a;" +
    "if(u_reveal>0.5){float thr=u_progress*(u_maxr+0.5)-0.36;a=smoothstep(thr-0.038,thr+0.0114,field);}" +  // inMargin 0.5 / inOffset 0.36 / edge 0.038
    "else{float thr=u_progress*(u_maxr+0.08);a=smoothstep(thr+0.038,thr-0.0114,field);}" +                  // outMargin 0.08 / edge 0.038
    "gl_FragColor=vec4(0.0,0.0,0.0,clamp(a,0.0,1.0));}";

  function grab() { overlay = document.getElementById("dn-transition"); if (!overlay) return false; canvas = overlay.querySelector("canvas"); return !!canvas; }
  function reduced() { return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; }

  function compile(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error("[dn-ink]", gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  function initGL() {
    try { gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false })
      || canvas.getContext("experimental-webgl", { alpha: true, premultipliedAlpha: true }); } catch (e) {}
    if (!gl) return false;
    var vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var pl = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
    ["res", "origin", "progress", "maxr", "seed", "reveal"].forEach(function (k) { loc[k] = gl.getUniformLocation(prog, "u_" + k); });
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    resize();
    return true;
  }
  function resize() {
    // Cap render resolution — desktop dpr2, phones 1.5 (halves the fragment work;
    // invisible on a fast full-screen mask). Keeps the shader cheap on weak GPUs.
    var cap = (window.matchMedia && matchMedia("(max-width: 767px)").matches) ? 1.5 : 2;
    dpr = Math.min(window.devicePixelRatio || 1, cap);
    W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr);
    canvas.width = W; canvas.height = H; if (gl) gl.viewport(0, 0, W, H);
  }
  function computeMaxr() {
    var mn = Math.min(W, H), ox = origin[0] * W, oy = origin[1] * H;
    maxr = Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy)) / mn;
  }
  function render(p) {
    if (!ok || gl.isContextLost()) return;
    gl.uniform2f(loc.res, W, H);
    gl.uniform2f(loc.origin, origin[0] * W, origin[1] * H);   // top-down px (shader flips gl_FragCoord.y)
    gl.uniform1f(loc.progress, p);
    gl.uniform1f(loc.maxr, maxr);
    gl.uniform1f(loc.seed, seed);
    gl.uniform1f(loc.reveal, revealMode ? 1 : 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  window.__dnInkRender = function (p, ox, oy, rev) { if (typeof ox === "number") origin = [ox, oy]; revealMode = !!rev; resize(); computeMaxr(); render(p); };

  // Origin in plain top-down normalized coords (the shader flips gl_FragCoord.y).
  function setOrigin(xPx, yPx) { origin = [xPx / innerWidth, yPx / innerHeight]; }
  function storedOrigin() {
    var x = parseFloat(sessionStorage.getItem("dnInkX")), y = parseFloat(sessionStorage.getItem("dnInkY"));
    if (isNaN(x) || isNaN(y)) return [0.5, 0.5];
    return [x / innerWidth, y / innerHeight];
  }

  // cubic-bezier easing (tune per stage in lab/ink-lab.html; paste the curves here)
  function bezier(x1, y1, x2, y2) {
    function A(a, b) { return 1 - 3 * b + 3 * a; } function B(a, b) { return 3 * b - 6 * a; } function C(a) { return 3 * a; }
    function cx(t) { return ((A(x1, x2) * t + B(x1, x2)) * t + C(x1)) * t; }
    function cy(t) { return ((A(y1, y2) * t + B(y1, y2)) * t + C(y1)) * t; }
    function sx(t) { return 3 * A(x1, x2) * t * t + 2 * B(x1, x2) * t + C(x1); }
    return function (x) { if (x <= 0) return 0; if (x >= 1) return 1; var t = x, i, s; for (i = 0; i < 6; i++) { s = sx(t); if (!s) break; t -= (cx(t) - x) / s; } return cy(t); };
  }
  var easeOutBez = bezier(0.704, 0.051, 1, 0.075);   // OUT stage
  var easeInBez = bezier(0.259, 0.537, 0.551, 0.983); // IN stage
  // rAF driver with a timer safety, so a throttled/backgrounded tab still finishes.
  function run(dur, ease, onFrame, onDone) {
    var t0 = performance.now(), raf, fin = false, sf;
    function done() { if (fin) return; fin = true; cancelAnimationFrame(raf); clearTimeout(sf); onFrame(1); if (onDone) onDone(); }
    function frame(now) { if (fin) return; var t = Math.min(1, (now - t0) / dur); onFrame(ease(t)); if (t < 1) raf = requestAnimationFrame(frame); else done(); }
    raf = requestAnimationFrame(frame);
    sf = setTimeout(done, dur + 600);
  }

  function reveal() {
    if (!grab()) return;
    if (!ok || gl.isContextLost()) ok = initGL();          // recover after bfcache
    document.documentElement.classList.add("dn-revealed");
    overlay.style.visibility = "visible"; overlay.style.pointerEvents = "none";
    // IN opens from a random corner/edge (slightly off-screen) — NOT the click
    // point — so the reveal doesn't mirror the bloom. Reads far more natural.
    var pts = [[-0.06, -0.06], [1.06, -0.06], [-0.06, 1.06], [1.06, 1.06], [0.5, -0.08], [0.5, 1.08], [-0.08, 0.5], [1.08, 0.5]];
    origin = pts[Math.floor(Math.random() * pts.length)];
    seed = 1 + Math.floor(Math.random() * 60);
    revealMode = true;
    window.scrollTo(0, 0);
    if (window.lenis) { try { window.lenis.scrollTo(0, { immediate: true }); window.lenis.start(); } catch (e) {} }
    deepLink();   // arriving from another page's #section link → land on that section
    var done = function () {
      overlay.style.visibility = "hidden"; overlay.style.pointerEvents = "none";
      overlay.style.background = "none"; document.documentElement.classList.remove("dn-anim");
    };
    if (!ok || reduced()) { done(); return; }
    resize(); computeMaxr(); render(0); overlay.style.background = "none";   // hand off CSS black -> canvas
    run(970, easeInBez, render, done);
  }

  function navigate(href, x, y) {
    if (busy || !grab()) { location.href = href; return; }
    busy = true;
    if (typeof x !== "number" || isNaN(x)) x = innerWidth / 2;
    if (typeof y !== "number" || isNaN(y)) y = innerHeight / 2;
    sessionStorage.setItem("dnInkX", x); sessionStorage.setItem("dnInkY", y);
    seed = 1 + (Math.floor(performance.now()) % 60); sessionStorage.setItem("dnInkS", seed);
    setOrigin(x, y); revealMode = false;
    if (window.lenis) { try { window.lenis.stop(); } catch (e) {} }
    document.documentElement.classList.add("dn-anim");
    overlay.style.visibility = "visible"; overlay.style.pointerEvents = "auto";
    var went = false, go = function () { if (went) return; went = true; location.href = href; };
    if (!ok || gl.isContextLost() || reduced()) { overlay.style.background = "#000"; setTimeout(go, 60); return; }
    resize(); computeMaxr(); overlay.style.background = "none"; render(0);
    run(660, easeOutBez, render, go);
  }
  window.dnNavigate = navigate;

  // Deep-link: reveal() resets scroll to the top on every load, which would
  // swallow a #section hash arriving from another page (e.g. a case page's
  // footer "Cases" → index.html#cases-section). Re-scroll to the target once,
  // re-asserting across a few frames + a late tick so pinned ScrollTriggers
  // that shift the section's offset have settled.
  // scrollType.js owns where a section reads as starting (the dossier is pinned,
  // so its element offset is not it). Same resolver, so a deep link and a click
  // can never disagree.
  function targetScroll(el) {
    if (typeof window.dnSectionScrollY === "function") return window.dnSectionScrollY(el);
    return el.getBoundingClientRect().top + (window.pageYOffset || window.scrollY || 0);
  }

  function deepLink() {
    var h = location.hash;
    if (!h || h.length < 2) return;
    var el; try { el = document.querySelector(h); } catch (e) { return; }
    if (!el) return;
    var land = function () {
      if (window.ScrollTrigger) { try { window.ScrollTrigger.refresh(); } catch (e) {} }
      var y = targetScroll(el);
      if (window.lenis && window.lenis.scrollTo) window.lenis.scrollTo(y, { immediate: true });
      else window.scrollTo(0, y);
    };
    requestAnimationFrame(function () { requestAnimationFrame(function () { land(); requestAnimationFrame(land); }); });
    setTimeout(land, 350);
  }

  // Cross-page links: cover with the ink, then navigate. Same-page #anchors are
  // not ours — scrollType.js owns those.
  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest("a") : null;
    if (!a || !a.getAttribute) return;
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) === "#") return;
    if (a.target === "_blank" || a.hasAttribute("download")) return;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return;
    var url; try { url = new URL(a.href, location.href); } catch (_) { return; }
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname) return;
    e.preventDefault();
    navigate(a.href, e.clientX, e.clientY);
  }

  function init() {
    if (!grab()) return;
    ok = initGL();
    if (history.scrollRestoration) history.scrollRestoration = "manual";
    addEventListener("resize", function () { if (ok) resize(); });
    reveal();
    document.addEventListener("click", onClick, true);
    // Back/forward: bfcache restore doesn't fire load, and the GL context may be
    // lost — re-cover and reveal from the stored point.
    addEventListener("pageshow", function (e) {
      if (e.persisted) { busy = false; document.documentElement.classList.add("dn-anim"); overlay.style.background = "#000"; reveal(); }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
