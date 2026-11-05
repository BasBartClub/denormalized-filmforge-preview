// Named events on top of PostHog autocapture (js/analytics.js).
//
// Autocapture already records every click, so this is not about volume — it is
// about meaning. Autocapture tells you "someone clicked span.footer-file"; this
// tells you "someone started a case request, picked Rebrand and Website, and
// filed it". You can build funnels on the second and not really on the first.
//
// Rule for everything below: properties describe CHOICES and SHAPES, never
// content. Which options were picked, how long the brief was — never what it
// said. See the ph-no-capture note in the form section.
(function () {
  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  // posthog may still be a stub, or absent entirely (declined consent, DNT, a
  // preview URL). Every call goes through here so none of that throws.
  function track(name, props) {
    try {
      if (window.posthog && typeof window.posthog.capture === "function") {
        window.posthog.capture(name, props || {});
      }
    } catch (e) {}
  }
  window.dnTrack = track;

  // Which door led to the contact page. REGISTERED rather than captured, so it
  // rides along on every later event — case_filed included. That join is the
  // whole point: work_with_us_clicked already carried a `from`, but nothing
  // downstream could see it, so header-vs-footer was unanswerable.
  //
  // Caveat worth knowing: before consent, PostHog persists in memory only, so a
  // route chosen on the home page does not survive the navigation to contact.
  // Those sessions read as "direct". After consent it persists properly.
  function routeKnown() {
    try {
      return !!(window.posthog && window.posthog.get_property &&
                window.posthog.get_property("contact_route"));
    } catch (e) { return false; }
  }
  // /foo and /foo.html are the same page; /index.html is "/". Without this,
  // every page-keyed property reports one page as two.
  function pagePath(v) {
    var s = v || location.pathname;
    if (s === "/index.html" || s === "/index") return "/";
    return s.replace(/\.html$/, "") || "/";
  }
  window.dnPagePath = pagePath;

  function route(from) {
    try {
      if (window.posthog && window.posthog.register) window.posthog.register({ contact_route: from });
    } catch (e) {}
  }

  ready(function () {
    // ---- Scroll depth ----------------------------------------------------
    // The home page is ~15,000px and the whole argument is in the scroll, so
    // "did they get past the cases" is the question. Milestones fire once each;
    // rAF-throttled so this never competes with the scroll it is measuring.
    var marks = [25, 50, 75, 100];
    var hit = {};
    var ticking = false;
    function depth() {
      ticking = false;
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      var pct = ((window.pageYOffset || doc.scrollTop) / max) * 100;
      for (var i = 0; i < marks.length; i++) {
        var m = marks[i];
        if (pct >= m && !hit[m]) {
          hit[m] = true;
          track("scroll_depth", { depth: m, page: pagePath() });
        }
      }
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(depth); }
    }, { passive: true });
    depth();

    // ---- Case request funnel ---------------------------------------------
    var paper = document.querySelector("#case-form");
    if (paper) {
      // The brief is a contenteditable, which autocapture treats as element
      // TEXT — so it was shipping whatever the prospect typed on every click
      // inside it. Verified in production before this line existed. The sheet
      // is opted out of autocapture entirely and the deliberate events below
      // carry the shape of the answer without the content.
      paper.classList.add("ph-no-capture");

      var started = false, startedAt = 0, filed = false;
      var touched = {}, completed = {}, lastField = null;

      // Someone arriving with no route registered came straight here.
      if (!routeKnown()) route("direct");

      // A NAME and a length band. Never a value — see the ph-no-capture note.
      function fieldOf(el) {
        return el.getAttribute("name") || el.id || (el.className || "").split(" ")[0] || "unknown";
      }
      function band(n) {
        return n < 20 ? "1-19" : n < 60 ? "20-59" : n < 200 ? "60-199" : "200+";
      }
      function isField(el) {
        return el && el.matches && el.matches("input, textarea, [contenteditable]");
      }

      // Starting the form is not only focusing a field: the chip groups are the
      // first thing most people touch. One visitor toggled five chips and never
      // fired this, a 12.5% undercount on the most important funnel step — so
      // both entry points go through the same guard.
      function begin() {
        if (started) return;
        started = true; startedAt = Date.now();
        track("case_form_started", {});
      }

      paper.addEventListener("focusin", function (e) {
        begin();
        if (!isField(e.target)) return;
        var f = fieldOf(e.target);
        lastField = f;
        if (!touched[f]) { touched[f] = true; track("field_focused", { field: f }); }
      });

      paper.addEventListener("focusout", function (e) {
        if (!isField(e.target)) return;
        var el = e.target, f = fieldOf(el);
        var v = (el.value != null ? el.value : (el.textContent || "")).replace(/\u200B/g, "").trim();
        if (v && !completed[f]) {
          completed[f] = true;
          track("field_completed", { field: f, length: band(v.length) });
        }
      });

      // The most actionable number here: where people stop. pagehide rather than
      // beforeunload, because it survives the bfcache path and mobile.
      window.addEventListener("pagehide", function () {
        if (!started || filed) return;
        track("case_form_abandoned", {
          last_field: lastField,
          fields_done: Object.keys(completed).length,
          seconds: Math.round((Date.now() - startedAt) / 1000),
        });
      });

      paper.addEventListener("click", function (e) {
        var chip = e.target.closest && e.target.closest(".ct-chip");
        if (!chip) return;
        begin();                                 // a chip is a start, same as a focus
        // The options are our own copy, not anything the visitor wrote.
        track("case_option_selected", {
          option: chip.dataset.value,
          group: chip.closest(".ct-chips-when") ? "timing" : "needs",
          // contact.js binds to the chip itself, so its toggle has already run
          // by the time this bubbles up — read the state, don't invert it.
          selected: chip.getAttribute("aria-pressed") === "true",
        });
      });

      // NOT "submit". contact.js preventDefaults invalid submits, but that does
      // not stop propagation to this listener — so a submit listener here counts
      // every rejected attempt as a filing, and suppresses the abandon event
      // that should have fired instead. contact.js announces validity instead.
      paper.addEventListener("dn:case-valid", function () {
        var chosen = function (sel) {
          return Array.prototype.map.call(
            paper.querySelectorAll(sel + ' .ct-chip[aria-pressed="true"]'),
            function (c) { return c.dataset.value; }
          );
        };
        var brief = document.querySelector("#f-brief");
        filed = true;
        track("case_filed", {
          needs: chosen(".ct-chips:not(.ct-chips-when)"),
          timing: chosen(".ct-chips-when")[0] || null,
          // Length only. Never the words. The zero-width space that holds the
          // caret in the empty blank is not part of what they wrote.
          brief_length: brief ? (brief.textContent || "").replace(/\u200B/g, "").trim().length : 0,
          // How much work it took, which is what you compare against abandonment.
          seconds_to_file: startedAt ? Math.round((Date.now() - startedAt) / 1000) : null,
          fields_done: Object.keys(completed).length,
        });
      });

      // Filed AND delivered. case_filed is the person's action; this is the
      // outcome, and the pair is what separates "nobody asks" from "we drop it".
      paper.addEventListener("dn:case-confirmed", function (e) {
        track("case_request_confirmed", {
          delivered: !!(e && e.detail && e.detail.delivered),
          seconds_to_file: startedAt ? Math.round((Date.now() - startedAt) / 1000) : null,
          fields_done: Object.keys(completed).length,
        });
      });
    }

    var howd = document.querySelector("#ct-howd");
    if (howd) {
      howd.classList.add("ph-no-capture");     // free text — same reasoning
      // Same two-listener trap as the case form: an empty submit is prevented
      // in contact.js but still reaches a plain "submit" listener here.
      howd.addEventListener("dn:attribution-valid", function () { track("attribution_submitted", {}); });
      // It ships hidden and is revealed after filing. Without the denominator,
      // "how many answered" is a number with nothing to divide by.
      if (window.MutationObserver) {
        var shown = false;
        new MutationObserver(function () {
          if (!shown && !howd.hidden) { shown = true; track("attribution_shown", {}); }
        }).observe(howd, { attributes: true, attributeFilter: ["hidden"] });
      }
    }

    // Vercel serves 404.html without rewriting the URL, so the path here is the
    // one that was actually asked for — which is the useful half.
    if (document.body.hasAttribute("data-dn-404")) {
      track("page_not_found", {
        path: location.pathname + location.search,
        referrer: document.referrer || "direct",
      });
    }

    // ---- The small deliberate moments ------------------------------------
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      if (t.closest(".nh-copy-email")) track("email_copied", { page: pagePath() });
      if (t.closest(".nh-mnav-menu, .ct-menu-toggle")) track("menu_opened", { page: pagePath() });
      if (t.closest(".nh-mdrawer-cta")) { route("mobile_menu"); track("work_with_us_clicked", { from: "mobile_menu" }); }
      if (t.closest(".nh-nav-block a")) { route("nav_rail"); track("work_with_us_clicked", { from: "nav_rail" }); }
      if (t.closest(".footer-file")) { route("footer"); track("work_with_us_clicked", { from: "footer" }); }
      // Any other way in — a case study's CTA, the 404, a stray link.
      var toContact = t.closest("a[href]");
      if (toContact && /^\/?contact(\.html)?$/.test(toContact.pathname || "") &&
          !t.closest(".nh-mdrawer-cta, .nh-nav-block, .footer-file")) {
        var fromLink = "link:" + (pagePath().replace(/^\//, "") || "index");
        route(fromLink);
        // Registered AND captured, so `from` here and the registered
        // contact_route downstream tell the same story.
        track("work_with_us_clicked", { from: fromLink });
      }

      // A phrase in the dossier being uncovered — the one interaction on the
      // page that is pure curiosity, so worth knowing if anyone finds it.
      var phrase = t.closest(".dn-classified");
      // data-dn-g is the group index classified.js injected, not the words —
      // name it for what it holds.
      if (phrase) track("classified_revealed", { group_index: phrase.dataset.dnG });

      // Anything leaving the site.
      var a = t.closest("a[href]");
      if (a) {
        var href = a.getAttribute("href") || "";
        if (/^https?:/i.test(href) && a.hostname && a.hostname !== location.hostname) {
          track("outbound_click", { url: href, text: (a.textContent || "").trim().slice(0, 60) });
        }
      }
    }, true);

    // Short, readable slugs shared by BOTH sides — an impression on the home
    // page and a read on the case page have to join on the same value, or the
    // funnel silently has two of everything.
    var CASE_SLUGS = {
      "fourdesign-website-redesign": "fourdesign",
      "linen-case-study-denormalized-r": "linen",
      "estyl-case-study-denormalized": "estyl",
      "specialty-case-study-denormalized-r": "specialty",
      "luminar-foundation-branding-website-design": "luminar",
      "genie-healthcare-branding-product-design": "genie",
      "prostir-youth-hub-brand-identity": "prostir",
      "volta-buro-visual-identity-communication": "volta",
    };

    // ---- Where attention actually goes -------------------------------------
    // scroll_depth measures a percentage of the whole document, which on a
    // 15,000px page is a number with no meaning: "50%" lands mid-pin, inside a
    // section whose scroll distance is choreography rather than content. This
    // reports per SECTION instead — entered, how long, and whether they got to
    // the end of it. scroll_depth stays so the existing series keeps running.
    var SECTIONS = [
      ["hero", ".nh-hero"],
      ["cases", "#cases-section"],
      ["dossier", "#about-section"],
      ["insights", "#insight-section"],
      ["footer", "#contact-section"],
    ];
    if (window.IntersectionObserver) {
      var watching = [];
      SECTIONS.forEach(function (pair) {
        var el = document.querySelector(pair[1]);
        if (el) watching.push({ name: pair[0], el: el, since: 0, reachedEnd: false, total: 0 });
      });

      function closeOut(w, send) {
        if (!w.since) return;
        w.total += Date.now() - w.since;
        w.since = 0;
        if (!send) return;
        track("section_viewed", {
          section: w.name,
          dwell_ms: w.total,
          reached_end: w.reachedEnd,
        });
        w.total = 0;
      }

      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var w = watching.filter(function (x) { return x.el === en.target; })[0];
          if (!w) return;
          if (en.isIntersecting) {
            if (!w.since) w.since = Date.now();
          } else {
            // Its end has scrolled above the fold — they went all the way through
            // rather than turning back. Measured off the element, because with a
            // midline root the observer's own rects describe the line, not the view.
            if (w.el.getBoundingClientRect().bottom <= (window.innerHeight || 0)) w.reachedEnd = true;
            closeOut(w, true);
          }
        });
        // A section TALLER than the viewport can never be "50% visible", so a
        // ratio threshold silently skipped exactly the sections that matter —
        // cases and insights never fired once. This asks a different question:
        // which section currently crosses the middle of the screen. Whatever the
        // height, one section owns the midline, and dwell is how long it held it.
      }, { threshold: 0, rootMargin: "-50% 0px -50% 0px" });
      watching.forEach(function (w) { io.observe(w.el); });

      // Whatever they were looking at when they left still counts.
      window.addEventListener("pagehide", function () {
        watching.forEach(function (w) { closeOut(w, true); });
      });
    }

    // The newsletter had a conversion count and no denominator: signups were
    // known, the number of people who ever saw the field was not.
    var nlForm = document.querySelector(".nl-form");
    if (nlForm && window.IntersectionObserver) {
      var nlSeen = false;
      var nlIo = new IntersectionObserver(function (entries) {
        if (nlSeen || !entries.some(function (e) { return e.isIntersecting; })) return;
        nlSeen = true;
        nlIo.disconnect();
        track("newsletter_form_seen", { page: pagePath() });
      }, { threshold: [0.6] });
      nlIo.observe(nlForm);
    }

    // ---- Featured cases, on the home page ---------------------------------
    // These are plain DOM: .dn-case-row > a.dn-case-link, built by cases-new.js.
    // Autocapture therefore DOES see the clicks — but only as "clicked
    // a.dn-case-link", with no notion of which case was on screen, how long
    // anyone weighed it up, or whether the ones nobody opens were even seen.
    // The scroll choreography moves an `is-active` class down the list, and that
    // class changing IS a case being presented, so it is the honest impression.
    var caseList = document.querySelector(".dn-cases-list");
    if (caseList) {
      var rows = [].slice.call(caseList.querySelectorAll(".dn-case-row"));
      var slugOf = function (row) {
        var a = row.querySelector("a[href]");
        var href = a ? (a.getAttribute("href") || "") : "";
        var file = href.replace(/\.html$/, "");
        return CASE_SLUGS[file] || file || null;
      };
      var nameOf = function (row) {
        var n = row.querySelector(".dn-case-name");
        return n ? n.textContent.trim() : null;
      };
      var seen = {};

      function present(row) {
        var i = rows.indexOf(row);
        var slug = slugOf(row);
        if (!slug || seen[slug]) return;
        seen[slug] = true;                       // once per visit, not once per pass
        track("case_impression", { case_name: slug, title: nameOf(row), position: i });
      }

      if (window.MutationObserver) {
        rows.forEach(function (row) {
          new MutationObserver(function () {
            if (row.classList.contains("is-active")) present(row);
          }).observe(row, { attributes: true, attributeFilter: ["class"] });
          if (row.classList.contains("is-active")) present(row);
        });
      }

      // Interest that never became a click is the useful half, so this is
      // reported on the way OUT with how long they lingered.
      rows.forEach(function (row) {
        var at = 0;
        row.addEventListener("pointerenter", function () { at = Date.now(); });
        row.addEventListener("pointerleave", function () {
          if (!at) return;
          var ms = Date.now() - at; at = 0;
          if (ms < 250) return;                  // a pointer passing through is not interest
          track("case_hovered", { case_name: slugOf(row), title: nameOf(row), dwell_ms: ms });
        });
      });

      // Two ways in: the name itself, or the cover zone, which opens whichever
      // case is currently active.
      document.addEventListener("click", function (e) {
        var link = e.target.closest && e.target.closest(".dn-case-link[href]");
        var row = link ? link.closest(".dn-case-row") : null;
        if (!row) {
          var zone = e.target.closest && e.target.closest(".dn-cases-cover, .dn-cases-pin");
          if (!zone || e.target.closest(".dn-case-link")) return;
          row = caseList.querySelector(".dn-case-row.is-active");
          if (!row) return;
        }
        track("case_opened", {
          case_name: slugOf(row),
          title: nameOf(row),
          position: rows.indexOf(row),
          via: link ? "name" : "cover",
        });
      }, true);
    }

    // ---- Case study pages -------------------------------------------------
    // The slugs match the `name` the experiment reports, so an impression in the
    // frame and a read on the page join on one property rather than on a
    // filename nobody can read.
    var thisCase = CASE_SLUGS[(location.pathname.split("/").pop() || "").replace(/\.html$/, "")] || null;

    if (thisCase) {
      var deepest = 0, arrived = Date.now(), readSent = false;
      function depthNow() {
        var doc = document.documentElement;
        var max = doc.scrollHeight - window.innerHeight;
        if (max <= 0) return 100;
        return Math.min(100, Math.round(((window.pageYOffset || doc.scrollTop) / max) * 100));
      }
      window.addEventListener("scroll", function () {
        var d = depthNow();
        if (d > deepest) deepest = d;
      }, { passive: true });

      // One event per visit, on the way out, carrying how far they actually got.
      // Five separate scroll milestones would say the same thing five times.
      function sendRead() {
        if (readSent) return;
        readSent = true;
        track("case_read", {
          case_name: thisCase,
          depth_pct: Math.max(deepest, depthNow()),
          seconds: Math.round((Date.now() - arrived) / 1000),
        });
      }
      window.addEventListener("pagehide", sendRead);
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") sendRead();
      });

      // Vimeo lives in a cross-origin iframe, so the only way in is their
      // postMessage API. Verified against the live player before writing this:
      // it acknowledges addEventListener, so the handshake is real rather than
      // hopeful. If a player ever stops replying, nothing fires — no throwing,
      // no half-events.
      var players = [].slice.call(document.querySelectorAll('iframe[src*="player.vimeo.com"]'));
      if (players.length) {
        var marks = [25, 50, 75, 100];
        var state = players.map(function () { return { played: false, hit: {}, duration: 0 }; });

        function toPlayer(f, msg) {
          try { f.contentWindow.postMessage(JSON.stringify(msg), "https://player.vimeo.com"); } catch (e) {}
        }
        window.addEventListener("message", function (e) {
          if (!/player\.vimeo\.com$/.test((e.origin || "").replace(/^https?:\/\//, ""))) return;
          var i = -1;
          for (var k = 0; k < players.length; k++) if (players[k].contentWindow === e.source) i = k;
          if (i < 0) return;
          var d = e.data;
          if (typeof d === "string") { try { d = JSON.parse(d); } catch (_) { return; } }
          if (!d || typeof d !== "object") return;
          var st = state[i];

          if (d.event === "play" && !st.played) {
            st.played = true;
            track("case_video_played", { case_name: thisCase, player: i });
          }
          if (d.event === "timeupdate" && d.data && d.data.percent != null) {
            var pct = Math.round(d.data.percent * 100);
            for (var m = 0; m < marks.length; m++) {
              // One event per quarter reached, not one per tick — timeupdate
              // fires several times a second and would drown everything else.
              if (pct >= marks[m] && !st.hit[marks[m]]) {
                st.hit[marks[m]] = true;
                track("case_video_progress", { case_name: thisCase, pct: marks[m], player: i });
              }
            }
          }
        });

        players.forEach(function (f, i) {
          function arm() {
            toPlayer(f, { method: "addEventListener", value: "play" });
            toPlayer(f, { method: "addEventListener", value: "timeupdate" });
          }
          if (f.contentWindow) arm();
          f.addEventListener("load", arm);
          setTimeout(arm, 1500);   // the player is often ready before we ask
        });
      }

      // Whether one case study leads to another, which is the question behind
      // the whole next-case block.
      document.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest(".next-cases-contant, .is-cases-next a");
        if (!a) return;
        var to = (a.getAttribute("href") || "").replace(/\.html$/, "");
        track("next_case_clicked", { from_case: thisCase, to_case: CASE_SLUGS[to] || to || null });
      }, true);
    }

    // ---- The cases experiment lives in an iframe --------------------------
    // Autocapture cannot see inside it, so every click on a case cover is
    // currently invisible. The frame already talks to the parent, so the modes
    // it announces are at least recoverable — a real per-case event needs a new
    // message from the experiment itself.
    window.addEventListener("message", function (ev) {
      var d = ev.data;
      if (!d || typeof d !== "object") return;
      if (d.t === "exp-mode") track("cases_view_mode", { mode: d.mode === "slider" ? "slider" : "thread" });
    });
  });
})();
