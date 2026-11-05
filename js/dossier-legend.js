// Clickable legend → swaps the deliverables grid beneath the heading.
//
// Codes are GENERATED, never typed by hand:
//   category code = initials of each word + its 1-based number
//                     "Strategy & Research"          → SR1
//                     "Brand & Communication Design" → BCD2   (& is skipped)
//   item code     = the category's code + the item's initials
//                     "Brand Persona" under SR1      → SR1—BP
//   (a trailing "(parenthetical)" is ignored when forming a code)
//
// To fill in real content, edit CATEGORIES — names only. Every code + cell falls out.
//
// Three reveals:
//   · legend rows  — hover rolls the label letters bottom-up (CSS, per-letter stagger)
//   · grid items   — shifting symbols resolve into the code + word (scramble)
//   · empty cells   — scattered at random positions, not clustered at the end

const CATEGORIES = [
  {
    name: "Strategy & Research",
    items: [
      "Market & Category Research", "Competitive Audit", "Positioning",
      "Brand Persona", "Tone of Voice", "Value Proposition",
      "Problem Statement", "Customer Journey Mapping", "Information Architecture",
    ],
  },
  {
    name: "Brand & Communication Design",
    items: [
      "Logo System", "Brand Guidelines", "Typography System", "Colour System",
      "Iconography", "Art Direction", "Campaign Concepts", "Social Templates",
      "Editorial Design", "Packaging",
    ],
  },
  {
    // Sam's list (screenshot Frame 1948761770)
    name: "Digital Design",
    items: [
      "UI Library", "Layout Systems", "Motion", "Usability Testing",
      "A/B & Preference Testing", "Accessibility Checks",
      "Edge Cases & States (404s, confirmations, empties)",
      "Handoff Specs & Developer Notes", "Microinteractions & Transitions",
      "Implementation Support (Retainer)",
    ],
  },
  {
    name: "Creative Development",
    items: [
      "Design System in Code", "Front-end Build", "WebGL & Shaders",
      "Motion (GSAP)", "CMS Integration", "Performance Budget",
      "Interactive Prototypes", "Creative Coding", "Deployment & QA",
    ],
  },
];

const SEP = "—";                       // joins category code and item initials
const GRID_COLS = 6, GRID_MIN = 12;    // Figma grid is 6 wide, ≥ 2 rows
const GLYPHS = "ABCDEFGHKLMNPRSTUVWXYZ0123456789#%&/=+<>*—·";

const baseName = (s) => s.split("(")[0];        // drop "(parenthetical)" for codes
const initials = (s) =>
  baseName(s).split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("");
const catCode = (c, i) => initials(c.name) + (i + 1);
const itemCode = (c, i, item) => catCode(c, i) + SEP + initials(item);

// Fisher–Yates
function shuffle(a) {
  for (let k = a.length - 1; k > 0; k--) {
    const j = (Math.random() * (k + 1)) | 0;
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}

// Shifting-symbols reveal: each character starts blank, flickers through glyphs,
// then locks to its final letter — left to right, so words + codes "decode" in.
function scramble(el, text, delay) {
  const N = text.length, per = 30, settle = 300;
  const t0 = performance.now() + (delay || 0);
  let raf, safety;
  const finish = () => { el.textContent = text; };
  const frame = (now) => {
    const t = now - t0;
    let out = "", done = true;
    for (let k = 0; k < N; k++) {
      const ch = text[k];
      if (ch === " ") { out += " "; continue; }
      const cs = k * per, ce = cs + settle;
      if (t < cs) { done = false; }                                  // not yet
      else if (t < ce) { out += GLYPHS[(Math.random() * GLYPHS.length) | 0]; done = false; }
      else out += ch;
    }
    el.textContent = out;
    if (!done) raf = requestAnimationFrame(frame);
    else finish();
  };
  raf = requestAnimationFrame(frame);
  // Guarantee the resolved text even if rAF is suspended (backgrounded tab) —
  // never leave a cell stuck mid-decode / blank.
  safety = setTimeout(finish, (delay || 0) + N * per + settle + 250);
  return () => { cancelAnimationFrame(raf); clearTimeout(safety); };
}

// Split a label into per-letter spans for the bottom-up hover roll. Each letter
// is a tight overflow-hidden window holding TWO stacked copies of itself; on
// hover the pair slides up exactly one line so a fresh copy rolls into place.
function splitLetters(label, text) {
  label.textContent = "";
  [...text].forEach((ch, k) => {
    const outer = document.createElement("span");
    outer.className = "dn-ltr";
    outer.style.setProperty("--i", k);
    const inner = document.createElement("span");
    inner.className = "dn-ltr-in";
    const c = ch === " " ? " " : ch;
    const a = document.createElement("span"); a.textContent = c;
    const b = document.createElement("span"); b.textContent = c;
    inner.append(a, b);
    outer.appendChild(inner);
    label.appendChild(outer);
  });
}

function init() {
  const sec = document.querySelector(".dn-dossier");
  const legend = sec && sec.querySelector(".dn-legend");
  const grid = sec && sec.querySelector(".dn-grid");
  if (!legend || !grid) return;

  // Build the legend from data — rows are buttons: code + name + active dot.
  legend.innerHTML = "";
  const rows = CATEGORIES.map((c, i) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "dn-leg-row";
    row.setAttribute("aria-pressed", "false");
    const code = document.createElement("span");
    code.className = "dn-leg-code";
    code.textContent = catCode(c, i);
    const label = document.createElement("span");
    label.className = "dn-leg-label";
    splitLetters(label, c.name);
    const dot = document.createElement("span");
    dot.className = "dn-leg-dot";
    dot.setAttribute("aria-hidden", "true");
    row.append(code, label, dot);
    row.addEventListener("click", () => select(i, true));
    legend.appendChild(row);
    return row;
  });

  let current = 0, cancels = [];

  function renderGrid(i, animate) {
    cancels.forEach((fn) => fn());
    cancels = [];
    const c = CATEGORIES[i];
    grid.innerHTML = "";
    const total = Math.max(GRID_MIN, Math.ceil(c.items.length / GRID_COLS) * GRID_COLS);
    // scatter the filled cells at random positions (empties fall wherever)
    const order = shuffle([...Array(total).keys()]).slice(0, c.items.length);
    const placed = new Array(total).fill(null);
    c.items.forEach((it, idx) => { placed[order[idx]] = it; });

    placed.forEach((item, pos) => {
      const cell = document.createElement("div");
      cell.className = "dn-cell";
      if (item) {
        const code = document.createElement("span");
        code.className = "dn-cell-code";
        const lab = document.createElement("span");
        lab.className = "dn-cell-label";
        cell.append(code, lab);
        const codeTxt = itemCode(c, i, item);
        if (animate) {
          const d = pos * 45;                       // cascade across the grid
          cancels.push(scramble(code, codeTxt, d));
          cancels.push(scramble(lab, item, d + 90));
        } else {
          code.textContent = codeTxt;
          lab.textContent = item;
        }
      } else {
        cell.setAttribute("aria-hidden", "true");   // empty frame cell
      }
      grid.appendChild(cell);
    });

    // Grid reflow can nudge the redaction overlay (screen 2) — re-measure it.
    try { window.__dnInk && window.__dnInk.layout(); } catch (_) {}
  }

  function select(i, animate) {
    current = i;
    rows.forEach((r, k) => {
      const on = k === i;
      r.classList.toggle("is-active", on);
      r.setAttribute("aria-pressed", on ? "true" : "false");
    });
    renderGrid(i, animate);
  }

  select(0, false);                                 // Strategy & Research, static first

  // Mobile (Figma 1658-17244): the grid is a plain filled table — no scramble
  // decode. Leave the static render above as-is.
  if (window.matchMedia("(max-width: 767px)").matches) return;

  // Decode the grid the first time the document actually scrolls into view.
  let revealed = false;
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !revealed) {
          revealed = true;
          renderGrid(current, true);
          io.disconnect();
        }
      });
    }, { threshold: 0.12 });
    io.observe(grid);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
