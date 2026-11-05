// Copy-email widget — the "[copy email]" row in the nav's right rail (hero) and
// on the contact page. Copies the address to the clipboard and swaps the label
// to "[copied]" for a beat. Shared by index.html + contact.html.
//
// Delegated + idempotent: works for buttons injected later, and safe to include
// twice. Falls back to a hidden textarea + execCommand on browsers that refuse
// navigator.clipboard (older Safari, or any non-secure origin such as the LAN
// dev server), so the widget never silently does nothing.
(function () {
  if (window.__dnCopyEmail) return;
  window.__dnCopyEmail = true;

  var REVERT_MS = 1400;

  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    // Off-screen but focusable — iOS ignores display:none / visibility:hidden.
    ta.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function flash(btn, label) {
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";
    if (!btn.dataset.idle) btn.dataset.idle = btn.textContent;
    btn.textContent = label;
    setTimeout(function () {
      btn.textContent = btn.dataset.idle;
      btn.dataset.busy = "0";
    }, REVERT_MS);
  }

  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest(".nh-copy-email") : null;
    if (!btn) return;
    e.preventDefault();

    var email = btn.dataset.email || "ding@denormalized.co";

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(email).then(
        function () { flash(btn, "[copied]"); },
        function () { flash(btn, legacyCopy(email) ? "[copied]" : email); },
      );
    } else {
      // No clipboard API: copy the old way, and if even that is blocked, reveal
      // the address in place so it can still be selected by hand.
      flash(btn, legacyCopy(email) ? "[copied]" : email);
    }
  });
})();
