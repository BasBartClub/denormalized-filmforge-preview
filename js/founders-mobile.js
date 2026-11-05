// Founders — MOBILE only (Figma 1195-6941). The three principles become a
// one-at-a-time carousel: ← → arrows (injected under the active label) rotate
// through them. Desktop keeps the three-column row untouched.

function arrowSVG(dir) {
  const p = dir === "left" ? "M20 12H4M10 6l-6 6 6 6" : "M4 12h16M14 6l6 6-6 6";
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + p + '"/></svg>';
}

function init() {
  if (!window.matchMedia("(max-width: 767px)").matches) return;
  const cont = document.querySelector(".blur-stiki-section .founder-contant");
  if (!cont) return;
  const items = [...cont.querySelectorAll(".founder-contant-item")];
  if (items.length < 2) return;

  const arrows = document.createElement("div");
  arrows.className = "dn-found-arrows";
  const mk = (dir, label) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "dn-found-arrow";
    b.setAttribute("aria-label", label);
    b.innerHTML = arrowSVG(dir);
    return b;
  };
  const prev = mk("left", "Previous principle");
  const next = mk("right", "Next principle");
  arrows.append(prev, next);

  let idx = 0;
  const show = (i) => {
    idx = (i + items.length) % items.length;
    items.forEach((it, k) => it.classList.toggle("is-active", k === idx));
    items[idx].appendChild(arrows);            // arrows live under the active label
  };
  prev.addEventListener("click", () => show(idx - 1));
  next.addEventListener("click", () => show(idx + 1));
  show(0);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
