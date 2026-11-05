// PostHog — EU cloud, cookieless until the visitor accepts.
//
// Session replay is ON from the moment analytics is accepted, and not a moment
// before. What it must never capture is the contents of the two forms: the case
// brief is client-confidential, and it is a contenteditable SPAN, which
// maskAllInputs does not cover because it is not an <input>. Both forms carry
// `ph-no-capture`, which blocks the whole element from the recording — masking
// runs in the browser, so that content never reaches PostHog at all. Do not
// remove those classes without replacing the protection.
//
// ─────────────────────────────────────────────────────────────────────────────
// PASTE THE PROJECT API KEY BELOW AND IT GOES LIVE. Until then this file does
// nothing at all: no script is fetched, no cookie is set, no request is made.
// The key is the public "Project API Key" from PostHog → Settings → Project
// (it starts with phc_). It is designed to sit in page source, so it is not a
// secret — do NOT paste a personal API key here.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  var KEY  = "phc_tDxhndreY6pceWFi6kXJidYLTPeV3mJqdbQpCdU3bfnW";
  var HOST = "https://eu.i.posthog.com";    // EU cloud, per Sam

  if (!KEY) return;

  // Keep the numbers honest: our own machines and the throwaway preview URLs
  // are not visitors.
  var h = location.hostname;
  if (h === "localhost" || h === "127.0.0.1" || h.endsWith(".local") ||
      h.endsWith(".vercel.app")) return;

  // An explicit "do not track me" is an answer, and it outranks the banner.
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1" ||
      navigator.globalPrivacyControl === true) return;

  // ---- Consent ------------------------------------------------------------
  // Finsweet stores its decision in an `fs-cc` cookie holding JSON, encoded
  // twice. Read the cookie rather than asking FsCC, because that script loads
  // async and we want the right persistence mode on the very first event —
  // switching afterwards would already have written a cookie.
  function consent() {
    var m = document.cookie.match(/(?:^|;\s*)fs-cc=([^;]*)/);
    if (!m) return null;                       // hasn't answered yet
    try {
      var raw = decodeURIComponent(decodeURIComponent(m[1]));
      var v = JSON.parse(raw);
      return !!(v && v.consents && v.consents.analytics);
    } catch (e) { return null; }
  }

  var decided = consent();
  if (decided === false) return;               // said no — respect it, load nothing

  // ---- Loader -------------------------------------------------------------
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){
  function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]);t[e]=function(){
  t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",
  p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host+"/static/array.js",
  (r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;
  for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){
  var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){
  return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),
  n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  posthog.init(KEY, {
    api_host: HOST,
    // Cookieless until they accept: memory persistence writes nothing to the
    // device, so a visitor who never touches the banner still gets counted
    // without us storing anything on their machine. The trade is that a return
    // visit reads as a new person until they accept.
    persistence: decided ? "localStorage+cookie" : "memory",
    // ---- Session replay -------------------------------------------------
    // On, but ONLY once analytics has actually been accepted. Recording a
    // visitor who has not answered the banner is a different order of thing
    // from counting them, so it starts false and is switched on by the accept
    // handler below.
    //
    // Free tier is 5,000 recordings a month and PostHog stops at the limit
    // rather than billing over it.
    disable_session_recording: decided !== true,
    session_recording: {
      // Inputs are masked by PostHog anyway; stated because it is load-bearing.
      maskAllInputs: true,
      maskInputOptions: { password: true, email: true, text: true, textarea: true },
    },
    // An internal click is not a traffic source. Because persistence is
    // memory-only before consent, identity resets on every navigation, so each
    // internal click otherwise arrives as a brand-new visitor "referred by"
    // denormalized.co — which put this site second in its own referrers chart.
    // entry_route still reads document.referrer directly and still reports
    // "internal", so nothing is lost by blanking these two.
    sanitize_properties: function (props) {
      try {
        var d = props && props.$referring_domain;
        if (d && /(^|\.)denormalized\.co$/i.test(String(d))) {
          // Keep WHICH page sent them before blanking the referrer. Without
          // this we knew an arrival was internal but not where from, so
          // "how did they reach contact" and "which case sends people to
          // contact" were unanswerable. It rides on the DESTINATION pageview,
          // so it needs no identity and survives the pre-consent reset that
          // breaks every cross-page funnel.
          try {
            var pth = new URL(String(props.$referrer)).pathname;
            props.internal_from =
              (pth === "/index.html" || pth === "/index") ? "/" : (pth.replace(/\.html$/, "") || "/");
          } catch (e) {}
          props.$referrer = "$direct";
          props.$referring_domain = "$direct";
          props.internal_nav = true;
        }
      } catch (e) {}
      return props;
    },
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
  });

  // ---- The shape of the session -------------------------------------------
  // Registered once so every later event carries them. This is what makes the
  // funnel questions answerable without joining anything by hand — a submission
  // arrives already knowing which door the person came through and what they
  // were using.
  function entryRoute() {
    var r = document.referrer;
    if (!r) return "direct";
    try {
      var h = new URL(r).hostname;
      if (h === location.hostname) return "internal";
      if (/(google|bing|duckduckgo|yahoo|ecosia|brave)\./i.test(h)) return "search";
      if (/(linkedin|instagram|behance|dribbble|awwwards|twitter|x\.com|t\.co|facebook|reddit)\./i.test(h)) return "social";
      return "referral";
    } catch (e) { return "referral"; }
  }
  function widthBucket(w) {
    return w < 480 ? "xs" : w < 768 ? "sm" : w < 1200 ? "md" : w < 1600 ? "lg" : "xl";
  }
  function mq(q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } }

  try {
    posthog.register({
      entry_route: entryRoute(),
      // /foo and /foo.html are one page. analytics-events.js has the same
      // normaliser, but this file loads first, so it carries its own.
      entry_page: (function () {
        var s = location.pathname;
        if (s === "/index.html" || s === "/index") return "/";
        return s.replace(/\.html$/, "") || "/";
      })(),
      viewport: widthBucket(window.innerWidth),
      // Half this site's behaviour is gated on these two, so the numbers should
      // be separable by them.
      can_hover: mq("(hover: hover) and (pointer: fine)"),
      reduced_motion: mq("(prefers-reduced-motion: reduce)"),
      consent_state: decided === true ? "accepted" : "undecided",
      // Our own visits, on a site quiet enough that they would otherwise be the
      // loudest thing in every chart. Read from localStorage rather than PostHog
      // persistence so it works before consent too — a read, never a write, so
      // the "nothing on the device before consent" rule still holds.
      is_internal: (function () {
        try { return localStorage.getItem("dn_internal") === "1"; } catch (e) { return false; }
      })(),
    });
  } catch (e) {}

  // ---- Failures ------------------------------------------------------------
  // Without this a page that throws looks exactly like a page nobody used.
  // captureException is part of the SDK surface (see the stub list above).
  function report(err) {
    try { if (posthog.captureException) posthog.captureException(err); } catch (e) {}
  }
  window.addEventListener("error", function (e) {
    if (e && e.error) report(e.error);
  });
  window.addEventListener("unhandledrejection", function (e) {
    if (!e) return;
    report(e.reason instanceof Error ? e.reason : new Error(String(e.reason)));
  });

  // ---- Upgrade / withdraw at the moment they choose -----------------------
  // The banner links are plain anchors; Finsweet writes its cookie on click, so
  // read it back on the next tick rather than assuming which button was hit.
  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest('[fs-cc="allow"], [fs-cc="deny"]');
    if (!el) return;
    setTimeout(function () {
      var now = consent();
      if (now === true) {
        // Accepted — start remembering them across visits, and start recording.
        posthog.set_config({ persistence: "localStorage+cookie" });
        posthog.opt_in_capturing();
        try { posthog.register({ consent_state: "accepted" }); } catch (e) {}
        try { posthog.startSessionRecording(); } catch (e) {}
      } else if (now === false) {
        // Declined — stop, and clear anything already written.
        try { posthog.stopSessionRecording(); } catch (e) {}
        posthog.opt_out_capturing();
        posthog.set_config({ persistence: "memory" });
      }
    }, 60);
  }, true);
})();
