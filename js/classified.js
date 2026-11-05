// Classified → ink-bleed reveal (WebGL).
// Replaces the archived scroll word-assembly (data-effect10) on the "two minds"
// paragraph. The phrases below render as black redaction bars painted by a
// fragment shader — fractal-noise (fbm) dissolve with domain-warp distortion,
// so hovering a phrase makes the ink BLEED away (liquid edges), not a CSS wipe.
//
// One transparent <canvas> overlays the <h3>. Each phrase is wrapped in a span
// (hover target); its per-line client rects become ink bars. Text lives in the
// DOM behind the canvas, revealed as the ink dissolves. GL readPixels-friendly.

const PHRASES = [
  "more, when justified",
  "ask annoying questions",
  "and makes it obvious",
];
const MAX_BARS = 12;

const VERT = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform int   uCount;
uniform vec4  uBars[${MAX_BARS}];   // px: x,y (top-left), w,h
uniform float uProg[${MAX_BARS}];   // 0 = solid ink, 1 = fully bled away
uniform vec2  uCursor[${MAX_BARS}]; // px: reagent-splash origin (cursor) per bar
uniform float uSpikeScale;          // px per spike feature (dev: size)
uniform float uSpikeAmp;            // spike/tendril amplitude (dev: amplitude)
uniform float uWarp;                // flow distortion amount (dev: displacement)
uniform float uSoft;                // edge softness band

float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i+vec2(1.,0.)), c = hash(i+vec2(0.,1.)), d = hash(i+vec2(1.,1.));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ v += a*vnoise(p); p = p*2.0 + 17.0; a *= 0.5; }
  return v;
}

void main(){
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y); // top-left origin
  float ink = 0.0;
  for(int i=0;i<${MAX_BARS};i++){
    if(i >= uCount) break;
    vec4 b = uBars[i];
    // test a padded region so the noisy edge can bleed slightly OUTSIDE the rect
    if(frag.x < b.x-9.0 || frag.x > b.x+b.z+9.0 || frag.y < b.y-9.0 || frag.y > b.y+b.w+9.0) continue;
    vec2 p = frag - b.xy;                       // px from bar top-left
    float prog = uProg[i];

    // --- inky, irregular outer edge (ALWAYS on, even at rest) ---
    // signed distance to the rect (positive inside), wobbled by noise so the
    // boundary reads like a soaked-in ink stain, not a clean rectangle.
    vec2 dd = min(p, b.zw - p);
    float edgeDist = min(dd.x, dd.y);
    float wob = (fbm(p/18.0 + 11.0) - 0.5) * 9.0;   // ±4.5px organic wobble
    float edge = smoothstep(-1.0, 4.0, edgeDist + wob);

    // --- reagent-splash dissolve: a droplet lands at the CURSOR and spreads,
    //     with more droplets landing across the bar; every front is a wet,
    //     flowing, expanding blob — the reveal completes by blobs OVERLAPPING,
    //     never a lazy fade-through-transparency ---
    float ar = b.z / max(b.w, 1.0);
    vec2 uvA = vec2((p.x / b.w), (p.y / b.w));  // px / bar-height → isotropic, height=1 unit
    // flow / displacement (dev: uWarp), sampled in physical px so it doesn't
    // stretch with the bar
    vec2 flow = vec2(fbm(p/70.0 + uTime*0.06), fbm(p/70.0 + vec2(4.1,9.2) - uTime*0.05)) - 0.5;
    vec2 uvF = uvA + flow*uWarp;

    // cursor origin, clamped onto this bar (same units as uvA)
    vec2 cpx = clamp(uCursor[i], b.xy, b.xy + b.zw);
    vec2 cursorC = (cpx - b.xy) / b.w;

    // furthest reagent reach (signed: >0 where the reagent has arrived)
    float reach = -100.0;
    for(int s=0; s<8; s++){
      float fs = float(s);
      vec2 c; float onset; float rmax;
      if(s == 0){
        c = cursorC; onset = 0.0;              // the cursor splash: first & largest
        rmax = ar*0.145 + 0.45;
      } else {
        float h1 = hash(b.xy*0.017 + fs*7.3);
        float h2 = hash(b.xy*0.017 + fs*3.1 + 5.0);
        float h3 = hash(b.xy*0.017 + fs*1.9 + 11.0);
        c = vec2(((fs - 0.5)/7.0 + (h1-0.5)*0.30) * ar, 0.5 + (h2-0.5)*0.85);
        onset = 0.1 + h3*0.72;                 // droplets keep landing to the very end
        rmax = ar/7.0 * 1.0 + 0.35;
      }
      float pl = clamp((prog - onset) / max(1.0 - onset, 0.12), 0.0, 2.3);
      // only contribute once active → NO holes at the splash centres in the idle state
      if(pl > 0.0) reach = max(reach, pl*rmax - distance(uvF, c));
    }
    // spikes at a PHYSICAL feature size (uSpikeScale px) so they stay big regardless
    // of bar size, with a big amplitude (uSpikeAmp) → dramatic wavy tendrils + specks
    vec2 sp = p / max(uSpikeScale, 1.0);
    float spikes = (fbm(sp + uTime*0.25) - 0.5) * 1.0
                 + (fbm(sp*2.3 + 3.0) - 0.5) * 0.55
                 + (vnoise(sp*5.5) - 0.5) * 0.28;
    // confine spikes to the moving FRONT: behind it clears fully (no leftover
    // specks), ahead it stays solid — only the boundary gets the tendrils
    float spikeFade = 1.0 - smoothstep(0.0, max(uSpikeAmp*1.7, 0.3), reach);
    reach += spikes * uSpikeAmp * spikeFade;
    float dissolved = smoothstep(-uSoft, uSoft, reach);  // crisp spiky edge
    ink = max(ink, edge * (1.0 - dissolved));
  }
  if(ink <= 0.003) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, ink);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("[classified] shader:", gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

function wrapPhrases(host) {
  let html = host.innerHTML;
  PHRASES.forEach((phrase, gi) => {
    html = html.replace(
      phrase,
      `<span class="dn-classified" data-dn-g="${gi}" tabindex="0" role="button" aria-label="Reveal classified text">${phrase}</span>`,
    );
  });
  host.innerHTML = html;
  return [...host.querySelectorAll(".dn-classified")];
}

// Last resort only — no WebGL at all. Flat bars that toggle, so the phrases
// still read as classified and can still be opened. This is NOT the mobile
// path: a phone gets the same ink dissolve as a desktop, driven by tap.
function staticFallback(host, spans) {
  host.classList.add("dn-secure--static");
  spans.forEach((s) => {
    s.setAttribute("aria-expanded", "false");
    const toggle = () => {
      const open = s.classList.toggle("is-open");
      s.setAttribute("aria-expanded", open ? "true" : "false");
      s.setAttribute("aria-label", open ? "Hide classified text" : "Reveal classified text");
    };
    s.addEventListener("click", toggle);
    s.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
  });
}

function init() {
  const host = document.querySelector(".dn-secure");
  if (!host || host.dataset.dnDone) return;
  host.dataset.dnDone = "1";

  const spans = wrapPhrases(host);
  // No hover on a touch screen — this picks the trigger, not the effect.
  const COARSE = window.matchMedia("(hover: none)").matches;

  // canvas overlays the <h3>, inside its positioned container
  const container = host.closest(".text-overlay-block") || host.parentElement;
  const gcs = getComputedStyle(container);
  if (gcs.position === "static") container.style.position = "relative";
  const canvas = document.createElement("canvas");
  canvas.className = "dn-ink-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:absolute;pointer-events:none;z-index:3;left:0;top:0;will-change:opacity";
  container.appendChild(canvas);

  const gl =
    canvas.getContext("webgl", { premultipliedAlpha: false, alpha: true, antialias: true }) ||
    canvas.getContext("experimental-webgl", { premultipliedAlpha: false, alpha: true });
  if (!gl) { canvas.remove(); staticFallback(host, spans); return; }

  const prog = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("[classified] link:", gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const U = (n) => gl.getUniformLocation(prog, n);
  const uRes = U("uRes"), uTime = U("uTime"), uCount = U("uCount"),
    uBars = U("uBars"), uProg = U("uProg"), uCursor = U("uCursor"),
    uSpikeScale = U("uSpikeScale"), uSpikeAmp = U("uSpikeAmp"),
    uWarp = U("uWarp"), uSoft = U("uSoft");

  // --- Tunables (dev panel: ?inkdev). Persisted so tuning survives reloads. ---
  const DEFAULTS = { spikeScale: 79, spikeAmp: 0.9, warp: 0.205, soft: 0.035, openMs: 1700 };
  let CFG = { ...DEFAULTS };
  try { Object.assign(CFG, JSON.parse(localStorage.getItem("dnInkCfg") || "{}")); } catch (_) {}

  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  const bars = new Float32Array(MAX_BARS * 4); // x,y,w,h (device px)
  const cursor = new Float32Array(MAX_BARS * 2); // reagent-splash origin per bar (device px)
  let barCount = 0;
  const barGroup = new Int8Array(MAX_BARS);    // which phrase each bar belongs to
  const target = new Array(PHRASES.length).fill(0);
  const progVal = new Array(PHRASES.length).fill(0);
  // duration-based tween per phrase → controllable speed + ease-out
  const anim = PHRASES.map(() => ({ t0: -1e9, from: 0, to: 0, dur: 1 }));
  const CLOSE_MS = 650;
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);  // fast start, ends slower and slower
  const easeIn = (k) => k * k;

  // Measure each phrase's per-line rects, relative to the <h3> box.
  function layout() {
    // Measure in the sheet's UNTRANSFORMED space. The dossier "land" tilt skews
    // getClientRects, which would misplace the bars mid-arrival (they'd snap into
    // place only once flat — the "stripes appear later" bug). Neutralise the sheet
    // transform for the measure, then restore it — no paint happens in between, and
    // the canvas rides inside the sheet so the bars tilt correctly with the paper.
    const sheet = host.closest(".text-body");
    const savedT = sheet ? sheet.style.transform : "";
    if (sheet) sheet.style.transform = "none";

    const hb = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(hb.width)), h = Math.max(1, Math.round(hb.height));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.style.left = host.offsetLeft + "px";
    canvas.style.top = host.offsetTop + "px";
    canvas.width = Math.round(w * dpr());
    canvas.height = Math.round(h * dpr());
    gl.viewport(0, 0, canvas.width, canvas.height);

    barCount = 0;
    const d = dpr();
    const fontPx = parseFloat(getComputedStyle(host).fontSize) || 40;
    const barH = fontPx * 0.9; // ≈ line-height → covers the word ink, no neighbour bleed
    spans.forEach((span) => {
      const gi = +span.dataset.dnG;
      for (const r of span.getClientRects()) {
        if (barCount >= MAX_BARS) break;
        const hpad = 2;
        const cy = r.top - hb.top + r.height / 2; // glyph-box vertical centre
        const x = (r.left - hb.left - hpad) * d;
        const y = (cy - barH / 2) * d;
        const bw = (r.width + hpad * 2) * d;
        const bh = barH * d;
        bars.set([x, y, bw, bh], barCount * 4);
        cursor.set([x + bw / 2, y + bh / 2], barCount * 2); // default origin = bar centre
        barGroup[barCount] = gi;
        barCount++;
      }
    });

    if (sheet) sheet.style.transform = savedT;   // restore the arrival tilt
  }

  const progBuf = new Float32Array(MAX_BARS);
  function render(time) {
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, (time || 0) * 0.001);
    gl.uniform1i(uCount, barCount);
    gl.uniform4fv(uBars, bars);
    gl.uniform2fv(uCursor, cursor);
    gl.uniform1f(uSpikeScale, CFG.spikeScale);
    gl.uniform1f(uSpikeAmp, CFG.spikeAmp);
    gl.uniform1f(uWarp, CFG.warp);
    gl.uniform1f(uSoft, CFG.soft);
    for (let i = 0; i < MAX_BARS; i++) progBuf[i] = progVal[barGroup[i]] || 0;
    gl.uniform1fv(uProg, progBuf);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  let raf = 0, animating = false;
  function loop(time) {
    let moving = false;
    for (let i = 0; i < PHRASES.length; i++) {
      const a = anim[i];
      const k = Math.min(1, Math.max(0, (time - a.t0) / a.dur));
      const e = a.to >= a.from ? easeOut(k) : easeIn(k);
      progVal[i] = a.from + (a.to - a.from) * e;
      if (k < 1) moving = true;
    }
    render(time);
    if (moving) { raf = requestAnimationFrame(loop); animating = true; }
    else { animating = false; }
  }
  function kick() { if (!animating) { animating = true; raf = requestAnimationFrame(loop); } }

  // Move the reagent origin (splash 0) to the pointer, for every bar of the
  // hovered phrase → the dissolve is "provoked" wherever the cursor lands.
  const setCursor = (gi, e) => {
    const cb = canvas.getBoundingClientRect();
    const cx = (e.clientX - cb.left) * dpr();
    const cy = (e.clientY - cb.top) * dpr();
    for (let i = 0; i < barCount; i++) {
      if (barGroup[i] === gi) { cursor[i * 2] = cx; cursor[i * 2 + 1] = cy; }
    }
  };
  spans.forEach((span) => {
    const gi = +span.dataset.dnG;
    const set = (on) => {
      const a = anim[gi];
      a.from = progVal[gi];
      // end just past full-clear (which scales with amplitude via spikeFade) so
      // the slow ease-out tail lifts the last spiky remnants with no empty fade
      a.to = on ? (1.0 + CFG.spikeAmp * 0.14) : 0;
      a.t0 = performance.now();
      a.dur = on ? CFG.openMs : CLOSE_MS;
      target[gi] = on ? 1 : 0;
      kick();
    };
    // WV-33: a touch screen has no hover, so enter/leave gave it nothing to
    // work with and the phrases sat there inert. Tap provokes the same
    // dissolve, from wherever the finger landed, and tapping again floods the
    // ink back. Same shader, same reagent — only the trigger differs.
    if (COARSE) {
      span.addEventListener("click", (e) => {
        const open = target[gi] === 1;
        setCursor(gi, e);
        set(!open);
        span.setAttribute("aria-expanded", open ? "false" : "true");
        span.setAttribute("aria-label", open ? "Reveal classified text" : "Hide classified text");
      });
    } else {
      span.addEventListener("pointerenter", (e) => { setCursor(gi, e); set(true); });
      span.addEventListener("pointermove", (e) => { setCursor(gi, e); kick(); });
      span.addEventListener("pointerleave", () => set(false));
    }
    span.addEventListener("focus", () => set(true));
    span.addEventListener("blur", () => set(false));
  });

  // --- Dev panel (add ?inkdev to the URL) ---------------------------------
  if (new URLSearchParams(location.search).has("inkdev")) {
    const persist = () => { try { localStorage.setItem("dnInkCfg", JSON.stringify(CFG)); } catch (_) {} };
    const panel = document.createElement("div");
    panel.style.cssText =
      "position:fixed;top:12px;right:12px;z-index:100001;background:rgba(18,18,18,.93);color:#fff;" +
      "font:11px/1.45 ui-monospace,monospace;padding:12px 14px;border-radius:8px;width:224px;" +
      "box-shadow:0 6px 30px rgba(0,0,0,.45)";
    const rows = [
      ["spikeScale", "Spike size (px)", 8, 160, 1],
      ["spikeAmp", "Amplitude", 0, 2.5, 0.01],
      ["warp", "Displacement", 0, 0.35, 0.005],
      ["soft", "Softness", 0.005, 0.2, 0.005],
      ["openMs", "Speed (ms)", 300, 3000, 50],
    ];
    let html = '<div style="font-weight:700;margin-bottom:6px">Ink · dev</div>';
    for (const [k, label, mn, mx, st] of rows)
      html += `<label style="display:block;margin:7px 0 1px">${label}: <b data-out="${k}">${CFG[k]}</b></label>` +
              `<input type="range" data-cfg="${k}" min="${mn}" max="${mx}" step="${st}" value="${CFG[k]}" style="width:100%">`;
    html += '<label style="display:block;margin:9px 0 1px">Preview: <b data-out="preview">0.00</b></label>' +
            '<input type="range" data-preview min="0" max="1.06" step="0.01" value="0" style="width:100%">' +
            '<div style="display:flex;gap:6px;margin-top:10px"><button data-reset style="flex:1">Reset</button>' +
            '<button data-copy style="flex:1">Copy cfg</button></div>';
    panel.innerHTML = html;
    document.body.appendChild(panel);
    panel.querySelectorAll("input[data-cfg]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const k = inp.dataset.cfg;
        CFG[k] = (k === "openMs" || k === "spikeScale") ? +inp.value : parseFloat(inp.value);
        panel.querySelector(`[data-out="${k}"]`).textContent = CFG[k];
        persist();
        render(performance.now());
      });
    });
    const prev = panel.querySelector("input[data-preview]");
    prev.addEventListener("input", () => {
      const v = parseFloat(prev.value);
      panel.querySelector('[data-out="preview"]').textContent = v.toFixed(2);
      progVal.fill(v);
      render(performance.now());
    });
    panel.querySelector("[data-reset]").addEventListener("click", () => {
      CFG = { ...DEFAULTS }; persist();
      panel.querySelectorAll("input[data-cfg]").forEach((inp) => {
        inp.value = CFG[inp.dataset.cfg];
        panel.querySelector(`[data-out="${inp.dataset.cfg}"]`).textContent = CFG[inp.dataset.cfg];
      });
      render(performance.now());
    });
    panel.querySelector("[data-copy]").addEventListener("click", (e) => {
      const s = JSON.stringify(CFG);
      if (navigator.clipboard) navigator.clipboard.writeText(s);
      console.log("[ink cfg]", s);
      e.target.textContent = "✓ copied"; setTimeout(() => (e.target.textContent = "Copy cfg"), 900);
    });
  }

  layout();
  render(0);
  let rz;
  window.addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => { layout(); render(0); }, 150);
  });
  // (No scroll-settle re-measure needed: layout() now measures in untransformed
  // space, so the bars are correct from the first render and ride the tilt.)
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { layout(); render(0); });
  }

  // expose for verification / tuning
  window.__dnInk = { gl, canvas, bars, get barCount() { return barCount; }, target, progVal, layout, render };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
