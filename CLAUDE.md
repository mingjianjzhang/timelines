# Riso animations — how to one-shot a new piece

This repo makes animated risograph-style prints in plain JavaScript. Each piece is
**one HTML file** in `scenes/` that loads `riso/riso.js` (no build step, no deps,
works from `file://`). `node scripts/build.mjs` inlines the library so the piece
becomes a single self-contained `.html` in `dist/` for sharing.

When asked for a new animation ("a riso of X", "a train journey drawn in riso"):

1. Copy `scenes/_template.html` to `scenes/<slug>.html`.
2. Pick **2–4 inks** from `Riso.INKS` (classic sets below) and a paper.
3. Write the scene function. Think in *plates*, not colours (see rules).
4. Render stills and look at them. Iterate until they read well:
   `node scripts/render.mjs scenes/<slug>.html --frames 0,60,120,180 --jpg --out out/<slug>`
   then view the images. Check several points in the loop (e.g. day and night).
5. Add a poster to `docs/` (`--poster N --jpg`) and a card to `index.html` + README.

## The medium — rules that make it look like riso

- **Draw each ink on its own plate.** `ink.blue`, `ink.fluorescentPink`, … are ordinary
  `CanvasRenderingContext2D`s. Paint in black. `tone(0.4)` = 40 % tint.
  Gradients of `tone()` work and look great once screened.
- **Colour comes from overprinting.** Pink + blue = purple, yellow + blue = green,
  pink + yellow = orange/red. Plan every object as a density on each plate.
- **White erases.** Filling `'#fff'` (or `rgba(255,255,255,a)`) on a plate removes ink
  → bare paper. Use `knockout(ink.all, path)` so a foreground object hides the inks
  behind it; otherwise it will overprint (sometimes that's what you want).
  Paper-coloured highlights (moons, steam, windows, sun stripes) are knockouts.
- **Flat shapes, few details.** Solid fills, tints, bold silhouettes. Hand-made edges
  via `wobblyPoly`, `wobblyRect`, `blob`, `ridge`. Avoid thin lines < 1.5px — they break
  up in the grain.
- **The printer does the rest:** grain/halftone screen, uneven ink laydown,
  misregistration between plates, paper texture, "boil" (grain + registration re-roll
  at `boil` fps). Never add fake noise yourself.
- **Leave a paper margin** and clip plates to the image area; set a caption in the
  margin with one of the inks (letter-spaced caps look right).

## Animation conventions

- `t` is seconds; the scene runs at `fps` (24 by default; 12 for a choppier, hand-made
  feel). Everything must be a pure function of `t` — no state between frames — so
  headless rendering of `?frame=N` is deterministic.
- **Seamless loops:** pick `LOOP` seconds. Periodic motion uses `cyc(t, n)` (n whole
  cycles per loop). Scrolling terrain uses `loopNoise(x + speed*t, speed*LOOP, wavelength)`;
  scattered objects use a whole number of objects per `speed*LOOP` (see `scatter()` in
  `train-journey.html`). Per-object variety: `hash(i, salt)`.
- Parallax: far layers slow, near layers fast; with a seamless loop the slowest layer's
  `speed*LOOP` should be ≥ the image width or you'll see it repeat.
- Deterministic particles (steam, rain, sparks): particle k is born at `k*dt`; compute
  its state from its age. Loop over the k's alive at time `t`.

## Classic ink sets

| Mood | Inks |
|---|---|
| Sunny poster | `blue`, `fluorescentPink`, `yellow` |
| Seaside | `teal`, `fluorescentOrange` |
| Moody night | `risoFederalBlue`, `sunflower`, `fluorescentPink` |
| Forest | `green`/`hunterGreen`, `orange`, `mediumBlue` |
| Zine | `black`, `fluorescentPink` |
| Autumn | `burgundy`, `sunflower`, `teal` |

Per-ink options: `{ name, color: '#hex', screen: 'grain'|'dots'|'lines'|'solid', cell, angle, grit, softness, opacity, unevenness }`.
Global options on `Riso.mount(sceneFactory, { width, height, inks, paper, fps, boil, misregister, jitter, screen, cell, unevenness, paperTexture, seed, loop, title })`.

## API cheat sheet (`window.Riso`)

`mount(factory, opts)` · `create(opts)` · `tone(d)` · `knockout(ctxs, path, amount)` ·
`blob(ctx, x, y, r, {wobble, seed, t})` · `ridge(ctx, f, {x0, x1, bottom})` ·
`wobblyLine/wobblyPoly/wobblyRect` · `loopNoise(x, period, wavelength, {seed, octaves})` ·
`noise.noise2/noise3/fbm` · `hash(i, salt)` · `rng(seed)` · `lerp/clamp/smoothstep/fract/ease`

Page controls: space pause · `s` save PNG · `r` record `loop` seconds to WebM · ←/→ scrub.
URL params: `?frame=N` (single frame, used by the renderer), `?seed=N`, `?record=S`.

## Performance

Compositing is per-pixel JS; ~960×600 with 3 inks is comfortable at 24 fps in a
desktop browser. Keep canvases ≤ ~1.2 MP, or drop `fps`.
