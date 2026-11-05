// Cloth dismissal for the case sheet — the alternative to the CSS fold.
//
// The sheet is rasterised into a texture (SVG foreignObject with the brand
// fonts inlined, so it comes out pixel-identical), then drawn as a WebGL plane
// that ripples like fabric, accordion-folds along its VERTICAL creases — the
// sheet is wide, so it gathers side to side, not top to bottom — and is carried
// off. The shader is the teaser reel's cloth (js/hero/reel.js), which already
// had the wave, the accordion and the derivative-based lighting.
//
// Exposed as window.__cloth = { play, scrub, reset } so the ?foldtune panel can
// drive it without submitting anything.
(function () {
  "use strict";

  var CLOTH = {
    folds: 6,          // accordion creases across the width
    foldDepth: 0.22,   // how deep the gathers go
    squeeze: 0.9,      // how much the width closes as it gathers
    wave: 2.2,         // ripple amplitude at rest
    waveOnFold: 0,     // ripple at the peak of the gather — 0 = it calms as it closes
    fold: 0.56,        // s to gather
    // Where the carry-off starts, as a fraction of the gather. Well under 1 so
    // the two read as one move: it is already leaving while it is still closing.
    flyStart: 0.45,
    flyDur: 0.46,      // s to carry off
    flyX: 1.7, flyY: 0.45, flyShrink: 0.62,
    light: 0.32,
    spec: 0.45,
    creaseShade: 0.25,
    ease: "power2.inOut",
    // WV-56. The entrance used to hand back to the DOM while the sheet was
    // still rippling: at the end of playIn `fold` reaches 0, so the ripple sat
    // at its RESTING amplitude (`wave`, 2.2) rather than at nothing, and the
    // flat DOM sheet that replaced it had no ripple and no shading. That
    // mismatch is the blink. This is how long the cloth spends going still
    // before the swap — the sheet comes to rest instead of being caught
    // mid-breath.
    settle: 0.22,
  };
  if (typeof window !== "undefined") window.__CLOTH = CLOTH;

  var VERT = [
    "attribute vec2 aUV;",
    "uniform float uTime, uAmp, uFold, uFly, uFolds, uDepth, uSqueeze;",
    "uniform float uFlyX, uFlyY, uFlyShrink;",
    "uniform vec2 uPlane;",
    "varying vec2 vUV; varying float vHeight; varying float vFoldShade;",
    "void main(){",
    "  vUV = aUV;",
    "  vec2 pos = (aUV * 2.0 - 1.0) * uPlane;",
    // Resting ripple — several offset waves so it never reads as one sine.
    "  float wy = 0.0, wx = 0.0;",
    "  wy += sin(aUV.x * 5.0 - uTime * 2.5) * 0.018 * uAmp;",
    "  wy += sin(aUV.x * 3.0 + uTime * 1.8 + aUV.y * 2.0) * 0.014 * uAmp;",
    "  wy += cos((aUV.x + aUV.y) * 4.0 - uTime * 3.0) * 0.010 * uAmp;",
    "  wy += sin(aUV.x * 8.0 + aUV.y * 3.0 - uTime * 3.5) * 0.006 * uAmp;",
    "  wx += sin(aUV.y * 4.0 - uTime * 2.0) * 0.014 * uAmp;",
    "  wx += cos(aUV.x * 3.0 + uTime * 1.5) * 0.008 * uAmp;",
    "  pos.y += wy; pos.x += wx;",
    "  vHeight = wy * 1.5 + wx * 0.8;",
    "  vFoldShade = 0.0;",
    // Accordion along X: vertical creases gathering a wide sheet inwards.
    "  if (uFold > 0.0) {",
    "    float f = uFold;",
    "    float phase = aUV.x * uFolds * 6.28318;",
    "    float depth = sin(phase) * f * uDepth;",
    "    vFoldShade = cos(phase) * f;",
    "    float persp = 1.0 / (1.0 + depth * 0.5);",   // gathers read as depth
    "    pos *= persp;",
    "    pos.x *= (1.0 - f * uSqueeze);",
    "    vHeight += depth * 0.3;",
    "  }",
    "  pos += vec2(uFly * uFlyX, uFly * uFlyY);",
    "  pos *= (1.0 - uFly * uFlyShrink);",
    "  gl_Position = vec4(pos, 0.0, 1.0);",
    "}",
  ].join("\n");

  var FRAG = [
    "#extension GL_OES_standard_derivatives : enable",
    "precision mediump float;",
    "varying vec2 vUV; varying float vHeight; varying float vFoldShade;",
    "uniform sampler2D uTex;",
    "uniform float uLight, uSpec, uCrease, uFade;",
    "void main(){",
    "  vec4 c = texture2D(uTex, vUV);",
    // Light it off the surface slope, so the ripples actually catch the light.
    "  float dhdx = dFdx(vHeight), dhdy = dFdy(vHeight);",
    "  vec3 n = normalize(vec3(-dhdx * 40.0, -dhdy * 40.0, 1.0));",
    "  vec3 l = normalize(vec3(0.35, 0.5, 1.0));",
    "  float dif = max(dot(n, l), 0.0);",
    "  vec3 h = normalize(l + vec3(0.0, 0.0, 1.0));",
    "  float sp = pow(max(dot(n, h), 0.0), 24.0);",
    "  float lit = 0.62 + uLight * dif + uSpec * sp;",
    "  lit *= 1.0 + vFoldShade * uCrease;",
    "  c.rgb *= lit;",
    "  gl_FragColor = vec4(c.rgb, c.a * uFade);",
    "}",
  ].join("\n");

  // ---- Rasterise the sheet -------------------------------------------------
  var fontCache = null;
  function inlinedFonts() {
    if (fontCache) return fontCache;
    fontCache = Promise.all([
      fetch("fonts/RegestoGrotesk-Regular.woff").then(function (r) { return r.arrayBuffer(); }),
      fetch("fonts/RegestoGrotesk-Medium.woff").then(function (r) { return r.arrayBuffer(); }),
      fetch("css/tokens.css").then(function (r) { return r.text(); }),
      fetch("css/contact.css").then(function (r) { return r.text(); }),
    ]).then(function (parts) {
      function b64(buf) {
        var bin = "", B = new Uint8Array(buf);
        for (var i = 0; i < B.length; i++) bin += String.fromCharCode(B[i]);
        return btoa(bin);
      }
      var css = (parts[2] + "\n" + parts[3]).replace(/@font-face\s*\{[\s\S]*?\}/g, "");
      css =
        "@font-face{font-family:'Regestogrotesk';font-weight:400;src:url(data:font/woff;base64," + b64(parts[0]) + ") format('woff')}" +
        "@font-face{font-family:'Regestogrotesk';font-weight:500;src:url(data:font/woff;base64," + b64(parts[1]) + ") format('woff')}" +
        css;
      // The SVG is parsed as XML, so these must not read as markup.
      return css.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    });
    return fontCache;
  }

  function snapshot(el) {
    // WV-62. Measure and serialise only once the real faces are in.
    //
    // The sheet is captured by reading its box and cloning its DOM. Before
    // Regesto loads, both of those describe the ARIAL fallback — different
    // metrics, different line breaks. The texture itself renders correctly,
    // because inlinedFonts() embeds the real face in the SVG; so the entrance
    // played in Regesto and then handed back to a DOM that had meanwhile
    // re-laid-out in Regesto at a different size, and the text jumped.
    //
    // Invisible wherever the font is already cached, which is why it looked
    // fine on one machine and not another. Every other module that measures
    // text here already waits on this; this one did not.
    var facesIn = (document.fonts && document.fonts.ready)
      ? document.fonts.ready : Promise.resolve();
    return facesIn.then(inlinedFonts).then(function (css) {
      var rect = el.getBoundingClientRect();
      var w = Math.round(rect.width), h = Math.round(rect.height);
      var clone = el.cloneNode(true);
      // cloneNode copies attributes, not live values.
      var src = el.querySelectorAll("input, textarea");
      Array.prototype.forEach.call(clone.querySelectorAll("input, textarea"), function (n, i) {
        if (src[i]) n.setAttribute("value", src[i].value);
      });
      clone.style.position = "static";
      clone.style.margin = "0";
      clone.style.width = w + "px";
      clone.style.height = h + "px";

      // XMLSerializer, not outerHTML: foreignObject is XML, and HTML's unclosed
      // <input> makes the whole SVG fail to parse.
      var body = new XMLSerializer().serializeToString(clone);
      var svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
        '<foreignObject width="100%" height="100%">' +
        '<div xmlns="http://www.w3.org/1999/xhtml" class="ct-body" style="background:#fff;margin:0">' +
        "<style>" + css + "</style>" + body + "</div></foreignObject></svg>";

      return new Promise(function (res, rej) {
        var img = new Image();
        img.onload = function () {
          var c = document.createElement("canvas");
          c.width = w; c.height = h;
          var ctx = c.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0);
          res({ canvas: c, rect: rect });
        };
        img.onerror = function () { rej(new Error("sheet snapshot failed to rasterise")); };
        // A data URI keeps the canvas untainted; a blob: URL taints it and the
        // texture upload then throws.
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      });
    });
  }

  // ---- The plane -----------------------------------------------------------
  function buildRig(shot) {
    var rect = shot.rect;
    var PAD = 0.45;                                   // room for ripple + gather
    var cw = Math.round(rect.width * (1 + PAD * 2));
    var ch = Math.round(rect.height * (1 + PAD * 2));

    var cv = document.createElement("canvas");
    cv.className = "ct-cloth";
    cv.width = cw * (window.devicePixelRatio > 1 ? 2 : 1);
    cv.height = ch * (window.devicePixelRatio > 1 ? 2 : 1);
    cv.style.cssText =
      "position:fixed;pointer-events:none;z-index:85;" +
      "left:" + (rect.left - rect.width * PAD) + "px;" +
      "top:" + (rect.top - rect.height * PAD) + "px;" +
      "width:" + cw + "px;height:" + ch + "px";
    document.body.appendChild(cv);

    var gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: true });
    if (!gl) { cv.remove(); return null; }
    gl.getExtension("OES_standard_derivatives");

    function sh(type, srcStr) {
      var s = gl.createShader(type);
      gl.shaderSource(s, srcStr); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error("[cloth]", gl.getShaderInfoLog(s)); return null;
      }
      return s;
    }
    var prog = gl.createProgram();
    var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { cv.remove(); return null; }
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    gl.useProgram(prog);

    // Grid: dense enough that the gathers curve instead of faceting.
    var NX = 96, NY = 64, uv = [], idx = [];
    for (var y = 0; y <= NY; y++) for (var x = 0; x <= NX; x++) uv.push(x / NX, y / NY);
    for (var yy = 0; yy < NY; yy++) for (var xx = 0; xx < NX; xx++) {
      var a = yy * (NX + 1) + xx, b = a + 1, c2 = a + NX + 1, d = c2 + 1;
      idx.push(a, b, c2, b, d, c2);
    }
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "aUV");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    var idxType = gl.UNSIGNED_INT;
    if (!gl.getExtension("OES_element_index_uint")) {
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
      idxType = gl.UNSIGNED_SHORT;
    }

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, shot.canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    var U = {};
    ["uTime","uAmp","uFold","uFly","uFolds","uDepth","uSqueeze","uPlane","uTex","uLight","uSpec","uCrease","uFade","uFlyX","uFlyY","uFlyShrink"]
      .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    gl.uniform1i(U.uTex, 0);
    gl.uniform2f(U.uPlane, 1 / (1 + PAD * 2), 1 / (1 + PAD * 2));

    gl.viewport(0, 0, cv.width, cv.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    var state = { fold: 0, fly: 0, amp: CLOTH.wave, fade: 1, t: 0 };

    function draw() {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(U.uTime, state.t);
      gl.uniform1f(U.uAmp, state.amp);
      gl.uniform1f(U.uFold, state.fold);
      gl.uniform1f(U.uFly, state.fly);
      gl.uniform1f(U.uFade, state.fade);
      gl.uniform1f(U.uFolds, CLOTH.folds);
      gl.uniform1f(U.uDepth, CLOTH.foldDepth);
      gl.uniform1f(U.uSqueeze, CLOTH.squeeze);
      gl.uniform1f(U.uLight, CLOTH.light);
      gl.uniform1f(U.uSpec, CLOTH.spec);
      gl.uniform1f(U.uCrease, CLOTH.creaseShade);
      gl.uniform1f(U.uFlyX, CLOTH.flyX);
      gl.uniform1f(U.uFlyY, CLOTH.flyY);
      gl.uniform1f(U.uFlyShrink, CLOTH.flyShrink);
      gl.drawElements(gl.TRIANGLES, idx.length, idxType, 0);
    }

    var raf = 0, running = false;
    function tick() { state.t += 0.016; draw(); if (running) raf = requestAnimationFrame(tick); }

    return {
      canvas: cv, state: state, draw: draw,
      start: function () { if (!running) { running = true; raf = requestAnimationFrame(tick); } },
      stop: function () { running = false; cancelAnimationFrame(raf); },
      destroy: function () { running = false; cancelAnimationFrame(raf); cv.remove(); },
    };
  }

  // ---- Public --------------------------------------------------------------
  var current = null;

  function reset(paper) {
    if (current) { current.destroy(); current = null; }
    if (paper) paper.style.visibility = "";
  }

  // `initial` seeds the state BEFORE the first draw. The entrance starts fully
  // gathered and off-screen, and without this the rig would paint one frame of
  // the sheet sitting at rest before the timeline's first tick moved it.
  function open(paper, initial) {
    return snapshot(paper).then(function (shot) {
      reset(null);
      var rig = buildRig(shot);
      if (!rig) throw new Error("no WebGL");
      paper.style.visibility = "hidden";
      current = rig;
      if (initial) for (var k in initial) rig.state[k] = initial[k];
      rig.draw();
      return rig;
    });
  }

  // The exit's timeline, so the entrance can be written as its mirror rather
  // than as a second set of numbers that would drift away from it.
  //   fold  0 → 1   0        .. CLOTH.fold
  //   fly   0 → 1   flyAt    .. flyAt + flyDur
  //   fade  1 → 0   fadeAt   .. fadeAt + fadeDur
  function beats() {
    var flyAt = CLOTH.fold * CLOTH.flyStart;
    var fadeDur = CLOTH.flyDur * 0.55;
    var fadeAt = flyAt + CLOTH.flyDur * 0.45;
    return {
      flyAt: flyAt, fadeAt: fadeAt, fadeDur: fadeDur,
      total: Math.max(CLOTH.fold, flyAt + CLOTH.flyDur, fadeAt + fadeDur),
    };
  }

  window.__cloth = {
    get rig() { return current; },
    // Hold the gather at an arbitrary amount, for tuning.
    scrub: function (paper, p) {
      var apply = function (rig) {
        rig.state.fold = p;
        rig.state.amp = CLOTH.wave + (CLOTH.waveOnFold - CLOTH.wave) * Math.sin(p * Math.PI);
        rig.start();
      };
      if (current) { apply(current); return Promise.resolve(current); }
      return open(paper).then(function (rig) { apply(rig); return rig; });
    },
    reset: function (paper) { reset(paper); },
    play: function (paper) {
      var B = beats();
      return open(paper).then(function (rig) {
        rig.start();
        var gsap = window.gsap;
        if (!gsap) { rig.destroy(); current = null; return; }
        return new Promise(function (resolve) {
          gsap.timeline({ onComplete: function () { rig.destroy(); current = null; resolve(); } })
            .to(rig.state, {
              fold: 1, duration: CLOTH.fold, ease: CLOTH.ease,
              onUpdate: function () {
                // ripple hardest mid-gather, where real cloth is loosest
                rig.state.amp = CLOTH.wave + (CLOTH.waveOnFold - CLOTH.wave) * Math.sin(rig.state.fold * Math.PI);
              },
            }, 0)
            // Starts while the gather is still closing, so it is one gesture
            // rather than "assemble, then leave".
            .to(rig.state, { fly: 1, duration: CLOTH.flyDur, ease: "power2.in" }, B.flyAt)
            .to(rig.state, { fade: 0, duration: B.fadeDur, ease: "power2.in" }, B.fadeAt);
        });
      });
    },

    // WV-41 — the arrival. The sheet had an exit and no entrance: it was simply
    // there. This is play() run backwards, which is what "slide in the way it
    // slides out" has to mean for a sheet that leaves as cloth — the same rig,
    // the same texture, the same three beats, each one's start time mirrored
    // about the timeline's end and its ease turned inside out (power2.in is
    // reversed by power2.out; the fold's inOut is its own reverse). So the
    // sheet arrives gathered from off the right, opens out of its creases, and
    // settles — and the last frame it draws is the first frame play() would.
    //
    // Resolves once the real DOM sheet is back on screen. Callers get that even
    // when there is no WebGL, no GSAP or no snapshot, because the paper is only
    // ever hidden by open(), and a rejection here leaves it untouched.
    playIn: function (paper) {
      var B = beats();
      return open(paper, { fold: 1, fly: 1, fade: 0, amp: CLOTH.waveOnFold, settling: false })
        .then(function (rig) {
          var gsap = window.gsap;
          if (!gsap) { reset(paper); return; }
          rig.start();
          return new Promise(function (resolve) {
            gsap.timeline({
              onComplete: function () {
                // Hand back to the DOM on the same frame the rig stops drawing,
                // so the swap from texture to live text has nothing between it.
                paper.style.visibility = "";
                rig.destroy(); current = null; resolve();
              },
            })
              .to(rig.state, { fly: 0, duration: CLOTH.flyDur, ease: "power2.out" }, 0)
              .to(rig.state, { fade: 1, duration: B.fadeDur, ease: "power2.out" }, 0)
              .to(rig.state, {
                fold: 0, duration: CLOTH.fold, ease: CLOTH.ease,
                onUpdate: function () {
                  // Once the settle owns the amplitude, stop fighting it for the
                  // value. Checked rather than ordered, because GSAP gives no
                  // promise about which of two overlapping tweens renders first.
                  if (rig.state.settling) return;
                  rig.state.amp = CLOTH.wave + (CLOTH.waveOnFold - CLOTH.wave) * Math.sin(rig.state.fold * Math.PI);
                },
              }, B.total - CLOTH.fold)
              // Ends at exactly 0 on the timeline's last frame, which is the
              // frame onComplete swaps in the DOM — so the sheet the reader
              // last sees as texture is the sheet they keep.
              .to(rig.state, {
                amp: 0, duration: CLOTH.settle, ease: "power2.out",
                onStart: function () { rig.state.settling = true; },
              }, B.total - CLOTH.settle);
          });
        });
    },
  };
})();
