// Newsletter signup — "We write sometimes." block.
//
// This form used to be Webflow's: method="get", no action, no handler. It
// reloaded the page with ?Email=someone@example.com in the address bar and did
// nothing else — the address went into the browser history and the server log
// and nowhere a person would ever read it. Every subscriber since launch is
// gone.
//
// Now it posts to /api/case with kind:"subscribe", which files the address in
// the same Notion table as the case requests, tagged Kind = Newsletter. No
// mail is sent yet; when there is something to send, the list exports from
// Notion into whatever tool we pick.
//
// The markup keeps a real action/method so a JS failure still delivers (the
// hidden kind field means the native POST hits the same branch); the reader
// just sees the raw JSON reply instead of the line below. Ugly, but the
// address is stored, which is the part that matters.
(function () {
  function init() {
    var forms = document.querySelectorAll(".nl-form");
    if (!forms.length) return;

    Array.prototype.forEach.call(forms, function (form) {
      var input = form.querySelector('input[type="email"]');
      var button = form.querySelector('[type="submit"]');
      var note = form.parentNode.querySelector(".nl-note");
      if (!input || !button) return;

      var busy = false;

      function say(msg, isError) {
        if (!note) return;
        note.textContent = msg;
        note.hidden = false;
        note.classList.toggle("is-error", !!isError);
      }

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (busy) return;

        var email = (input.value || "").trim();
        // Let the browser own the "that isn't an email" conversation — it
        // already knows how to say it in the reader's language.
        if (!email || (input.checkValidity && !input.checkValidity())) {
          if (form.reportValidity) form.reportValidity();
          return;
        }

        busy = true;
        var label = button.value;
        button.value = "Sending";
        button.disabled = true;
        if (note) note.hidden = true;

        fetch("/api/case", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "subscribe", email: email, page: (window.dnPagePath ? window.dnPagePath() : location.pathname) }),
        })
          .then(function (r) { return r.json().catch(function () { return {}; }); })
          .then(function (body) {
            if (!body.ok) throw new Error(body.error || "failed");
            // The form is replaced by the confirmation rather than sitting
            // there inviting a second submission.
            form.hidden = true;
            // Kept to one line on purpose. The column is about 200px wide, so
            // anything longer wraps to three lines and shoves the section down
            // by 32px at the moment of the click — measured, not guessed.
            say(body.duplicate ? "Already on the list." : "You’re on the list.", false);
            if (window.dnTrack) {
              // The address is never sent to analytics — only that it happened.
              window.dnTrack("newsletter_subscribed", {
                page: (window.dnPagePath ? window.dnPagePath() : location.pathname),
                duplicate: !!body.duplicate,
              });
            }
          })
          .catch(function (err) {
            busy = false;
            button.value = label;
            button.disabled = false;
            say("Didn’t send — try again.", true);
            // Without this, us dropping a signup and nobody wanting one look
            // identical in the funnel.
            if (window.dnTrack) {
              window.dnTrack("newsletter_failed", {
                page: (window.dnPagePath ? window.dnPagePath() : location.pathname),
                reason: err && err.message ? String(err.message).slice(0, 120) : "network",
              });
            }
          });
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
