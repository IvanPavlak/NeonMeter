// The desktop band's drawings. The desktop draws the band in a proportional font, so
// cells are nominal there, and its Client module is handed no vector element,
// so the band is drawn by the hooks module itself: text pieces as `Text` in
// Claude Code's theme keys, and every bar and percent as an `Svg`, where each
// filled dot, bar and percent sits under a blurred halo of its own color (the
// design's `text-shadow` glow). The pulse is a SMIL animation inside each
// drawing: the color toward white and the halo wider, on one cycle, with no
// redraw. The app draws each drawing as an image, and an animated image is
// drawn again on every display frame, so a breath that never stops costs
// about a fifth of a CPU core (docs/resource-use.md). Under
// `pulseMode: responsive` the drawings breathe only for the `burst` the hooks
// module hands them after a value changed: each carries the change's number,
// so every drawing is a new image and they all start together, and the
// animation's negative `begin` keeps a drawing made later in the burst in
// phase and ends it with the rest. The Weekly rotation is the hooks module's
// timer. Under `resetColor: time` a window's reset is a drawing too, in its
// time color under the same halo, breathing with the percents.
//
// What a frame costs is mostly the blurs, so the drawings keep them few
// without changing what a frame looks like. A dot's halo is no blur at all
// but a radial gradient shaped exactly like the blurred disc (`haloProfile`),
// stepping through the blur's widths with the pulse, so a dot bar draws no
// filter however many dots it has, each halo still laid over the dots before
// it as one blur per dot was. Live dots of one color share one animated paint.
// Every filter that remains covers only its drawing's canvas, and a drawing
// with nothing live carries no animation at all, so it is never drawn again.

// The drawings are plain markup strings with no engine element in sight, so
// the README's generator runs this very file; desktop.tsx
// lays them out in the band.

import type { ContextRow, FlexChip, FlexDot, FlexPace, FlexSlice, Palette, Span } from './builder'
import type { Burst } from './color'
import { pulseForeground } from './color'

export type DesktopOptions = {
  /** The `pulse` option: false draws every drawing at rest with no animation. */
  pulse: boolean
  /** One pulse cycle in milliseconds. */
  pulseMs: number
  /** `responsive` breathes only during `burst`, after a value changed; `always` never stops. */
  pulseMode: 'responsive' | 'always'
  /** The responsive pulse at the time of drawing. */
  burst: Burst
  /** The `glow` option: false draws no halo; the pulse still brightens the colors. */
  glow: boolean
  /** The theme the row was built with: its ground and track colors are drawn where a theme key cannot be. */
  palette: Palette
  /** The bar's nominal width in dots (from the band's width); every bar drawing is this many `DOT_UNIT` wide. */
  dotCount: number
  /** The `rainbow` option: everything live and colored by a percent is painted in these colors instead. */
  rainbow?: Rainbow
  /**
   * The clock at the drawing, in milliseconds. With it, a pulse that never stops is in phase with the clock, not with
   * the moment the drawing was made: a band drawn again mid-cycle (a rotation's turn, a new reading) carries on where
   * the last one stood, so a turning rainbow never jumps back. Without it the animation starts with the drawing.
   */
  nowMs?: number
}

/**
 * The rainbow theme: its colors, and how it moves. `still` holds it; `breathe`
 * brightens it and widens the halo with the pulse, as the range colors do;
 * `circle` runs it along the bars and the text and around the rings, once
 * per pulse cycle, the halo breathing.
 */
export type Rainbow = { colors: readonly string[]; motion: 'still' | 'breathe' | 'circle' }

/**
 * The drawings' geometry, in their own pixels. The app shows a drawing at the
 * row's height (about 20px), so a 30px drawing lands at two thirds: these
 * sizes are drawn 1.5 x so the bar, dots and text keep their size on screen
 * while the halo gets the room it needs above and below.
 */
export const DOT_UNIT = 15
export const DOT_RADIUS = 4.8
/** CSS pixels every drawing is drawn at: about one line of the desktop's text. */
export const ROW_HEIGHT = 30
/** CSS pixels a drawing is shown at: one line of the desktop's text. The 30px canvas lands at two thirds, the sizes above at their intended size. */
export const DISPLAY_HEIGHT = 20
export const BAR_THICKNESS = 10.5
/**
 * The line every bar, dot and percent is centered on, in a drawing's own pixels.
 * The app centers each drawing on the middle of its own digits beside it, so
 * the canvas's middle is that line. Measured on the desktop app at 1.3.1: the
 * 2.25 lift from 1.3.0 showed the dots about 0.75 px and the percents and
 * resets about 2 px above the labels.
 */
export const MIDLINE = ROW_HEIGHT / 2
/**
 * Where a text drawing's baseline sits below `MIDLINE`, as a share of its font
 * size: digits are about 0.7 em tall, so their middle lands on the midline,
 * level with the app's own digits (`13:00`) beside them.
 */
export const BASELINE_DROP = 0.35
/** Room on either side of a drawing, so the halo at its ends is not cut by the drawing's bounds. */
export const PAD = 12
export const PCT_FONT_SIZE = 19.5
export const PCT_CHAR_WIDTH = 12.6
/** The width of one regular-weight character at `PCT_FONT_SIZE`: a reset drawing is sized by it, so it ends where its text does. */
export const RESET_CHAR_WIDTH = 11

/** The halo at rest and at the peak of the pulse: the design's 6px to 12px `text-shadow`. */
export const GLOW = { restBlur: 3, peakBlur: 6, restHalo: 0.7, peakHalo: 0.95 } as const

/** A `#RRGGBB` color, what every drawing paints with (anything else falls back to the track). */
export const HEX = /^#[0-9A-Fa-f]{6}$/
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/**
 * A drawing's pulse: its cycle, the SMIL timing of its animations and the
 * attribute that marks the change it belongs to; null when it does not pulse:
 * the pulse off, responsive with no change running, or nothing in the drawing
 * live (a 0% bar, a stale segment), which then never needs drawing again.
 */
type Beat = { ms: number; timing: string; mark: string } | null

function beatOf(o: DesktopOptions, live: boolean): Beat {
  if (!o.pulse || !live) return null
  if (o.pulseMode === 'always') {
    if (o.nowMs === undefined) return { ms: o.pulseMs, timing: 'repeatCount="indefinite"', mark: '' }
    return { ms: o.pulseMs, timing: `begin="-${Math.round(((o.nowMs % o.pulseMs) + o.pulseMs) % o.pulseMs)}ms" repeatCount="indefinite"`, mark: '' }
  }
  const { gen, elapsedMs, totalMs } = o.burst
  if (gen === 0 || elapsedMs >= totalMs) return null
  return { ms: o.pulseMs, timing: `begin="-${Math.round(elapsedMs)}ms" repeatDur="${Math.round(totalMs)}ms"`, mark: ` data-burst="${gen}"` }
}

/** Whether a drawing with something live in it is painted in the rainbow. */
function rainbowOn(o: DesktopOptions, live: boolean): boolean {
  return Boolean(o.rainbow && o.rainbow.colors.length > 1 && live)
}

/** A drawing's pulse as `beatOf` gives it, or, painted in a rainbow that holds still, none. */
function beatFor(o: DesktopOptions, live: boolean): Beat {
  return rainbowOn(o, live) && o.rainbow!.motion === 'still' ? null : beatOf(o, live)
}

/** The rainbow's paint, and how far one run of its colors reaches along a bar or a line of text, in a drawing's own pixels. */
const RB = 'url(#rb)'
export const RAINBOW_PERIOD = 126

/**
 * The rainbow as a gradient, its colors and the first one again so it closes on
 * itself: along `period` and repeating, for bars and text, where `circle`
 * slides it one period per pulse cycle; or across a circle of radius `r`, for
 * rings, where `circle` turns it once per cycle. `breathe` brightens every
 * stop with the pulse. `id` names it when a drawing holds two, and `dir: -1`
 * slides it the other way: a frame's top edge runs right and its bottom edge
 * left, so the colors go round.
 */
function rainbowPaint(o: DesktopOptions, beat: Beat, at: { period: number } | { cx: number; cy: number; r: number }, id = 'rb', dir: 1 | -1 = 1): string {
  const rb = o.rainbow!
  const colors = rb.colors.map(c => (HEX.test(c) ? c.toUpperCase() : o.palette.track))
  const loop = [...colors, colors[0]!]
  const stops = loop.map((c, i) => `<stop offset="${+(i / (loop.length - 1)).toFixed(4)}" stop-color="${c}">${beat && rb.motion === 'breathe' ? animate('stop-color', c, peakOf(c), beat) : ''}</stop>`).join('')
  const moving = beat && rb.motion === 'circle' ? beat : null
  if ('period' in at) {
    const slide = moving ? `<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="${dir * at.period} 0" dur="${moving.ms}ms" ${moving.timing}/>` : ''
    return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${at.period}" y2="0" spreadMethod="repeat">${stops}${slide}</linearGradient>`
  }
  const turn = moving ? `<animateTransform attributeName="gradientTransform" type="rotate" from="0 ${at.cx} ${at.cy}" to="360 ${at.cx} ${at.cy}" dur="${moving.ms}ms" ${moving.timing}/>` : ''
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${at.cx - at.r}" y1="${at.cy}" x2="${at.cx + at.r}" y2="${at.cy}">${stops}${turn}</linearGradient>`
}

/**
 * A frame in the rainbow. Its edges are one drawing the app stretches, and its
 * caps two more, and no drawing knows how wide another is: so each stretch of
 * edge runs the whole rainbow, ending in the color it began with, and under
 * `circle` slides it by exactly its own width per cycle, the top edge to the
 * right and the bottom edge to the left. Every stretch then shows the same
 * color at both its ends at any moment, whatever its width, so stretches meet
 * without a seam, and a cap, whose line joins a top edge to a bottom edge,
 * runs from the one's color to the other's: the colors go round the frame.
 * Held still, every end is the first color, and so are the caps.
 */
function edgePaints(o: DesktopOptions, beat: Beat, w: number): string {
  return rainbowPaint(o, beat, { period: w }, 'rbt', 1) + rainbowPaint(o, beat, { period: w }, 'rbb', -1)
}

/** A cap's paint in the rainbow, from the line's top `t` to its bottom `b`: null when the rainbow holds still or breathes, and the cap is the first color. */
function capPaint(o: DesktopOptions, beat: Beat, t: number, b: number): string | null {
  if (!beat || o.rainbow?.motion !== 'circle') return null
  const colors = o.rainbow.colors.map(c => (HEX.test(c) ? c.toUpperCase() : o.palette.track))
  const loop = [...colors, colors[0]!]
  // The top edge slides right, so the color at its end runs back through the rainbow; the bottom edge's runs forward.
  const stop = (offset: number, values: string[]) => `<stop offset="${offset}" stop-color="${values[0]}"><animate attributeName="stop-color" values="${values.join(';')}" dur="${beat.ms}ms" ${beat.timing}/></stop>`
  return `<linearGradient id="rbc" gradientUnits="userSpaceOnUse" x1="0" y1="${t}" x2="0" y2="${b}">${stop(0, [...loop].reverse())}${stop(1, loop)}</linearGradient>`
}

/** The pulse's ease, `cubic-bezier(0.42, 0, 0.58, 1)` (the spline below), at `x` of half a cycle. */
function ease(x: number): number {
  let lo = 0
  let hi = 1
  for (let n = 0; n < 24; n++) {
    const u = (lo + hi) / 2
    if (3 * (1 - u) ** 2 * u * 0.42 + 3 * (1 - u) * u * u * 0.58 + u ** 3 < x) lo = u
    else hi = u
  }
  const u = (lo + hi) / 2
  return 3 * (1 - u) * u * u + u ** 3
}

/** The pulse's intensity at `t` of a cycle: 0 at rest, 1 at the peak halfway, eased both ways. */
export function intensity(t: number): number {
  return t < 0.5 ? ease(2 * t) : 1 - ease(2 * t - 1)
}

/** An attribute from `rest` to `peak` and back over one cycle, eased both ways. */
function animate(attr: string, rest: number | string, peak: number | string, beat: NonNullable<Beat>): string {
  return `<animate attributeName="${attr}" values="${rest};${peak};${rest}" dur="${beat.ms}ms" ${beat.timing} calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>`
}

/** `C;P;C`'s middle: a color's pulse peak, toward white. */
function peakOf(color: string): string {
  return pulseForeground(color, 1)
}

/**
 * The glow filter: `g` pulses between the rest and the peak blur when the
 * drawing pulses, `r` is the rest blur alone (stale drawings, or the pulse
 * off). Its region is the drawing's canvas, `w` by `h`: a halo past it is cut
 * by the canvas anyway, and a wider region blurs pixels nobody sees.
 */
function filters(w: number, h: number, beat: Beat): string {
  const region = `filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"`
  const g = beat ? `<filter id="g" ${region}><feGaussianBlur stdDeviation="${GLOW.restBlur}">${animate('stdDeviation', GLOW.restBlur, GLOW.peakBlur, beat)}</feGaussianBlur></filter>` : ''
  return `${g}<filter id="r" ${region}><feGaussianBlur stdDeviation="${GLOW.restBlur}"/></filter>`
}

/** A blurred halo's filter and opacity, closing the opening tag: pulsing when live, at rest otherwise. */
function halo(live: boolean, beat: Beat): string {
  if (live && beat) return `filter="url(#g)" opacity="${GLOW.restHalo}">${animate('opacity', GLOW.restHalo, GLOW.peakHalo, beat)}`
  return `filter="url(#r)" opacity="${GLOW.restHalo}">`
}

function open(w: number, h: number, beat: Beat, defs: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMid meet"${beat?.mark ?? ''}><defs>${defs}</defs>`
}

/**
 * One animated paint per color: a gradient of one stop, which paints as its
 * color, stepping to the pulse's peak and back. Every live part of that color
 * fills with `url(#<id>)`, so a bar of thirty dots runs a handful of
 * animations, not thirty. `ids` keeps them by color, in order of first use.
 */
function paint(ids: Map<string, string>, color: string): string {
  const key = color.toUpperCase()
  let id = ids.get(key)
  if (!id) {
    id = `p${ids.size}`
    ids.set(key, id)
  }
  return `url(#${id})`
}

function paints(ids: Map<string, string>, beat: NonNullable<Beat> | null): string {
  let out = ''
  for (const [color, id] of ids) out += `<linearGradient id="${id}"><stop stop-color="${color}">${beat ? animate('stop-color', color, peakOf(color), beat) : ''}</stop></linearGradient>`
  return out
}

// ---------------------------------------------------------------------------
// The dot halo as a gradient. A filled dot's halo is a disc of HALO_DISC
// blurred by a Gaussian of the glow's deviation, cut to three times the disc's
// width around it (the blur filter's default region, which the dots were drawn
// with). A blurred disc's profile is a known function of the distance from its
// centre, so a radial gradient through that profile draws the same halo as the
// filter did without a filter's offscreen pass, and the pulse steps the
// gradient's stops through the blur's widths as the blur's own animation did.
// ---------------------------------------------------------------------------

/** The line of a hollow dot, a striped cell's. */
export const HOLLOW_WIDTH = 2

/** The disc a dot's halo blurs: the dot and a little more. */
const HALO_DISC = DOT_RADIUS + 1.2
/** How far a halo reaches: the disc and three deviations of the widest blur, past which it is nothing. */
export const HALO_REACH = HALO_DISC + 3 * GLOW.peakBlur
/** Gradient stops across the reach: one every 1.5 of the drawing's pixels, within 1/255 of the exact profile. */
const HALO_STOPS = 16
/** Samples of one pulse cycle the halo's gradient passes through, interpolated in between as the blur was. */
const HALO_SAMPLES = 24

/** `exp(-x) I0(x)`, the scaled modified Bessel function of order 0 (Abramowitz and Stegun 9.8.1, 9.8.2). */
function i0e(x: number): number {
  const ax = Math.abs(x)
  if (ax < 3.75) {
    const t = (x / 3.75) ** 2
    return Math.exp(-ax) * (1 + t * (3.5156229 + t * (3.0899424 + t * (1.2067492 + t * (0.2659732 + t * (0.0360768 + t * 0.0045813))))))
  }
  const t = 3.75 / ax
  return (0.39894228 + t * (0.01328592 + t * (0.00225319 + t * (-0.00157565 + t * (0.00916281 + t * (-0.02057706 + t * (0.02635537 + t * (-0.01647633 + t * 0.00392377)))))))) / Math.sqrt(ax)
}

/**
 * A disc of radius `R` blurred by a Gaussian of deviation `sd`, at distance
 * `r` from its centre: the share of a Gaussian centred there that falls on
 * the disc, from 1 inside a sharp disc to 0 far outside.
 */
export function blurredDisc(r: number, R: number, sd: number): number {
  const n = 160
  let sum = 0
  for (let i = 0; i < n; i++) {
    const rho = ((i + 0.5) / n) * R
    sum += (rho / (sd * sd)) * Math.exp(-((r - rho) ** 2) / (2 * sd * sd)) * i0e((r * rho) / (sd * sd)) * (R / n)
  }
  return Math.min(1, sum)
}

const profiles = new Map<string, readonly number[]>()

/** The halo's opacity at each stop, for a blur of deviation `sd` and a halo opacity of `op`. */
export function haloProfile(sd: number, op: number): readonly number[] {
  const key = `${sd.toFixed(4)}|${op.toFixed(4)}`
  let p = profiles.get(key)
  if (!p) {
    const stops: number[] = []
    for (let k = 0; k <= HALO_STOPS; k++) stops.push(+(blurredDisc((k / HALO_STOPS) * HALO_REACH, HALO_DISC, sd) * op).toFixed(4))
    p = stops
    profiles.set(key, p)
  }
  return p
}

/**
 * The halos of one color: a radial gradient through the blurred disc's
 * profile, still at the rest blur, or passing through the pulse's blurs and
 * opacities over the cycle (sampled `HALO_SAMPLES` times, interpolated in
 * between) when the halos pulse.
 */
function haloGradient(id: string, color: string, beat: Beat): string {
  // The same gradient comes back on every draw of a bar (the beat changes only with a change), so it is built once.
  const key = `${id}|${color}|${beat ? `${beat.ms}|${beat.timing}` : ''}`
  let made = gradients.get(key)
  if (!made) {
    if (gradients.size > 256) gradients.clear()
    made = haloGradientOf(id, color, beat)
    gradients.set(key, made)
  }
  return made
}

const gradients = new Map<string, string>()

function haloGradientOf(id: string, color: string, beat: Beat): string {
  let stops = ''
  if (beat) {
    const samples: (readonly number[])[] = []
    for (let i = 0; i <= HALO_SAMPLES; i++) {
      const k = intensity(i / HALO_SAMPLES)
      samples.push(haloProfile(GLOW.restBlur + (GLOW.peakBlur - GLOW.restBlur) * k, GLOW.restHalo + (GLOW.peakHalo - GLOW.restHalo) * k))
    }
    for (let k = 0; k <= HALO_STOPS; k++) {
      const values = samples.map(s => s[k]).join(';')
      stops += `<stop offset="${+(k / HALO_STOPS).toFixed(4)}" stop-color="${color}" stop-opacity="${samples[0]![k]}"><animate attributeName="stop-opacity" values="${values}" dur="${beat.ms}ms" ${beat.timing}/></stop>`
    }
  } else {
    const rest = haloProfile(GLOW.restBlur, GLOW.restHalo)
    for (let k = 0; k <= HALO_STOPS; k++) stops += `<stop offset="${+(k / HALO_STOPS).toFixed(4)}" stop-color="${color}" stop-opacity="${rest[k]}"/>`
  }
  return `<radialGradient id="${id}">${stops}</radialGradient>`
}

/** The blur filter's default region around a halo disc, three of its widths across, as a clip of the halo's gradient circle. */
const HALO_CLIP = `<clipPath id="hc" clipPathUnits="objectBoundingBox"><rect x="${+((HALO_REACH - 3 * HALO_DISC) / (2 * HALO_REACH)).toFixed(4)}" y="-1" width="${+((3 * HALO_DISC) / HALO_REACH).toFixed(4)}" height="3"/></clipPath>`

/**
 * A dot bar: one circle per dot, every filled one (any color but the track)
 * under a halo; live ones pulse. Each halo is laid down just before its dot,
 * so it spills over the dots before it and under the ones after. Every
 * element carries a `data-role` (`dot`, `dot-halo`) for a reader of the
 * markup; a live dot's `data-color` is its color, its fill the shared paint.
 */
export function dotBarSvg(dots: readonly FlexDot[], o: DesktopOptions, tick?: number): string {
  for (const halos of ['pulse', 'still', 'none'] as const) {
    const svg = dotBar(dots, o, halos, tick)
    if (svg.length <= DRAWING_BUDGET || halos === 'none') return svg
  }
  return ''
}

/**
 * The characters a drawing may take: the engine refuses one past 131072, and
 * the band with it. A dot bar of hundreds of dots in six colors could reach it.
 */
const DRAWING_BUDGET = 120_000

/**
 * The dot bar, its halos pulsing, or, when its markup would pass
 * `DRAWING_BUDGET`, at rest (the dots still pulse), and past that crisp.
 */
function dotBar(dots: readonly FlexDot[], o: DesktopOptions, halosAs: 'pulse' | 'still' | 'none', tick?: number): string {
  const rb = rainbowOn(o, dots.some(d => d.live))
  const beat = beatFor(o, dots.some(d => d.live))
  if (halosAs === 'none') o = { ...o, glow: false }
  let rainbowHalo = ''
  const w = dots.length * DOT_UNIT + 2 * PAD
  const h = ROW_HEIGHT
  const cy = MIDLINE
  const fills = new Map<string, string>()
  const halos = new Map<string, { id: string; color: string; live: boolean }>()
  let body = ''
  dots.forEach((d, k) => {
    const cx = (PAD + k * DOT_UNIT + DOT_UNIT / 2).toFixed(1)
    const color = HEX.test(d.color) ? d.color.toUpperCase() : o.palette.track
    const filled = color !== o.palette.track.toUpperCase()
    const live = Boolean(d.live) && beat !== null
    if (rb && d.live && filled) {
      // In the rainbow every live dot takes the one paint, and their halos are one blurred copy of them all.
      const shape = d.hollow ? `cx="${cx}" cy="${cy}" r="${DOT_RADIUS - HOLLOW_WIDTH / 2}" fill="none" stroke="${RB}" stroke-width="${HOLLOW_WIDTH}"` : `cx="${cx}" cy="${cy}" r="${DOT_RADIUS}" fill="${RB}"`
      if (o.glow && d.halo !== false) rainbowHalo += `<circle ${shape}/>`
      body += `<circle data-role="${d.hollow ? 'dot-ring' : 'dot'}" ${shape}/>`
      return
    }
    if (filled && o.glow && d.halo !== false) {
      const key = color + (live ? '+' : '')
      let hg = halos.get(key)
      if (!hg) {
        hg = { id: `h${halos.size}`, color, live }
        halos.set(key, hg)
      }
      body += `<circle data-role="dot-halo" cx="${cx}" cy="${cy}" r="${HALO_REACH}" fill="url(#${hg.id})" clip-path="url(#hc)"/>`
    }
    if (d.hollow && filled) {
      // A striped cell's dot: a ring of the dot's size, in the dot's paint.
      const ring = `cx="${cx}" cy="${cy}" r="${DOT_RADIUS - HOLLOW_WIDTH / 2}" fill="none" stroke-width="${HOLLOW_WIDTH}"`
      body += live ? `<circle data-role="dot-ring" ${ring} stroke="${paint(fills, color)}" data-color="${color}"/>` : `<circle data-role="dot-ring" ${ring} stroke="${color}"/>`
      return
    }
    body += live ? `<circle data-role="dot" cx="${cx}" cy="${cy}" r="${DOT_RADIUS}" fill="${paint(fills, color)}" data-color="${color}"/>` : `<circle data-role="dot" cx="${cx}" cy="${cy}" r="${DOT_RADIUS}" fill="${color}"/>`
  })
  let defs = halos.size ? HALO_CLIP : ''
  for (const hg of halos.values()) defs += haloGradient(hg.id, hg.color, hg.live && halosAs === 'pulse' ? beat : null)
  defs += paints(fills, beat)
  if (rb) {
    defs += rainbowPaint(o, beat, { period: RAINBOW_PERIOD }) + (rainbowHalo ? filters(w, h, beat) : '')
    if (rainbowHalo) body = `<g data-role="dot-halo" ${halo(beat !== null, beat)}${rainbowHalo}</g>` + body
  }
  if (tick !== undefined) body += tickRect(PAD + (Math.min(100, Math.max(0, tick)) / 100) * dots.length * DOT_UNIT, o)
  return open(w, h, beat, defs) + body + '</svg>'
}

/**
 * A smooth bar: a pill-shaped track the full width, the filled part clipped
 * to a pill of its own (never shorter than it is thick, so a small percent is
 * a round dot, not a sliver), each slice a rect of its color (`data-grow`
 * holds its hundredths of the bar), and the filled part's halo under it. Live
 * slices pulse; a slice drawn `halo: false` (the context's autocompact
 * buffer) stays out of the halo.
 */
export function smoothBarSvg(slices: readonly FlexSlice[], o: DesktopOptions, pace?: FlexPace): string {
  const rb = rainbowOn(o, slices.some(sl => sl.live))
  const beat = beatFor(o, slices.some(sl => sl.live))
  const bar = Math.max(1, o.dotCount) * DOT_UNIT
  let tipFill = o.palette.track
  const w = bar + 2 * PAD
  const h = ROW_HEIGHT
  const y = MIDLINE - BAR_THICKNESS / 2
  const rx = BAR_THICKNESS / 2
  const track = o.palette.track
  const px = bar / 100
  let at = 0
  let filledTo = 0
  let glowTo = 0
  let glowColor = track
  let rects = ''
  let glowRects = ''
  for (const sl of slices) {
    const color = HEX.test(sl.color) ? sl.color.toUpperCase() : track
    if (color !== track.toUpperCase()) {
      filledTo = at + sl.grow
      // Each slice animates its own fill: a shared gradient paint would draw the bar's edges a shade darker.
      // In the rainbow a live slice takes the one paint, which moves by itself.
      const fill = rb && sl.live ? RB : color
      tipFill = fill
      const rect = `x="${(PAD + at * px).toFixed(2)}" y="${y}" width="${(sl.grow * px).toFixed(2)}" height="${BAR_THICKNESS}" fill="${fill}" data-grow="${sl.grow.toFixed(1)}">${sl.live && beat && fill !== RB ? animate('fill', color, peakOf(color), beat) : ''}</rect>`
      rects += `<rect data-role="slice" ${rect}`
      if (sl.halo !== false) {
        glowRects += `<rect data-role="slice-halo" ${rect}`
        glowTo = filledTo
        glowColor = fill
      }
    }
    at += sl.grow
  }
  const anyLive = slices.some(sl => sl.live) && beat !== null
  const filledPx = Math.min(bar, Math.max(BAR_THICKNESS, filledTo * px))
  const glowPx = Math.min(filledPx, Math.max(BAR_THICKNESS, glowTo * px))
  const clip = `<clipPath id="c"><rect x="${PAD}" y="${y}" width="${filledPx.toFixed(2)}" height="${BAR_THICKNESS}" rx="${rx}"/></clipPath>`
  // The tip reaches the pill's end in the last color, so a small percent fills its round dot.
  const tip = (role: string, to: number, color: string) => `<rect data-role="${role}-tip" x="${PAD}" y="${y}" width="${to.toFixed(2)}" height="${BAR_THICKNESS}" fill="${color}"/>`
  const glow = glowTo > 0 && o.glow ? `<g ${halo(anyLive, beat)}<g clip-path="url(#c)">${tip('slice-halo', glowPx, glowColor)}${glowRects}</g></g>` : ''
  // The pace's stripes: cut out of the fill in the track's color, so the fill under them pulses as ever, or drawn
  // in their own color on the track past the fill, under the fill's round end.
  const st = pace?.stripe
  const stripeColor = st ? (st.cut ? track : HEX.test(st.color) ? st.color.toUpperCase() : track) : ''
  const stripeRect = st ? `<rect data-role="pace-stripe" data-cut="${st.cut}" x="${(PAD + st.from * px).toFixed(2)}" y="${y}" width="${(Math.max(0, st.to - st.from) * px).toFixed(2)}" height="${BAR_THICKNESS}" fill="url(#st)"/>` : ''
  const stripeDefs = st ? `${stripePattern(stripeColor)}<clipPath id="t"><rect x="${PAD}" y="${y}" width="${bar}" height="${BAR_THICKNESS}" rx="${rx}"/></clipPath>` : ''
  return (
    open(w, h, beat, filters(w, h, anyLive ? beat : null) + clip + stripeDefs + (rb ? rainbowPaint(o, beat, { period: RAINBOW_PERIOD }) : '')) +
    `<rect data-role="track" x="${PAD}" y="${y}" width="${bar}" height="${BAR_THICKNESS}" rx="${rx}" fill="${track}"/>` +
    (st && !st.cut ? `<g clip-path="url(#t)">${stripeRect}</g>` : '') +
    glow +
    (filledTo > 0 ? `<g clip-path="url(#c)">${tip('slice', filledPx, rb ? tipFill : lastColor(slices, track))}${rects}${st?.cut ? stripeRect : ''}</g>` : '') +
    (pace?.tick !== undefined ? tickRect(PAD + (Math.min(100, Math.max(0, pace.tick)) / 100) * bar, o) : '') +
    '</svg>'
  )
}

/** The stripes' pattern: bands of `color` half the period wide, leaning as the bar's own stripes in the design do. */
const STRIPE_PERIOD = 7
function stripePattern(color: string): string {
  return `<pattern id="st" width="${STRIPE_PERIOD}" height="${STRIPE_PERIOD}" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="${STRIPE_PERIOD / 2}" height="${STRIPE_PERIOD}" fill="${color}"/></pattern>`
}

/** The pace tick: a still notch in the text color across the bar at `x`, a little taller than the bar. */
export const TICK_HEIGHT = 19.5
function tickRect(x: number, o: DesktopOptions): string {
  return `<rect data-role="pace-tick" x="${(x - RING_WIDTH / 2).toFixed(2)}" y="${(MIDLINE - TICK_HEIGHT / 2).toFixed(2)}" width="${RING_WIDTH}" height="${TICK_HEIGHT}" rx="${RING_WIDTH / 2}" fill="${o.palette.text}"/>`
}

/** The color of the last filled slice, what a bar's tip is painted. */
function lastColor(slices: readonly FlexSlice[], track: string): string {
  let color = track
  for (const sl of slices) if (HEX.test(sl.color) && sl.color.toUpperCase() !== track.toUpperCase()) color = sl.color.toUpperCase()
  return color
}

/**
 * A text drawing's look: the `data-role` of the text (its halo's is `<role>-halo`),
 * its weight, and the width of one of its characters, which sizes the drawing to the text.
 */
type TextLook = { role: string; weight: number; charWidth: number }

/** Text in its color under a halo of the same color; live, it pulses. */
function textSvg(span: Span, look: TextLook, o: DesktopOptions): string {
  const rb = rainbowOn(o, Boolean(span.live))
  const beat = beatFor(o, Boolean(span.live))
  const live = Boolean(span.live) && beat !== null
  const w = Math.ceil(span.text.length * look.charWidth) + 2 * PAD
  const h = ROW_HEIGHT
  const attrs = `x="${PAD}" y="${(MIDLINE + PCT_FONT_SIZE * BASELINE_DROP).toFixed(1)}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="${PCT_FONT_SIZE}" font-weight="${look.weight}" fill="${rb ? RB : span.color}"`
  const text = esc(span.text)
  return (
    open(w, h, beat, (o.glow ? filters(w, h, beat) : '') + (rb ? rainbowPaint(o, beat, { period: RAINBOW_PERIOD }) : '')) +
    (o.glow ? `<text data-role="${look.role}-halo" ${attrs} ${halo(live, beat)}${text}</text>` : '') +
    `<text data-role="${look.role}" ${attrs}>${text}${live && !rb ? animate('fill', span.color, peakOf(span.color), beat!) : ''}</text>` +
    '</svg>'
  )
}

/** A percent: bold text in its color under a halo of the same color; live, it pulses. */
export function pctSvg(pct: Span, o: DesktopOptions): string {
  return textSvg(pct, { role: 'pct', weight: 700, charWidth: PCT_CHAR_WIDTH }, o)
}

/** A reset under `resetColor: time`: regular-weight text in its time color under the halo; live, it pulses with the percents. */
export function resetSvg(reset: Span, o: DesktopOptions): string {
  return textSvg(reset, { role: 'extra', weight: 400, charWidth: RESET_CHAR_WIDTH }, o)
}

/** About what a character of a card row measures across at `PCT_FONT_SIZE`, on average: it places a rainbow over a line's text. */
const ROW_TEXT_WIDTH = 9

/**
 * A card row with its text centered: every row of the card is drawn `chars`
 * characters wide, the widest line's, and its text sits in the middle of
 * that, so the lines are centered on one another whatever the font measures
 * (a drawing's own width is an estimate; text anchored at its middle needs
 * none). An expiry's dot is a character of its text, so it stays beside it.
 * A gap is the same drawing with nothing in it: room between two lines.
 */
function centeredRowSvg(row: ContextRow, chars: number, o: DesktopOptions): string {
  const w = Math.ceil(chars * ROW_CHAR_WIDTH) + 2 * PAD
  const h = ROW_HEIGHT
  // An empty drawing takes no room in the app: a rect of nothing gives it its size.
  if (row.gap) return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect data-role="row-gap" width="${w}" height="${h}" fill="#000000" fill-opacity="0"/></svg>`
  const across = row.rainbow && row.rainbow.length > 1 ? row.rainbow.map(c => (HEX.test(c) ? c.toUpperCase() : o.palette.track)) : null
  const half = (row.text.length * ROW_TEXT_WIDTH) / 2
  const attrs = `x="${w / 2}" y="${(MIDLINE + PCT_FONT_SIZE * BASELINE_DROP).toFixed(1)}" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="${PCT_FONT_SIZE}" font-weight="${row.strong ? 600 : 400}" fill="${across ? 'url(#rw)' : row.color}"`
  const text = esc(row.text)
  const paintDef = across ? `<linearGradient id="rw" gradientUnits="userSpaceOnUse" x1="${(w / 2 - half).toFixed(1)}" y1="0" x2="${(w / 2 + half).toFixed(1)}" y2="0">${across.map((c, i) => `<stop offset="${+(i / (across.length - 1)).toFixed(3)}" stop-color="${c}"/>`).join('')}</linearGradient>` : ''
  const glow = row.halo && o.glow ? `<g data-role="row-halo" ${halo(false, null)}<text ${attrs}>${text}</text></g>` : ''
  return open(w, h, null, (row.halo && o.glow ? filters(w, h, null) : '') + paintDef) + glow + `<text data-role="row" ${attrs}>${text}</text></svg>`
}

/**
 * The button's ring, in the drawing's own pixels: 14 px across on
 * screen, the size of the app's own context ring beside the model picker.
 */
export const RING_RADIUS = 9.3
export const RING_WIDTH = 2.4

/**
 * The button: a ring of the track's color with the context percent
 * drawn over it clockwise from the top, as the bars draw it (the percent's
 * range color, or every range up to it under ramp coloring), under a halo of
 * its own colors; live arcs pulse with the band. Every part carries a
 * `data-role` (`ring-track`, `ring`, `ring-halo`).
 */
export function buttonSvg(ring: readonly FlexSlice[], o: DesktopOptions): string {
  const rb = rainbowOn(o, ring.some(sl => sl.live))
  const beat = beatFor(o, ring.some(sl => sl.live))
  const w = ROW_HEIGHT
  const h = ROW_HEIGHT
  const c = MIDLINE
  const track = o.palette.track
  const len = 2 * Math.PI * RING_RADIUS
  const circle = `cx="${c}" cy="${c}" r="${RING_RADIUS}" fill="none" stroke-width="${RING_WIDTH}" transform="rotate(-90 ${c} ${c})"`
  let at = 0
  let arcs = ''
  let glows = ''
  for (const sl of ring) {
    const color = HEX.test(sl.color) ? sl.color.toUpperCase() : track
    if (color !== track.toUpperCase() && sl.grow > 0) {
      // The arc and its halo copy pulse alike, as a bar's slices and theirs do.
      const stroke = rb && sl.live ? RB : color
      const arc = `${circle} stroke="${stroke}" stroke-dasharray="${((sl.grow / 100) * len).toFixed(2)} ${len.toFixed(2)}" stroke-dashoffset="${(-(at / 100) * len).toFixed(2)}">${sl.live && beat && stroke !== RB ? animate('stroke', color, peakOf(color), beat) : ''}</circle>`
      arcs += `<circle data-role="ring" ${arc}`
      glows += `<circle data-role="ring-halo" ${arc}`
    }
    at += sl.grow
  }
  const glow = arcs && o.glow ? `<g ${halo(beat !== null, beat)}${glows}</g>` : ''
  const defs = (o.glow ? filters(w, h, beat) : '') + (rb ? rainbowPaint(o, beat, { cx: c, cy: c, r: RING_RADIUS + RING_WIDTH }) : '')
  return open(w, h, beat, defs) + `<circle data-role="ring-track" ${circle} stroke="${track}"/>` + glow + arcs + '</svg>'
}

/**
 * A reset chip's geometry, in the drawing's own pixels: a pill around its text,
 * as tall as the button's ring is wide, with room around it for the halo.
 */
export const CHIP_HEIGHT = 2 * RING_RADIUS + RING_WIDTH
export const CHIP_FONT_SIZE = 16.5
export const CHIP_CHAR_WIDTH = 10.4
export const CHIP_INSET = 8
export const CHIP_PAD = 9

/**
 * A reset chip: its text in a pill, both in one paint under a halo of the
 * pill. With six colors the paint is the rainbow, a gradient across the pill
 * that turns once per pulse cycle while the band pulses and lies still
 * otherwise; with one, that color, brightening as a frame does. Every part
 * carries a `data-role` (`chip`, `chip-text`, `chip-halo`).
 */
export function resetChipSvg(chip: FlexChip, o: DesktopOptions): string {
  const beat = beatOf(o, true)
  const inner = Math.ceil(chip.text.length * CHIP_CHAR_WIDTH) + 2 * CHIP_PAD
  const w = inner + 2 * CHIP_INSET
  const h = ROW_HEIGHT
  const y = MIDLINE - CHIP_HEIGHT / 2
  const colors = chip.colors.map(c => (HEX.test(c) ? c.toUpperCase() : o.palette.track))
  const rainbow = colors.length > 1
  let defs = o.glow ? filters(w, h, beat) : ''
  let pulse: ((attr: string) => string) | null = null
  if (rainbow) {
    const turn = beat ? `<animateTransform attributeName="gradientTransform" type="rotate" from="0 ${w / 2} ${MIDLINE}" to="360 ${w / 2} ${MIDLINE}" dur="${beat.ms}ms" ${beat.timing}/>` : ''
    const stops = colors.map((c, i) => `<stop offset="${+(i / (colors.length - 1)).toFixed(3)}" stop-color="${c}"/>`).join('')
    defs += `<linearGradient id="rb" gradientUnits="userSpaceOnUse" x1="${CHIP_INSET}" y1="0" x2="${w - CHIP_INSET}" y2="0">${stops}${turn}</linearGradient>`
  } else if (beat) {
    pulse = (attr: string) => animate(attr, colors[0]!, peakOf(colors[0]!), beat)
  }
  const paintOf = rainbow ? 'url(#rb)' : colors[0]!
  const pill = `x="${CHIP_INSET}" y="${y.toFixed(2)}" width="${inner}" height="${CHIP_HEIGHT.toFixed(2)}" rx="${(CHIP_HEIGHT / 2).toFixed(2)}" fill="none" stroke="${paintOf}" stroke-width="${RING_WIDTH}"`
  const strokePulse = pulse ? pulse('stroke') : ''
  const fillPulse = pulse ? pulse('fill') : ''
  const glow = o.glow ? `<g data-role="chip-halo" ${halo(beat !== null, beat)}<rect ${pill}>${strokePulse}</rect></g>` : ''
  const text = `<text data-role="chip-text" x="${w / 2}" y="${(MIDLINE + CHIP_FONT_SIZE * BASELINE_DROP).toFixed(1)}" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="${CHIP_FONT_SIZE}" font-weight="700" fill="${paintOf}">${esc(chip.text)}${fillPulse}</text>`
  return open(w, h, beat, defs) + glow + `<rect data-role="chip" ${pill}>${strokePulse}</rect>` + text + '</svg>'
}

/** A breakdown row's character width at `PCT_FONT_SIZE`, generous so the drawing ends past its text. */
const ROW_CHAR_WIDTH = 10.6

/**
 * One row of the context breakdown card: a dot and `Messages: 25.5k, 2.6%`
 * in the category's color under one halo; a used category pulses with the
 * band, the autocompact buffer holds still without a halo.
 */
export function contextRowSvg(row: ContextRow, o: DesktopOptions): string {
  if (row.center !== undefined) return centeredRowSvg(row, row.center, o)
  const beat = beatOf(o, row.live)
  const live = row.live && beat !== null
  const textX = row.dot === false ? PAD : PAD + DOT_UNIT
  // A line in the rainbow: the colors once across its text, still.
  const across = row.rainbow && row.rainbow.length > 1 ? row.rainbow.map(c => (HEX.test(c) ? c.toUpperCase() : o.palette.track)) : null
  const paintOf = across ? 'url(#rw)' : row.color
  const w = Math.ceil(textX + row.text.length * ROW_CHAR_WIDTH) + PAD
  const h = ROW_HEIGHT
  const dot = `cx="${PAD + DOT_UNIT / 2 - 3}" cy="${MIDLINE}" r="${DOT_RADIUS}"`
  const attrs = `x="${textX}" y="${(MIDLINE + PCT_FONT_SIZE * BASELINE_DROP).toFixed(1)}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="${PCT_FONT_SIZE}" font-weight="${row.dot === false ? 600 : 400}" fill="${paintOf}"`
  const pulse = live ? animate('fill', row.color, peakOf(row.color), beat!) : ''
  const text = esc(row.text)
  const glow = row.halo && o.glow ? `<g data-role="row-halo" ${halo(live, beat)}<circle ${dot} fill="${row.color}"/><text ${attrs}>${text}</text></g>` : ''
  return (
    open(w, h, beat, (row.halo && o.glow ? filters(w, h, beat) : '') + (across ? `<linearGradient id="rw" gradientUnits="userSpaceOnUse" x1="${textX}" y1="0" x2="${w - PAD}" y2="0">${across.map((c, i) => `<stop offset="${+(i / (across.length - 1)).toFixed(3)}" stop-color="${c}"/>`).join('')}</linearGradient>` : '')) +
    glow +
    (row.dot === false ? '' : `<circle data-role="row-dot" ${dot} fill="${row.color}">${pulse}</circle>`) +
    `<text data-role="row" ${attrs}>${text}${pulse}</text>` +
    '</svg>'
  )
}

// ---------------------------------------------------------------------------
// The frame: a rounded neon border around a segment, or the whole band, once
// its percent reaches `borderAt` (or always, under `border: always`). The app
// gives a drawing no width but its own, so a frame is three drawings: two caps
// of a fixed width with the rounded corners, and between them the top and
// bottom edges, drawn 100 wide and stretched by the app to whatever the
// segment takes (`preserveAspectRatio="none"`). The edges blur only up and
// down, so stretching them changes nothing, and each cap draws its edges on
// past its canvas into the filter's region, so its halo meets theirs without
// a seam.
// ---------------------------------------------------------------------------

/** The frame's drawings' height, in their own pixels: taller than a row, so the halo has room outside the line. */
export const FRAME_HEIGHT = 50
/** What the app shows a frame drawing at, CSS pixels: `FRAME_HEIGHT` at the band's scale. */
export const FRAME_DISPLAY_HEIGHT = (FRAME_HEIGHT * DISPLAY_HEIGHT) / ROW_HEIGHT
/** The line's width, the ring's. */
export const FRAME_WIDTH = RING_WIDTH
/** Where the line runs, inset from the drawing's edges by room for the halo. */
export const FRAME_INSET = 7
export const FRAME_RADIUS = 12
/** A cap's width: its inset, the corner, and a straight stretch of edge, room between the line and the text. */
export const FRAME_CAP = FRAME_INSET + FRAME_RADIUS + 9

/** A frame part's look: its color, whether it pulses, and whether the band glows. */
export type FrameLook = { color: string; live: boolean }

function frameFilter(id: string, x: number, w: number, sdX: number, beat: Beat): string {
  const region = `filterUnits="userSpaceOnUse" x="${x}" y="0" width="${w}" height="${FRAME_HEIGHT}"`
  const sd = (b: number) => `${sdX ? b : 0} ${b}`
  const anim = beat ? `<animate attributeName="stdDeviation" values="${sd(GLOW.restBlur)};${sd(GLOW.peakBlur)};${sd(GLOW.restBlur)}" dur="${beat.ms}ms" ${beat.timing} calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>` : ''
  return `<filter id="${id}" ${region}><feGaussianBlur stdDeviation="${sd(GLOW.restBlur)}">${anim}</feGaussianBlur></filter>`
}

/** A frame part's line and its halo copy, the halo blurred by filter `f`; live, the color and the halo pulse. */
function frameStroke(d: string, f: FrameLook, o: DesktopOptions, beat: Beat, paintWith?: string): string {
  const color = paintWith ?? (HEX.test(f.color) ? f.color.toUpperCase() : o.palette.track)
  const live = f.live && beat !== null
  const line = `d="${d}" fill="none" stroke="${color}" stroke-width="${FRAME_WIDTH}" stroke-linecap="butt"`
  // A paint moves or brightens by itself; the halo breathes either way.
  const pulse = live && !paintWith ? animate('stroke', color, peakOf(color), beat!) : ''
  const glow = o.glow ? `<path data-role="frame-halo" ${line} filter="url(#fg)" opacity="${GLOW.restHalo}">${live ? animate('opacity', GLOW.restHalo, GLOW.peakHalo, beat!) : ''}${pulse}</path>` : ''
  return glow + `<path data-role="frame" ${line}>${pulse}</path>`
}

/** One end of a frame: the rounded corners and a stretch of the edges, which run on past the drawing to meet the edges' drawing. */
export function frameCapSvg(side: 'left' | 'right', f: FrameLook, o: DesktopOptions): string {
  f = capLook(f, o)
  const beat = beatFor(o, f.live)
  const w = FRAME_CAP
  const h = FRAME_HEIGHT
  const t = FRAME_INSET
  const b = h - FRAME_INSET
  const x = FRAME_INSET
  const r = FRAME_RADIUS
  const run = w + 3 * GLOW.peakBlur
  // Drawn as the left cap; the right cap is the same, mirrored.
  const d = `M${run} ${t}H${x + r}A${r} ${r} 0 0 0 ${x} ${t + r}V${b - r}A${r} ${r} 0 0 0 ${x + r} ${b}H${run}`
  const turning = rainbowOn(o, f.live) ? capPaint(o, beat, t, b) : null
  const filter = (o.glow ? frameFilter('fg', -run, 3 * run, 1, beat) : '') + (turning ?? '')
  const line = frameStroke(d, f, o, beat, turning ? 'url(#rbc)' : undefined)
  const body = side === 'left' ? line : `<g transform="translate(${w} 0) scale(-1 1)">${line}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${beat?.mark ?? ''}><defs>${filter}</defs>${body}</svg>`
}

/** The edges' drawing: the top and bottom lines, 100 wide, which the app stretches across the frame. */
export function frameEdgesSvg(f: FrameLook, o: DesktopOptions): string {
  const rb = rainbowOn(o, f.live)
  const beat = beatFor(o, f.live)
  const w = 100
  const h = FRAME_HEIGHT
  const d = `M0 ${FRAME_INSET}H${w}M0 ${h - FRAME_INSET}H${w}`
  const filter = (o.glow ? frameFilter('fg', 0, w, 0, beat) : '') + (rb ? edgePaints(o, beat, w) : '')
  const lines = rb ? frameStroke(`M0 ${FRAME_INSET}H${w}`, f, o, beat, 'url(#rbt)') + frameStroke(`M0 ${h - FRAME_INSET}H${w}`, f, o, beat, 'url(#rbb)') : frameStroke(d, f, o, beat)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"${beat?.mark ?? ''}><defs>${filter}</defs>${lines}</svg>`
}

/**
 * A cap's look in the rainbow while it holds still or breathes: the rainbow's
 * first color, the one a frame's edges start and end in, so the line runs on
 * without a seam; it brightens with the pulse as any frame does.
 */
function capLook(f: FrameLook, o: DesktopOptions): FrameLook {
  return rainbowOn(o, f.live) ? { ...f, color: o.rainbow!.colors[0]! } : f
}

/** A drawing of nothing, `w` of the frame's pixels wide: room a frame keeps clear of the segment's text. */
export function frameSpacerSvg(w: number): string {
  // An empty drawing takes no room in the app: a rect of nothing gives it its size.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${FRAME_HEIGHT}" viewBox="0 0 ${w} ${FRAME_HEIGHT}"><rect data-role="frame-room" width="${w}" height="${FRAME_HEIGHT}" fill="none"/></svg>`
}

// ---------------------------------------------------------------------------
// The outline: a border around the band's whole card, as close to the card's
// edge as the app lets a plugin draw. The app pads its card around the band
// by about one cell on either side and `OUTLINE_PAD` above and below, and
// clips what a plugin draws to the card: so the band's first and last pieces
// reach one cell out, to the card's edges, and hold the caps, and every
// drawing is the row's height and the padding above and below it, overflowing
// the row equally both ways, so its lines land along the card's edge.
// Each piece of the band draws its own stretch of the top and bottom edges,
// beside the caps and never under them (two drawings of one line never meet
// pixel for pixel), so under `outline: sections` each takes its own color;
// the caps take the first and the last section's.
// ---------------------------------------------------------------------------

/**
 * The app's padding above and below the band inside its card, in CSS pixels,
 * measured on the desktop app: 10 on Windows and on macOS. Windows was first
 * taken for 13: the drawings then stood 3 pixels past the card above and
 * below, their lines on its clipped edge, and the card had those pixels to
 * scroll, so the wheel over the band moved the row.
 */
export const OUTLINE_PAD = { windows: 10, mac: 10 } as const
export type OutlinePad = (typeof OUTLINE_PAD)[keyof typeof OUTLINE_PAD]
/** The card's corner radius, in the drawings' own pixels (about 10 CSS pixels, as the app rounds its card). */
export const OUTLINE_RADIUS = 15
/**
 * Where the line runs: half its width in from the drawing's edge, so it lies along the card's own edge, all of it
 * inside the clip. Its halo shows inward alone; the card cuts the rest.
 */
export const OUTLINE_INSET = FRAME_WIDTH / 2
/** A cap's width: the corner and a little edge, narrow enough to fit the narrowest piece that can end the band (the button, with its cell of padding). */
export const OUTLINE_CAP = 36

/** The outline drawings' height in their own pixels, for a row `rowHeight` CSS pixels tall in a card padded `pad` above and below. */
export function outlineHeight(rowHeight: number, pad: number): number {
  return ((rowHeight + 2 * pad) * ROW_HEIGHT) / DISPLAY_HEIGHT
}

function outlineFilter(id: string, x: number, w: number, h: number, sdX: number, beat: Beat): string {
  const region = `filterUnits="userSpaceOnUse" x="${x}" y="0" width="${w}" height="${h}"`
  const sd = (b: number) => `${sdX ? b : 0} ${b}`
  const anim = beat ? `<animate attributeName="stdDeviation" values="${sd(GLOW.restBlur)};${sd(GLOW.peakBlur)};${sd(GLOW.restBlur)}" dur="${beat.ms}ms" ${beat.timing} calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>` : ''
  return `<filter id="${id}" ${region}><feGaussianBlur stdDeviation="${sd(GLOW.restBlur)}">${anim}</feGaussianBlur></filter>`
}

/** One end of the outline, `h` of its own pixels tall: the two rounded corners and the side between them, the edges running on past the drawing to meet the edges' drawing beside it. */
export function outlineCapSvg(side: 'left' | 'right', f: FrameLook, h: number, o: DesktopOptions): string {
  f = capLook(f, o)
  const beat = beatFor(o, f.live)
  const w = OUTLINE_CAP
  const t = OUTLINE_INSET
  const b = h - OUTLINE_INSET
  const x = OUTLINE_INSET
  // The line's corner, inside the card's by the inset, so it follows the card's corner around.
  const r = Math.min(OUTLINE_RADIUS - OUTLINE_INSET, (b - t) / 2)
  const run = w + 3 * GLOW.peakBlur
  const d = `M${run} ${t}H${x + r}A${r} ${r} 0 0 0 ${x} ${t + r}V${b - r}A${r} ${r} 0 0 0 ${x + r} ${b}H${run}`
  const turning = rainbowOn(o, f.live) ? capPaint(o, beat, t, b) : null
  const filter = (o.glow ? outlineFilter('fg', -run, 3 * run, h, 1, beat) : '') + (turning ?? '')
  const line = frameStroke(d, f, o, beat, turning ? 'url(#rbc)' : undefined)
  const body = side === 'left' ? line : `<g transform="translate(${w} 0) scale(-1 1)">${line}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h.toFixed(2)}" viewBox="0 0 ${w} ${h.toFixed(2)}"${beat?.mark ?? ''}><defs>${filter}</defs>${body}</svg>`
}

/**
 * A section's stretch of the outline's top and bottom edges, `h` of its own
 * pixels tall, 100 wide, which the app stretches across the section. With
 * `right`, the right half takes that color: a separator's stretch, split
 * between the sections either side of it.
 */
export function outlineEdgesSvg(f: FrameLook, h: number, o: DesktopOptions, right?: FrameLook): string {
  const live = f.live || Boolean(right?.live)
  const rb = rainbowOn(o, live)
  const beat = beatFor(o, live)
  const w = 100
  const t = OUTLINE_INSET
  const b = h - OUTLINE_INSET
  const filter = (o.glow ? outlineFilter('fg', 0, w, h, 0, beat) : '') + (rb ? edgePaints(o, beat, w) : '')
  const half = (from: number, to: number, look: FrameLook) => frameStroke(`M${from} ${t}H${to}M${from} ${b.toFixed(2)}H${to}`, look, o, beat)
  // In the rainbow every stretch runs the whole of it and ends where it began, so sections meet without a seam (`edgePaints`).
  const body = rb ? frameStroke(`M0 ${t}H${w}`, f, o, beat, 'url(#rbt)') + frameStroke(`M0 ${b.toFixed(2)}H${w}`, f, o, beat, 'url(#rbb)') : right ? half(0, 50, f) + half(50, w, right) : half(0, w, f)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="${h.toFixed(2)}" viewBox="0 0 ${w} ${h.toFixed(2)}" preserveAspectRatio="none"${beat?.mark ?? ''}><defs>${filter}</defs>${body}</svg>`
}

// ---------------------------------------------------------------------------
// The outline in the rainbow: one drawing. In pieces, each piece could only
// run the whole rainbow over its own width, so a separator or a gap, a few
// pixels wide, showed all six colors squeezed into a speck. The band's width
// is known to within a few percent (its columns), so here the whole outline
// is drawn at that size, corners and all, and the app stretches it the little
// that is left. The rainbow follows the line round: along the top to the
// right, down the right side, back along the bottom, up the left side, a
// whole number of rainbows to the lap so it closes on itself, and under
// `circle` it travels one rainbow per pulse cycle.
// ---------------------------------------------------------------------------

/** About how long one rainbow is along the outline, in the drawing's own pixels; the lap is divided into a whole number of them. */
export const RING_RAINBOW = 300

/**
 * The outline around the band's card, `w` by `h` of its own pixels, in the
 * rainbow. The line is drawn four times, each clipped to its part of the lap
 * (top, right end, bottom, left end) and painted with a gradient along that
 * part, placed so each begins in the color the one before it ends in.
 */
export function outlineRingSvg(w: number, h: number, o: DesktopOptions): string {
  const beat = beatFor(o, true)
  const rb = o.rainbow!
  const colors = rb.colors.map(c => (HEX.test(c) ? c.toUpperCase() : o.palette.track))
  const loop = [...colors, colors[0]!]
  const x0 = OUTLINE_INSET
  const x1 = w - OUTLINE_INSET
  const t = OUTLINE_INSET
  const b = h - OUTLINE_INSET
  const r = Math.min(OUTLINE_RADIUS, (b - t) / 2)
  // The lap, measured along straight runs: the top and the bottom between the corners, and the two ends top to bottom.
  const along = Math.max(1, x1 - x0 - 2 * r)
  const down = b - t
  const lap = 2 * along + 2 * down
  const period = lap / Math.max(1, Math.round(lap / RING_RAINBOW))
  const stops = loop.map((c, i) => `<stop offset="${+(i / (loop.length - 1)).toFixed(4)}" stop-color="${c}">${beat && rb.motion === 'breathe' ? animate('stop-color', c, peakOf(c), beat) : ''}</stop>`).join('')
  const moving = beat && rb.motion === 'circle' ? beat : null
  // A part's gradient: from where its rainbow starts, `period` along its direction of travel, moving that way.
  const part = (id: string, fromX: number, fromY: number, dx: number, dy: number) => {
    const move = moving ? `<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="${(dx * period).toFixed(2)} ${(dy * period).toFixed(2)}" dur="${moving.ms}ms" ${moving.timing}/>` : ''
    return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${fromX.toFixed(2)}" y1="${fromY.toFixed(2)}" x2="${(fromX + dx * period).toFixed(2)}" y2="${(fromY + dy * period).toFixed(2)}" spreadMethod="repeat">${stops}${move}</linearGradient>`
  }
  const left = x0 + r
  const right = x1 - r
  const defs =
    part('rt', left, 0, 1, 0) +
    part('rr', 0, t - along, 0, 1) +
    part('rbm', right + along + down, 0, -1, 0) +
    part('rl', 0, b + 2 * along + down, 0, -1) +
    `<clipPath id="ct"><rect x="${left}" y="0" width="${along.toFixed(2)}" height="${(h / 2).toFixed(2)}"/></clipPath>` +
    `<clipPath id="cr"><rect x="${right.toFixed(2)}" y="0" width="${(w - right).toFixed(2)}" height="${h.toFixed(2)}"/></clipPath>` +
    `<clipPath id="cb"><rect x="${left}" y="${(h / 2).toFixed(2)}" width="${along.toFixed(2)}" height="${(h / 2).toFixed(2)}"/></clipPath>` +
    `<clipPath id="cl"><rect x="0" y="0" width="${left}" height="${h.toFixed(2)}"/></clipPath>` +
    (o.glow ? filters(w, h, beat) : '')
  const d = `M${x0 + r} ${t}H${(x1 - r).toFixed(2)}A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${t + r}V${(b - r).toFixed(2)}A${r} ${r} 0 0 1 ${(x1 - r).toFixed(2)} ${b.toFixed(2)}H${x0 + r}A${r} ${r} 0 0 1 ${x0} ${(b - r).toFixed(2)}V${t + r}A${r} ${r} 0 0 1 ${x0 + r} ${t}Z`
  const line = (role: string) =>
    [['ct', 'rt'], ['cr', 'rr'], ['cb', 'rbm'], ['cl', 'rl']].map(([clip, paintId]) => `<g clip-path="url(#${clip})"><path data-role="${role}" d="${d}" fill="none" stroke="url(#${paintId})" stroke-width="${FRAME_WIDTH}"/></g>`).join('')
  const glow = o.glow ? `<g ${halo(beat !== null, beat)}${line('ring-outline-halo')}</g>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="${h.toFixed(2)}" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" preserveAspectRatio="none"${beat?.mark ?? ''}><defs>${defs}</defs>${glow}${line('ring-outline')}</svg>`
}
