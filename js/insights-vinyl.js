// Insights ("We write sometimes") — on hovering an article, a vinyl record slides
// out to the right from behind the cover (the cover is the sleeve) and the cover
// shifts slightly left (Figma 1652-17016). Pure CSS hover + spin; JS only injects
// the record behind each cover.
function init() {
  var covers = document.querySelectorAll(".is-abs-blog .blog-image_contant");
  covers.forEach(function (cover) {
    if (cover.parentNode.classList.contains("dn-cover-wrap")) return;
    var wrap = document.createElement("div");
    wrap.className = "dn-cover-wrap";
    cover.parentNode.insertBefore(wrap, cover);
    var vinyl = document.createElement("div");
    vinyl.className = "dn-vinyl";
    vinyl.setAttribute("aria-hidden", "true");
    vinyl.innerHTML = '<div class="dn-vinyl-disc"><span class="dn-vinyl-label"></span></div>';
    wrap.appendChild(vinyl);   // record first → behind the cover
    wrap.appendChild(cover);   // sleeve on top
  });

  // Pause the autoplay while hovering, so the cover stays put and the record can
  // slide out instead of the slide advancing under the cursor.
  var swEl = document.querySelector(".swiper");
  if (swEl) {
    swEl.addEventListener("mouseenter", function () { if (swEl.swiper && swEl.swiper.autoplay) try { swEl.swiper.autoplay.stop(); } catch (e) {} });
    swEl.addEventListener("mouseleave", function () { if (swEl.swiper && swEl.swiper.autoplay) try { swEl.swiper.autoplay.start(); } catch (e) {} });
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
