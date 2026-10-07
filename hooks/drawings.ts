// The desktop band's drawings. The desktop draws the band in a proportional font, so
// cells are nominal there, and its Client module is handed no vector element,
// so the band is drawn by the hooks module itself: text pieces as `Text` in
// Claude Code's theme keys, and every bar and percent as an `Svg`, where each
// filled dot, bar and percent sits under a blurred halo of its own color (the
// design's `text-shadow` glow). The pulse is a SMIL animation inside each
// drawing: the color toward white and the halo wider, on one cycle, with no
// redraw. The app draws each drawing as an image, and an animated image is
// drawn again whenever it changes, so a breath that never stops costs about a
// third of a CPU core (README, Resource use). Three things keep that down: the
// pulse moves in steps at `PULSE_FPS` instead of on every display frame, every
// halo of a dot bar is one blurred group instead of one blur per dot, and every
// glow filter covers only the drawing's own canvas. Under
// `pulseMode: responsive` the drawings breathe only for the `burst` the hooks
// module hands them after a value changed: each carries the change's number,
// so every drawing is a new image and they all start together, and the
// animation's negative `begin` keeps a drawing made later in the burst in
// phase and ends it with the rest. The Weekly rotation is the hooks module's
// timer. Under `resetColor: time` a window's reset is a drawing too, in its
// time color under the same halo, breathing with the percents.

// The drawings are plain markup strings with no engine element in sight, so
// the README's generator runs this very file; desktop.tsx
// lays them out in the band.

import type { FlexDot, FlexRow, FlexSegment, FlexSlice, Palette, Span } from './builder'
import type { Burst } from './color'
import { mix, pulseForeground } from './color'

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
 * A drawing's pulse: its cycle, the SMIL timing of its animations, the
 * attribute that marks the change it belongs to and the steps of one cycle
 * (0 for a smooth animation, see `stepsFor`); null when it does not pulse
 * (the pulse off, or responsive with no change running).
 */
type Beat = { ms: number; timing: string; mark: string; steps: number } | null

/** The pulse of a drawing with `animations` animated attributes. */
function beatOf(o: DesktopOptions, animations: number): Beat {
  if (!o.pulse) return null
  const steps = stepsFor(o.pulseMs, animations)
  if (o.pulseMode === 'always') return { ms: o.pulseMs, timing: 'repeatCount="indefinite"', mark: '', steps }
  const { gen, elapsedMs, totalMs } = o.burst
  if (gen === 0 || elapsedMs >= totalMs) return null
  return { ms: o.pulseMs, timing: `begin="-${Math.round(elapsedMs)}ms" repeatDur="${Math.round(totalMs)}ms"`, mark: ` data-burst="${gen}"`, steps }
}

/**
 * Frames a second the pulse is drawn at. Each animation holds its value from
 * one step to the next (`calcMode="discrete"`), so the app draws a pulsing
 * drawing again this often instead of on every display frame.
 */
export const PULSE_FPS = 30

/**
 * The characters a drawing's animations may take: every step is a value and a
 * time in each animated attribute, and the engine takes a drawing of at most
 * 131072 characters.
 */
const STEP_BUDGET = 100_000

/**
 * The steps of one cycle at `PULSE_FPS`, an even number so one lands on the
 * peak; fewer when `animations` attributes would not fit `STEP_BUDGET` (a
 * long cycle on a wide dot bar), and 0, a smooth animation as before steps,
 * when fewer than 12 would.
 */
function stepsFor(ms: number, animations: number): number {
  const wanted = Math.max(2, 2 * Math.round((ms * PULSE_FPS) / 2000))
  const fit = 2 * Math.floor((STEP_BUDGET / Math.max(1, animations) - 200) / 32)
  if (wanted <= fit) return wanted
  return fit >= 12 ? fit : 0
}

/** The pulse's ease, `cubic-bezier(0.42, 0, 0.58, 1)`, at `x` of half a cycle. */
function ease(x: number): number {
  let lo = 0
  let hi = 1
  for (let n = 0; n < 20; n++) {
    const u = (lo + hi) / 2
    if (3 * (1 - u) ** 2 * u * 0.42 + 3 * (1 - u) * u * u * 0.58 + u ** 3 < x) lo = u
    else hi = u
  }
  const u = (lo + hi) / 2
  return 3 * (1 - u) * u * u + u ** 3
}

/** The pulse's intensity at `t` of a cycle: 0 at rest, 1 at the peak halfway, eased both ways. */
function intensity(t: number): number {
  return t < 0.5 ? ease(2 * t) : 1 - ease(2 * t - 1)
}

/**
 * An attribute from `rest` to `peak` and back over one cycle, eased both ways:
 * in the beat's steps, each value as SMIL would blend it (numbers, and
 * `#RRGGBB` colors channel by channel), or smooth when the beat has none.
 */
function animate(attr: string, rest: number | string, peak: number | string, beat: NonNullable<Beat>): string {
  const steps = beat.steps
  if (steps === 0) {
    return `<animate attributeName="${attr}" values="${rest};${peak};${rest}" dur="${beat.ms}ms" ${beat.timing} calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>`
  }
  const values: string[] = []
  const times: string[] = []
  for (let i = 0; i < steps; i++) {
    const k = intensity(i / steps)
    values.push(typeof rest === 'number' ? String(+(rest + ((peak as number) - rest) * k).toFixed(3)) : mix(peak as string, rest, k))
    times.push(String(+(i / steps).toFixed(4)))
  }
  return `<animate attributeName="${attr}" values="${values.join(';')}" keyTimes="${times.join(';')}" dur="${beat.ms}ms" ${beat.timing} calcMode="discrete"/>`
}

/**
 * The glow filters: `g` pulses between the rest and the peak blur when the
 * drawing pulses, `r` is the rest blur alone (stale drawings, or the pulse
 * off). Their region is the drawing's canvas, `w` by `h`: a halo past it is
 * cut by the canvas anyway, and the default region, three times the element's
 * width and more than its height, blurred pixels nobody sees.
 */
function defs(w: number, h: number, beat: Beat): string {
  const region = `filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"`
  const g = beat ? `<filter id="g" ${region}><feGaussianBlur stdDeviation="${GLOW.restBlur}">${animate('stdDeviation', GLOW.restBlur, GLOW.peakBlur, beat)}</feGaussianBlur></filter>` : ''
  const r = `<filter id="r" ${region}><feGaussianBlur stdDeviation="${GLOW.restBlur}"/></filter>`
  return `<defs>${g}${r}</defs>`
}

/** The halo's filter and opacity, closing the opening tag: pulsing when live, at rest otherwise. */
function halo(live: boolean, beat: Beat): string {
  if (live && beat) return `filter="url(#g)" opacity="${GLOW.restHalo}">${animate('opacity', GLOW.restHalo, GLOW.peakHalo, beat)}`
  return `filter="url(#r)" opacity="${GLOW.restHalo}">`
}

function open(w: number, h: number, beat: Beat): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMid meet"${beat?.mark ?? ''}>${defs(w, h, beat)}`
}

/**
 * A dot bar: one circle per dot, every filled one (any color but the track)
 * under a halo; live ones pulse. The halos are one blurred group, the live
 * ones' and the still ones' apart. Every element carries a `data-role`
 * (`dot`, `dot-halo`) for a reader of the markup.
 */
export function dotBarSvg(dots: readonly FlexDot[], o: DesktopOptions): string {
  const beat = beatOf(o, dots.filter(d => d.live).length + 2)
  const w = dots.length * DOT_UNIT + 2 * PAD
  const h = ROW_HEIGHT
  const cy = MIDLINE
  let liveHalos = ''
  let stillHalos = ''
  let body = ''
  dots.forEach((d, k) => {
    const cx = (PAD + k * DOT_UNIT + DOT_UNIT / 2).toFixed(1)
    const color = HEX.test(d.color) ? d.color : o.palette.track
    const filled = color.toUpperCase() !== o.palette.track.toUpperCase()
    const live = Boolean(d.live) && beat !== null
    const haloDot = `<circle data-role="dot-halo" cx="${cx}" cy="${cy}" r="${DOT_RADIUS + 1.2}" fill="${color}"/>`
    if (filled && o.glow && live) liveHalos += haloDot
    else if (filled && o.glow) stillHalos += haloDot
    body += `<circle data-role="dot" cx="${cx}" cy="${cy}" r="${DOT_RADIUS}" fill="${color}">${live ? animate('fill', color, pulseForeground(color, 1), beat!) : ''}</circle>`
  })
  const halos = (stillHalos ? `<g ${halo(false, beat)}${stillHalos}</g>` : '') + (liveHalos ? `<g ${halo(true, beat)}${liveHalos}</g>` : '')
  return open(w, h, beat) + halos + body + '</svg>'
}

/**
 * A smooth bar: a pill-shaped track the full width, the filled part clipped
 * to a pill of its own (never shorter than it is thick, so a small percent is
 * a round dot, not a sliver), each slice a rect of its color (class `s`, in
 * pixels; `data-grow` holds its hundredths of the bar), and the filled part's
 * halo under it. Live slices pulse.
 */
export function smoothBarSvg(slices: readonly FlexSlice[], o: DesktopOptions): string {
  const beat = beatOf(o, 2 * slices.filter(sl => sl.live).length + 2)
  const bar = Math.max(1, o.dotCount) * DOT_UNIT
  const w = bar + 2 * PAD
  const h = ROW_HEIGHT
  const y = MIDLINE - BAR_THICKNESS / 2
  const rx = BAR_THICKNESS / 2
  const track = o.palette.track
  const px = bar / 100
  let at = 0
  let filledTo = 0
  let rects = ''
  for (const sl of slices) {
    const color = HEX.test(sl.color) ? sl.color : track
    const isFilled = color.toUpperCase() !== track.toUpperCase()
    if (isFilled) {
      filledTo = at + sl.grow
      const live = Boolean(sl.live) && beat !== null
      rects += `<rect data-role="slice" x="${(PAD + at * px).toFixed(2)}" y="${y}" width="${(sl.grow * px).toFixed(2)}" height="${BAR_THICKNESS}" fill="${color}" data-grow="${sl.grow.toFixed(1)}">${live ? animate('fill', color, pulseForeground(color, 1), beat!) : ''}</rect>`
    }
    at += sl.grow
  }
  const anyLive = slices.some(sl => sl.live) && beat !== null
  const filledPx = Math.min(bar, Math.max(BAR_THICKNESS, filledTo * px))
  const clip = `<clipPath id="c"><rect x="${PAD}" y="${y}" width="${filledPx.toFixed(2)}" height="${BAR_THICKNESS}" rx="${rx}"/></clipPath>`
  // The last slice reaches the pill's end, so a small percent fills its round dot.
  const fill = (role: string) => `<g clip-path="url(#c)"><rect data-role="${role}-tip" x="${PAD}" y="${y}" width="${filledPx.toFixed(2)}" height="${BAR_THICKNESS}" fill="${lastColor(slices, track)}"/>${rects.replaceAll('data-role="slice"', `data-role="${role}"`)}</g>`
  const glow = filledTo > 0 && o.glow ? `<g ${halo(anyLive, beat)}${fill('slice-halo')}</g>` : ''
  return (
    open(w, h, beat) +
    `<defs>${clip}</defs>` +
    `<rect data-role="track" x="${PAD}" y="${y}" width="${bar}" height="${BAR_THICKNESS}" rx="${rx}" fill="${track}"/>` +
    glow +
    (filledTo > 0 ? fill('slice') : '') +
    '</svg>'
  )
}

/** The color of the last filled slice, what a bar's tip is painted. */
function lastColor(slices: readonly FlexSlice[], track: string): string {
  let color = track
  for (const sl of slices) if (HEX.test(sl.color) && sl.color.toUpperCase() !== track.toUpperCase()) color = sl.color
  return color
}

/**
 * A text drawing's look: the `data-role` of the text (its halo's is `<role>-halo`),
 * its weight, and the width of one of its characters, which sizes the drawing to the text.
 */
type TextLook = { role: string; weight: number; charWidth: number }

/** Text in its color under a halo of the same color; live, it pulses. */
function textSvg(span: Span, look: TextLook, o: DesktopOptions): string {
  const beat = beatOf(o, 3)
  const live = Boolean(span.live) && beat !== null
  const w = Math.ceil(span.text.length * look.charWidth) + 2 * PAD
  const h = ROW_HEIGHT
  const attrs = `x="${PAD}" y="${(MIDLINE + PCT_FONT_SIZE * BASELINE_DROP).toFixed(1)}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="${PCT_FONT_SIZE}" font-weight="${look.weight}" fill="${span.color}"`
  const text = esc(span.text)
  return (
    open(w, h, beat) +
    (o.glow ? `<text data-role="${look.role}-halo" ${attrs} ${halo(live, beat)}${text}</text>` : '') +
    `<text data-role="${look.role}" ${attrs}>${text}${live ? animate('fill', span.color, pulseForeground(span.color, 1), beat!) : ''}</text>` +
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
