// Hero wordmark — ported from Wordmark.tsx + MorphLetter.tsx.
// Each letter is a canvas that morphs Regesto → Hawk on hover via
// interpolated SDFs (precomputed glyph paths in glyphs.js — no font
// parsing at runtime). Uses the page's global gsap + ScrollTrigger.

import { GLYPHS, GLYPH_FONT_SIZE } from "./glyphs.js";
import { generateSDF } from "./sdf.js";

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Whether this device can drive the ink morph at all. setupProximity drops touch
// pointers, so on a phone every part of the morph is unreachable — the Hawk SDFs
// and noise field (see makeMorphWarmer) and the per-letter goo filter below.
const CAN_HOVER = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

function normalizeSdf(sdf) {
  const maxDist = 20;
  const out = new Float32Array(sdf.grid.length);
  for (let i = 0; i < sdf.grid.length; i++) {
    out[i] = (sdf.grid[i] / maxDist) * 0.5 + 0.5;
  }
  return out;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ---- Ink morph ----------------------------------------------------------
// Each letter cross-dissolves Regesto → Hawk. Instead of a time-based hover tween
// (which "blinks" the whole word when the shared goo filter snaps on), the morph
// amount is driven purely by CURSOR PROXIMITY: a letter is full Hawk when the
// pointer sits on its centre, half-melted a letter away, and plain Regesto once
// the pointer is far. One rAF loop (setupProximity) reads the live pointer and
// sets every letter's morph from its distance — so the word flows under the
// cursor with no on/off flash.
//   render() then (1) domain-warps the sample coords by a smooth fbm that is ZERO
// at rest and peaks mid-morph (organic ink spread) and (2) cross-dissolves the two
// glyph alphas; each letter's own goo filter blurs + re-thresholds ONLY its canvas
// so its ink fuses into a liquid blob — no shape-morph, so no pointy crossings.
const INK = {
  reach: 0.6,    // influence RADIUS (× font size): distance where morph fades to 0
  hardness: 0.15, // edge sharpness 0–1: 0 = soft gradient from the centre out,
                 //   1 = hard step (full Hawk inside the radius, nothing outside)
  chase: 0.18,   // how fast a letter chases the cursor (LOW = laggy/inky viscosity)
  push: 0.1,     // neighbours slide aside up to this (× font size) to clear the ink
  pushWidth: 1.45,// how far the shove reaches (× font size; Gaussian falloff)
  pushSmart: true,// scale each letter's shove by its melted-glyph width (M/Z > O)
  warp: 4,       // px domain-warp amplitude at the midpoint (turbulent displace)
  freq: 0.5,     // noise sampling frequency (LOW = big smooth blobs, HIGH = spiky)
  edge: 0.03,    // AA half-band on each glyph's alpha before the cross-dissolve
  flow: 1.5,     // noise drift per frame (the ink "flows")
  // The AE recipe: cross-dissolve the two glyphs, blur the heck out of it, then
  // re-threshold the alpha (Levels). Heavy blur is what dissolves the shapes into
  // one liquid blob at the midpoint — no shape-morph, so no pointy SDF-crossings.
  // Applied to the WHOLE wordmark (GooGroup), so morphing ink fuses with its
  // neighbours. Keep the blur modest — a global blur rounds idle letters too.
  gooBlur: 18,      // feGaussianBlur stdDeviation (CSS px) at the midpoint
  gooContrast: 20,  // alpha contrast (Levels: re-crisp the blurred alpha)
  gooOffset: -6.3,  // alpha offset (threshold level / blob fatness)
  hold: 0.15,       // goo kept at the FULLY-morphed (Hawk) end: 0 = sharp Hawk,
                    //   >0 = keeps the letter under the cursor inky/rounded
};
if (typeof window !== "undefined") window.__INK = INK;   // live-tuning hook

// PER-LETTER goo filter. Each letter blurs + re-thresholds ONLY its own canvas,
// driven by ITS OWN morph amount — so a letter outside the cursor zone (env 0) is a
// no-op and stays razor-crisp; only letters actually melting get any blur. (A single
// word-wide filter rounded every letter the moment one morphed — not what we want.)
// The filter region bleeds a little past the glyph box so two ADJACENT melting
// letters, both fattened, overlap in the kerning gap and read as fused ink.
let gooSeq = 0;
function makeGooFilter(canvas) {
  const NS = "http://www.w3.org/2000/svg";
  const id = "ink-goo-" + (gooSeq++);
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  const defs = document.createElementNS(NS, "defs");
  const filter = document.createElementNS(NS, "filter");
  filter.setAttribute("id", id);
  filter.setAttribute("x", "-25%"); filter.setAttribute("y", "-35%");
  filter.setAttribute("width", "150%"); filter.setAttribute("height", "170%");
  filter.setAttribute("color-interpolation-filters", "sRGB");
  const blur = document.createElementNS(NS, "feGaussianBlur");
  blur.setAttribute("in", "SourceGraphic"); blur.setAttribute("stdDeviation", "0");
  const cm = document.createElementNS(NS, "feColorMatrix");
  cm.setAttribute("type", "matrix");
  cm.setAttribute("values", "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0");
  filter.appendChild(blur); filter.appendChild(cm);
  defs.appendChild(filter); svg.appendChild(defs); document.body.appendChild(svg);
  // Attach once and leave it: at env 0 it's a no-op (blur 0, identity), so an idle
  // letter is pixel-crisp, and never detaching avoids an attach/detach repaint.
  canvas.style.filter = `url(#${id})`;
  return (env) => {
    const b = env < 0.01 ? 0 : env * INK.gooBlur;
    blur.setAttribute("stdDeviation", b.toFixed(2));
    const A = env < 0.01 ? 1 : 1 + env * (INK.gooContrast - 1);
    const B = env < 0.01 ? 0 : env * INK.gooOffset;
    cm.setAttribute("values", `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${A.toFixed(3)} ${B.toFixed(3)}`);
  };
}

// Precomputed tileable value-noise (2 octaves of fbm), sampled for the warp.
//
// Built on demand, not at import. The warp only runs mid-morph (`warping` needs
// amp > 0.05, which needs env > 0, which needs a letter off its resting 0), so a
// page nobody hovers never samples this field once — and filling it costs ~59ms
// of main thread on the load path. makeMorphWarmer() fills it in before the
// first morph frame can run.
const NOISE_SIZE = 256;
let NOISE = null;
function buildNoise(size) {
  const field = new Float32Array(size * size);
  const ss = (t) => t * t * (3 - 2 * t);
  for (const [cells, amp] of [[8, 0.6], [19, 0.3], [46, 0.1]]) {
    const lat = new Float32Array(cells * cells);
    for (let i = 0; i < lat.length; i++) lat[i] = Math.random() * 2 - 1;
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * cells, y0 = Math.floor(gy) % cells, y1 = (y0 + 1) % cells, fy = ss(gy - Math.floor(gy));
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * cells, x0 = Math.floor(gx) % cells, x1 = (x0 + 1) % cells, fx = ss(gx - Math.floor(gx));
        const a = lat[y0 * cells + x0], b = lat[y0 * cells + x1], c = lat[y1 * cells + x0], d = lat[y1 * cells + x1];
        const top = a + (b - a) * fx, bot = c + (d - c) * fx;
        field[y * size + x] += (top + (bot - top) * fy) * amp;
      }
    }
  }
  return field;
}

function sampleNoise(x, y) {
  const S = NOISE_SIZE;
  let fx = x % S; if (fx < 0) fx += S;
  let fy = y % S; if (fy < 0) fy += S;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = (x0 + 1) % S, y1 = (y0 + 1) % S;
  const tx = fx - x0, ty = fy - y0;
  const a = NOISE[y0 * S + x0], b = NOISE[y0 * S + x1], c = NOISE[y1 * S + x0], d = NOISE[y1 * S + x1];
  const top = a + (b - a) * tx, bot = c + (d - c) * tx;
  return top + (bot - top) * ty;
}

// Bilinear sample of an SDF grid (edge-clamped).
function sampleField(sdf, w, h, x, y) {
  if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
  if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = x0 + 1, y1 = y0 + 1;
  const tx = x - x0, ty = y - y0;
  const a = sdf[y0 * w + x0], b = sdf[y0 * w + x1], c = sdf[y1 * w + x0], d = sdf[y1 * w + x1];
  const top = a + (b - a) * tx, bot = c + (d - c) * tx;
  return top + (bot - top) * ty;
}

// Geometric bounding-box width of an SVG path (font units), via a throwaway path.
// Used to learn how wide each MELTED (Hawk) glyph really is — flourishy letters
// (M, Z) come out wider than round/compact ones (O), so they shove more.
function measurePathWidth(d) {
  try {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    svg.appendChild(p); document.body.appendChild(svg);
    const w = p.getBBox().width;
    svg.remove();
    return w || 0;
  } catch { return 0; }
}

/** Build one morphable letter span with its SDF canvas.
 *  `paint` is the wordmark's shared ink state (see initWordmark). While
 *  `paint.on` is false — which is every page except the Loco-Mode lab — the
 *  letter takes exactly the path it always took: alpha straight to the visible
 *  canvas, RGB left at 0, i.e. black ink. */
function buildMorphLetter(char, paint) {
  const data = GLYPHS[char];
  const span = document.createElement("span");
  span.className = "nh-char";
  if (!data) {
    span.textContent = char === " " ? " " : char;
    return span;
  }
  span.classList.add("nh-morph-letter");

  const { slotWidth, slotTop, slotBottom, boxLeft, boxTop, boxWidth, boxHeight } = data;
  const F = GLYPH_FONT_SIZE;

  span._char = char;
  // How much the melted (Hawk) outline overflows this letter's resting slot.
  // Normalised across the word later; drives the per-glyph shove weight. Only
  // the shove reads it, and nothing shoves until a letter melts, so the measure
  // (a throwaway SVG + getBBox, i.e. a forced layout per letter) is deferred.
  span._measurePush = () => {
    const hawkW = measurePathWidth(data.hawkD);
    return hawkW > 0 && slotWidth > 0 ? hawkW / slotWidth : 1;
  };

  span.style.position = "relative";
  span.style.display = "inline-block";
  span.style.width = `${slotWidth / F}em`;
  span.style.height = `${(slotBottom - slotTop) / F}em`;
  span.style.lineHeight = "0";
  span.style.verticalAlign = `${-(slotBottom / F)}em`;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.position = "absolute";
  canvas.style.left = `${boxLeft / F}em`;
  canvas.style.top = `${(boxTop - slotTop) / F}em`;
  canvas.style.width = `${boxWidth / F}em`;
  canvas.style.height = `${boxHeight / F}em`;
  canvas.style.display = "block";
  canvas.style.pointerEvents = "none";
  span.appendChild(canvas);

  // --- SDF pair + render loop (ported from MorphLetter) ---
  const viewBox = { x: boxLeft, y: boxTop, w: boxWidth, h: boxHeight };
  const sdfARaw = generateSDF(data.regestoD, viewBox);
  const sdfA = normalizeSdf(sdfARaw);
  // The Hawk field is the other half of the cross-dissolve, and the dissolve
  // weights it by `mB` — which is exactly 0 on a resting letter, so it cannot
  // touch a single pixel until something melts. Building it here doubled the
  // wordmark's startup cost for an effect touch devices can never reach
  // (setupProximity drops touch pointers). Built on warm-up instead; render()
  // skips the sample entirely while it's null, which is the same arithmetic as
  // multiplying it by 0.
  let sdfB = null;
  // Both fields come from the same viewBox, and generateSDF sizes its grid from
  // the viewBox aspect alone — so sdfA's dimensions are the pair's dimensions.
  const w = sdfARaw.width;
  const h = sdfARaw.height;

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const morph = { value: 0 };
  let raf = 0, time = 0;
  // Loco-Mode only: when the letter is being colourised, render() stops writing
  // to the visible canvas and paintLetter() does it instead — putImageData is
  // the "stamp", then two flat fills tint it. This flag says the stamp is stale.
  let alphaDirty = true;
  let lastSplit = false, lastCol = "";
  const imgData = ctx.createImageData(w, h);   // reused each frame; RGB stays 0 (black)
  const px = imgData.data;
  // This letter's own goo. On a device that can hover it is attached eagerly and
  // never detached, exactly as before — at env 0 it is blur 0 and an identity
  // matrix, so an idle letter stays pixel-crisp, and attaching once avoids an
  // attach/detach repaint mid-hover. Where nothing can hover it is never created:
  // the filter would be a permanent no-op, and a `filter:` on an element still
  // promotes it to its own compositing layer — 7 spare layers on a phone, for the
  // life of the page. A hybrid device that grows a mouse later picks it up in
  // _ensureMorph, which runs before the first morph frame can render.
  let applyGoo = CAN_HOVER ? makeGooFilter(canvas) : null;

  function render() {
    const m = morph.value;
    const mc = Math.max(0, Math.min(1, m));
    // Goo envelope: 0 at rest, 1 at the midpoint. `hold` keeps some at the Hawk
    // end so the spiky font stays rounded/inky instead of snapping sharp.
    const env = Math.max(Math.sin(mc * Math.PI), mc * mc * INK.hold);
    const amp = env * INK.warp;
    const e0 = 0.5 - INK.edge, e1 = 0.5 + INK.edge;
    const warping = amp > 0.05 && NOISE !== null;
    const nf = INK.freq, t = time;
    const mA = 1 - m, mB = m;
    // A resting letter is pure Regesto: the Hawk term is weighted by mB = 0, so
    // sampling it would cost a full second pass over the grid to add nothing.
    // Skipping it is the same result, and it's what lets the Hawk field arrive
    // late — see the warmer. (Guarding on sdfB too, so a frame that somehow
    // lands before warm-up draws the crisp letter rather than NaN.)
    const useB = mB > 0 && sdfB !== null;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sx = x, sy = y;
        if (warping) {                              // turbulent displace
          sx = x + sampleNoise(x * nf + t, y * nf) * amp;
          sy = y + sampleNoise(x * nf + 71.3, y * nf - t) * amp;
        }
        // Cross-dissolve the two glyphs' alphas (NOT an SDF shape-morph). The goo
        // filter (blur → re-threshold) fuses the overlap into one liquid blob.
        const aA = 1.0 - smoothstep(e0, e1, sampleField(sdfA, w, h, sx, sy));
        let a = aA * mA;
        if (useB) {
          a += (1.0 - smoothstep(e0, e1, sampleField(sdfB, w, h, sx, sy))) * mB;
        }
        px[(y * w + x) * 4 + 3] = a < 0.004 ? 0 : (a > 1 ? 255 : (a * 255) | 0);
      }
    }
    // Off Loco-Mode this is the whole story: black alpha straight to the screen.
    // On it, the tint pass owns the visible canvas — see paintLetter.
    if (paint && paint.on) alphaDirty = true;
    else ctx.putImageData(imgData, 0, 0);

    // This letter's OWN goo: blur + re-threshold only its canvas, scaled by its own
    // melt. env 0 → no-op → crisp; neighbours in the zone fatten and fuse in the gap.
    // Null only where nothing can hover, and there env is always 0 — the call it
    // replaces was already a no-op.
    if (applyGoo) applyGoo(env);
  }

  // ---- Loco-Mode ink tint ------------------------------------------------
  // The glyph bitmap carries alpha only, so colour is a compositing job, not a
  // per-pixel one: stamp the alpha, `source-in` a flat fill to make the whole
  // letter the settled ink, then `source-atop` each reveal front's shape in its
  // own ink. `source-atop` paints only where the destination is already opaque
  // and leaves everything outside the source shape alone — so a front cuts a
  // pixel-exact edge THROUGH the glyph without a clip, and a letter can read
  // half pink, half red. All GPU-side; the per-pixel SDF pass in render() stays
  // untouched.
  //
  // `paint.stack` is the reveal layers bottom-to-top, so painting it in order
  // reproduces exactly what the background layers do — which matters once
  // Loco-Mode's `hold` goes negative and two fronts are open at once. A letter
  // can then legitimately carry three colours.
  //
  // `rect` is the canvas's live viewport box, supplied by the proximity loop
  // which has already measured it for the shove — so this adds no layout read.
  const splits = [];
  function paintLetter(rect) {
    if (!paint || !paint.on) return;
    let solid = paint.fg;
    splits.length = 0;
    const stack = paint.stack;
    for (let i = 0; i < stack.length; i++) {
      const L = stack[i];
      // 0 = this front has not reached the letter, 1 = it has wholly passed it,
      // 2 = it is cutting through right now.
      const mode = L.front && rect && rect.width ? L.front.classify(rect) : 0;
      if (mode === 1) { solid = L.fg; splits.length = 0; }   // hides everything under it
      else if (mode === 2) splits.push(L);
    }
    // A letter no front is crossing is a flat colour. If that colour and the
    // alpha both match the last pass there is nothing to redraw — which is most
    // letters, most frames.
    if (!alphaDirty && !splits.length && !lastSplit && solid === lastCol) return;

    ctx.putImageData(imgData, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = solid;
    ctx.fillRect(0, 0, w, h);
    if (splits.length) {
      ctx.globalCompositeOperation = "source-atop";
      // Viewport px → this canvas's grid, so a shared front traces the same
      // curve here as it clips on the background layer. The rect is post-
      // transform, so the neighbour shove carries the boundary with the letter.
      const sx = w / rect.width, sy = h / rect.height;
      for (let i = 0; i < splits.length; i++) {
        ctx.fillStyle = splits[i].fg;
        ctx.save();
        ctx.setTransform(sx, 0, 0, sy, -rect.left * sx, -rect.top * sy);
        splits[i].front.fill(ctx);   // the front paints itself — blob or shape
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    alphaDirty = false; lastSplit = splits.length > 0; lastCol = solid;
  }

  render();

  // Exposed to the proximity controller (setupProximity), which owns the single
  // rAF loop: each frame it sets morph.value from the cursor distance, advances
  // the noise drift, and redraws. No per-letter tween or hover listener here.
  span._morph = morph;
  span._render = render;
  // Build this letter's half of the cross-dissolve. Idempotent; called by the
  // warmer (at idle) and again as a guard before the first proximity frame.
  span._ensureMorph = () => {
    if (!sdfB) sdfB = normalizeSdf(generateSDF(data.hawkD, viewBox));
    // A real pointer has arrived on a device that reported it couldn't hover —
    // a tablet with a trackpad, a phone with a mouse. Attach the goo now, before
    // the frame that needs it, rather than mid-morph.
    if (!applyGoo) applyGoo = makeGooFilter(canvas);
  };
  span._canvas = canvas;   // visible glyph box — used for the proximity centre
  span._advanceTime = () => { time += INK.flow; };
  // Loco-Mode: a second, additive driver for `morph` (the reveal front melts
  // the letter as it crosses), and the tint pass above.
  span._ext = 0;
  span._paint = paintLetter;

  // Tuning hook: freeze this letter at a morph value (used to inspect the mid-
  // transition ink look). Harmless in production.
  span._setMorph = (v, t) => {
    span._ensureMorph();                    // console hook: may run before any hover
    if (!NOISE) NOISE = buildNoise(NOISE_SIZE);
    morph.value = v; if (t != null) time = t; render();
    paintLetter(canvas.getBoundingClientRect());   // no-op unless Loco-Mode is on
  };

  return span;
}

// Cursor-proximity morph. One rAF loop drives EVERY letter from the live pointer.
// Distance is measured to each letter's VISUAL (canvas) centre horizontally, with a
// SHARED vertical reference + dead-zone so anywhere over the word counts as "on it".
// That keeps a left→right sweep strictly ordered by horizontal position (no glyph's
// odd cap-height can make a further letter morph more than a nearer one). `hardness`
// sets how sharp the falloff is inside `reach`; morph chases its target each frame
// (`chase` = viscosity). The loop sleeps once every letter is back at rest.
// `ctl` is the wordmark's controller (see initWordmark). Loco-Mode hangs three
// things off it, all inert when nobody sets them: a per-frame hook that runs
// AFTER the letter rects are measured and BEFORE the morph is solved (so the
// reveal front and the melt agree to the frame, off one layout read rather than
// a second rAF fighting this one for it), an `alwaysOn` flag that stops the loop
// sleeping while the storm runs, and the ink state the tint pass reads.
function setupProximity(h1, letters, ensureAssets, ctl) {
  if (!letters.length) return;
  let px = 0, py = 0, active = false, raf = 0, running = false;

  const frame = () => {
    const unit = parseFloat(h1.style.fontSize) || 120;
    const far = INK.reach * unit;
    const near = far * Math.min(0.98, Math.max(0, INK.hardness));  // inner full-Hawk radius
    const box = h1.getBoundingClientRect();
    const cyShared = box.top + box.height / 2;         // one vertical anchor for all letters
    const band = 0.5 * unit;                           // vertical "still on the word" dead-zone
    const dv = active ? Math.max(0, Math.abs(py - cyShared) - band) : 0;
    let alive = false;
    // Resting horizontal centres — subtract the shove we applied last frame so the
    // displacement never feeds back into the morph distance or the next shove.
    const N = letters.length;
    const baseCx = new Array(N);
    const rects = new Array(N);
    for (let i = 0; i < N; i++) {
      const r = (letters[i]._canvas || letters[i]).getBoundingClientRect();
      rects[i] = r;
      baseCx[i] = r.left + r.width / 2 - (letters[i]._tx || 0);
    }
    // 0) Loco-Mode: advance the reveal front and set each letter's `_ext`.
    if (ctl.hook) ctl.hook(rects);
    if (ctl.alwaysOn) alive = true;
    // 1) proximity morph — plus whatever the front is asking for. They MAX
    // rather than add, so the cursor still works mid-storm and neither driver
    // can push a letter past full Hawk.
    for (let i = 0; i < N; i++) {
      let target = 0;
      if (active) {
        const d = Math.hypot(px - baseCx[i], dv);      // horizontal + shared vertical falloff
        target = 1 - smoothstep(near, far, d);         // 1 inside `near`, 0 past `far`
      }
      if (letters[i]._ext > target) target = letters[i]._ext;
      const m = letters[i]._morph;
      const prev = m.value;
      m.value += (target - m.value) * INK.chase;
      if (target === 0 && m.value < 0.002) m.value = 0;
      if (m.value > 0.001) alive = true;
      // Only repaint what actually moved. Each render is a full per-pixel pass over
      // the letter's SDF grid, so redrawing all 12 letters every frame pegged the
      // main thread the whole time the cursor was anywhere over the wordmark.
      if (m.value > 0.001 || Math.abs(m.value - prev) > 0.0005) {
        letters[i]._advanceTime();
        letters[i]._render();
      }
      // Re-tint. Self-skips unless the ink changed or the front is crossing
      // this letter, so an untouched letter costs one comparison.
      if (ctl.paint.on) letters[i]._paint(rects[i]);
    }
    // 2) shove neighbours aside so the melting ink doesn't overlap crisp glyphs. Each
    // letter is pushed AWAY from every melting letter, Gaussian-weighted by distance;
    // the melted letter itself gets only weak symmetric pushes, so it stays put.
    const sig = Math.max(1, INK.pushWidth * unit), denom = 2 * sig * sig;
    for (let i = 0; i < N; i++) {
      let shove = 0;
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const mj = letters[j]._morph.value;
        if (mj < 0.01) continue;
        const wj = INK.pushSmart ? (letters[j]._pushWeight || 1) : 1;  // per-glyph room
        const dx = baseCx[i] - baseCx[j];
        shove += (dx >= 0 ? 1 : -1) * mj * wj * Math.exp(-(dx * dx) / denom);
      }
      const tx = shove * INK.push * unit;
      letters[i]._tx = tx;
      const t = Math.abs(tx) > 0.1 ? `translateX(${tx.toFixed(1)}px)` : "";
      if (letters[i]._canvas.style.transform !== t) letters[i]._canvas.style.transform = t;
    }
    if (active || alive) raf = requestAnimationFrame(frame);
    else running = false;
  };
  const kick = () => { if (!running) { running = true; raf = requestAnimationFrame(frame); } };
  ctl.kick = kick;
  ctl.hasLoop = true;   // Loco-Mode runs its own rAF instead when this is false

  h1.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;   // touch has no hover — leave it crisp
    // Normally a no-op: the idle warmer has had since `load` to finish. It only
    // does real work if someone reaches the word in that first moment, and then
    // it has to be synchronous — the frame below is about to sample the fields.
    ensureAssets();
    px = e.clientX; py = e.clientY; active = true; kick();
  });
  h1.addEventListener("pointerleave", () => { active = false; kick(); });
}

/**
 * Measure real pair-kerning of the loaded page font, in em units.
 * The slot layout uses bare advance widths, which silently discards both
 * GPOS kerning and CSS letter-spacing (letter-spacing does not apply
 * between the inline-block slots) — measured +3.8% total tracking on
 * DENORMALIZED vs native text. We bake both back in as slot margins.
 */
async function measurePairKerningEm(letters) {
  try { await document.fonts?.ready; } catch { /* no-op */ }
  const probe = document.createElement("span");
  probe.style.cssText =
    "position:absolute;visibility:hidden;white-space:nowrap;" +
    "font-family:Regestogrotesk,sans-serif;font-weight:500;font-size:100px;" +
    "letter-spacing:0;font-kerning:normal;text-transform:uppercase;";
  document.body.appendChild(probe);
  const w = (s) => {
    probe.textContent = s;
    return probe.getBoundingClientRect().width;
  };
  const kerns = [];
  for (let i = 0; i < letters.length - 1; i++) {
    const a = letters[i], b = letters[i + 1];
    kerns.push((w(a + b) - w(a) - w(b)) / 100);
  }
  probe.remove();
  return kerns;
}

// Tracking from the design (matches the old hed-1 headline): -0.02em.
// Applied via slot margins, not CSS letter-spacing (see above).
const TRACKING_EM = -0.02;

/**
 * Everything the ink morph needs and a resting wordmark does not: the Hawk half
 * of each letter's cross-dissolve, the melted widths behind the neighbour shove,
 * and the noise field for the domain warp. Together they were ~180ms of the
 * wordmark's ~280ms startup, all of it inside the load window — and on a phone
 * it was 180ms spent on an effect that cannot fire, since setupProximity ignores
 * touch pointers.
 *
 * So: nothing here runs unless the device actually has a cursor, and when it
 * does it runs at idle after load, one letter per slice, so it never forms a
 * long task of its own. `ensure()` is the correctness guard — it finishes the
 * job synchronously if a pointer reaches the word before idle got there.
 */
function makeMorphWarmer(morphEls) {
  let next = 0, settled = false;

  const step = () => {
    const el = morphEls[next++];
    el._ensureMorph();
    el._pushRaw = el._measurePush();
  };

  const settle = () => {
    if (settled) return;
    settled = true;
    if (!NOISE) NOISE = buildNoise(NOISE_SIZE);
    // Normalise the per-glyph melt-width to mean 1 across the word, so the "smart
    // push" only REDISTRIBUTES the shove (wide Hawk glyphs get >1, compact <1)
    // while INK.push keeps setting the overall strength.
    const raws = morphEls.map((el) => el._pushRaw || 1);
    const mean = raws.reduce((a, b) => a + b, 0) / raws.length;
    morphEls.forEach((el, i) => { el._pushWeight = mean > 0 ? raws[i] / mean : 1; });
    if (typeof window !== "undefined") {
      window.__pushWeights = morphEls.map((el) => [el._char, +(el._pushWeight).toFixed(2)]);
    }
  };

  const ensure = () => {
    while (next < morphEls.length) step();
    settle();
  };

  // No cursor, no morph — and prefers-reduced-motion never wires the proximity
  // loop at all, so warming for it would just be the old cost moved later.
  if (morphEls.length && !REDUCED && CAN_HOVER) {
    const idle = window.requestIdleCallback
      || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 200));
    // do/while, so a slice with no budget left still makes progress rather than
    // rescheduling forever.
    const pump = (deadline) => {
      if (settled) return;                  // a pointer beat us to it via ensure()
      do { step(); } while (next < morphEls.length && deadline.timeRemaining() > 8);
      if (next < morphEls.length) idle(pump, { timeout: 2000 });
      else settle();
    };
    const start = () => idle(pump, { timeout: 2000 });
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
  }

  return ensure;
}

/**
 * Build the wordmark into `wrap`, wire fit-to-width + reveal + parallax.
 *
 * Returns a controller. Nothing on the live site reads it — it exists so
 * Loco-Mode (js/hero/loco.js) can drive the ink colour and feed a second morph
 * source without this module knowing anything about colour schemes. Everything
 * on it starts inert, so a page that ignores it behaves exactly as before.
 */
export function initWordmark(wrap, word, { delay = 0.1, parallax = true } = {}) {
  const gsap = window.gsap;
  const letters = word.toUpperCase();

  // Shared ink state. `on` false = the original black-alpha path, untouched.
  // `stack` is the reveal layers bottom-to-top; empty on every page but the
  // Loco-Mode lab. See paintLetter.
  const paint = { on: false, fg: "#000", stack: [] };
  const ctl = { paint, hook: null, alwaysOn: false, kick: () => {}, chars: [] };

  const h1 = document.createElement("h1");
  h1.className = "nh-wordmark";
  const inner = document.createElement("span");
  inner.className = "nh-wordmark-inner";
  inner.setAttribute("aria-hidden", "true");

  for (const c of letters) inner.appendChild(buildMorphLetter(c, paint));

  const srOnly = document.createElement("span");
  srOnly.className = "nh-sr-only";
  srOnly.textContent = letters;

  h1.appendChild(inner);
  h1.appendChild(srOnly);
  wrap.appendChild(h1);

  // The morph-only assets (Hawk SDFs, melt widths, noise) build at idle after
  // load rather than here — see makeMorphWarmer. Nothing below reads them.
  const morphEls = Array.from(inner.querySelectorAll(".nh-morph-letter"));
  const ensureMorphAssets = makeMorphWarmer(morphEls);
  ctl.h1 = h1;
  ctl.chars = morphEls;
  ctl.ensureAssets = ensureMorphAssets;

  // --- Auto-fit font-size to 100% of container width ---
  const fit = () => {
    h1.style.fontSize = "100px";
    const natural = inner.getBoundingClientRect().width;
    const target = wrap.clientWidth;
    if (natural === 0 || target === 0) return;
    h1.style.fontSize = `${(100 * target) / natural}px`;
  };
  fit();
  if (document.fonts?.ready) document.fonts.ready.then(fit).catch(() => {});
  new ResizeObserver(fit).observe(wrap);

  // Bake kerning + tracking into the slot layout, then refit so the
  // tightened word still fills the container edge to edge.
  const spans = inner.querySelectorAll(".nh-char");
  measurePairKerningEm(letters).then((kerns) => {
    for (let i = 0; i < spans.length - 1; i++) {
      spans[i].style.marginRight = `${(kerns[i] || 0) + TRACKING_EM}em`;
    }
    fit();
  });

  if (REDUCED) return ctl;

  const chars = h1.querySelectorAll(".nh-char");
  if (!chars.length) return ctl;

  // Cursor-proximity ink morph (replaces per-letter hover tweens).
  setupProximity(h1, morphEls, ensureMorphAssets, ctl);

  // --- Reveal: slide each letter up from below the baseline ---
  gsap.fromTo(
    chars,
    { yPercent: 110 },
    { yPercent: 0, duration: 1.1, ease: "power4.out", stagger: 0.022, delay },
  );

  // --- Scroll parallax: each letter flies away at its own speed ---
  // Skippable, because it is meaningless on a page that does not scroll — and
  // worse than meaningless: with no scrollable distance the ScrollTrigger sits
  // at full progress, so every letter starts life flung to the top of its own
  // travel and the word arrives already scattered (the Loco-Mode lab).
  if (!parallax) return ctl;

  // Deterministic pseudo-random speed per letter index.
  const speeds = Array.from(chars).map((_, i) => {
    const seed = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return 0.3 + (seed - Math.floor(seed)) * 0.7; // 0.3 – 1.0
  });

  const revealDuration = (delay + 1.1 + 0.022 * chars.length) * 1000 + 100;
  setTimeout(() => {
    const charHeight = chars[0]?.getBoundingClientRect().height || 120;
    const TRAVEL = charHeight * 2.5;
    const scroll = { trigger: "body", start: "top top", end: "+=120%", scrub: 0.6 };

    chars.forEach((char, i) => {
      gsap.to(char, { y: -speeds[i] * TRAVEL, ease: "none", scrollTrigger: scroll });
    });

    // WV-34: the rail (Strategy · Driven · Design over its hairline) sits above
    // the wordmark and wasn't moving at all, so the quickest letters climbed
    // straight through it. Speeds top out at 1.0, so anything above that keeps
    // the rail ahead of the field for the whole scrub — it leads rather than
    // gets overtaken.
    //
    // The mark and the paragraph travel with it, at exactly the same speed. They
    // were the only things standing still, so the rail — now the fastest thing
    // on screen — climbed straight into the paragraph. Moving them as one block
    // means nothing above the wordmark can ever close on anything else: the only
    // gaps that change are the ones between the letters and the block.
    const LEAD = 1.35;
    [".nh-hero-rail", ".nh-logo-area"].forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) gsap.to(el, { y: -LEAD * TRAVEL, ease: "none", scrollTrigger: scroll });
    });
  }, revealDuration);

  return ctl;
}
