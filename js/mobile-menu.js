// Mobile menu drawer. The .nh-mnav-menu button was styled but wired to nothing
// (the case-study pages use Webflow's own nav component, which is why the menu
// "works there but not on the homepage"). This injects a full-screen panel and
// toggles it. Self-contained; no deps beyond optional Lenis.
//
// WV-40: rebuilt to the design on the Notion row — a black sheet with [Close]
// top-left, the sections set large and CENTRED against the bottom, and a filled
// white "Work with us" block under them carrying the availability line. The
// counts and the month are stamped by js/site-counts.js, not typed in here.
//
// WV-43: no longer homepage-only. The contact page was still opening its links
// with a <details> disclosure — a menu nobody designed — so it now hangs off the
// same sheet. Two things follow from running on a second page: the trigger can
// be that page's <summary> (whose default toggle has to be swallowed), and the
// section links have to be qualified, because #cases-section is only an anchor
// when you are already on the page that has it.
(function () {
  function init() {
    var btn = document.querySelector(".nh-mnav-menu, .ct-menu-toggle");
    if (!btn || document.querySelector(".nh-mdrawer")) return;

    // "" on the home page so the anchors stay in-page (and Lenis can smooth-
    // scroll them); "/" everywhere else. Matches the home page in both its
    // forms, because /index.html still resolves even though nothing links to it.
    var home = /^\/(index(\.html)?)?$/.test(location.pathname) ? "" : "/";

    // Unique Process is in the design but its section is archived (display:none),
    // so it is left out rather than shipped as a link that goes nowhere — same
    // call as the footer. One line to restore when the section comes back.
    var links = [
      ["Featured Cases", home + "#cases-section", "cases"],
      ["About Us", home + "#about-section", null],
      ["Insights", home + "#insight-section", "insights"],
    ];

    var drawer = document.createElement("div");
    drawer.className = "nh-mdrawer";
    drawer.setAttribute("aria-hidden", "true");

    var html =
      '<button class="nh-mdrawer-close" type="button" aria-label="Close menu">[Close]</button>' +
      '<nav class="nh-mdrawer-nav" aria-label="Primary">';
    links.forEach(function (l) {
      html += '<a href="' + l[1] + '">' + l[0] +
        (l[2] ? '<sup class="nh-mdrawer-n">(<span data-dn-count="' + l[2] + '">–</span>)</sup>' : "") +
        "</a>";
    });
    html +=
      "</nav>" +
      '<a class="nh-mdrawer-cta" href="contact/">' +
        '<span class="nh-mdrawer-cta-line">Work with us</span>' +
        '<span class="nh-mdrawer-cta-meta">' +
          '<span>2 openings</span>' +
          '<span>(<span data-dn-month>Sep</span>)</span>' +
        "</span>" +
      "</a>";
    drawer.innerHTML = html;
    document.body.appendChild(drawer);
    if (window.dnCounts) window.dnCounts.stamp(drawer);

    // A <summary>'s aria-expanded is owned by its own <details>, and that
    // disclosure stays shut — saying "expanded" there would describe a list the
    // reader is not being shown. The sheet announces itself instead.
    var ownsExpanded = btn.tagName !== "SUMMARY";

    function open() {
      drawer.classList.add("is-open");
      drawer.setAttribute("aria-hidden", "false");
      if (ownsExpanded) btn.setAttribute("aria-expanded", "true");
      document.documentElement.classList.add("nh-mdrawer-lock");
      if (window.lenis) try { window.lenis.stop(); } catch (e) {}
    }
    function close() {
      drawer.classList.remove("is-open");
      drawer.setAttribute("aria-hidden", "true");
      if (ownsExpanded) btn.setAttribute("aria-expanded", "false");
      document.documentElement.classList.remove("nh-mdrawer-lock");
      if (window.lenis) try { window.lenis.start(); } catch (e) {}
    }

    // On the contact page the trigger is a <summary>, whose own job is to open
    // the disclosure it sits in. Swallow that — the sheet is the menu now.
    btn.addEventListener("click", function (e) {
      if (btn.tagName === "SUMMARY") e.preventDefault();
      open();
    });
    drawer.querySelector(".nh-mdrawer-close").addEventListener("click", close);
    // Close on tap; the anchor's own smooth-scroll runs after (Lenis resumed).
    drawer.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function (e) {
        // The work-with-us block points at contact.html, which on the contact
        // page is the page you are standing on — closing the sheet IS the whole
        // action there, so don't reload to arrive where you already are.
        if (!a.hash && a.pathname === location.pathname) e.preventDefault();
        close();
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && drawer.classList.contains("is-open")) close();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
