// The hero rail's hairline, as a plucked string.
//
// `.nh-hero-rail` draws its divider with `border-bottom: 1px solid currentColor`.
// This swaps that border for an SVG path running the same line, and hands it to
// a 1-D wave simulation: bring the cursor near and it hooks and drags; take it
// away and the string is released, the pluck travels out to both ends, reflects,
// and decays.
//
// ---- Why a wave equation and not a decaying sine ---------------------------
// The cheap version — displace by cursor distance, release into A·e^(−λt)·sin —
// looks like a wobble, not a string, because every point moves in phase. A
// string's character is that a disturbance TRAVELS: pluck it off-centre and the
// bump runs to the near end first, bounces, and comes back inverted. That falls
// straight out of the discrete wave equation over a line of nodes,
//
//     a[i] = tension · (y[i−1] + y[i+1] − 2·y[i])
//
// which is 96 multiply-adds a frame. The endpoints are pinned at zero, which is
// what makes the reflections happen at all.
//
// ---- One simulation, several paths -----------------------------------------
// Loco-Mode stacks four copies of the hero, so there are four rails on screen at
// once and the reveal front cuts across them. They must be the SAME string to
// the pixel or the wipe would show two different curves meeting at its edge — so
// the geometry is solved once per frame and the one path string is assigned to
// every copy. Each copy strokes it in `currentColor`, so each takes its own
// layer's scheme for free.

export const STRING = {
  ride: 1,         // how much of the string's displacement a pinned rider takes
  tilt: 1,         // how much of the string's local SLOPE a rider leans to
  nodes: 96,       // points along the line. More = finer wave, linear cost.
  tension: 0.22,   // wave speed. Explicit integration goes unstable past ~0.5.
  damping: 0.955,  // velocity kept per frame. 1 = rings forever, 0.9 = a thud.
  // ---- what makes it RUBBER rather than a guitar string ----
  // A taut string's only restoring force is neighbour curvature, so its lowest
  // mode — the whole line bowed into one arc — has almost no curvature to pull
  // it back and drifts home in its own time. That is the "floating in a vacuum"
  // read. Rubber has a second force: the band itself wants to be straight, so
  // every point is pulled at the line whatever shape it is in.
  elastic: 0.055,  // pull toward the line, independent of curvature
  // And real rubber gets STIFFER the further you stretch it, which is why it
  // snaps rather than wafts. Scales `elastic` by how far this point is pulled.
  stretch: 2.2,    // extra stiffness at full amplitude (0 = perfectly linear)
  reach: 74,       // px above/below the line where the cursor grabs it
  // How many nodes the cursor drags. This is what decides whether a pull reads
  // as a finger DENTING the line or STRETCHING it: narrow makes a local needle,
  // wide makes the broad triangle a rubber band actually takes. Wider also pulls
  // deeper for the same cursor offset, because the elastic resistance is spread
  // over more of the band — measured peak 27px at 4.2, 50px at 18.
  grab: 16,
  maxAmp: 150,     // px clamp, so a flick cannot fold it through itself
  slack: 0.85,     // how much of the cursor's offset the string actually takes
  rest: 0.02,      // px below which the string is called still and the loop sleeps
};
if (typeof window !== "undefined") window.__STRING = STRING;

const REDUCED = typeof window !== "undefined"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * @param {Iterable<HTMLElement>} rails  every `.nh-hero-rail` to draw into.
 *   All of them render the same string — see the note above.
 */
export function initRailString(rails) {
  const els = Array.from(rails).filter(Boolean);
  if (!els.length || REDUCED) return null;

  const NS = "http://www.w3.org/2000/svg";
  const paths = [];
  let W = 0, H = STRING.maxAmp * 2 + 8;

  for (const rail of els) {
    // The rail is `position: absolute` at both breakpoints. Reading
    // `rail.style.position` returns the INLINE value — empty — so a
    // `|| "relative"` here silently overrides the stylesheet and drops the rail
    // back into flow, on top of the wordmark. Ask the cascade, not the element.
    if (getComputedStyle(rail).position === "static") rail.style.position = "relative";

    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.cssText =
      `position:absolute;left:0;width:100%;height:${H}px;` +
      "overflow:visible;pointer-events:none";
    const path = document.createElementNS(NS, "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1");
    // The SVG is stretched to the rail's width while its viewBox is kept in
    // sync, so there is normally no scaling — but during a resize the two can
    // disagree for a frame, and a stretched hairline is instantly visible.
    path.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(path);
    // FIRST child, not appended. hero.css right-aligns the rail's third word with
    // `.nh-hero-rail span:last-child` — append the svg and that selector stops
    // matching anything, so "Design" left-aligns inside its grid column and lands
    // flush against "Driven" in the middle of the line. Going in at the front
    // leaves the spans' positions, and the selector, exactly as they were.
    rail.insertBefore(svg, rail.firstChild);
    paths.push({ svg, path, rail });
  }

  const N = Math.max(8, STRING.nodes | 0);
  const y = new Float64Array(N);
  const v = new Float64Array(N);

  // Things pinned to the line. A rider rides the wave: it takes the string's
  // displacement where it stands, and leans to the string's local slope, pivoting
  // on its own feet. The hero's mark is the one that matters — the figures stand
  // ON this hairline, so when the string is plucked they should go with it.
  const riders = [];

  // WHICH EDGE the hairline is on is a breakpoint decision, not a constant:
  // hero.css draws it as `border-bottom` in the base rule and re-draws it as
  // `border-top` from 768px up, where the rail becomes the hero's horizon with
  // the words hanging under it. Getting this wrong puts the string a rail-height
  // away from the line it is supposed to be. Re-checked on every resize, since
  // crossing the breakpoint swaps it.
  let onTop = true;
  const measure = () => {
    const cs = getComputedStyle(els[0]);
    onTop = parseFloat(cs.borderTopWidth) > 0;
    const r = els[0].getBoundingClientRect();
    W = r.width;
    for (const p of paths) {
      // Hide whichever border is painting, restore the other.
      p.rail.style.borderTopColor = onTop ? "transparent" : "";
      p.rail.style.borderBottomColor = onTop ? "" : "transparent";
      p.svg.style.top = onTop ? `${-H / 2}px` : "";
      p.svg.style.bottom = onTop ? "" : `${-H / 2}px`;
      p.svg.setAttribute("viewBox", `0 ${-H / 2} ${W} ${H}`);
    }
    for (const r of riders) if (r.measure) r.measure();
  };
  measure();
  new ResizeObserver(measure).observe(els[0]);

  /** The line's own y in viewport px — whichever border edge it lives on. */
  const lineY = () => {
    const r = els[0].getBoundingClientRect();
    return onTop ? r.top : r.bottom;
  };

  let px = 0, py = 0, touching = false, raf = 0, runningLoop = false;

  addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;      // no hover to speak of
    px = e.clientX; py = e.clientY;
    touching = true;
    kick();
  }, { passive: true });
  addEventListener("pointerleave", () => { touching = false; }, { passive: true });

  function step() {
    // --- the cursor's hold on the string ---
    if (touching) {
      const ly = lineY();
      const dy = py - ly;
      if (Math.abs(dy) < STRING.reach) {
        const r = els[0].getBoundingClientRect();
        const t = (px - r.left) / (W || 1);
        if (t >= 0 && t <= 1) {
          // Pull a span of nodes rather than one, or the string reads as a
          // single spike caught on a nail rather than as something being held.
          const centre = t * (N - 1);
          const g = Math.max(0.5, STRING.grab);
          const amp = Math.max(-STRING.maxAmp, Math.min(STRING.maxAmp, dy * STRING.slack));
          // Fade the hold out toward the edge of `reach`, so the string lets go
          // gradually as the cursor leaves instead of snapping off it.
          const grip = 1 - Math.abs(dy) / STRING.reach;
          for (let i = 1; i < N - 1; i++) {
            const d = (i - centre) / g;
            const w = Math.exp(-d * d) * grip;
            if (w < 0.002) continue;
            y[i] += (amp - y[i]) * w;
            v[i] *= 1 - w * 0.6;
          }
        }
      }
    }

    // --- the string itself ---
    const c = Math.min(0.5, Math.max(0, STRING.tension));
    const damp = Math.min(1, Math.max(0, STRING.damping));
    // Clamped together, not separately: explicit integration blows up once the
    // per-frame stiffness gets near 1, and the two forces add.
    const kMax = Math.max(0, 0.9 - 4 * c);
    const k = Math.min(kMax, Math.max(0, STRING.elastic));
    const nl = Math.max(0, STRING.stretch) / Math.max(1, STRING.maxAmp);
    let alive = 0;
    for (let i = 1; i < N - 1; i++) {
      const yi = y[i];
      const curve = c * (y[i - 1] + y[i + 1] - 2 * yi);
      // Stiffer the further it is stretched — the whole point of rubber.
      const pull = k * yi * (1 + nl * (yi < 0 ? -yi : yi));
      v[i] = (v[i] + curve - pull) * damp;
    }
    y[0] = y[N - 1] = 0;                 // pinned: this is what reflects the wave
    v[0] = v[N - 1] = 0;
    for (let i = 1; i < N - 1; i++) {
      y[i] += v[i];
      const m = Math.abs(y[i]) + Math.abs(v[i]);
      if (m > alive) alive = m;
    }
    return alive;
  }

  // Closed-open quadratic through the sample midpoints — smooth at 96 nodes,
  // where a raw polyline would read as faceted across a 1400px rail.
  function draw() {
    const sx = W / (N - 1);
    let d = `M0 ${y[0].toFixed(2)}`;
    for (let i = 1; i < N - 1; i++) {
      const mx = (i + 0.5) * sx, my = (y[i] + y[i + 1]) / 2;
      d += `Q${(i * sx).toFixed(2)} ${y[i].toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
    }
    d += `L${W.toFixed(2)} ${y[N - 1].toFixed(2)}`;
    for (const p of paths) p.path.setAttribute("d", d);

    // Central-difference slope at a node: the tilt has to come from the curve
    // either side of a point, not from its own single node.
    const slopeAt = (i) => (y[Math.min(N - 1, i + 1)] - y[Math.max(0, i - 1)]) / (2 * (sx || 1));
    for (const r of riders) {
      // INTERPOLATED between the two nodes either side, not snapped to the
      // nearest. Nodes are ~15px apart on a desktop rail and the tagline's
      // letters ~9px, so snapping put runs of neighbouring letters on the same
      // node and the word moved in steps — exactly the chunkiness letter-by-
      // letter riding is meant to remove.
      const f = Math.max(0, Math.min(N - 1, r.at * (N - 1)));
      const i0 = Math.min(N - 2, Math.floor(f)), u = f - i0;
      const yy = y[i0] + (y[i0 + 1] - y[i0]) * u;
      const slope = slopeAt(i0) + (slopeAt(i0 + 1) - slopeAt(i0)) * u;
      const deg = Math.atan(slope * STRING.tilt) * 180 / Math.PI;
      const dy = yy * STRING.ride;
      const t = (Math.abs(dy) < 0.01 && Math.abs(deg) < 0.01)
        ? "" : `translateY(${dy.toFixed(2)}px) rotate(${deg.toFixed(2)}deg)`;
      if (r.el.style.transform !== t) r.el.style.transform = t;
    }
  }

  function frame() {
    const alive = step();
    draw();
    // Sleep once it has settled — a hairline that is not moving should not cost
    // a frame. A pointermove wakes it.
    if (alive > STRING.rest || touching) raf = requestAnimationFrame(frame);
    else { runningLoop = false; y.fill(0); v.fill(0); draw(); }
  }
  function kick() {
    if (!runningLoop) { runningLoop = true; raf = requestAnimationFrame(frame); }
  }

  draw();

  return {
    params: STRING,
    /**
     * Pin an element to the line so it moves and leans with it.
     * `foot` is where the element's contact point sits in its own box (0 = top,
     * 1 = bottom) — the pivot. The hero mark's artwork stands at 0.827 of its
     * frame, which is why hero.css offsets it by exactly that.
     */
    pin(el, { foot = 0.827 } = {}) {
      el.style.transformOrigin = `50% ${(foot * 100).toFixed(2)}%`;
      const rider = { el, at: 0.5, foot };
      // Where along the line does it stand? Measured with our own transform
      // cleared, or the reading feeds back into itself.
      rider.measure = () => {
        const prev = el.style.transform;
        el.style.transform = "";
        const e = el.getBoundingClientRect(), r = els[0].getBoundingClientRect();
        rider.at = r.width ? Math.max(0, Math.min(1, (e.left + e.width / 2 - r.left) / r.width)) : 0.5;
        el.style.transform = prev;
      };
      rider.measure();
      riders.push(rider);
      return rider;
    },
    /**
     * Hang a rail's tagline from the string, letter by letter.
     *
     * The words sit just under the hairline, so once only the mark rode the
     * string a pull down sank the figures straight into "Creative" while the
     * words stayed put. Pinning each WORD would fix the overlap but move in
     * slabs; each glyph is its own rider instead, so the type follows the curve
     * like beads on it. Every glyph pivots on the line above it (the point it
     * hangs from), not on its own centre — a leaning letter swings from the
     * string rather than spinning in place.
     *
     * Splits the rail's spans into inline-block glyphs (whitespace stays text,
     * so word spacing and the grid columns are untouched). Idempotent.
     */
    hang(rail) {
      if (!rail || rail.dataset.hung) return [];
      rail.dataset.hung = "1";
      const glyphs = [];
      for (const word of rail.querySelectorAll(":scope > span")) {
        const text = word.textContent;
        word.textContent = "";
        for (const ch of text) {
          if (/\s/.test(ch)) { word.append(ch); continue; }
          const g = document.createElement("span");
          g.className = "nh-rail-ch";
          g.textContent = ch;
          g.style.display = "inline-block";
          word.append(g);
          glyphs.push(g);
        }
      }
      const out = [];
      for (const g of glyphs) {
        const rider = { el: g, at: 0.5 };
        rider.measure = () => {
          const prev = g.style.transform;
          g.style.transform = "";
          const e = g.getBoundingClientRect(), r = rail.getBoundingClientRect();
          if (r.width) rider.at = Math.max(0, Math.min(1, (e.left + e.width / 2 - r.left) / r.width));
          // Pivot ON the hairline: its distance above this glyph's box.
          const line = onTop ? r.top : r.bottom;
          g.style.transformOrigin = `50% ${(line - e.top).toFixed(2)}px`;
          g.style.transform = prev;
        };
        rider.measure();
        riders.push(rider);
        out.push(rider);
      }
      // Glyph positions move when the webfont lands; the ResizeObserver will not
      // see that (the rail's own box does not change), so re-measure once it has.
      if (document.fonts) document.fonts.ready.then(() => out.forEach((r) => r.measure()));
      return out;
    },
    /** Pluck it by hand — `at` 0–1 along the line, `amp` in px. */
    pluck(at = 0.5, amp = 40) {
      const centre = at * (N - 1), g = Math.max(0.5, STRING.grab);
      for (let i = 1; i < N - 1; i++) {
        const d = (i - centre) / g;
        y[i] += amp * Math.exp(-d * d);
      }
      kick();
    },
    /** Advance one frame by hand. The string owns a rAF of its own, which is
     *  right for a page that has no loop to spare — but a host that already
     *  runs one (the hero's proximity loop) can drive it from there instead and
     *  save a second callback. Also how the physics gets tested off the clock. */
    tick() { const a = step(); draw(); return a; },
    /** The string's displacement, sampled 0–1 along its length. */
    sample(at) { return y[Math.max(0, Math.min(N - 1, Math.round(at * (N - 1))))]; },
    /** Peak displacement right now, px. */
    get amplitude() { let m = 0; for (const yy of y) m = Math.max(m, Math.abs(yy)); return m; },
    get nodeCount() { return N; },
    stop() { cancelAnimationFrame(raf); runningLoop = false; },
  };
}
