// Homepage cases — Figma 1195-6657. A pinned, scroll-driven list:
//   · top-right   — case names. The ACTIVE case is solid; the NEXT case's name
//                   fills black left→right (clipped to the WORD, so 0→100% is the
//                   whole word) as a scroll progress bar. When it completes the
//                   active advances. Others dim.
//   · top-left    — active case description (masked reveal on switch).
//   · bottom-left — active case services (masked reveal on switch).
//   · bottom-right— active case cover VIDEO (masked wipe on switch: in from the
//                   bottom going forward, from the top going back).
// Light theme (white). Replaces the old WebGL thread experiment.

const CASES = [
  { name: "FixYourFilm",
    desc: "Eigen AI-filmplatform: van idee tot 4K-master in één productieketen. Galerij met mastered films en losse shots.",
    services: ["AI-film", "Platform", "Pipeline"],
    image: "images/ff/fixyourfilm/cover.webp", href: "werk/fixyourfilm/" },
  { name: "DANIEL/VOLT",
    desc: "AI-film 2:13 / 11 shots — look, blocking en cinema-afwerking onder één regie.",
    services: ["AI-video", "Regie", "Montage"],
    image: "images/ff/daniel-volt/look.webp", href: "werk/daniel-volt/" },
  { name: "Huis Zelfverkoop",
    desc: "0% courtage-platform plus AI-fotostudio: website, woningzoeker en merk in één lijn.",
    services: ["Website", "AI-foto", "Merk"],
    image: "images/ff/huis-zelfverkoop/start.webp", href: "werk/huis-zelfverkoop/" },
  { name: "FilmForge.nl",
    desc: "Eigen website en kennisbank — snel, vindbaar, met video en diensten onder één dak.",
    services: ["Website", "SEO", "Kennisbank"],
    image: "images/ff/filmforge-website/start.webp", href: "werk/filmforge-website/" },
  { name: "AI 15s",
    desc: "Vijftien seconden chaos → film. Korte AI-commercial als proof van de pipeline.",
    services: ["AI-commercial", "15s", "Social"],
    image: "images/ff/ai-film-15s/start.webp", href: "werk/ai-film-15s/" },
];

const N = CASES.length;
const CASE_SCREENS = 0.8;   // viewports of scroll per case advance
const LAST_HOLD = 0.8;      // hold the final case before the reveal begins
const REVEAL_SCREENS = 1;   // the pin lifts away here, uncovering the dossier
const FULL = "inset(0px 0px 0px 0px)";

function init() {
  const sec = document.querySelector(".dn-cases");
  if (!sec) return;
  const gsap = window.gsap, ST = window.ScrollTrigger;

  // Mobile (Figma 1195-6840): drop the pinned scroll experience entirely — it's
  // a plain vertical stack of cover + name/services + description, first three
  // shown, the rest behind "Show More". No pin, no reveal, no dossier overlap.
  if (window.matchMedia("(max-width: 767px)").matches) { buildMobile(sec); return; }

  const list = sec.querySelector(".dn-cases-list");
  const descEl = sec.querySelector(".dn-cases-desc");
  const servEl = sec.querySelector(".dn-cases-services");
  const cover = sec.querySelector(".dn-cases-cover");

  // Masked-reveal inner wrappers for the left text.
  descEl.innerHTML = '<span class="dn-reveal-inner"></span>';
  servEl.innerHTML = '<span class="dn-reveal-inner"></span>';
  const descInner = descEl.firstChild, servInner = servEl.firstChild;

  // List rows: base name (dim / solid when active) + a black fill clipped to the word.
  const rows = CASES.map((c) => {
    const li = document.createElement("li");
    li.className = "dn-case-row";
    const open = c.href ? `<a class="dn-case-link" href="${c.href}">` : '<span class="dn-case-link">';
    const close = c.href ? "</a>" : "</span>";
    li.innerHTML = open +
      `<span class="dn-case-name">${c.name}</span>` +
      `<span class="dn-case-fill" aria-hidden="true">${c.name}</span>` + close;
    list.appendChild(li);
    return li;
  });
  const fills = rows.map((r) => r.querySelector(".dn-case-fill"));

  // Stacked covers: image preferred (FilmForge), else video.
  const videos = CASES.map((c) => {
    let el;
    if (c.image) {
      el = document.createElement("img");
      el.className = "dn-case-video";
      el.alt = c.name;
      el.decoding = "async";
      el.src = c.image;
      el.style.objectFit = "cover";
    } else {
      el = document.createElement("video");
      el.className = "dn-case-video";
      el.muted = true; el.loop = true; el.playsInline = true; el.preload = "none";
      el.setAttribute("muted", ""); el.setAttribute("playsinline", "");
      el.dataset.src = c.video || "";
    }
    el.style.clipPath = FULL;
    cover.appendChild(el);
    return el;
  });
  const ensureLoaded = (v) => {
    if (!v) return;
    if (v.tagName === "IMG") return;
    if (!v.src && v.dataset.src) { v.src = v.dataset.src; v.load(); }
  };

  let current = -1, z = 0;
  function setActive(i, dir) {
    current = i;
    rows.forEach((r, k) => r.classList.toggle("is-active", k === i));

    // Left text — masked slide-up reveal.
    descInner.textContent = CASES[i].desc;
    servInner.textContent = CASES[i].services.join(", ");
    if (gsap) {
      gsap.fromTo([descInner], { yPercent: 110 }, { yPercent: 0, duration: 0.55, ease: "power3.out" });
      gsap.fromTo([servInner], { yPercent: 110 }, { yPercent: 0, duration: 0.55, ease: "power3.out", delay: 0.05 });
    }

    // Cover video — masked wipe over the previous one.
    const v = videos[i];
    ensureLoaded(v); ensureLoaded(videos[i + 1]); ensureLoaded(videos[i - 1]);
    v.style.zIndex = String(++z);
    v.style.opacity = "1";
    const from = dir >= 0 ? "inset(100% 0px 0px 0px)" : "inset(0px 0px 100% 0px)";
    if (gsap) gsap.fromTo(v, { clipPath: from }, { clipPath: FULL, duration: 0.6, ease: "power2.inOut", overwrite: true });
    else v.style.clipPath = FULL;
    if (v.tagName === "VIDEO" && v.play) { const p = v.play(); if (p) p.catch(() => {}); }
    videos.forEach((o, k) => { if (k !== i && o.tagName === "VIDEO" && o.pause) o.pause(); });
  }

  function render(g) {
    const active = Math.min(Math.floor(g), N - 1);
    const frac = g - active;
    if (active !== current) setActive(active, active > current ? 1 : -1);
    // Fill only the NEXT case's word (0 → its full width). Everyone else hidden.
    fills.forEach((f, k) => {
      const amt = k === active + 1 ? frac : 0;
      f.style.clipPath = "inset(0px " + ((1 - amt) * 100).toFixed(2) + "% 0px 0px)";
    });
  }

  setActive(0, 1);

  // Only the COVER is clickable + shows the Explore glove (WV-16). Clicking dead
  // space felt wrong — the cover is the obvious target. The case-name links keep
  // their own per-case navigation.
  const zone = sec.querySelector(".dn-cases-cover");
  const activeHref = () => CASES[current] && CASES[current].href;
  zone.addEventListener("click", (e) => {
    if (e.target.closest(".dn-case-link")) return;   // names keep their per-case link
    const h = activeHref();
    if (!h) return;
    if (window.dnNavigate) window.dnNavigate(h, e.clientX, e.clientY); else window.location.href = h;
  });

  // "Explore" glove cursor over that zone (desktop only). Lift the Webflow hand
  // Lottie out of .mouse-move — IX2 keeps re-pinning its opacity to 0, so steal
  // the animating node into our own follow element. Hide it over the name links
  // (they get the normal pointer) and when the active case has no page.
  if (window.matchMedia("(pointer: fine)").matches) {
    const srcHand = document.querySelector(".cursor-wrapper .mouse-move");
    const lottie = srcHand && srcHand.firstElementChild;
    if (lottie) {
      const glove = document.createElement("div");
      glove.className = "dn-glove-cursor";
      glove.style.cssText =
        "position:fixed;left:0;top:0;width:69px;height:87px;z-index:100000;pointer-events:none;" +
        "opacity:0;transition:opacity .16s ease;will-change:transform,opacity;display:flex;align-items:center;justify-content:center";
      lottie.style.width = "100%"; lottie.style.height = "100%";
      glove.appendChild(lottie);
      document.body.appendChild(glove);
      const trackGlove = (e) => {
        if (e.target.closest(".dn-case-link") || !activeHref()) { glove.style.opacity = "0"; zone.style.cursor = ""; return; }
        zone.style.cursor = "none"; glove.style.opacity = "1";
        glove.style.transform = "translate(" + e.clientX + "px, " + e.clientY + "px) translate(-50%, -50%)";
      };
      zone.addEventListener("mouseenter", trackGlove);   // show immediately (also when it scrolls under a still cursor)
      zone.addEventListener("mousemove", trackGlove);
      zone.addEventListener("mouseleave", () => { glove.style.opacity = "0"; zone.style.cursor = ""; });
    }
  }

  const pin = sec.querySelector(".dn-cases-pin");
  const totalScreens = (N - 1) * CASE_SCREENS + LAST_HOLD + REVEAL_SCREENS;
  sec.style.height = (totalScreens * 100) + "vh";

  if (!gsap || !ST || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { render(N - 1); return; }
  gsap.registerPlugin(ST);

  // Progress [0,1] over the section: cycle the cases in the front span, hold the
  // last one, then LIFT the whole pin up over the final REVEAL_SCREENS to uncover
  // the dossier.
  const holdFrac = LAST_HOLD / totalScreens;
  const revealFrac = REVEAL_SCREENS / totalScreens;
  const cycleSpan = 1 - holdFrac - revealFrac;
  const revealAt = 1 - revealFrac;
  const toG = (p) => Math.min(Math.max(0, p / cycleSpan), 1) * (N - 1);

  // Pull the dossier up so it PINS exactly at the reveal-start — then it sits
  // stationary behind the cases (rotating its document in) while the pin lifts
  // off it, instead of rising up from below. Overlap (in screens):
  //   totalScreens − revealAt·(scroll range = totalScreens − 1 screen)
  const doss = document.querySelector(".dn-dossier");
  const overlapScreens = totalScreens - revealAt * (totalScreens - 1);
  if (doss) doss.style.marginTop = (-overlapScreens * 100) + "vh";

  const update = (p) => {
    render(toG(p));
    const rv = Math.min(Math.max(0, (p - revealAt) / revealFrac), 1);
    gsap.set(pin, { yPercent: -100 * rv });
  };
  ST.create({
    trigger: sec,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    invalidateOnRefresh: true,
    onUpdate: (self) => update(self.progress),
    onRefresh: (self) => update(self.progress),
  });

  // The margin above shifts the dossier's pin start — recompute all triggers now
  // that layout is final (dossier.js may have built its pin before this ran).
  requestAnimationFrame(() => ST.refresh());
}

// ---- Mobile: simple vertical stack (Figma 1195-6840) -------------------------
function buildMobile(sec) {
  sec.classList.add("is-mobile");
  sec.style.height = "";
  const pin = sec.querySelector(".dn-cases-pin");
  pin.innerHTML = "";

  const head = document.createElement("div");
  head.className = "dn-mhead";
  head.textContent = "[ Geselecteerd werk ]";
  pin.appendChild(head);

  // Load + play each cover only while it's near the viewport (perf).
  const io = ("IntersectionObserver" in window) ? new IntersectionObserver((ents) => {
    ents.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) { if (!v.src) { v.src = v.dataset.src; v.load(); } const p = v.play(); if (p) p.catch(() => {}); }
      else v.pause();
    });
  }, { rootMargin: "300px 0px" }) : null;

  CASES.forEach((c, i) => {
    const block = document.createElement(c.href ? "a" : "div");
    block.className = "dn-mcase";
    if (c.href) block.href = c.href;

    const cover = document.createElement("div");
    cover.className = "dn-mcover";
    let v;
    if (c.image) {
      v = document.createElement("img");
      v.src = c.image; v.alt = c.name; v.decoding = "async";
      v.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover";
    } else {
      v = document.createElement("video");
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = "none";
      v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
      v.dataset.src = c.video || "";
      if (io) io.observe(v);
    }
    cover.appendChild(v);

    const meta = document.createElement("div");
    meta.className = "dn-mmeta";
    meta.innerHTML = '<span class="dn-mname"></span><span class="dn-mserv"></span>';
    meta.firstChild.textContent = c.name;
    meta.lastChild.textContent = c.services.join(", ");

    const desc = document.createElement("p");
    desc.className = "dn-mdesc";
    desc.textContent = c.desc;

    block.append(cover, meta, desc);
    pin.appendChild(block);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
