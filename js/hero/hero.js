// New hero entry point — ported from the Next.js build (Hero.tsx).
// Assumes the page's global gsap + ScrollTrigger are already loaded
// (Webflow export loads GSAP 3.15 before this module).

import { initWordmark } from "./wordmark.js";
import { initMotionLogo } from "./logo.js";
import { initRailString } from "./rail-string.js";

function init() {
  if (!window.gsap || !window.ScrollTrigger) {
    console.error("[nh-hero] gsap/ScrollTrigger missing — hero not initialized");
    return;
  }
  window.gsap.registerPlugin(window.ScrollTrigger);

  // --- Motion logo (center, looping) ---
  const logo = document.querySelector(".nh-logo");
  if (logo) initMotionLogo(logo, { loop: true, delay: 0.4 });

  // --- Wordmark (abbreviated "DNRMLZD" on mobile so it fills the narrow width, per Figma) ---
  const wordmarkWrap = document.querySelector(".nh-wordmark-wrap");
  // 767 to match hero.css — the mobile hero block used to switch at 640, which
  // left 641–767 rendering the abbreviated wordmark under the desktop layout.
  const mobile = window.matchMedia("(max-width: 767px)").matches;
  if (wordmarkWrap) initWordmark(wordmarkWrap, mobile ? "FilmForge" : "FilmForge");

  // --- The rail hairline as a plucked string (ported from lab/exp-002) ---
  // The figures stand ON the line and the tagline hangs under it, so both ride
  // it: pull the line down and the mark and "Creative" go down together instead
  // of the figures sinking into the type. Hover-driven; null under reduced
  // motion, and touch never plucks it.
  const rail = document.querySelector(".nh-hero-rail");
  const string = rail ? initRailString([rail]) : null;
  if (string) {
    if (logo) string.pin(logo, { foot: 0.827 });
    string.hang(rail);
  }

  // --- Paragraph reveal (from Reveal.tsx: y 40 → 0, opacity 0 → 1) ---
  // Now in CSS (.nh-hero-para / @keyframes nh-para-in in hero.css), not here.
  // It is the page's LCP element, and a tween can only start once this module
  // has loaded — which means after GSAP, behind the render-blocking scripts. The
  // paragraph therefore stayed invisible for seconds on a slow connection while
  // the browser had the text, the font and the layout ready to paint. The CSS
  // reveal is the same 0.7s hold / 0.8s / 40px rise, on a curve fitted to
  // power3.out, and it starts at first paint. Reduced motion is handled by the
  // media query alongside it.

  // The hero is now a plain in-flow section — it scrolls away normally. The
  // "reveal" moved to the cases→dossier hand-off (cases lifts to uncover the
  // black document, which starts rotating as it's revealed — js/cases-new.js +
  // js/dossier.js).

  // Safe space above the rail. The mark sits on the viewport's centre while the
  // rail is pinned to the bottom, so on a short window — a browser carrying tabs
  // and a bookmarks bar — the paragraph closes on "Strategy · Driven · Design".
  // Lift the whole stack by however much it takes to hold a gap; 0 when there is
  // room, so a tall window still matches the frame exactly.
  //
  // Measured off offsetTop, not rects: the scroll parallax transforms both, and
  // rects would read the transformed position and feed it back into the lift.
  const SAFE_GAP = 40;
  function syncLift() {
    const hero = document.querySelector(".nh-hero");
    const para = document.querySelector(".nh-hero-para");
    const bottom = document.querySelector(".nh-hero-bottom");
    if (!hero || !para || !bottom) return;
    hero.style.setProperty("--nh-lift", "0px");
    // The paragraph now hangs BELOW the rail, so the thing it can close on is
    // the wordmark — which is pinned to the bottom while the block is centred.
    const need = para.offsetTop + para.offsetHeight + SAFE_GAP - bottom.offsetTop;
    hero.style.setProperty("--nh-lift", Math.max(0, Math.round(need)) + "px");
  }
  syncLift();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncLift);
  let liftT;
  window.addEventListener("resize", () => { clearTimeout(liftT); liftT = setTimeout(syncLift, 120); });

  // The old "Open a Case" pill is gone — the nav's right rail now carries
  // "Work with us" (→ contact.html) and the copy-email widget (js/copy-email.js).
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
