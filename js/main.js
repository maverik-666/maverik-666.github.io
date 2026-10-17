(function () {
  "use strict";

  // ---------------------------------------------------------------
  // Playable ads list. Put builds in /playables and covers in /Assets/Playables.
  // cover: optional image path; the checker placeholder is used without it.
  // ---------------------------------------------------------------
  var PLAYABLES = [
    { title: "EXPLORE DUNGEON", genre: "RPG", src: "playables/explore-dungeon.html", cover: "Assets/PlayablePreviews/explore-dungeon.webp" },
    { title: "FARM SIMULATOR", genre: "", src: "playables/farm-simulator.html", cover: "Assets/PlayablePreviews/farm-simulator.webp" },
    { title: "WAVE", genre: "", src: "playables/wave.html", cover: "Assets/PlayablePreviews/wave.webp" },
    { title: "DRAWING", genre: "", src: "playables/drawing.html", cover: "Assets/PlayablePreviews/drawing.webp" },
    { title: "SANDBOX", genre: "", src: "playables/sandbox.html", cover: "Assets/PlayablePreviews/sandbox.webp" }
  ];

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var rootStyle = getComputedStyle(document.documentElement);

  function cssVar(name, fallback) {
    return rootStyle.getPropertyValue(name).trim() || fallback;
  }

  // ================= Bayer 8x8 ordered dithering =================
  var BAYER8 = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21]
  ];

  // ================= Dithered gradients from Assets/Art/gradient.png =================
  // The 16x16 tile goes from sparse (top) to solid (bottom). It is upscaled with
  // nearest-neighbour into full-size tiles, so the browser never smooths it.
  function scaledTile(img, scale, flip, color) {
    var c = document.createElement("canvas");
    c.width = img.naturalWidth * scale;
    c.height = img.naturalHeight * scale;
    var g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    if (flip) { g.translate(0, c.height); g.scale(1, -1); }
    g.drawImage(img, 0, 0, c.width, c.height);
    if (color) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
    }
    return "url(" + c.toDataURL() + ")";
  }

  var world = document.querySelector(".pixel-world");
  var gradientImg = new Image();
  gradientImg.onload = function () {
    try {
      var rootEl = document.documentElement;
      var panelColor = getComputedStyle(world).getPropertyValue("--panel").trim() || "rgba(31,22,54,.92)";
      // edges: 4x -> 64px tile, exactly one grid cell; panel: 2x like the other pixel art
      rootEl.style.setProperty("--dither-mask-top", scaledTile(gradientImg, 4, false));
      rootEl.style.setProperty("--dither-mask-bottom", scaledTile(gradientImg, 4, true));
      rootEl.style.setProperty("--dither-panel", scaledTile(gradientImg, 2, false, panelColor));

      world.classList.add("dither-ready");
    } catch (err) { /* CSS gradient stays as a fallback */ }
  };
  gradientImg.src = "Assets/Art/gradient.png";

  // short fade (Assets/Art/gradient_small.png) under the player's title bar:
  // dark on top, dissolving downwards over the game
  var gradientSmallImg = new Image();
  gradientSmallImg.onload = function () {
    try {
      document.documentElement.style.setProperty("--dither-bar",
        scaledTile(gradientSmallImg, 2, true, cssVar("--plum-5", "#1f1636")));
    } catch (err) { /* CSS gradient stays as a fallback */ }
  };
  gradientSmallImg.src = "Assets/Art/gradient_small.png";

  // the bottom edge starts at the world's bottom, which is rarely on a grid line
  function syncBottomGrid() {
    var h = world.offsetHeight;
    world.style.setProperty("--grid-shift-bottom", ((64 - (h % 64)) % 64) + "px");
  }
  syncBottomGrid();
  window.addEventListener("resize", syncBottomGrid);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncBottomGrid);

  // ================= Covers =================
  function applyCover(el, src) {
    if (!src) return;
    el.classList.remove("px-placeholder");
    el.classList.add("has-cover");
    el.style.backgroundImage = "url('" + src + "')";
  }
  document.querySelectorAll("[data-cover]").forEach(function (el) {
    applyCover(el, el.getAttribute("data-cover"));
  });

  // ================= Playable cards =================
  var PLAY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5 2h2v12H5zM7 4h2v8H7zM9 6h2v4H9z"/></svg>';
  var playTrack = document.getElementById("playables-track");
  PLAYABLES.forEach(function (p, i) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "showcase__item play-card px-frame";
    btn.setAttribute("aria-label", "Play " + p.title);
    btn.setAttribute("data-playable", i);

    var inner = document.createElement("span");
    inner.className = "px-frame__inner px-placeholder";
    applyCover(inner, p.cover);
    if (!p.cover) {
      var label = document.createElement("span");
      label.className = "play-card__label";
      label.textContent = "COVER " + (i + 1);
      inner.appendChild(label);
    }
    inner.insertAdjacentHTML("beforeend", '<span class="play-card__play px-button px-button--icon" aria-hidden="true">' + PLAY_ICON + "</span>");

    var panel = document.createElement("span");
    panel.className = "play-card__panel px-panel";
    panel.innerHTML = '<span class="play-card__title"></span>';
    panel.firstChild.textContent = p.title;
    inner.appendChild(panel);

    btn.appendChild(inner);
    playTrack.appendChild(btn);
  });

  // ================= Showcase: infinite carousel =================
  // Items are cloned before and after the originals; after an animated move
  // into a clone set, the track jumps back to the matching original silently.
  function Showcase(root, opts) {
    var viewport = root.querySelector(".showcase__viewport");
    var track = root.querySelector(".showcase__track");
    var dotsBox = root.querySelector(".showcase__dots");
    var originals = Array.prototype.slice.call(track.children);
    var n = originals.length;
    if (n === 0) return;

    var items = [];
    function cloneSet() {
      return originals.map(function (el) {
        var c = el.cloneNode(true);
        c.setAttribute("aria-hidden", "true");
        c.setAttribute("tabindex", "-1");
        c.querySelectorAll("a, button").forEach(function (f) { f.setAttribute("tabindex", "-1"); });
        return c;
      });
    }
    // Enough copies on each side to cover the widest screen plus a full drag,
    // so the end of the strip is never visible.
    var step0 = n > 1 ? originals[1].offsetLeft - originals[0].offsetLeft : originals[0].offsetWidth;
    var setWidth = Math.max(1, step0 * n);
    var K = Math.ceil(Math.max(window.screen.width || 0, window.innerWidth) / setWidth) + 1;
    var before = [];
    var after = [];
    for (var k = 0; k < K; k++) {
      before = cloneSet().concat(before);
      after = after.concat(cloneSet());
    }
    before.forEach(function (c) { track.insertBefore(c, originals[0]); });
    after.forEach(function (c) { track.appendChild(c); });
    items = before.concat(originals, after);
    var first = K * n;          // index of the first original item
    var last = items.length - 1;

    var index = first;
    var offset = 0;
    var dots = [];

    for (var d = 0; d < n; d++) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "showcase__dot";
      dot.setAttribute("aria-label", "Show item " + (d + 1));
      dot.addEventListener("click", (function (k) {
        return function () { normalize(); go(first + k); };
      })(d));
      dotsBox.appendChild(dot);
      dots.push(dot);
    }

    function offsetFor(i) {
      var el = items[i];
      return viewport.clientWidth / 2 - (el.offsetLeft + el.offsetWidth / 2);
    }

    function setTransform(x, animate) {
      track.classList.toggle("no-anim", !animate);
      track.style.transform = "translate3d(" + Math.round(x) + "px,0,0)";
    }

    function mark(at) {
      var cur = at === undefined ? index : at;
      var real = ((cur % n) + n) % n;
      items.forEach(function (el, i) { el.classList.toggle("is-active", i === cur); });
      dots.forEach(function (el, i) { el.classList.toggle("is-active", i === real); });
    }

    var settleTimer = null;
    function go(i, animate) {
      // always move from the original set, so fast clicks never run off the clones
      var delta = i - index;
      normalize();
      index = Math.max(0, Math.min(last, index + delta));
      offset = offsetFor(index);
      var anim = animate !== false && !reduceMotion;
      setTransform(offset, anim);
      mark();
      clearTimeout(settleTimer);
      if (anim) settleTimer = setTimeout(normalize, 650); // fallback if transitionend is skipped
      else normalize();
    }

    function normalize() {
      if (index >= first && index < first + n) return;
      index = ((index % n) + n) % n + first;
      offset = offsetFor(index);
      setTransform(offset, false);
      // swap the active card with its fade disabled for this one frame, so it doesn't blink
      track.classList.add("no-fade");
      mark();
      void track.offsetWidth; // flush so the next move animates again
      track.classList.remove("no-fade");
    }

    track.addEventListener("transitionend", function (e) {
      if (e.target === track) normalize();
    });

    root.querySelector("[data-prev]").addEventListener("click", function () { go(index - 1); });
    root.querySelector("[data-next]").addEventListener("click", function () { go(index + 1); });
    root.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    });

    // ----- drag / swipe -----
    var startX = 0;
    var startY = 0;
    var pointerId = null;
    var dragging = false;
    var suppressClick = false;

    viewport.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      dragging = false;
    });
    viewport.addEventListener("pointermove", function (e) {
      if (e.pointerId !== pointerId) return;
      var step = items[1].offsetLeft - items[0].offsetLeft;
      var limit = step * n; // never drag further than one full set
      var dx = Math.max(-limit, Math.min(limit, e.clientX - startX));
      if (!dragging) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - startY)) return;
        dragging = true;
        normalize();
        viewport.classList.add("is-dragging");
        try { viewport.setPointerCapture(pointerId); } catch (err) { /* ignore */ }
      }
      setTransform(offset + dx, false);
      // highlight whichever card is currently closest to the center
      mark(Math.max(0, Math.min(last, index + Math.round(-dx / step))));
    });
    function endDrag(e) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      if (!dragging) return;
      dragging = false;
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 0);
      viewport.classList.remove("is-dragging");
      var dx = e.clientX - startX;
      var step = items[1].offsetLeft - items[0].offsetLeft;
      var moved = Math.round(-dx / step);
      if (moved === 0 && Math.abs(dx) > 40) moved = dx < 0 ? 1 : -1;
      moved = Math.max(-n, Math.min(n, moved));
      go(index + moved);
    }
    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);
    track.addEventListener("dragstart", function (e) { e.preventDefault(); });

    // clicks: ignore after a drag; side items move into focus instead of activating
    track.addEventListener("click", function (e) {
      if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
      var item = e.target.closest(".showcase__item");
      if (!item) return;
      var i = items.indexOf(item);
      if (opts.focusOnClick && i !== index) {
        e.preventDefault();
        e.stopPropagation();
        go(index + (i - index));
        return;
      }
      if (opts.onActivate) opts.onActivate(item, e);
    }, true);

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { go(index, false); }, 100);
    });
    // fonts change card sizes, so re-center once they are ready
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { go(index, false); });
    }

    go(index, false);
  }

  // ================= Pixel loading circle =================
  // Drawn on a 64x64 canvas shown at 4x: a 60px dark disc with the percentage, and a
  // yellow disc growing from the center. Every shape is tested per pixel, so the
  // edges stay pixel-art; letters turn dark where the yellow covers them.
  var loader = (function () {
    var box = document.getElementById("player-loader");
    var canvas = box.querySelector("canvas");
    var g = canvas.getContext("2d");
    var N = canvas.width;
    var C = N / 2;
    var R = 30;
    var DIGIT_SCALE = 2; // 5x7 digits drawn at 2x so they stay readable in the bigger disc
    var INK = cssVar("--ink", "#1f1636");
    var ORANGE = cssVar("--orange", "#da915e");
    var YELLOW = cssVar("--yellow", "#e6c575");
    var masks = {};     // thresholded text bitmaps, per label
    var shown = 0;      // drawn progress 0..1
    var goal = 0;       // progress we move towards
    var creepTo = 0;    // slow automatic progress while the build boots
    var running = false;
    var finishing = false;

    // 5x7 pixel digits: the web font has fractional advances at this size,
    // so its glyphs break up when snapped to pixels
    var GLYPHS = {
      "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
      "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
      "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
      "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
      "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
      "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
      "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
      "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
      "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
      "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
      "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"]
    };
    function textMask(label) {
      if (masks[label]) return masks[label];
      var m = new Uint8Array(N * N);
      var k = DIGIT_SCALE;
      var width = (label.length * 6 - 1) * k;
      var x0 = Math.round(C - width / 2);
      var y0 = Math.round(C - 3.5 * k);
      for (var i = 0; i < label.length; i++) {
        var glyph = GLYPHS[label[i]];
        if (!glyph) continue;
        for (var gy = 0; gy < 7; gy++) {
          for (var gx = 0; gx < 5; gx++) {
            if (glyph[gy][gx] !== "1") continue;
            for (var sy = 0; sy < k; sy++) {
              for (var sx = 0; sx < k; sx++) {
                m[(y0 + gy * k + sy) * N + x0 + (i * 6 + gx) * k + sx] = 1;
              }
            }
          }
        }
      }
      masks[label] = m;
      return m;
    }

    function draw() {
      var mask = textMask(Math.floor(shown * 100) + "%");
      var fill = shown * (R + 1);
      g.clearRect(0, 0, N, N);
      for (var y = 0; y < N; y++) {
        for (var x = 0; x < N; x++) {
          var dx = x + 0.5 - C;
          var dy = y + 0.5 - C;
          var d2 = dx * dx + dy * dy;
          if (d2 > R * R) continue;
          var inYellow = d2 <= fill * fill;
          var isText = mask[y * N + x] === 1;
          g.fillStyle = isText ? (inYellow ? INK : ORANGE) : (inYellow ? YELLOW : INK);
          g.fillRect(x, y, 1, 1);
        }
      }
    }

    function tick() {
      if (creepTo > goal) goal = Math.min(creepTo, goal + 0.0025);
      var before = shown;
      shown += (goal - shown) * 0.15;
      if (Math.abs(goal - shown) < 0.002) shown = goal;
      if (shown !== before) draw();
      if (finishing && shown >= 1) {
        running = false;
        box.classList.add("is-done");
        setTimeout(function () { if (finishing) box.hidden = true; }, 300);
        return;
      }
      if (!box.hidden) requestAnimationFrame(tick);
      else running = false;
    }

    function start() {
      if (!running) { running = true; requestAnimationFrame(tick); }
    }

    var api = {
      show: function () {
        shown = goal = creepTo = 0;
        finishing = false;
        box.classList.remove("is-done");
        box.hidden = false;
        draw();
        start();
      },
      target: function (k) { goal = Math.max(goal, k); start(); },
      creep: function (k) { creepTo = k; start(); },
      finish: function () {
        finishing = true;
        goal = creepTo = 1;
        if (reduceMotion) shown = 1;
        start();
      },
      hide: function () {
        finishing = false;
        box.hidden = true;
        box.classList.remove("is-done");
      }
    };
    return api;
  })();

  // ================= Analytics (GoatCounter events) =================
  // Events show up in the GoatCounter dashboard as paths like "playable/wave".
  // count.js loads async, so events fired before it is ready are just skipped.
  function track(name, title) {
    try {
      if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({ path: name, title: title || name, event: true });
      }
    } catch (err) { /* analytics must never break the page */ }
  }
  // anything with data-track="name" is counted when clicked (bubble phase, so
  // clicks swallowed after a carousel drag are not counted)
  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-track]");
    if (el) track(el.getAttribute("data-track"));
  });

  // ================= Player modal (card -> centered window) =================
  var player = document.getElementById("player");
  var win = player.querySelector(".player__window");
  var frame = document.getElementById("player-frame");
  var titleEl = document.getElementById("player-title");
  var current = null;
  var origin = null;

  function flipFrom(rect) {
    var target = win.getBoundingClientRect();
    var sx = rect.width / target.width;
    var sy = rect.height / target.height;
    var dx = rect.left + rect.width / 2 - (target.left + target.width / 2);
    var dy = rect.top + rect.height / 2 - (target.top + target.height / 2);
    return "translate(" + dx + "px," + dy + "px) scale(" + sx + "," + sy + ")";
  }

  function openPlayer(p, card) {
    track("playable/" + p.src.split("/").pop().replace(/\.html$/, ""), "Open playable: " + p.title);
    current = p;
    origin = card;
    titleEl.textContent = p.title;
    player.hidden = false;
    document.body.classList.add("is-locked");
    paintButtons(player); // hidden at load, so painted on first open

    if (!reduceMotion && win.animate) {
      var from = flipFrom(card.getBoundingClientRect());
      win.animate(
        [{ transform: from, opacity: .6 }, { transform: "none", opacity: 1 }],
        { duration: 420, easing: "cubic-bezier(.34, 1.3, .64, 1)" }
      );
    }
    requestAnimationFrame(function () { player.classList.add("is-open"); });
    // load after the window has grown so the build gets its final size
    setTimeout(function () { loadPlayable(p); }, reduceMotion ? 0 : 300);
    player.querySelector("button[data-close]").focus({ preventScroll: true });
  }

  // ----- loading the build -----
  // The build runs as srcdoc in an opaque-origin sandbox (no allow-same-origin),
  // so Chrome gives it its own process and the page keeps running while it boots.
  // A tiny shim goes in front of the build's own scripts:
  //  - window.open (used by ad builds to open the store) is reported to this page;
  //  - the Luna preloader (bar) is hidden: our pixel loader covers the whole boot;
  //  - Luna startup stages are reported as progress;
  //  - "ready" is sent when Luna removes its preloader (or on load for non-Luna builds).
  var LUNA_STAGES = [
    "luna:build", "luna:startup:bundlesLoad", "luna:startup:loadSimpleAssetsAsync",
    "luna:startup:shaderReady", "luna:startup:loadComplexAssetsAsync",
    "luna:startup:loadPrefabsAsync", "luna:startup:loadScenesAsync"
  ];
  //  - all sound goes through a master volume (builds are mixed loud for ads).
  var PLAYABLE_VOLUME = 0.35; // 0..1 of the build's own volume
  var PLAYABLE_SHIM =
    "<style>.preloader{display:none!important}</style>" +
    "<script>(function(){function post(t,v){try{parent.postMessage({type:t,value:v},'*')}catch(e){}}" +
    // Web Audio: every context's destination becomes a gain node in front of the speakers
    "var V=" + PLAYABLE_VOLUME + ";" +
    "var AC=window.AudioContext||window.webkitAudioContext;" +
    "var BP=AC&&(window.BaseAudioContext||AC).prototype;" +
    "var dd=BP&&Object.getOwnPropertyDescriptor(BP,'destination');" +
    "if(dd&&dd.get){Object.defineProperty(BP,'destination',{configurable:true,get:function(){" +
    "if(typeof OfflineAudioContext!=='undefined'&&this instanceof OfflineAudioContext)return dd.get.call(this);" +
    "if(!this.__master){var g=this.createGain();g.gain.value=V;g.connect(dd.get.call(this));this.__master=g;}" +
    "return this.__master;}});}" +
    // <audio>/<video>: scale whatever volume the build sets
    "var MP=window.HTMLMediaElement&&HTMLMediaElement.prototype;" +
    "var vd=MP&&Object.getOwnPropertyDescriptor(MP,'volume');" +
    "if(vd&&vd.set){Object.defineProperty(MP,'volume',{configurable:true," +
    "get:function(){return this.__vol==null?1:this.__vol;}," +
    "set:function(v){this.__vol=v;vd.set.call(this,v*V);}});" +
    "var play=MP.play;MP.play=function(){if(this.__vol==null)vd.set.call(this,V);return play.apply(this,arguments);};}" +
    "window.open=function(u){post('playable:redirect',String(u||''));return null;};" +
    "var stages=" + JSON.stringify(LUNA_STAGES) + ";" +
    "stages.forEach(function(n,i){addEventListener(n,function(){post('playable:progress',(i+1)/(stages.length+1));});});" +
    "var done=false;function ready(){if(done)return;done=true;" +
    "requestAnimationFrame(function(){requestAnimationFrame(function(){post('playable:ready');});});}" +
    // Luna removes #application-preloader in its start callback: that is the real start
    "addEventListener('DOMContentLoaded',function(){var pre=document.getElementById('application-preloader');" +
    "if(!pre)return;new MutationObserver(function(){if(!pre.isConnected)ready();})" +
    ".observe(pre.parentNode||document.body,{childList:true});});" +
    "addEventListener('load',function(){if(typeof Luna==='undefined')ready();});" +
    // A press that leaves the playable no longer reaches it (the game would keep
    // "holding", e.g. a joystick). While the button is held, the page forwards the
    // pointer from outside; the shim replays it as mouse/pointer events.
    "var down=false,lx=0,ly=0,lt=null;" +
    "function fire(type,x,y,buttons){var t=(lt&&lt.isConnected)?lt:(document.elementFromPoint(x,y)||document.body);" +
    "var o={bubbles:true,cancelable:true,clientX:x,clientY:y,screenX:x,screenY:y,button:0,buttons:buttons};" +
    "t.dispatchEvent(new MouseEvent('mouse'+type,o));" +
    "try{o.pointerId=1;o.pointerType='mouse';o.isPrimary=true;t.dispatchEvent(new PointerEvent('pointer'+type,o));}catch(e){}}" +
    "function release(x,y){if(!down)return;down=false;fire('up',x,y,0);post('playable:unpress');}" +
    "addEventListener('mousedown',function(e){if(!e.isTrusted)return;down=true;lt=e.target;lx=e.clientX;ly=e.clientY;post('playable:press');},true);" +
    "addEventListener('mousemove',function(e){if(!e.isTrusted)return;lx=e.clientX;ly=e.clientY;if(down&&e.buttons===0)release(lx,ly);},true);" +
    "addEventListener('mouseup',function(e){if(e.isTrusted&&down){down=false;post('playable:unpress');}},true);" +
    "addEventListener('blur',function(){release(lx,ly);});" +
    "addEventListener('message',function(e){if(e.source!==parent||!e.data)return;var d=e.data;" +
    "if(d.type==='host:move'&&down){lx=d.x;ly=d.y;fire('move',d.x,d.y,1);}" +
    "if(d.type==='host:up')release(d.x,d.y);});" +
    "})();<\/script>";
  var screenEl = player.querySelector(".player__screen");
  var buildCache = {};
  var loadToken = 0;

  function unloadPlayable() {
    loadToken++;
    pressing = false;
    loader.hide();
    frame.removeAttribute("srcdoc");
    frame.src = "about:blank";
  }

  // download with progress, so the loader can show real numbers for this part
  function fetchBuild(src, onProgress) {
    if (buildCache[src]) return Promise.resolve(buildCache[src]);
    return fetch(src).then(function (r) {
      var total = Number(r.headers.get("Content-Length")) || 0;
      if (!r.body || !r.body.getReader || !total) return r.text();
      var reader = r.body.getReader();
      var chunks = [];
      var got = 0;
      function pump() {
        return reader.read().then(function (res) {
          if (res.done) {
            var all = new Uint8Array(got);
            var pos = 0;
            chunks.forEach(function (c) { all.set(c, pos); pos += c.length; });
            return new TextDecoder("utf-8").decode(all);
          }
          chunks.push(res.value);
          got += res.value.length;
          onProgress(Math.min(1, got / total));
          return pump();
        });
      }
      return pump();
    }).then(function (html) {
      buildCache[src] = html;
      return html;
    });
  }

  function loadPlayable(p) {
    unloadPlayable();
    var token = loadToken;
    loader.show();
    var bootTimer = null;
    fetchBuild(p.src, function (k) {
      if (token === loadToken) loader.target(k * 0.6); // download = first 60%
    }).then(function (html) {
      if (token !== loadToken) return; // closed or restarted meanwhile
      loader.target(0.6);
      loader.creep(0.95); // booting: creep between the stage reports from the build
      var head = html.search(/<head[^>]*>/i);
      var at = head >= 0 ? html.indexOf(">", head) + 1 : 0;
      frame.srcdoc = html.slice(0, at) + PLAYABLE_SHIM + html.slice(at);
      bootTimer = setTimeout(function () { if (token === loadToken) loader.finish(); }, 20000);
    }).catch(function () {
      if (token !== loadToken) return;
      frame.src = p.src; // e.g. opened from file://
      loader.finish();
    });
    loadPlayable.clearBoot = function () { clearTimeout(bootTimer); };
  }

  function redirectPop() {
    if (reduceMotion) return;
    var pop = document.createElement("span");
    pop.className = "redirect-pop";
    pop.textContent = "REDIRECT!";
    screenEl.appendChild(pop);
    setTimeout(function () { pop.remove(); }, 1300);
  }

  // While a press that started in the playable is held, forward the pointer
  // from the rest of the page to it, in the playable's own coordinates.
  var pressing = false;
  function forwardPointer(type, e) {
    var r = frame.getBoundingClientRect();
    try {
      frame.contentWindow.postMessage({ type: type, x: e.clientX - r.left, y: e.clientY - r.top }, "*");
    } catch (err) { /* ignore */ }
  }
  document.addEventListener("mousemove", function (e) {
    if (pressing && !player.hidden) forwardPointer("host:move", e);
  });
  document.addEventListener("mouseup", function (e) {
    if (!pressing) return;
    pressing = false;
    if (!player.hidden) forwardPointer("host:up", e);
  });

  window.addEventListener("message", function (e) {
    if (e.source !== frame.contentWindow || !e.data) return;
    if (e.data.type === "playable:redirect") {
      redirectPop();
      // the player got to the store button: the ad "converted"
      if (current) track("playable-cta/" + current.src.split("/").pop().replace(/\.html$/, ""), "Reached CTA: " + current.title);
    }
    if (e.data.type === "playable:press") pressing = true;
    if (e.data.type === "playable:unpress") pressing = false;
    if (e.data.type === "playable:progress") loader.target(0.6 + 0.35 * Number(e.data.value || 0));
    if (e.data.type === "playable:ready") {
      if (loadPlayable.clearBoot) loadPlayable.clearBoot();
      loader.finish();
    }
  });

  function closePlayer() {
    if (player.hidden) return;
    unloadPlayable();
    player.classList.remove("is-open");
    document.body.classList.remove("is-locked");

    var done = function () {
      player.hidden = true;
      if (origin) origin.focus({ preventScroll: true });
    };
    if (!reduceMotion && win.animate && origin) {
      var to = flipFrom(origin.getBoundingClientRect());
      win.animate(
        [{ transform: "none", opacity: 1 }, { transform: to, opacity: 0 }],
        { duration: 280, easing: "ease-in" }
      ).onfinish = done;
    } else {
      done();
    }
  }

  player.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]")) closePlayer();
  });
  function restartPlayable() {
    if (current) loadPlayable(current);
  }
  document.getElementById("player-restart").addEventListener("click", restartPlayable);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePlayer();
  });

  // ================= Pixel buttons: seamless 9-slice =================
  // CSS border-image draws 9 separate pieces and leaves hairline seams at
  // fractional zoom. Instead each button size is rendered once into a canvas.
  var BTN_SLICE = 14;
  var btnImg = new Image();
  var btnCache = {};
  btnImg.src = "Assets/Art/button.png";

  function paintButton(el) {
    var w = el.offsetWidth;
    var h = el.offsetHeight;
    if (!w || !h || !btnImg.complete || !btnImg.naturalWidth) return;
    var key = w + "x" + h;
    if (!btnCache[key]) {
      var c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      var g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      var S = BTN_SLICE;
      var iw = btnImg.naturalWidth;
      var ih = btnImg.naturalHeight;
      var sx = [0, S, iw - S, iw];
      var sy = [0, S, ih - S, ih];
      var dx = [0, S, w - S, w];
      var dy = [0, S, h - S, h];
      for (var r = 0; r < 3; r++) {
        for (var q = 0; q < 3; q++) {
          var sw = sx[q + 1] - sx[q];
          var sh = sy[r + 1] - sy[r];
          var dw = dx[q + 1] - dx[q];
          var dh = dy[r + 1] - dy[r];
          if (sw > 0 && sh > 0 && dw > 0 && dh > 0) {
            g.drawImage(btnImg, sx[q], sy[r], sw, sh, dx[q], dy[r], dw, dh);
          }
        }
      }
      btnCache[key] = "url(" + c.toDataURL() + ")";
    }
    el.style.backgroundImage = btnCache[key];
    el.classList.add("is-painted");
  }

  function paintButtons(root) {
    (root || document).querySelectorAll(".px-button").forEach(paintButton);
  }

  // ================= Init showcases =================
  Showcase(document.querySelector('[data-showcase="games"]'), { focusOnClick: true });
  Showcase(document.querySelector('[data-showcase="playables"]'), {
    onActivate: function (item) {
      var i = Number(item.getAttribute("data-playable"));
      if (PLAYABLES[i]) openPlayer(PLAYABLES[i], item);
    }
  });

  // paint once the art and the pixel font (which sets button widths) are ready
  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  var imgReady = new Promise(function (res) {
    if (btnImg.complete) res();
    else { btnImg.onload = res; btnImg.onerror = res; }
  });
  Promise.all([fontsReady, imgReady]).then(function () { paintButtons(); });

  // ================= Copy on click =================
  function copiedPop(x, y) {
    var pop = document.createElement("span");
    pop.className = "copied-pop";
    pop.textContent = "Copied!";
    pop.style.left = x + "px";
    pop.style.top = y + "px";
    document.body.appendChild(pop);
    setTimeout(function () { pop.remove(); }, 1100);
  }

  function copyFallback(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (err) { /* ignore */ }
    ta.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error("copy failed"));
  }

  // Clipboard API first; some browsers/embeds refuse it, then fall back to execCommand
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return copyFallback(text); });
    }
    return copyFallback(text);
  }

  document.querySelectorAll("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function (e) {
      var r = b.getBoundingClientRect();
      // keyboard activation has no pointer position: use the row's center
      var x = e.detail === 0 ? r.left + r.width / 2 : e.clientX;
      var y = e.detail === 0 ? r.top + r.height / 2 : e.clientY;
      copyText(b.getAttribute("data-copy")).then(function () {
        copiedPop(x, y);
      }, function () { /* clipboard blocked: nothing to show */ });
    });
  });

  // ================= Scroll-in reveal =================
  document.querySelectorAll(".job, .stack__group, .contact").forEach(function (el) {
    el.classList.add("reveal");
  });
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
      });
    }, { threshold: 0.15 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("is-visible"); });
  }

  // ================= Active nav link + address bar =================
  // The section in the middle of the screen is highlighted in the menu and put
  // into the URL (#games, ...), so the current address is a link to it.
  // replaceState keeps the Back button history clean; the hero clears the hash.
  var links = document.querySelectorAll(".nav__links a");
  // The URL is left alone until a link like /#playables has been honoured:
  // jump there once the layout has settled (fonts, carousels), then start syncing.
  var syncUrl = false;
  var initialTarget = location.hash.length > 1 ? document.getElementById(location.hash.slice(1)) : null;
  function startUrlSync() { setTimeout(function () { syncUrl = true; }, 400); }
  window.addEventListener("load", function () {
    if (!initialTarget) { startUrlSync(); return; }
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () {
      initialTarget.scrollIntoView({ behavior: "instant", block: "start" });
      startUrlSync();
    });
  });
  function setCurrentSection(id) {
    links.forEach(function (a) {
      a.classList.toggle("is-active", !!id && a.getAttribute("href") === "#" + id);
    });
    var want = id ? "#" + id : "";
    if (syncUrl && location.hash !== want && window.history && history.replaceState) {
      history.replaceState(null, "", location.pathname + location.search + want);
    }
  }
  if ("IntersectionObserver" in window) {
    var hero = document.querySelector(".hero");
    var navIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        setCurrentSection(en.target === hero ? "" : en.target.id);
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    if (hero) navIo.observe(hero);
    document.querySelectorAll("main section[id]").forEach(function (s) { navIo.observe(s); });
  }

  // ================= Micro-interactions =================
  // Particles are frame-by-frame stars (Assets/Art/stars.png, 4 frames of 9x9 at 2x):
  // each one appears near the click, drifts up and plays frames 1-4, then disappears.
  var particles = [];
  var particlesRunning = false;
  var STAR_FRAMES = 4;
  var STAR_SIZE = 18;       // one frame on screen, px
  var GRAVITY = -320;       // px/s^2, negative = pulls up
  var SPAWN_RADIUS = 22;    // px around the click where particles appear
  var SOFT_LIFE = 1.4;      // s, lifetime of the smooth (non-pixel) stars

  function stepParticles(now, prev) {
    var dt = Math.min(0.05, (now - prev) / 1000);
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      if (p.soft) {
        // no pull: just spread out and slow down
        var drag = Math.exp(-2.5 * dt);
        p.vx *= drag;
        p.vy *= drag;
      } else {
        p.vy += GRAVITY * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.age += dt;
      if (p.soft) {
        // smooth star: spins and fades out over SOFT_LIFE
        var fade = 1 - Math.max(0, (p.age / SOFT_LIFE - 0.3) / 0.7);
        if (fade <= 0) {
          p.el.remove();
          particles.splice(i, 1);
          continue;
        }
        p.el.style.transform = "translate(" + (p.x - STAR_SIZE / 2) + "px," + (p.y - STAR_SIZE / 2) + "px) rotate(" + Math.round(p.age * p.spin) + "deg)";
        p.el.style.opacity = fade;
        continue;
      }
      var frame = Math.floor(p.age / p.frameTime);
      if (frame >= STAR_FRAMES) {
        p.el.remove();
        particles.splice(i, 1);
        continue;
      }
      if (frame !== p.frame) {
        p.frame = frame;
        p.el.style.backgroundPosition = -STAR_SIZE * frame + "px 0";
      }
      // snap to the 2px art grid; no rotation or scaling, it would smear the pixel art
      var px = Math.round(p.x / 2) * 2 - STAR_SIZE / 2;
      var py = Math.round(p.y / 2) * 2 - STAR_SIZE / 2;
      p.el.style.transform = "translate(" + px + "px," + py + "px)";
    }
    if (particles.length) {
      requestAnimationFrame(function (t) { stepParticles(t, now); });
    } else {
      particlesRunning = false;
    }
  }

  function burst(x, y, opts) {
    if (reduceMotion) return;
    opts = opts || {};
    var count = opts.count || 7;
    for (var i = 0; i < count; i++) {
      var el = document.createElement("span");
      el.className = opts.soft ? "burst burst--soft" : "burst";
      // start somewhere inside a small circle around the click
      var r0 = Math.sqrt(Math.random()) * SPAWN_RADIUS;
      var a0 = Math.random() * Math.PI * 2;
      var sx = x + Math.cos(a0) * r0;
      var sy = y + Math.sin(a0) * r0;
      el.style.transform = "translate(" + (sx - STAR_SIZE / 2) + "px," + (sy - STAR_SIZE / 2) + "px)";
      document.body.appendChild(el);
      // pixel stars: any direction at first, the upward pull takes over quickly;
      // smooth stars: fly straight out from the click
      var angle = opts.soft ? a0 : Math.random() * Math.PI * 2;
      var speed = opts.soft ? 90 + Math.random() * 120 : 50 + Math.random() * 110;
      particles.push({
        el: el,
        x: sx, y: sy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        frame: 0,
        // slightly different frame rates so the stars don't blink in sync
        frameTime: 0.16 + Math.random() * 0.1,
        soft: !!opts.soft,
        spin: (Math.random() - 0.5) * 360
      });
    }
    if (!particlesRunning) {
      particlesRunning = true;
      var start = performance.now();
      requestAnimationFrame(function (t) { stepParticles(t, start); });
    }
  }
  function burstFrom(el, opts) {
    var r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, opts);
  }

  // scroll progress bar
  var progress = document.createElement("div");
  progress.className = "progress";
  progress.setAttribute("aria-hidden", "true");
  document.body.appendChild(progress);
  var progressQueued = false;
  function updateProgress() {
    progressQueued = false;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = "scaleX(" + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ")";
  }
  window.addEventListener("scroll", function () {
    if (!progressQueued) { progressQueued = true; requestAnimationFrame(updateProgress); }
  }, { passive: true });
  updateProgress();

  // nav: pill slides to the active link
  var navLinks = document.querySelector(".nav__links");
  var pill = document.createElement("span");
  pill.className = "nav__pill";
  pill.setAttribute("aria-hidden", "true");
  navLinks.appendChild(pill);
  navLinks.classList.add("has-pill");
  function movePill() {
    var a = navLinks.querySelector("a.is-active");
    if (!a) { pill.style.opacity = "0"; return; }
    pill.style.opacity = "1";
    pill.style.width = a.offsetWidth + "px";
    pill.style.height = a.offsetHeight + "px";
    pill.style.transform = "translate(" + a.offsetLeft + "px," + a.offsetTop + "px)";
  }
  new MutationObserver(movePill).observe(navLinks, { attributes: true, subtree: true, attributeFilter: ["class"] });
  window.addEventListener("resize", movePill);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(movePill);

  // avatar: pet the cat
  var avatar = document.querySelector(".hero__avatar");
  avatar.setAttribute("role", "button");
  avatar.setAttribute("tabindex", "0");
  avatar.setAttribute("aria-label", "Pet the cat");
  var petTimer = null;
  function pet(x, y) {
    avatar.classList.remove("is-petted");
    void avatar.offsetWidth; // restart the animation
    avatar.classList.add("is-petted");
    clearTimeout(petTimer);
    petTimer = setTimeout(function () { avatar.classList.remove("is-petted"); }, 550);
    if (x === undefined) burstFrom(avatar, { count: 9, soft: true });
    else burst(x, y, { count: 9, soft: true });
  }
  // drop the class after the squish so the idle bob animation resumes
  avatar.addEventListener("animationend", function (e) {
    if (e.animationName === "squish") avatar.classList.remove("is-petted");
  });
  avatar.addEventListener("click", function (e) { pet(e.clientX, e.clientY); });
  avatar.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pet(); }
  });

  // star burst on hand-drawn buttons
  document.querySelectorAll(".btn").forEach(function (b) {
    b.addEventListener("click", function (e) {
      if (e.detail === 0) burstFrom(b, { count: 6, soft: true }); // keyboard activation
      else burst(e.clientX, e.clientY, { count: 6, soft: true });
    });
  });

  // pixel burst on clicks inside the pixel world (except after a drag)
  document.querySelector(".pixel-world").addEventListener("click", function (e) {
    if (e.defaultPrevented || e.detail === 0) return;
    burst(e.clientX, e.clientY, { pixel: true, count: 8 });
  });

  // ================= Bayer dissolve when entering the pixel world =================
  // A page-colored layer covers the top of the pixel world and disappears
  // cell by cell in Bayer-matrix order (plus a top-down bias).
  var worldEl = document.querySelector(".pixel-world");
  var canvas = worldEl.querySelector(".pixel-reveal");
  if (reduceMotion || !canvas.getContext || !("IntersectionObserver" in window)) {
    canvas.remove();
    return;
  }

  var ctx = canvas.getContext("2d");
  var CELL = 16;
  var cells = [];
  var played = false;

  function setup() {
    var cols = Math.ceil(canvas.clientWidth / CELL);
    var rows = Math.ceil(canvas.clientHeight / CELL);
    canvas.width = cols;   // 1 canvas px = 1 cell, scaled up with pixelated rendering
    canvas.height = rows;
    cells = [];
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        cells.push({ x: x, y: y, t: (BAYER8[y % 8][x % 8] / 64) * 0.55 + (y / rows) * 0.45 });
      }
    }
    ctx.fillStyle = cssVar("--bg", "#2c1b39");
    ctx.fillRect(0, 0, cols, rows);
  }

  function play() {
    var duration = 1100; // the layer now spans the whole (tall) pixel world
    var start = performance.now();
    function step(now) {
      var k = Math.min(1, (now - start) / duration);
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        if (!c.done && c.t <= k) {
          ctx.clearRect(c.x, c.y, 1, 1);
          c.done = true;
        }
      }
      if (k < 1) requestAnimationFrame(step);
      else canvas.remove();
    }
    requestAnimationFrame(step);
  }

  // Only cover the world if the user hasn't scrolled to it yet (e.g. page reload mid-way)
  if (worldEl.getBoundingClientRect().top > window.innerHeight * 0.5) {
    setup();
    var worldIo = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && !played) {
        played = true;
        worldIo.disconnect();
        play();
      }
    }, { rootMargin: "0px 0px -35% 0px" });
    worldIo.observe(worldEl);
    window.addEventListener("resize", function () { if (!played) setup(); });
    // the world's height settles once fonts load; rebuild the layer to match
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { if (!played) setup(); });
    }
  } else {
    canvas.remove();
  }
})();
