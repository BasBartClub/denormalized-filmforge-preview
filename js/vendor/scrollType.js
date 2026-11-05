gsap.registerPlugin(ScrollTrigger);
Splitting();

// Lenis smooth scrolling
let lenis;

// Initialize Lenis smooth scrolling
const initSmoothScrolling = () => {
  lenis = new Lenis({
    lerp: 0.2,
    smooth: true
  });
  window.lenis = lenis; // exposed so the embedded cases experiment can forward wheel/touch here

  lenis.on("scroll", () => ScrollTrigger.update());

  const scrollFn = (time) => {
    lenis.raf(time);
    requestAnimationFrame(scrollFn);
  };

  requestAnimationFrame(scrollFn);
};

const type1 = [...document.querySelectorAll("[data-splitting][data-effect1]")];

const type2 = [...document.querySelectorAll("[data-splitting][data-effect2]")];

const type3 = [...document.querySelectorAll("[data-splitting][data-effect3]")];

const type4 = [...document.querySelectorAll("[data-splitting][data-effect4]")];

const type5 = [...document.querySelectorAll("[data-splitting][data-effect5]")];

const type6 = [...document.querySelectorAll("[data-splitting][data-effect6]")];

const type7 = [...document.querySelectorAll("[data-splitting][data-effect7]")];

const type8 = [...document.querySelectorAll("[data-splitting][data-effect8]")];

const type9 = [...document.querySelectorAll("[data-splitting][data-effect9]")];

const type10 = [
  ...document.querySelectorAll("[data-splitting][data-effect10]")
];

const scroll = () => {
  type1.forEach((title) => {
    gsap.fromTo(
      title,
      {
        transformOrigin: "0% 50%",
        rotate: 3
      },
      {
        ease: "none",
        rotate: 0,
        scrollTrigger: {
          trigger: title,
          start: "top bottom",
          end: "top top",
          scrub: true
        }
      }
    );

    gsap.fromTo(
      title.querySelectorAll(".word"),
      {
        "will-change": "opacity",
        opacity: 0.1
      },
      {
        ease: "none",
        opacity: 1,
        stagger: 0.05,
        scrollTrigger: {
          trigger: title,
          start: "top bottom-=20%",
          end: "center top+=20%",
          scrub: true
        }
      }
    );
  });

  type2.forEach((title) => {
    const chars = title.querySelectorAll(".char");

    chars.forEach((char) => gsap.set(char.parentNode, { perspective: 1000 }));

    gsap.fromTo(
      chars,
      {
        "will-change": "opacity, transform",
        opacity: 0,
        rotateX: () => gsap.utils.random(-120, 120),
        z: () => gsap.utils.random(-200, 200)
      },
      {
        ease: "none",
        opacity: 1,
        rotateX: 0,
        z: 0,
        stagger: 0.02,
        scrollTrigger: {
          trigger: title,
          start: "top bottom",
          end: "bottom top",
          scrub: true
        }
      }
    );
  });

  type3.forEach((title) => {
    const chars = title.querySelectorAll(".char");

    chars.forEach((char) => gsap.set(char.parentNode, { perspective: 1000 }));

    gsap.fromTo(
      chars,
      {
        "will-change": "opacity, transform",
        opacity: 0.2,
        z: -800
      },
      {
        ease: "back.out(1.2)",
        opacity: 1,
        z: 0,
        stagger: 0.04,
        scrollTrigger: {
          trigger: title,
          start: "top bottom",
          end: "bottom top",
          scrub: true
        }
      }
    );
  });

  type4.forEach((title) => {
    const chars = title.querySelectorAll(".char");

    chars.forEach((char) => gsap.set(char.parentNode, { perspective: 1000 }));

    gsap.fromTo(
      chars,
      {
        "will-change": "opacity, transform",
        transformOrigin: "50% 0%",
        opacity: 0,
        rotationX: -90,
        z: -200
      },
      {
        ease: "power1",
        opacity: 1,
        stagger: 0.05,
        rotationX: 0,
        z: 0,
        scrollTrigger: {
          trigger: title,
          start: "center bottom",
          end: "bottom top+=20%",
          scrub: true
        }
      }
    );
  });

  type5.forEach((title) => {
    const chars = title.querySelectorAll(".char");

    chars.forEach((char) => gsap.set(char.parentNode, { perspective: 1000 }));

    gsap.fromTo(
      chars,
      {
        "will-change": "opacity, transform",
        transformOrigin: "50% 100%",
        opacity: 0,
        rotationX: 90
      },
      {
        ease: "power4",
        opacity: 1,
        stagger: {
          each: 0.03,
          from: "random"
        },
        rotationX: 0,
        scrollTrigger: {
          trigger: title,
          start: "center bottom",
          end: "bottom top+=20%",
          scrub: true
        }
      }
    );
  });

  type6.forEach((title) => {
    const words = [...title.querySelectorAll(".word")];

    for (const word of words) {
      const chars = word.querySelectorAll(".char");

      chars.forEach((char) => gsap.set(char.parentNode, { perspective: 2000 }));

      gsap.fromTo(
        chars,
        {
          "will-change": "opacity, transform",
          opacity: 0,
          y: (position, _, arr) => -40 * Math.abs(position - arr.length / 2),
          z: () => gsap.utils.random(-1500, -600),
          rotationX: () => gsap.utils.random(-500, -200)
        },
        {
          ease: "power1.inOut",
          opacity: 1,
          y: 0,
          z: 0,
          rotationX: 0,
          stagger: {
            each: 0.06,
            from: "center"
          },
          scrollTrigger: {
            trigger: word,
            start: "top bottom",
            end: "top top+=15%",
            scrub: true
          }
        }
      );
    }
  });

  type7.forEach((title) => {
    const chars = title.querySelectorAll(".char");
    const charsTotal = chars.length;

    gsap.fromTo(
      chars,
      {
        "will-change": "transform",
        y: (position) => {
          const factor =
            position < Math.ceil(charsTotal / 2)
              ? position
              : Math.ceil(charsTotal / 2) -
                Math.abs(Math.floor(charsTotal / 2) - position) -
                1;
          return (charsTotal / 2 - factor + 6) * 130;
        }
      },
      {
        ease: "elastic.out(.4)",
        y: 0,
        stagger: {
          amount: 0.1,
          from: "center"
        },
        scrollTrigger: {
          trigger: title,
          start: "top bottom",
          end: "bottom top-=50%",
          scrub: true
        }
      }
    );
  });

  type8.forEach((title) => {
    gsap.fromTo(
      title.querySelectorAll(".char"),
      {
        "will-change": "transform",
        transformOrigin: "50% 100%",
        scaleY: 0
      },
      {
        ease: "power3.in",
        opacity: 1,
        scaleY: 1,
        stagger: 0.05,
        scrollTrigger: {
          trigger: title,
          start: "center center",
          end: "+=500%",
          scrub: true,
          pin: title.parentNode
        }
      }
    );
  });

  type9.forEach((title) => {
    const words = [...title.querySelectorAll(".word")];

    for (const word of words) {
      const chars = word.querySelectorAll(".char");
      const charsTotal = chars.length;

      gsap.fromTo(
        chars,
        {
          "will-change": "transform, filter",
          transformOrigin: "50% 100%",
          scale: (position) => {
            const factor =
              position < Math.ceil(charsTotal / 2)
                ? position
                : Math.ceil(charsTotal / 2) -
                  Math.abs(Math.floor(charsTotal / 2) - position) -
                  1;
            return gsap.utils.mapRange(
              0,
              Math.ceil(charsTotal / 2),
              0.5,
              2.1,
              factor
            );
          },
          y: (position) => {
            const factor =
              position < Math.ceil(charsTotal / 2)
                ? position
                : Math.ceil(charsTotal / 2) -
                  Math.abs(Math.floor(charsTotal / 2) - position) -
                  1;
            return gsap.utils.mapRange(
              0,
              Math.ceil(charsTotal / 2),
              0,
              60,
              factor
            );
          },
          rotation: (position) => {
            const factor =
              position < Math.ceil(charsTotal / 2)
                ? position
                : Math.ceil(charsTotal / 2) -
                  Math.abs(Math.floor(charsTotal / 2) - position) -
                  1;
            return position < charsTotal / 2
              ? gsap.utils.mapRange(0, Math.ceil(charsTotal / 2), -4, 0, factor)
              : gsap.utils.mapRange(0, Math.ceil(charsTotal / 2), 0, 4, factor);
          },
          filter: "blur(12px) opacity(0)"
        },
        {
          ease: "power2.inOut",
          y: 0,
          rotation: 0,
          scale: 1,
          filter: "blur(0px) opacity(1)",
          scrollTrigger: {
            trigger: word,
            start: "top bottom+=40%",
            end: "top top+=15%",
            scrub: true
          },
          stagger: {
            amount: 0.15,
            from: "center"
          }
        }
      );
    }
  });

  type10.forEach((title) => {
    const words = [...title.querySelectorAll(".word")];

    words.forEach((word) => gsap.set(word.parentNode, { perspective: 1000 }));

    gsap.fromTo(
      words,
      {
        "will-change": "opacity, transform",
        z: () => gsap.utils.random(500, 950),
        opacity: 0,
        xPercent: (pos) => gsap.utils.random(-100, 100),
        yPercent: (pos) => gsap.utils.random(-10, 10),
        rotationX: () => gsap.utils.random(-90, 90)
      },
      {
        ease: "expo",
        opacity: 1,
        rotationX: 0,
        rotationY: 0,
        xPercent: 0,
        yPercent: 0,
        z: 0,
        scrollTrigger: {
          trigger: title,
          start: "center center",
          end: "+=300%",
          scrub: true,
          pin: title.parentNode
        },
        stagger: {
          each: 0.006,
          from: "random"
        }
      }
    );
  });
};

initSmoothScrolling();

// WV-29: route in-page section links through Lenis. Native #hash jumps land short
// when ScrollTrigger pins sit between the top and the target — Insights stopped
// ~4000px above its section. Scoped to our "*-section" ids so Webflow tabs, swiper
// arrows (href="#") and cookie buttons keep their native behaviour.
// Where a section reads as STARTING. For most that is the element's own offset.
// The dossier is the exception: it is pinned for two screens while the document
// spins up from a rotating miniature, so its element offset is the START of that
// arrival — on screen, still the tail of the last case study. Landing on About
// means the end of the pinned range, where the document has settled and the
// header is readable. Shared with transition.js for #hash deep links.
var pinEndCache = typeof WeakMap === "function" ? new WeakMap() : null;
function sectionScrollY(target) {
  if (target.classList && target.classList.contains("dn-dossier")) {
    if (window.ScrollTrigger) {
      var pinned = window.ScrollTrigger.getAll().filter(function (s) {
        return s.trigger === target && s.pin;
      })[0];
      if (pinned) {
        if (pinEndCache) pinEndCache.set(target, pinned.end);
        return pinned.end;
      }
    }
    // WV-60. Falling through to the element offset is NOT a neutral guess for
    // this one element: the dossier's own top is the START of its pinned
    // arrival, which on screen is still the tail of the last case study. And
    // the pin can be missing for a frame — ScrollTrigger rebuilds on refresh,
    // and getAll() is empty while it does.
    //
    // That frame is the bug. The click handler re-resolves the target in its
    // onComplete to settle any drift, so a glide that landed correctly on the
    // dossier would get "corrected" 1800px BACKWARDS onto the last case the
    // moment a refresh happened to land there. Re-use the last known end
    // instead of a value we know is wrong.
    if (pinEndCache && pinEndCache.has(target)) return pinEndCache.get(target);
  }
  return target.getBoundingClientRect().top + (window.pageYOffset || window.scrollY || 0);
}
window.dnSectionScrollY = sectionScrollY;

// Keep the landing.
//
// The glide reaches the right place and then something else moves the page. The
// dossier is pinned with invalidateOnRefresh, and when ScrollTrigger recalculates
// that pin it restores the scroll to the pin's START — which on screen is the tail
// of the last case study. Instrumented on the live site: Lenis drove the page all
// the way to the pin end, and the scroll then became the pin start with no further
// scrollTo call from anyone. Nothing scrolled back; the position was reset beneath us.
//
// This used to be handled in lenis.scrollTo's `onComplete`. Lenis 0.2.28 does not
// support that option, so the correction has never once run — verified by passing
// onComplete and watching it never fire. Hence a watchdog instead: once the glide
// should have landed, re-assert the target for a short window, and get out of the
// way the moment the reader touches the page themselves.
function holdAfterGlide(target, glideSeconds) {
  var moved = false;
  var events = ["wheel", "touchstart", "keydown"];
  function release() {
    moved = true;
    events.forEach(function (t) { window.removeEventListener(t, release); });
  }
  events.forEach(function (t) { window.addEventListener(t, release, { passive: true }); });

  setTimeout(function () {
    var until = Date.now() + 1200;
    (function hold() {
      if (moved || Date.now() > until) { release(); return; }
      var want = sectionScrollY(target);
      var now = window.pageYOffset || window.scrollY || 0;
      // Only correct a real displacement, never fight sub-pixel settling.
      if (Math.abs(now - want) > 8) {
        if (window.lenis && window.lenis.scrollTo) window.lenis.scrollTo(want, { immediate: true });
        else window.scrollTo(0, want);
      }
      requestAnimationFrame(hold);
    })();
  }, glideSeconds * 1000 + 60);
}

document.addEventListener("click", function (e) {
  var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
  if (!a) return;
  var href = a.getAttribute("href");
  if (!href || !/-section$/.test(href)) return;      // only our page sections
  var target;
  try { target = document.querySelector(href); } catch (_) { return; }
  if (!target) return;
  e.preventDefault();                                 // we own the scroll for these
  if (getComputedStyle(target).display === "none") return;  // archived section (e.g. Unique Process) — inert
  var GLIDE = 1.2;
  if (window.lenis) {
    window.lenis.scrollTo(sectionScrollY(target), { duration: GLIDE });
  } else {
    window.scrollTo({ top: sectionScrollY(target), behavior: "smooth" });
  }
  holdAfterGlide(target, GLIDE);
  if (history.replaceState) history.replaceState(null, "", href);
});

// GSAP Scroll Triggers
scroll();
