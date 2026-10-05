// The desktop band. The desktop draws the band in a proportional font, so
// cells are nominal there, and its Client module is handed no vector element,
// so the band is drawn by the hooks module itself: text pieces as `Text` in
// Claude Code's theme keys, and every bar and percent as an `Svg`, where each
// filled dot, bar and percent sits under a blurred halo of its own color (the
// design's `text-shadow` glow). The pulse is a SMIL animation inside each
// drawing: the color toward white and the halo wider, on one cycle, with no
// redraw. The app draws each drawing as an image, and an animated image is
// rasterized again on every display frame, so a breath that never stops
// measured about a third of a CPU core (README, Resource use). Under
// `pulseMode: responsive` the drawings breathe only for the `burst` the hooks
// module hands them after a value changed: each carries the change's number,
// so every drawing is a new image and they all start together, and the
// animation's negative `begin` keeps a drawing made later in the burst in
// phase and ends it with the rest. The Weekly rotation is the hooks module's
// timer.

import type { BoxProps, ElementConstructor, RenderElement, SvgProps, TextProps } from 'claude-code'

import type { FlexDot, FlexRow, FlexSegment, FlexSlice, Palette, Span } from './builder'
import { THEME_KEYS } from './builder'
import type { Burst } from './color'
import { pulseForeground } from './color'

export type DesktopElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Svg: ElementConstructor<SvgProps>
}

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
/** Room on either side of a drawing, so the halo at its ends is not cut by the drawing's bounds. */
export const PAD = 12
export const PCT_FONT_SIZE = 19.5
export const PCT_CHAR_WIDTH = 12.6

/** The halo at rest and at the peak of the pulse: the design's 6px to 12px `text-shadow`. */
export const GLOW = { restBlur: 3, peakBlur: 6, restHalo: 0.7, peakHalo: 0.95 } as const

const HEX = /^#[0-9A-Fa-f]{6}$/
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/**
 * A drawing's pulse: its cycle, the SMIL timing of its animations and the
 * attribute that marks the change it belongs to; null when it does not pulse
 * (the pulse off, or responsive with no change running).
 */
type Beat = { ms: number; timing: string; mark: string } | null

function beatOf(o: DesktopOptions): Beat {
  if (!o.pulse) return null
  if (o.pulseMode === 'always') return { ms: o.pulseMs, timing: 'repeatCount="indefinite"', mark: '' }
  const { gen, elapsedMs, totalMs } = o.burst
  if (gen === 0 || elapsedMs >= totalMs) return null
  return { ms: o.pulseMs, timing: `begin="-${Math.round(elapsedMs)}ms" repeatDur="${Math.round(totalMs)}ms"`, mark: ` data-burst="${gen}"` }
}

/** `C;P;C`: the color, its pulse peak and back, for a SMIL `values`. */
function pulseValues(color: string): string {
  return `${color};${pulseForeground(color, 1)};${color}`
}

function animate(attr: string, values: string, beat: NonNullable<Beat>): string {
  return `<animate attributeName="${attr}" values="${values}" dur="${beat.ms}ms" ${beat.timing} calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>`
}

/**
 * The glow filters: `g` pulses between the rest and the peak blur when the
 * drawing pulses, `r` is the rest blur alone (stale drawings, or the pulse off).
 */
function defs(beat: Beat): string {
  const g = beat
    ? `<filter id="g" x="-100%" y="-200%" width="300%" height="500%"><feGaussianBlur stdDeviation="${GLOW.restBlur}">${animate('stdDeviation', `${GLOW.restBlur};${GLOW.peakBlur};${GLOW.restBlur}`, beat)}</feGaussianBlur></filter>`
    : ''
  const r = `<filter id="r" x="-100%" y="-200%" width="300%" height="500%"><feGaussianBlur stdDeviation="${GLOW.restBlur}"/></filter>`
  return `<defs>${g}${r}</defs>`
}

/** The halo's filter and opacity, closing the opening tag: pulsing when live, at rest otherwise. */
function halo(live: boolean, beat: Beat): string {
  if (live && beat) return `filter="url(#g)" opacity="${GLOW.restHalo}">${animate('opacity', `${GLOW.restHalo};${GLOW.peakHalo};${GLOW.restHalo}`, beat)}`
  return `filter="url(#r)" opacity="${GLOW.restHalo}">`
}

function open(w: number, h: number, beat: Beat): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMid meet"${beat?.mark ?? ''}>${defs(beat)}`
}

/**
 * A dot bar: one circle per dot, every filled one (any color but the track)
 * under a halo; live ones pulse. Every element carries a `data-role`
 * (`dot`, `dot-halo`) for a reader of the markup.
 */
export function dotBarSvg(dots: readonly FlexDot[], o: DesktopOptions): string {
  const beat = beatOf(o)
  const w = dots.length * DOT_UNIT + 2 * PAD
  const h = ROW_HEIGHT
  const cy = h / 2
  let body = ''
  dots.forEach((d, k) => {
    const cx = (PAD + k * DOT_UNIT + DOT_UNIT / 2).toFixed(1)
    const color = HEX.test(d.color) ? d.color : o.palette.track
    const filled = color.toUpperCase() !== o.palette.track.toUpperCase()
    const live = Boolean(d.live) && beat !== null
    if (filled && o.glow) body += `<circle data-role="dot-halo" cx="${cx}" cy="${cy}" r="${DOT_RADIUS + 1.2}" fill="${color}" ${halo(live, beat)}</circle>`
    body += `<circle data-role="dot" cx="${cx}" cy="${cy}" r="${DOT_RADIUS}" fill="${color}">${live ? animate('fill', pulseValues(color), beat!) : ''}</circle>`
  })
  return open(w, h, beat) + body + '</svg>'
}

/**
 * A smooth bar: a pill-shaped track the full width, the filled part clipped
 * to a pill of its own (never shorter than it is thick, so a small percent is
 * a round dot, not a sliver), each slice a rect of its color (class `s`, in
 * pixels; `data-grow` holds its hundredths of the bar), and the filled part's
 * halo under it. Live slices pulse.
 */
export function smoothBarSvg(slices: readonly FlexSlice[], o: DesktopOptions): string {
  const beat = beatOf(o)
  const bar = Math.max(1, o.dotCount) * DOT_UNIT
  const w = bar + 2 * PAD
  const h = ROW_HEIGHT
  const y = (h - BAR_THICKNESS) / 2
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
      rects += `<rect data-role="slice" x="${(PAD + at * px).toFixed(2)}" y="${y}" width="${(sl.grow * px).toFixed(2)}" height="${BAR_THICKNESS}" fill="${color}" data-grow="${sl.grow.toFixed(1)}">${live ? animate('fill', pulseValues(color), beat!) : ''}</rect>`
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

/** A percent: bold text in its color under a halo of the same color; live, it pulses. */
export function pctSvg(pct: Span, o: DesktopOptions): string {
  const beat = beatOf(o)
  const live = Boolean(pct.live) && beat !== null
  const w = Math.ceil(pct.text.length * PCT_CHAR_WIDTH) + 2 * PAD
  const h = ROW_HEIGHT
  const attrs = `x="${PAD}" y="${(h / 2 + PCT_FONT_SIZE * 0.36).toFixed(1)}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="${PCT_FONT_SIZE}" font-weight="700" fill="${pct.color}"`
  const text = esc(pct.text)
  return (
    open(w, h, beat) +
    (o.glow ? `<text data-role="pct-halo" ${attrs} ${halo(live, beat)}${text}</text>` : '') +
    `<text data-role="pct" ${attrs}>${text}${live ? animate('fill', pulseValues(pct.color), beat!) : ''}</text>` +
    '</svg>'
  )
}

/**
 * The desktop band from a flex row (its colors as the builder made them, in
 * `#RRGGBB`): labels, separators, reset fields and the stale marker as `Text`
 * in theme keys the app paints for its own appearance; bars and percents as
 * drawings. A percent in the theme's plain text color (`--`) stays text.
 */
export function desktopBand(row: FlexRow, els: DesktopElements, o: DesktopOptions): RenderElement {
  const { Box, Text, Svg } = els
  const children: RenderElement[] = []
  let lastWin = -1
  row.segments.forEach((seg, n) => {
    if (seg.kind !== 'ctx') lastWin = n
  })
  const fixed = (key: string, el: RenderElement) => (
    <Box key={key} flexShrink={0}>
      {el}
    </Box>
  )
  row.segments.forEach((seg: FlexSegment, n) => {
    if (n > 0) children.push(fixed(`sep-${seg.kind}`, <Text color={THEME_KEYS.dim}> │ </Text>))
    children.push(fixed(`label-${seg.kind}`, <Text color={THEME_KEYS.text}>{seg.label} </Text>))
    if (seg.dots) {
      const filled = seg.dots.filter(d => HEX.test(d.color) && d.color.toUpperCase() !== o.palette.track.toUpperCase()).length
      children.push(
        <Box key={`dots-${seg.kind}`} flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
          <Svg source={dotBarSvg(seg.dots, o)} alt={`${filled} of ${seg.dots.length} dots`} height={DISPLAY_HEIGHT} />
        </Box>,
      )
      children.push(fixed(`gap-${seg.kind}`, <Text color={THEME_KEYS.text}> </Text>))
    } else if (seg.bar) {
      children.push(
        <Box key={`bar-${seg.kind}`} flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
          <Svg source={smoothBarSvg(seg.bar, o)} alt={`${seg.kind} bar`} height={DISPLAY_HEIGHT} />
        </Box>,
      )
      children.push(fixed(`gap-${seg.kind}`, <Text color={THEME_KEYS.text}> </Text>))
    }
    if (!seg.pct.live && seg.pct.color.toUpperCase() === o.palette.text.toUpperCase()) {
      children.push(
        fixed(
          `pct-${seg.kind}`,
          <Text color={THEME_KEYS.text} bold>
            {seg.pct.text}
          </Text>,
        ),
      )
    } else {
      children.push(fixed(`pct-${seg.kind}`, <Svg source={pctSvg(seg.pct, o)} alt={seg.pct.text} height={DISPLAY_HEIGHT} />))
    }
    if (seg.extra) children.push(fixed(`extra-${seg.kind}`, <Text color={THEME_KEYS.text}> {seg.extra}</Text>))
    if (n === lastWin && row.stale) {
      children.push(
        fixed(
          `stale-${seg.kind}`,
          <Text color={THEME_KEYS.dim} italic>
            {'  ' + row.stale.text}
          </Text>,
        ),
      )
    }
  })
  return (
    <Box key="band" flexDirection="row" width="100%" alignItems="center">
      {children}
    </Box>
  )
}
