// Dossier arrival — editorialnew "document on a table". The section is a BLACK
// table; the paper starts a small, CENTRED miniature and, while the section is
// pinned, scales up + spins a full turn into the full document. It stops short of
// full width (scaleTo < 1) so black table shows on the sides. Rotation is anchored
// at the DOCUMENT CENTRE. After the pin releases you scroll through the document.

// Final tuned config (locked in from ?dossierdev).
const CFG = {
  scaleFrom: 0.35,  // miniature scale
  scaleTo: 0.85,    // final scale (< 1 → black table margin on the sides)
  spin: 360,        // deg of rotation across the arrival (360 = one full turn → 0)
  topPad: 70,       // px of black table above the document when it lands
  pin: 2,           // screens pinned. The first ~half overlaps the cases reveal
                    // (doc small + rotating as it's uncovered); the rest lands it.
  scrub: 1,
};

function init() {
  const gsap = window.gsap, ST = window.ScrollTrigger;
  const sec = document.querySelector(".dn-dossier");
  const page = sec && sec.querySelector(".text-body");
  if (!page) return;

  // Keep the redaction bars measured AND redrawn (they were popping in late).
  const relayout = () => { try { const ink = window.__dnInk; if (ink) { ink.layout(); ink.render(0); } } catch (_) {} };

  // Mobile (Figma 1658-17244): the document is a plain, static, WHITE page — no
  // black table, no rotation arrival. CSS reflows it; just skip the pin here.
  if (window.matchMedia("(max-width: 767px)").matches) { relayout(); return; }

  if (!gsap || !ST || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    relayout();
    return;
  }
  gsap.registerPlugin(ST);

  function build() {
    ScrollTrigger.getAll().forEach((s) => { if (s.trigger === sec) s.kill(); });
    // width stays 100% (layout as designed — the side margin comes from scaleTo).
    page.style.width = ""; page.style.margin = "";
    gsap.set(page, { transformOrigin: "50% 50%", willChange: "transform" });

    const apply = (p) => {
      const scale = CFG.scaleFrom + (CFG.scaleTo - CFG.scaleFrom) * p;
      const rot = -CFG.spin * (1 - p);                        // full turn → 0
      const vh = window.innerHeight, docH = page.offsetHeight;
      // Anchor at the document centre. y interpolates from CENTRED (miniature) to
      // TOP-ALIGNED at scaleTo (so the read-through starts at the header).
      const tyStart = (vh - docH) / 2;                        // doc centre → viewport centre
      const tyEnd = (docH / 2) * (CFG.scaleTo - 1) + CFG.topPad; // doc top → topPad below the top
      gsap.set(page, { scale, rotate: rot, y: tyStart + (tyEnd - tyStart) * p });
      if (p < 0.04 || p > 0.96) relayout();
    };

    ScrollTrigger.create({
      trigger: sec,
      start: "top top",
      end: "+=" + Math.round(CFG.pin * window.innerHeight),
      pin: true,
      pinSpacing: true,
      scrub: CFG.scrub,
      invalidateOnRefresh: true,
      onUpdate: (self) => apply(self.progress),
      onRefresh: (self) => apply(self.progress),
    });
  }
  build();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { ST.refresh(); relayout(); });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
