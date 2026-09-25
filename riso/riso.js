/*
 * riso.js — a tiny risograph print simulator for canvas animations.
 *
 * You draw each ink "plate" as a grayscale drawing (black = full ink, transparent
 * or white = no ink). riso.js then screens every plate (grain / dots / lines),
 * adds uneven ink coverage, misregisters the plates against each other, and
 * multiplies them onto textured paper — like a real riso print.
 *
 * Classic script (no modules) so scenes also work straight from file://.
 * Exposes a single global: window.Riso
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Ink + paper library (approximations of real Riso ink colours)
  // ---------------------------------------------------------------------------
  const INKS = {
    black: '#000000',
    burgundy: '#914E72',
    blue: '#0078BF',
    green: '#00A95C',
    mediumBlue: '#3255A4',
    brightRed: '#F15060',
    risoFederalBlue: '#3D5588',
    purple: '#765BA7',
    teal: '#00838A',
    flatGold: '#BB8B41',
    hunterGreen: '#407060',
    red: '#FF665E',
    brown: '#925F52',
    yellow: '#FFE800',
    marineRed: '#D2515E',
    orange: '#FF6C2F',
    fluorescentPink: '#FF48B0',
    lightGray: '#88898A',
    metallicGold: '#AC936E',
    crimson: '#E45D50',
    fluorescentOrange: '#FF7477',
    cornflower: '#62A8E5',
    skyBlue: '#4982CF',
    seaBlue: '#0074A2',
    lake: '#235BA8',
    indigo: '#484D7A',
    midnight: '#435060',
    mist: '#D5E4C0',
    granite: '#A5AAA8',
    charcoal: '#70747C',
    smokyTeal: '#5F8289',
    steel: '#375E77',
    slate: '#5E695E',
    turquoise: '#00AA93',
    emerald: '#19975D',
    grass: '#397E58',
    forest: '#516E5A',
    spruce: '#4A635D',
    moss: '#68724D',
    seaFoam: '#62C2B1',
    kellyGreen: '#67B346',
    lightTeal: '#009DA5',
    ivy: '#169B62',
    pine: '#23815A',
    lagoon: '#2F6165',
    violet: '#9D7AD2',
    orchid: '#AA60BF',
    plum: '#845991',
    raisin: '#775D7A',
    grape: '#6C5D80',
    scarlet: '#F65058',
    tomato: '#D2515E',
    cranberry: '#D1517A',
    maroon: '#9E4C6E',
    raspberryRed: '#D1517A',
    brick: '#A75154',
    lightLime: '#E3ED55',
    sunflower: '#FFB511',
    melon: '#FFAE3B',
    apricot: '#F6A04D',
    paprika: '#EE7F4B',
    pumpkin: '#FF6F4C',
    brightOlivegreen: '#B49F29',
    brightGold: '#BA8032',
    copper: '#BD6439',
    mahogany: '#8E595A',
    bisque: '#F2CDCF',
    bubbleGum: '#F984CA',
    lightMauve: '#E6B5C9',
    darkMauve: '#BD8CA6',
    wine: '#914E72',
    gray: '#928D88',
    coral: '#FF8E91',
    white: '#FFFFFF',
    aqua: '#5EC8E5',
    mint: '#82D8D5',
    fluorescentYellow: '#FFE916',
    fluorescentRed: '#FF4C65',
    fluorescentGreen: '#44D62C',
  };

  const PAPERS = {
    cream: '#F4EEE1',
    white: '#FAF8F3',
    newsprint: '#EAE4D6',
    kraft: '#D9C4A0',
    pink: '#F6E0DC',
    blue: '#E1E9EE',
    black: '#1E1D1F', // light inks on black stock don't really exist; mostly for fun
  };

  // ---------------------------------------------------------------------------
  // Small utilities: seeded rng, value noise, fbm, maths
  // ---------------------------------------------------------------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rng(seed) {
    const r = mulberry32(seed == null ? (Math.random() * 1e9) | 0 : seed);
    const f = () => r();
    f.range = (a, b) => a + (b - a) * r();
    f.int = (a, b) => Math.floor(a + (b - a + 1) * r());
    f.pick = (arr) => arr[Math.floor(r() * arr.length)];
    f.chance = (p) => r() < p;
    f.gauss = () => {
      let u = 0, v = 0;
      while (u === 0) u = r();
      while (v === 0) v = r();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    return f;
  }

  // 2D/3D value noise with smooth interpolation, returns roughly [-1, 1]
  function makeNoise(seed) {
    const r = mulberry32(seed || 1);
    const perm = new Uint8Array(512);
    const vals = new Float32Array(256);
    for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = r() * 2 - 1; }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a, b, t) => a + (b - a) * t;

    function noise2(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const X = xi & 255, Y = yi & 255;
      const u = fade(xf), v = fade(yf);
      const a = vals[perm[perm[X] + Y]], b = vals[perm[perm[X + 1] + Y]];
      const c = vals[perm[perm[X] + Y + 1]], d = vals[perm[perm[X + 1] + Y + 1]];
      return lerp(lerp(a, b, u), lerp(c, d, u), v);
    }
    function noise3(x, y, z) {
      const zi = Math.floor(z), zf = fade(z - zi);
      return lerp(noise2(x + zi * 31.7, y + zi * 17.3), noise2(x + (zi + 1) * 31.7, y + (zi + 1) * 17.3), zf);
    }
    function fbm(x, y, oct = 4) {
      let s = 0, a = 0.5, f = 1, n = 0;
      for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); n += a; a *= 0.5; f *= 2; }
      return s / n;
    }
    return { noise2, noise3, fbm };
  }

  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const fract = (x) => x - Math.floor(x);
  const ease = {
    inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    out: (t) => 1 - (1 - t) * (1 - t),
    in: (t) => t * t,
    sine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  };

  // deterministic 0..1 hash of an integer (+ optional salt) — for per-object variety
  const hash = (i, s = 0) => fract(Math.sin(i * 127.1 + s * 311.7) * 43758.5453123);

  // Seamlessly looping 1D noise: loopNoise(x, period, wavelength) === loopNoise(x + period, ...)
  // Use it for scrolling scenery so a `loop`-second animation repeats perfectly.
  function loopNoise(x, period, wavelength, { seed = 0, octaves = 3, noise = null } = {}) {
    const nz = noise || loopNoise.nz || (loopNoise.nz = makeNoise(99));
    const a = (2 * Math.PI * x) / period;
    const r = period / (2 * Math.PI * wavelength);
    const cx = Math.cos(a) * r, cy = Math.sin(a) * r;
    let s = 0, amp = 0.5, f = 1, n = 0;
    for (let o = 0; o < octaves; o++) {
      s += amp * nz.noise2(cx * f + seed * 13.1 + o * 5.3, cy * f + seed * 7.7 - o * 3.1);
      n += amp; amp *= 0.5; f *= 2;
    }
    return s / n;
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // "tone" — a fill style for plate drawing. tone(1) = solid ink, tone(0.3) = 30% tint.
  const tone = (d = 1) => `rgba(0,0,0,${clamp(d)})`;

  // ---------------------------------------------------------------------------
  // Hand-drawn path helpers (operate on any CanvasRenderingContext2D)
  // ---------------------------------------------------------------------------
  const shared = makeNoise(7);

  // A closed wobbly blob / circle
  function blob(ctx, cx, cy, r, { wobble = 0.08, seed = 0, steps = 48, t = 0 } = {}) {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const n = shared.noise3(Math.cos(a) * 1.3 + seed, Math.sin(a) * 1.3 + seed * 1.7, t);
      const rr = r * (1 + wobble * n);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  // Fill the area under a function y = f(x) down to `bottom`
  function ridge(ctx, f, { x0 = 0, x1 = 1000, bottom = 1000, step = 4 } = {}) {
    ctx.beginPath();
    ctx.moveTo(x0, bottom);
    for (let x = x0; x <= x1 + step; x += step) ctx.lineTo(x, f(x));
    ctx.lineTo(x1 + step, bottom);
    ctx.closePath();
  }

  // A slightly jittered straight line, like a hand-cut stencil edge.
  // Starts a new subpath unless { continue: true } (used when chaining edges).
  function wobblyLine(ctx, x0, y0, x1, y1, { amp = 1.2, seed = 0, seg = 12, continue: cont = false } = {}) {
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const n = Math.max(2, Math.ceil(len / seg));
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    if (!cont) ctx.moveTo(x0, y0);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const o = i === n ? 0 : shared.noise2(t * n * 0.5 + seed, seed * 3.1) * amp;
      ctx.lineTo(lerp(x0, x1, t) + nx * o, lerp(y0, y1, t) + ny * o);
    }
  }

  // A closed polygon with wobbly edges (call ctx.fill() / ctx.stroke() after)
  function wobblyPoly(ctx, pts, opts = {}) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      wobblyLine(ctx, ax, ay, bx, by, { ...opts, seed: (opts.seed || 0) + i * 1.37, continue: true });
    }
    ctx.closePath();
  }

  // Wobbly rectangle
  function wobblyRect(ctx, x, y, w, h, opts = {}) {
    wobblyPoly(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], opts);
  }

  // Knock out (erase) a shape on several plates at once, so an object in front
  // hides whatever other inks were printed behind it. `path(ctx)` builds the path.
  function knockout(ctxs, path, amount = 1) {
    for (const c of ctxs) {
      c.save();
      c.fillStyle = `rgba(255,255,255,${amount})`;
      c.beginPath();
      path(c);
      c.fill();
      c.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Screens: per-ink threshold maps
  // ---------------------------------------------------------------------------
  function buildScreen(kind, W, H, { angle = 15, cell = 5, seed = 1, grit = 0.15 } = {}) {
    const r = mulberry32(seed * 9973 + 17);
    const nz = makeNoise(seed * 31 + 3);
    const out = new Float32Array(W * H);
    const a = (angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    let wn = null; // white noise for the grain screen
    if (kind === 'grain') { wn = new Float32Array(W * H); for (let i = 0; i < wn.length; i++) wn[i] = r(); }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let th;
        const white = r();
        if (kind === 'dots') {
          const u = (x * ca + y * sa) / cell, v = (-x * sa + y * ca) / cell;
          const fu = u - Math.floor(u) - 0.5, fv = v - Math.floor(v) - 0.5;
          th = Math.sqrt(fu * fu + fv * fv) * 1.35;
          th = lerp(th, white, grit);
        } else if (kind === 'lines') {
          const u = (x * ca + y * sa) / cell;
          th = Math.abs(u - Math.floor(u) - 0.5) * 2;
          th = lerp(th, white, grit);
        } else if (kind === 'solid') {
          th = 0.5 + (white - 0.5) * 0.1;
        } else {
          // 'grain' — stochastic ~2px grain, like riso's default screen
          const i = y * W + x, x1 = x + 1 < W ? 1 : 0, y1 = y + 1 < H ? W : 0;
          th = (wn[i] + wn[i + x1] + wn[i + y1] + wn[i + x1 + y1]) / 4; // 2x2 box blur
          th = 0.5 + (th - 0.5) * 1.9 + nz.noise2(x * 0.08, y * 0.08) * 0.04;
        }
        out[y * W + x] = clamp(th, 0.015, 0.985);
      }
    }
    return out;
  }

  // Low-frequency map for uneven ink laydown (1 = full, lower = starved)
  function buildLaydown(W, H, seed, amount) {
    const nz = makeNoise(seed * 101 + 5);
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const big = nz.fbm(x / 140, y / 140, 3);
        const streak = nz.noise2(x / 600, y / 6) * 0.35; // roller streaks
        out[y * W + x] = clamp(1 - amount * (0.5 + 0.5 * (big + streak)), 0, 1.05);
      }
    }
    return out;
  }

  function buildPaper(W, H, hex, seed, amount) {
    const [pr, pg, pb] = hexToRgb(hex);
    const nz = makeNoise(seed * 13 + 1);
    const r = mulberry32(seed * 7 + 11);
    const out = new Float32Array(W * H * 3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let k = 1 - amount * (0.5 + 0.5 * nz.fbm(x / 2, y / 2, 2)) * 0.035;  // fibres
        k -= amount * (0.5 + 0.5 * nz.fbm(x / 120, y / 120, 2)) * 0.04;       // mottling
        if (r() < 0.0004 * amount) k -= 0.2 * r();                            // flecks
        const i = (y * W + x) * 3;
        out[i] = (pr / 255) * k; out[i + 1] = (pg / 255) * k; out[i + 2] = (pb / 255) * k;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // The printer
  // ---------------------------------------------------------------------------
  const DEFAULT_ANGLES = [15, 75, 0, 45, 30, 60];

  function create(opts = {}) {
    const W = opts.width || 960;
    const H = opts.height || 600;
    const seed = opts.seed == null ? 1 : opts.seed;
    const PAD = 16;                       // room for misregistration / boil offsets
    const MW = W + PAD * 2, MH = H + PAD * 2;
    const R = rng(seed);

    const canvas = opts.canvas || (() => {
      const c = document.createElement('canvas');
      (opts.parent || document.body).appendChild(c);
      return c;
    })();
    canvas.width = W;
    canvas.height = H;
    const out = canvas.getContext('2d');
    const outImg = out.createImageData(W, H);

    const misreg = opts.misregister == null ? 3 : opts.misregister;
    const jitter = opts.jitter == null ? 0.8 : opts.jitter;
    const paper = buildPaper(W, H, PAPERS[opts.paper] || opts.paper || PAPERS.cream, seed, opts.paperTexture == null ? 1 : opts.paperTexture);

    const inkDefs = (opts.inks || ['blue', 'fluorescentPink', 'yellow']).map((spec, i) => {
      const s = typeof spec === 'string' ? { name: spec } : spec;
      const name = s.name;
      const hex = s.color || INKS[name] || name;
      const layer = document.createElement('canvas');
      layer.width = W; layer.height = H;
      const ctx = layer.getContext('2d', { willReadFrequently: true });
      const screen = s.screen || opts.screen || 'grain';
      return {
        name,
        rgb: hexToRgb(hex).map((v) => v / 255),
        layer,
        ctx,
        opacity: s.opacity == null ? (opts.opacity == null ? 0.92 : opts.opacity) : s.opacity,
        softness: s.softness == null ? (screen === 'grain' ? 0.22 : 0.1) : s.softness,
        thresh: buildScreen(screen, MW, MH, {
          angle: s.angle == null ? DEFAULT_ANGLES[i % DEFAULT_ANGLES.length] : s.angle,
          cell: s.cell || opts.cell || 5,
          seed: seed * 17 + i * 7 + 1,
          grit: s.grit == null ? 0.15 : s.grit,
        }),
        laydown: buildLaydown(MW, MH, seed * 3 + i, s.unevenness == null ? (opts.unevenness == null ? 0.16 : opts.unevenness) : s.unevenness),
        base: [R.range(-misreg, misreg), R.range(-misreg, misreg)],
        off: [0, 0],
        grainOff: [0, 0],
      };
    });

    // `inks` object handed to scene: inks.blue → 2D context for the blue plate
    const plates = {};
    inkDefs.forEach((d) => (plates[d.name] = d.ctx));
    Object.defineProperty(plates, 'all', { value: inkDefs.map((d) => d.ctx) });
    Object.defineProperty(plates, 'names', { value: inkDefs.map((d) => d.name) });

    const fps = opts.fps || 24;            // scene frame rate ("on ones" at 24)
    const boilFps = opts.boil == null ? 8 : opts.boil; // how often grain/registration re-rolls
    let scene = null;
    let running = false;
    let startTime = 0, pausedAt = 0, lastFrame = -1, lastBoil = -1;

    function reroll(boilIndex) {
      const br = rng(seed * 1000 + boilIndex * 7919);
      for (const d of inkDefs) {
        d.off[0] = Math.round(d.base[0] + br.range(-jitter, jitter));
        d.off[1] = Math.round(d.base[1] + br.range(-jitter, jitter));
        d.grainOff[0] = boilFps ? br.int(0, PAD) : 0;
        d.grainOff[1] = boilFps ? br.int(0, PAD) : 0;
      }
    }

    function composite() {
      const px = outImg.data;
      const n = W * H;
      // start from paper (float 0..1 per channel, stored in a scratch buffer)
      const acc = composite.acc || (composite.acc = new Float32Array(n * 3));
      acc.set(paper);
      for (const d of inkDefs) {
        const src = d.ctx.getImageData(0, 0, W, H).data;
        const [ir, ig, ib] = d.rgb;
        const kr = 1 - ir, kg = 1 - ig, kb = 1 - ib;
        const ox = d.off[0], oy = d.off[1];
        const gx = d.grainOff[0], gy = d.grainOff[1];
        const th = d.thresh, lay = d.laydown;
        const soft = d.softness, op = d.opacity;
        const inv2s = 1 / (2 * soft);
        for (let y = 0; y < H; y++) {
          const sy = y - oy;
          if (sy < 0 || sy >= H) continue;
          const rowS = sy * W;
          const rowM = (sy + gy) * MW + gx;
          const rowL = (y + PAD) * MW + PAD; // laydown is tied to the paper, not the plate
          for (let x = 0; x < W; x++) {
            const sx = x - ox;
            if (sx < 0 || sx >= W) continue;
            const si = (rowS + sx) << 2;
            const a = src[si + 3];
            if (a === 0) continue;
            let dens = (a / 255) * (1 - (src[si] + src[si + 1] + src[si + 2]) / 765);
            if (dens <= 0.004) continue;
            dens *= lay[rowL + x];
            // screen: soft threshold
            let c = (dens - th[rowM + sx] + soft) * inv2s;
            if (c <= 0) continue;
            if (c > 1) c = 1;
            c *= op;
            const oi = (y * W + x) * 3;
            acc[oi] *= 1 - c * kr;
            acc[oi + 1] *= 1 - c * kg;
            acc[oi + 2] *= 1 - c * kb;
          }
        }
      }
      for (let i = 0, j = 0; i < n; i++, j += 3) {
        const p = i << 2;
        px[p] = acc[j] * 255;
        px[p + 1] = acc[j + 1] * 255;
        px[p + 2] = acc[j + 2] * 255;
        px[p + 3] = 255;
      }
      out.putImageData(outImg, 0, 0);
    }

    function renderAt(t) {
      const frame = Math.floor(t * fps + 1e-6);
      let boil = boilFps ? Math.floor(t * boilFps + 1e-6) : 0;
      if (opts.loop && boilFps) boil %= Math.max(1, Math.round(opts.loop * boilFps)); // keep loops seamless
      if (boil !== lastBoil) { reroll(boil); lastBoil = boil; }
      for (const d of inkDefs) {
        d.ctx.setTransform(1, 0, 0, 1, 0, 0);
        d.ctx.clearRect(0, 0, W, H);
        d.ctx.fillStyle = '#000';
        d.ctx.strokeStyle = '#000';
        d.ctx.globalAlpha = 1;
        d.ctx.globalCompositeOperation = 'source-over';
      }
      if (scene) scene(plates, frame / fps, { frame, fps, width: W, height: H, rng, noise: shared, api });
      composite();
      lastFrame = frame;
    }

    function tick(now) {
      if (!running) return;
      const t = (now - startTime) / 1000;
      const frame = Math.floor(t * fps);
      if (frame !== lastFrame) renderAt(t);
      requestAnimationFrame(tick);
    }

    const api = {
      canvas,
      width: W,
      height: H,
      inks: plates,
      scene(fn) { scene = fn; return api; },
      start() {
        if (running) return api;
        running = true;
        startTime = performance.now() - pausedAt * 1000;
        requestAnimationFrame(tick);
        return api;
      },
      stop() {
        if (!running) return api;
        running = false;
        pausedAt = (performance.now() - startTime) / 1000;
        return api;
      },
      toggle() { return running ? api.stop() : api.start(); },
      get running() { return running; },
      get time() { return running ? (performance.now() - startTime) / 1000 : pausedAt; },
      // render one deterministic frame (used by the exporter)
      renderFrame(frame) { lastBoil = -1; renderAt(frame / fps); pausedAt = frame / fps; return api; },
      seek(t) { pausedAt = t; startTime = performance.now() - t * 1000; lastBoil = -1; renderAt(t); return api; },
      savePNG(name = 'riso.png') {
        const a = document.createElement('a');
        a.download = name;
        a.href = canvas.toDataURL('image/png');
        a.click();
      },
      // record `seconds` of the live canvas to a .webm using MediaRecorder
      record(seconds = 10, name = 'riso.webm') {
        const stream = canvas.captureStream(fps);
        const mime = ['video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
        const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12e6 });
        const chunks = [];
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        rec.onstop = () => {
          const a = document.createElement('a');
          a.download = name;
          a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
          a.click();
        };
        api.seek(0).start();
        rec.start();
        setTimeout(() => rec.stop(), seconds * 1000);
        return api;
      },
    };
    return api;
  }

  // ---------------------------------------------------------------------------
  // Page harness: fit canvas to window, keyboard controls, URL params
  //   ?frame=N   render a single frame and stop (used by scripts/render.mjs)
  //   ?seed=N    override the seed
  //   ?record=S  record S seconds to webm on load
  //   keys: space = pause, s = save png, r = record 10s, ← → = scrub
  // ---------------------------------------------------------------------------
  function mount(makeScene, opts = {}) {
    const params = new URLSearchParams(location.search);
    if (params.has('seed')) opts.seed = +params.get('seed');

    document.documentElement.style.cssText += ';height:100%;background:' + (opts.background || '#1b1a1c');
    document.body.style.cssText += ';margin:0;height:100%;display:grid;place-items:center;overflow:hidden';

    const riso = create(opts);
    const c = riso.canvas;
    c.style.boxShadow = '0 10px 40px rgba(0,0,0,.45)';
    const fit = () => {
      const m = opts.margin == null ? 24 : opts.margin;
      const s = Math.min((innerWidth - m * 2) / riso.width, (innerHeight - m * 2) / riso.height);
      c.style.width = riso.width * s + 'px';
      c.style.height = riso.height * s + 'px';
    };
    const frameMode = params.has('frame');
    if (frameMode) { c.style.width = riso.width + 'px'; c.style.height = riso.height + 'px'; c.style.boxShadow = 'none'; }
    else { addEventListener('resize', fit); fit(); }

    riso.scene(makeScene(riso));

    if (frameMode) {
      riso.renderFrame(+params.get('frame'));
      document.body.dataset.ready = '1';
      global.__riso = riso;
      return riso;
    }

    addEventListener('keydown', (e) => {
      if (e.key === ' ') { riso.toggle(); e.preventDefault(); }
      else if (e.key === 's') riso.savePNG((opts.title || 'riso') + '.png');
      else if (e.key === 'r') riso.record(opts.loop || 10, (opts.title || 'riso') + '.webm');
      else if (e.key === 'ArrowRight') riso.seek(riso.time + 1);
      else if (e.key === 'ArrowLeft') riso.seek(Math.max(0, riso.time - 1));
    });

    global.__riso = riso;
    document.body.dataset.ready = '1';
    if (params.has('record')) riso.record(+params.get('record') || 10, (opts.title || 'riso') + '.webm');
    else riso.start();
    return riso;
  }

  global.Riso = {
    create, mount,
    INKS, PAPERS,
    rng, makeNoise, noise: shared,
    clamp, lerp, smoothstep, fract, ease, tone, hexToRgb, hash, loopNoise,
    blob, ridge, wobblyLine, wobblyPoly, wobblyRect, knockout,
  };
})(typeof window !== 'undefined' ? window : globalThis);
