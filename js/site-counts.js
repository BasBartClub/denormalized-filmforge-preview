// Live numbers for the nav annotations (WV-40).
//
// The counts next to Cases and Insights, and the month on the work-with-us CTA,
// were hardcoded in three separate places — the hero rail, the footer, and the
// mobile menu — so they could (and did) disagree with each other and with
// reality. They come from here now, and every place that shows one is stamped
// from the same value.
//
// Anything carrying data-dn-count="cases" | "insights" | data-dn-month |
// data-dn-year gets filled at load. Brackets/parens stay in the markup around it.
(function () {
  // Cases: the case-study pages that are actually published. Update this list
  // when one ships and every count on the site follows.
  var CASES = [
    "estyl-case-study-denormalized.html",
    "fourdesign-website-redesign.html",
    "linen-case-study-denormalized-r.html",
    "luminar-foundation-branding-website-design.html",
    "specialty-case-study-denormalized-r.html",
  ];

  // Insights: PUBLISHED articles. The first piece is written but held back
  // (WV-37 — article.html serves the placeholder), so this is 0 until it ships.
  var INSIGHTS = 0;

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // The availability line advertises the NEXT intake, not the current month —
  // the design reads (Sep) and was drawn in August. Rolls on its own.
  function nextMonth() {
    var d = new Date();
    return MONTHS[(d.getMonth() + 1) % 12];
  }

  var VALUES = {
    cases: String(CASES.length),
    insights: String(INSIGHTS),
  };

  // The copyright year. It was typed as 2025 into the footer of every page and
  // the nav of most of them — thirteen places to forget next January (WV-59).
  // The year in the markup is only what a reader sees if this never runs.
  function thisYear() {
    return String(new Date().getFullYear());
  }

  function stamp(root) {
    (root || document).querySelectorAll("[data-dn-count]").forEach(function (el) {
      var v = VALUES[el.getAttribute("data-dn-count")];
      if (v != null) el.textContent = v;
    });
    (root || document).querySelectorAll("[data-dn-month]").forEach(function (el) {
      el.textContent = nextMonth();
    });
    (root || document).querySelectorAll("[data-dn-year]").forEach(function (el) {
      el.textContent = thisYear();
    });
  }

  window.dnCounts = { values: VALUES, month: nextMonth, year: thisYear, stamp: stamp };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { stamp(); });
  } else {
    stamp();
  }
})();
