// The desktop band's drawings. The desktop draws the band in a proportional font, so
// cells are nominal there, and its Client module is handed no vector element,
// so the band is drawn by the hooks module itself: text pieces as `Text` in
// Claude Code's theme keys, and every bar and percent as an `Svg`, where each
// filled dot, bar and percent sits under a blurred halo of its own color (the
// design's `text-shadow` glow). The pulse is a SMIL animation inside each
// drawing: the color toward white and the halo wider, on one cycle, with no
// redraw. The app draws each drawing as an image, and an animated image is
// drawn again on every display frame, so a breath that never stops costs
// about a fifth of a CPU core (README, Resource use). Under
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

import type { ContextRow, FlexDot, FlexSlice, Palette, Span } from './builder'
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
}

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
  if (o.pulseMode === 'always') return { ms: o.pulseMs, timing: 'repeatCount="indefinite"', mark: '' }
  const { gen, elapsedMs, totalMs } = o.burst
  if (gen === 0 || elapsedMs >= totalMs) return null
  return { ms: o.pulseMs, timing: `begin="-${Math.round(elapsedMs)}ms" repeatDur="${Math.round(totalMs)}ms"`, mark: ` data-burst="${gen}"` }
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
export function dotBarSvg(dots: readonly FlexDot[], o: DesktopOptions): string {
  for (const halos of ['pulse', 'still', 'none'] as const) {
    const svg = dotBar(dots, o, halos)
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
function dotBar(dots: readonly FlexDot[], o: DesktopOptions, halosAs: 'pulse' | 'still' | 'none'): string {
  const beat = beatOf(o, dots.some(d => d.live))
  if (halosAs === 'none') o = { ...o, glow: false }
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
    if (filled && o.glow && d.halo !== false) {
      const key = color + (live ? '+' : '')
      let hg = halos.get(key)
      if (!hg) {
        hg = { id: `h${halos.size}`, color, live }
        halos.set(key, hg)
      }
      body += `<circle data-role="dot-halo" cx="${cx}" cy="${cy}" r="${HALO_REACH}" fill="url(#${hg.id})" clip-path="url(#hc)"/>`
    }
    body += live ? `<circle data-role="dot" cx="${cx}" cy="${cy}" r="${DOT_RADIUS}" fill="${paint(fills, color)}" data-color="${color}"/>` : `<circle data-role="dot" cx="${cx}" cy="${cy}" r="${DOT_RADIUS}" fill="${color}"/>`
  })
  let defs = halos.size ? HALO_CLIP : ''
  for (const hg of halos.values()) defs += haloGradient(hg.id, hg.color, hg.live && halosAs === 'pulse' ? beat : null)
  defs += paints(fills, beat)
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
export function smoothBarSvg(slices: readonly FlexSlice[], o: DesktopOptions): string {
  const beat = beatOf(o, slices.some(sl => sl.live))
  const bar = Math.max(1, o.dotCount) * DOT_UNIT
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
      const rect = `x="${(PAD + at * px).toFixed(2)}" y="${y}" width="${(sl.grow * px).toFixed(2)}" height="${BAR_THICKNESS}" fill="${color}" data-grow="${sl.grow.toFixed(1)}">${sl.live && beat ? animate('fill', color, peakOf(color), beat) : ''}</rect>`
      rects += `<rect data-role="slice" ${rect}`
      if (sl.halo !== false) {
        glowRects += `<rect data-role="slice-halo" ${rect}`
        glowTo = filledTo
        glowColor = color
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
  return (
    open(w, h, beat, filters(w, h, anyLive ? beat : null) + clip) +
    `<rect data-role="track" x="${PAD}" y="${y}" width="${bar}" height="${BAR_THICKNESS}" rx="${rx}" fill="${track}"/>` +
    glow +
    (filledTo > 0 ? `<g clip-path="url(#c)">${tip('slice', filledPx, lastColor(slices, track))}${rects}</g>` : '') +
    '</svg>'
  )
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
  const beat = beatOf(o, Boolean(span.live))
  const live = Boolean(span.live) && beat !== null
  const w = Math.ceil(span.text.length * look.charWidth) + 2 * PAD
  const h = ROW_HEIGHT
  const attrs = `x="${PAD}" y="${(MIDLINE + PCT_FONT_SIZE * BASELINE_DROP).toFixed(1)}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="${PCT_FONT_SIZE}" font-weight="${look.weight}" fill="${span.color}"`
  const text = esc(span.text)
  return (
    open(w, h, beat, o.glow ? filters(w, h, beat) : '') +
    (o.glow ? `<text data-role="${look.role}-halo" ${attrs} ${halo(live, beat)}${text}</text>` : '') +
    `<text data-role="${look.role}" ${attrs}>${text}${live ? animate('fill', span.color, peakOf(span.color), beat!) : ''}</text>` +
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

/**
 * The compact button's ring, in the drawing's own pixels: 14 px across on
 * screen, the size of the app's own context ring beside the model picker.
 */
export const RING_RADIUS = 9.3
export const RING_WIDTH = 2.4

/**
 * The compact button: a ring of the track's color with the context percent
 * drawn over it clockwise from the top, as the bars draw it (the percent's
 * range color, or every range up to it under ramp coloring), under a halo of
 * its own colors; live arcs pulse with the band. Every part carries a
 * `data-role` (`ring-track`, `ring`, `ring-halo`).
 */
export function compactSvg(ring: readonly FlexSlice[], o: DesktopOptions): string {
  const beat = beatOf(o, ring.some(sl => sl.live))
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
      const arc = `${circle} stroke="${color}" stroke-dasharray="${((sl.grow / 100) * len).toFixed(2)} ${len.toFixed(2)}" stroke-dashoffset="${(-(at / 100) * len).toFixed(2)}">${sl.live && beat ? animate('stroke', color, peakOf(color), beat) : ''}</circle>`
      arcs += `<circle data-role="ring" ${arc}`
      glows += `<circle data-role="ring-halo" ${arc}`
    }
    at += sl.grow
  }
  const glow = arcs && o.glow ? `<g ${halo(beat !== null, beat)}${glows}</g>` : ''
  return open(w, h, beat, o.glow ? filters(w, h, beat) : '') + `<circle data-role="ring-track" ${circle} stroke="${track}"/>` + glow + arcs + '</svg>'
}

/** A breakdown row's character width at `PCT_FONT_SIZE`, generous so the drawing ends past its text. */
const ROW_CHAR_WIDTH = 10.6

/**
 * One row of the context breakdown card: a dot and `Messages: 25.5k, 2.6%`
 * in the category's color under one halo; a used category pulses with the
 * band, the autocompact buffer holds still without a halo.
 */
export function contextRowSvg(row: ContextRow, o: DesktopOptions): string {
  const beat = beatOf(o, row.live)
  const live = row.live && beat !== null
  const textX = PAD + DOT_UNIT
  const w = Math.ceil(textX + row.text.length * ROW_CHAR_WIDTH) + PAD
  const h = ROW_HEIGHT
  const dot = `cx="${PAD + DOT_UNIT / 2 - 3}" cy="${MIDLINE}" r="${DOT_RADIUS}"`
  const attrs = `x="${textX}" y="${(MIDLINE + PCT_FONT_SIZE * BASELINE_DROP).toFixed(1)}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="${PCT_FONT_SIZE}" font-weight="400" fill="${row.color}"`
  const pulse = live ? animate('fill', row.color, peakOf(row.color), beat!) : ''
  const text = esc(row.text)
  const glow = row.halo && o.glow ? `<g data-role="row-halo" ${halo(live, beat)}<circle ${dot} fill="${row.color}"/><text ${attrs}>${text}</text></g>` : ''
  return (
    open(w, h, beat, row.halo && o.glow ? filters(w, h, beat) : '') +
    glow +
    `<circle data-role="row-dot" ${dot} fill="${row.color}">${pulse}</circle><text data-role="row" ${attrs}>${text}${pulse}</text>` +
    '</svg>'
  )
}
