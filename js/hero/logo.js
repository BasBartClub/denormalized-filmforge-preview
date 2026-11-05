// Motion logo — ported from MotionLogo.tsx.
// Frame-sequence player for the 29-frame logo; rAF holds a fixed ~24fps
// cadence regardless of display refresh rate. All frames are stacked
// <img> elements so every frame stays in the image cache (jitter-free).

// The walkcycle's own numbers, and the defaults. A different sequence — the
// Loco-Mode dance — passes its own `frames`/`fps`.
const FRAME_COUNT = 29;
const FPS = 24;

// `base` exists for pages that are not at the site root — the lab lives one
// directory down, and a bare relative src there hunts for /lab/images/.
//
// `tint` swaps each frame from an <img> to a div that uses the SAME file as a
// CSS mask over `currentColor`. The artwork is pure black on transparent (240px
// square, ~0.5% of its ink is a light highlight, which a flat tint swallows
// without anyone noticing), so its alpha channel IS the silhouette and the
// colour can come from the cascade. That is what Loco-Mode needs: every scheme
// layer holds its own copy of the mark, each inheriting that layer's
// --loco-fg, and the reveal front clips them like any other chrome — so the
// mark gets cut through by the wipe for free, with no per-pixel work.
//
// The cost of tinting is the `fetchPriority` hint: a CSS mask image cannot
// carry one, so the opening frames lose their head start. Fine for the lab;
// worth a <link rel=preload> if this ships.
export function initMotionLogo(container, { loop = false, delay = 0, base = "images/motion-logo-v2/",
                                            tint = false, frames = FRAME_COUNT, fps = FPS } = {}) {
  const imgs = [];
  for (let i = 0; i < frames; i++) {
    const url = `${base}${String(i).padStart(5, "0")}.webp`;
    if (tint) {
      const cell = document.createElement("div");
      // Mirrors `.nh-logo img` in hero.css (absolute, inset 0, contain) so the
      // two modes are pixel-identical apart from the colour.
      cell.style.cssText =
        "position:absolute;inset:0;opacity:0;background-color:currentColor;" +
        `-webkit-mask:url("${url}") center/contain no-repeat;` +
        `mask:url("${url}") center/contain no-repeat;`;
      container.appendChild(cell);
      imgs.push(cell);
      continue;
    }
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.decoding = "async";
    // Only the opening frames are on the critical path; the rest can wait behind
    // the type rather than competing with it. The walk is 24fps, so frame 5
    // isn't wanted until 200ms in.
    img.fetchPriority = i < 4 ? "high" : "low";
    container.appendChild(img);
    imgs.push(img);
  }

  let current = -1;
  function show(i) {
    if (i === current) return;
    if (current >= 0) imgs[current].style.opacity = "0";
    imgs[i].style.opacity = "1";
    current = i;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    show(frames - 1);
    return;
  }

  const start = performance.now() + delay * 1000;
  let t0 = null;

  function tick(now) {
    if (now < start) {
      requestAnimationFrame(tick);
      return;
    }
    if (t0 == null) t0 = now;
    const elapsed = (now - t0) / 1000;
    const raw = Math.floor(elapsed * fps);
    const i = loop ? raw % frames : Math.min(raw, frames - 1);
    show(i);
    if (loop || raw < frames) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
