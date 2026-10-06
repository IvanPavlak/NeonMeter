// The band builder: a line-for-line port of the design canvas's builder (the
// appendix of the approved design specification), with three deliberate
// differences: the cell is `━` (a continuous bar); ramp coloring, an option beside the default level coloring;
// and the reset field's display and color options (`resetAs`, `resetColor`), whose defaults draw the design's
// text. Pure functions from a reading to the spans of one row; no `$`, no elements.

import { mix } from './color'

export type Theme = 'dark' | 'light'

export type Palette = {
  /** The ground every blend goes toward. */
  bg: string
  text: string
  /** Empty cells. */
  track: string
  /** Loading cells and the loading `…`. */
  neutral: string
  /** The six neon range colors, in range order. */
  ramp: readonly string[]
}

export const THEMES: Record<Theme, Palette> = {
  dark: {
    bg: '#0D1117',
    text: '#FFFFFF',
    track: '#21262D',
    neutral: '#6E7681',
    ramp: ['#1E90FF', '#39FF14', '#00D45A', '#FFF01F', '#FF5F1F', '#FF073A'],
  },
  light: {
    bg: '#FFFFFF',
    text: '#000000',
    track: '#EBEDF0',
    neutral: '#8C959F',
    ramp: ['#1874D2', '#32A800', '#139A43', '#A89200', '#E84A00', '#E8001F'],
  },
}

/** The default six neon colors per theme, in range order (the approved design). */
export const DEFAULT_RAMPS: Record<Theme, readonly string[]> = {
  dark: ['#1E90FF', '#39FF14', '#00D45A', '#FFF01F', '#FF5F1F', '#FF073A'],
  light: ['#1874D2', '#32A800', '#139A43', '#A89200', '#E84A00', '#E8001F'],
}

/** The default lower bounds of ranges 2 to 6 (the approved design): 0-49, 50-59, ..., 90 and up. */
export const DEFAULT_BOUNDS: readonly number[] = [50, 60, 70, 80, 90]

/**
 * The default lower bounds of time ranges 2 to 6, the share of a window still to
 * run that `resetColor: time` colors by: the window in six even steps, so each
 * color holds about 50 minutes of a 5-hour window and 1.2 days of a week.
 */
export const DEFAULT_TIME_BOUNDS: readonly number[] = [17, 33, 50, 67, 83]

/** The default bar cell, filled and empty alike. */
export const DEFAULT_CELL = '━'

let bounds: readonly number[] = DEFAULT_BOUNDS
let timeBounds: readonly number[] = DEFAULT_TIME_BOUNDS

/** The current range bounds (`configureDesign` sets them). */
export function rangeBounds(): readonly number[] {
  return bounds
}

/** The current time range bounds (`configureDesign` sets them). */
export function timeRangeBounds(): readonly number[] {
  return timeBounds
}

/**
 * Sets the configurable parts of the design for this activation: the five
 * range bounds, the five time range bounds, the six colors per theme and the
 * bar cell. Anything left out is the default, so calling it with nothing
 * restores the design.
 */
export function configureDesign(design: { bounds?: readonly number[]; timeBounds?: readonly number[]; dark?: readonly string[]; light?: readonly string[]; cell?: string } = {}): void {
  bounds = design.bounds ?? DEFAULT_BOUNDS
  timeBounds = design.timeBounds ?? DEFAULT_TIME_BOUNDS
  THEMES.dark.ramp = design.dark ?? DEFAULT_RAMPS.dark
  THEMES.light.ramp = design.light ?? DEFAULT_RAMPS.light
  CELL = design.cell ?? DEFAULT_CELL
}

/** The approved design's ranges, by name (documentation; the live bounds come from `rangeBounds`). */
export const RANGES = [
  { name: 'dodgerblue', from: 0, to: 50 },
  { name: 'lime green', from: 50, to: 60 },
  { name: 'darker green', from: 60, to: 70 },
  { name: 'yellow', from: 70, to: 80 },
  { name: 'orangered', from: 80, to: 90 },
  { name: 'red', from: 90, to: 100 },
] as const

export type WindowKind = 'five_hour' | 'seven_day' | 'spend_limit'
export type SegmentKind = WindowKind | 'ctx'

export const LABELS: Record<'full' | 'short', Record<SegmentKind, string>> = {
  full: { five_hour: '5-hour', seven_day: 'Weekly', spend_limit: 'Spend', ctx: 'Context' },
  short: { five_hour: '5h', seven_day: '7d', spend_limit: '$', ctx: 'Ctx' },
}

/** Every bar cell, filled and empty alike (the `glyph` option; `configureDesign` sets it). */
export let CELL = DEFAULT_CELL

export type Tier = 'full' | 'compact' | 'narrow' | 'micro'
export type BarColoring = 'level' | 'ramp'
/** How the full tier shows a window's reset: `countdown` (`in 3h13m`) or `clock` (`Thu 14:05`, `14:05`). */
export type ResetAs = 'countdown' | 'clock'
/** `time` colors a window's reset by how much of the window is still to run; `plain` draws it in the text color. */
export type ResetColor = 'plain' | 'time'

/** One run of same-styled characters. `color` is final: blends are applied. */
export type Span = {
  text: string
  color: string
  bold?: boolean
  italic?: boolean
  /** A live cell run or percent: it pulses in its own color. */
  live?: boolean
}

/** A segment's label in place of the kind's own, for each tier width. */
export type SegmentLabel = { full: string; short: string }

export type WindowInput = {
  kind: WindowKind
  pct: number
  /** Overrides the kind's label: a per-model weekly window (`Fable`), or a padded `Weekly` while they rotate. */
  label?: SegmentLabel
  /** Minutes until the reset; absent for a spend limit. */
  resetMin?: number | null
  /** The reset as a clock time, `Thu 14:05` for a weekly window and `14:05` for the 5-hour one: drawn on the full tier when the window shows a clock. */
  resetAt?: string
  /** How the full tier shows the reset; absent, a weekly window shows the clock and every other window counts down. */
  resetAs?: ResetAs
  /** This window alone is old: a per-model window the fetch has not refreshed in twice the period. */
  stale?: boolean
}

export type ContextInput = {
  pct: number
  /** Null before the first response: all cells empty and `--`. */
  tokens: number | null
  window: number
}

/** The order the `segments` option speaks in; `spend` and `context` map to the builder's kinds. */
export type OptionSegment = 'five_hour' | 'seven_day' | 'spend' | 'context'

export type BandInput = {
  /** False hides every window segment (no subscription, no credential). */
  auth: boolean
  /** True before the first reading: loading cells and `…`. */
  loading: boolean
  stale: boolean
  /** The reading's age as `fmtAge` spells it, drawn when `stale`. */
  staleAge: string
  windows: WindowInput[]
  ctx: ContextInput | null
  /** Which segments to draw and in what order. */
  segments: readonly OptionSegment[]
  /** `time` colors each window's reset by the share of the window still to run (live, faded when stale); `plain` or absent, the text color. */
  resetColor?: ResetColor
}

type Segment = {
  kind: SegmentKind
  hasBar: boolean
  label?: SegmentLabel
  loading?: boolean
  pct?: number | null
  resetMin?: number | null
  resetAt?: string
  resetAs?: ResetAs
  stale?: boolean
  tokens?: number | null
  window?: number
}

type Pieces = { label: string; pct: string; extra: string }

/** Which of the six ranges `p` falls in under `list`; a range includes its lower bound. */
function indexIn(p: number, list: readonly number[]): number {
  let i = 0
  for (const bound of list) if (p >= bound) i++
  return i
}

/** Which of the six ranges a percent falls in; a range includes its lower bound. */
export function rampIndex(p: number): number {
  return indexIn(p, bounds)
}

/** Which of the six time ranges a share of a window still to run falls in (`resetShare`). */
export function timeIndex(share: number): number {
  return indexIn(share, timeBounds)
}

function rep(c: string, n: number): string {
  let s = ''
  for (let i = 0; i < n; i++) s += c
  return s
}

function padL(s: string, n: number): string {
  while (s.length < n) s = ' ' + s
  return s
}

function padR(s: string, n: number): string {
  while (s.length < n) s = s + ' '
  return s
}

/** A countdown: `47m`, `2h13m` (minutes two digits), `3d4h`. */
export function fmtDur(min: number): string {
  if (min < 60) return min + 'm'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h < 24) return h + 'h' + (m < 10 ? '0' : '') + m + 'm'
  return Math.floor(h / 24) + 'd' + (h % 24) + 'h'
}

/** A reading's age in whole minutes, at least `1m`: `5m`, `1h`, `1h01m`, `1d2h`. */
export function fmtAge(min: number): string {
  const m = Math.max(1, Math.floor(min))
  if (m < 60) return m + 'm'
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h < 24) return h + 'h' + (r ? (r < 10 ? '0' : '') + r + 'm' : '')
  return Math.floor(h / 24) + 'd' + (h % 24) + 'h'
}

/** Tokens: `76k` under a million, `1M` or `1.2M` from a million on. */
export function fmtTok(n: number): string {
  return n >= 1000000 ? Math.round(n / 100000) / 10 + 'M' : Math.round(n / 1000) + 'k'
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/**
 * A reset as a clock time: local short weekday and 24-hour time, `Thu 14:05`,
 * or the time alone, `14:05`, without `withDay` (the 5-hour window, which
 * resets within the day's hours). Rounded to the minute, so a reset the
 * endpoint stamps a few milliseconds before midnight reads as the next day's
 * `00:00`, as /usage does.
 */
export function fmtResetAt(ms: number, withDay = true): string {
  const d = new Date(Math.round(ms / 60_000) * 60_000)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return withDay ? `${DAYS[d.getDay()]} ${hh}:${mm}` : `${hh}:${mm}`
}

/** Whether the full tier shows the segment's reset as a clock time: as its `resetAs` says, else the weekly window alone. */
function isClock(seg: Segment): boolean {
  return seg.resetAs ? seg.resetAs === 'clock' : seg.kind === 'seven_day'
}

type SpanOptions = { live?: boolean; op?: number; bold?: boolean; italic?: boolean }

function sp(T: Palette, text: string, color: string, o: SpanOptions = {}): Span {
  const span: Span = { text, color: mix(color, T.bg, o.op ?? 1) }
  if (o.bold) span.bold = true
  if (o.italic) span.italic = true
  if (o.live) span.live = true
  return span
}

const OPTION_KIND: Record<OptionSegment, SegmentKind> = {
  five_hour: 'five_hour',
  seven_day: 'seven_day',
  spend: 'spend_limit',
  context: 'ctx',
}

function segmentsOf(s: BandInput): Segment[] {
  const all: Segment[] = []
  if (s.auth) {
    if (s.loading) {
      all.push({ kind: 'five_hour', loading: true, hasBar: true })
      all.push({ kind: 'seven_day', loading: true, hasBar: true })
    } else {
      for (const w of s.windows) {
        const seg: Segment = { kind: w.kind, pct: w.pct, resetMin: w.resetMin, resetAt: w.resetAt, resetAs: w.resetAs, hasBar: w.kind !== 'spend_limit', stale: s.stale || w.stale === true }
        if (w.label) seg.label = w.label
        all.push(seg)
      }
    }
  }
  if (s.ctx) {
    all.push({ kind: 'ctx', pct: s.ctx.tokens == null ? null : s.ctx.pct, tokens: s.ctx.tokens, window: s.ctx.window, hasBar: true })
  }
  // The `segments` option filters and orders; a kind the account has no segment for is skipped.
  const out: Segment[] = []
  for (const option of s.segments) {
    const kind = OPTION_KIND[option]
    const seg = all.find(x => x.kind === kind)
    if (seg) out.push(seg)
  }
  return out
}

function piecesOf(seg: Segment, tier: Tier, isLast: boolean): Pieces {
  const barTier = tier === 'full' || tier === 'compact'
  const label = seg.label ? (tier === 'full' ? seg.label.full : seg.label.short) : (tier === 'full' ? LABELS.full : LABELS.short)[seg.kind]
  let pct = seg.loading ? '…' : seg.pct == null ? '--' : Math.round(seg.pct) + '%'
  if (seg.stale && !barTier) pct = '~' + pct
  let extra = ''
  if (seg.kind === 'ctx') {
    if (barTier && seg.pct != null) extra = fmtTok(seg.tokens ?? 0) + '/' + fmtTok(seg.window ?? 0)
  } else if (!seg.loading && seg.resetMin != null && tier !== 'micro') {
    extra = tier === 'full' && isClock(seg) ? (seg.resetAt ?? '') : (tier === 'full' ? 'in ' : '') + fmtDur(seg.resetMin)
  }
  if (barTier) {
    pct = padL(pct, 4)
    if (seg.kind !== 'spend_limit' && !isLast && !seg.loading) {
      extra = padR(extra, seg.kind === 'ctx' ? 9 : tier === 'full' ? (seg.kind === 'seven_day' ? 9 : 8) : 5)
    }
  }
  return { label, pct, extra }
}

function pctColor(seg: Segment, T: Palette): { color: string; op: number; live: boolean } {
  if (seg.loading) return { color: T.neutral, op: 1, live: true }
  if (seg.pct == null) return { color: T.text, op: 1, live: false }
  if (seg.stale) return { color: T.ramp[rampIndex(seg.pct)]!, op: 0.45, live: false }
  return { color: T.ramp[rampIndex(seg.pct)]!, op: 1, live: true }
}

/** Each window's length in minutes, what the share of a window still to run is measured against. */
export const WINDOW_MINUTES: Readonly<Record<'five_hour' | 'seven_day', number>> = { five_hour: 300, seven_day: 7 * 24 * 60 }

/**
 * The share of a window still to run before it resets, 0 to 100; null for a
 * window without a reset or without a fixed length (a spend limit).
 */
export function resetShare(kind: WindowKind, resetMin: number | null | undefined): number | null {
  if (resetMin == null || kind === 'spend_limit') return null
  return Math.min(100, Math.max(0, (resetMin / WINDOW_MINUTES[kind]) * 100))
}

/**
 * A reset's color under `resetColor: time`: the time range its share of the
 * window still to run falls in (`timeRanges`), on the same six colors as the percents. A
 * reset that is close is cool and one far off is hot, whatever the percent
 * used, so two limits that reset together share a color. Live like a percent;
 * stale, it fades and holds still with the rest of its segment.
 */
function timeColor(seg: Segment, T: Palette): { color: string; op: number; live: boolean } {
  const color = T.ramp[timeIndex(resetShare(seg.kind as WindowKind, seg.resetMin) ?? 0)]!
  return seg.stale ? { color, op: 0.45, live: false } : { color, op: 1, live: true }
}

/**
 * The field after a percent, with its leading space: under `resetColor: time`
 * a window's reset takes its time color (`timeColor`); every other field, the
 * context's tokens included, is plain text.
 */
function extraSpan(T: Palette, seg: Segment, text: string, color: ResetColor | undefined): Span {
  if (color === 'time' && seg.kind !== 'ctx' && seg.resetMin != null) {
    const tc = timeColor(seg, T)
    return sp(T, ' ' + text, tc.color, { live: tc.live, op: tc.op })
  }
  return sp(T, ' ' + text, T.text)
}

/**
 * The color of filled cell `i` of `f`: under level coloring the percent's
 * range; under ramp coloring the filled part runs through every range from
 * the first up to the percent's in equal stretches, so the bar always ends in
 * the percent's color and every range below it shows. (`len` is unused: the
 * ramp spans the fill, not the bar.)
 */
export function cellColor(T: Palette, bars: BarColoring, pct: number, i: number, f: number, _len: number): string {
  const top = rampIndex(pct)
  if (bars !== 'ramp' || i >= f - 1) return T.ramp[top]!
  return T.ramp[Math.min(top, Math.floor((i / f) * (top + 1)))]!
}

/**
 * The filled cells of a bar of `len`: one range color per filled cell (from
 * `cellColor`), whether they are live, and their opacity (stale cells fade).
 * The terminal's cell runs and the desktop's dots both draw from this.
 */
function filledCells(seg: Segment, len: number, T: Palette, bars: BarColoring): { colors: string[]; live: boolean; op: number } {
  const pct = seg.pct == null ? 0 : Math.min(seg.pct, 100)
  const f = pct <= 0 ? 0 : Math.max(1, Math.round((pct / 100) * len))
  const colors: string[] = []
  for (let i = 0; i < f; i++) colors.push(cellColor(T, bars, pct, i, f, len))
  return { colors, live: !seg.stale, op: seg.stale ? 0.45 : 1 }
}

function pushBar(out: Span[], seg: Segment, len: number, T: Palette, bars: BarColoring): void {
  if (seg.loading) {
    out.push(sp(T, rep(CELL, len), T.neutral, { live: true }))
    return
  }
  const { colors, live, op } = filledCells(seg, len, T, bars)
  // Cells of one color become one span, so a bar is a few spans, not one per cell.
  let run = ''
  let runColor: string | null = null
  for (const c of colors) {
    if (c !== runColor && run && runColor) {
      out.push(sp(T, run, runColor, { live, op }))
      run = ''
    }
    runColor = c
    run += CELL
  }
  if (run && runColor) out.push(sp(T, run, runColor, { live, op }))
  if (len - colors.length > 0) out.push(sp(T, rep(CELL, len - colors.length), T.track))
}

function layoutBars(segs: Segment[], tier: Tier, s: BandInput, cols: number, T: Palette, bars: BarColoring): Span[] | null {
  const min = tier === 'full' ? 8 : 4
  const parts = segs.map((seg, i) => piecesOf(seg, tier, i === segs.length - 1))
  const staleTxt = s.stale && s.auth && !s.loading ? '  stale ' + s.staleAge : ''
  let lastWin = -1
  segs.forEach((seg, i) => {
    if (seg.kind !== 'ctx') lastWin = i
  })
  let fixed = (segs.length - 1) * 3
  let nb = 0
  parts.forEach((p, i) => {
    fixed += p.label.length + 1 + p.pct.length + (p.extra ? 1 + p.extra.length : 0) + (i === lastWin ? staleTxt.length : 0)
    if (segs[i]?.hasBar) {
      fixed += 1
      nb++
    }
  })
  const free = cols - fixed
  if (nb === 0 || free < nb * min) return null
  const base = Math.floor(free / nb)
  const rem = free % nb
  let k = 0
  const out: Span[] = []
  segs.forEach((seg, i) => {
    const p = parts[i]!
    if (i) out.push(sp(T, ' │ ', T.text, { op: 0.4 }))
    out.push(sp(T, p.label + ' ', T.text))
    if (seg.hasBar) {
      pushBar(out, seg, base + (k < rem ? 1 : 0), T, bars)
      k++
      out.push(sp(T, ' ', T.text))
    }
    const pc = pctColor(seg, T)
    out.push(sp(T, p.pct, pc.color, { live: pc.live, op: pc.op, bold: true }))
    if (p.extra) out.push(extraSpan(T, seg, p.extra, s.resetColor))
    if (i === lastWin && staleTxt) out.push(sp(T, staleTxt, T.text, { italic: true, op: 0.7 }))
  })
  return out
}

function layoutJustified(segs: Segment[], tier: Tier, cols: number, T: Palette, force: boolean, color: ResetColor | undefined): Span[] | null {
  const parts = segs.map(seg => piecesOf(seg, tier, true))
  let total = 0
  parts.forEach(p => {
    total += p.label.length + 1 + p.pct.length + (p.extra ? 1 + p.extra.length : 0)
  })
  const gaps = segs.length - 1
  if (!force && total + gaps * 3 > cols) return null
  const free = Math.max(cols - total, gaps * 3)
  const out: Span[] = []
  segs.forEach((seg, i) => {
    const p = parts[i]!
    if (i) {
      const g = Math.floor(free / gaps) + (i - 1 < free % gaps ? 1 : 0)
      const left = Math.floor((g - 1) / 2)
      out.push(sp(T, rep(' ', left) + '·' + rep(' ', g - 1 - left), T.text, { op: 0.4 }))
    }
    const pc = pctColor(seg, T)
    out.push(sp(T, p.label + ' ', T.text))
    out.push(sp(T, p.pct, pc.color, { live: pc.live, op: pc.op, bold: true }))
    if (p.extra) out.push(extraSpan(T, seg, p.extra, color))
  })
  return out
}

/** Cuts the spans at the right edge, as the micro tier overflows there. */
function truncate(spans: Span[], cols: number): Span[] {
  const out: Span[] = []
  let used = 0
  for (const span of spans) {
    if (used >= cols) break
    const room = cols - used
    const text = span.text.length > room ? Array.from(span.text).slice(0, room).join('') : span.text
    out.push({ ...span, text })
    used += text.length
  }
  return out
}

export type Band = { tier: Tier; spans: Span[] }

/**
 * Builds one row of exactly `cols` cells: the most detailed tier that fits.
 * Null when there is nothing to draw.
 */
export function band(s: BandInput, cols: number, theme: Theme, bars: BarColoring): Band | null {
  const T = THEMES[theme]
  const segs = segmentsOf(s)
  if (!segs.length) return null
  let spans = layoutBars(segs, 'full', s, cols, T, bars)
  let tier: Tier = 'full'
  if (!spans) {
    spans = layoutBars(segs, 'compact', s, cols, T, bars)
    tier = 'compact'
  }
  if (!spans) {
    spans = layoutJustified(segs, 'narrow', cols, T, false, s.resetColor)
    tier = 'narrow'
  }
  if (!spans) {
    spans = truncate(layoutJustified(segs, 'micro', cols, T, true, s.resetColor)!, cols)
    tier = 'micro'
  }
  return { tier, spans }
}

/** The row's characters alone, what the golden rows compare against. */
export function textOf(spans: readonly Span[]): string {
  return spans.map(s => s.text).join('')
}

// ---------------------------------------------------------------------------
// The flex row: the desktop's layout. The desktop band is drawn in a
// proportional font, so character cells are nominal there and a row counted
// in cells never fills it. Instead the desktop gets the full-tier text and,
// for each bar, slices that a flex layout stretches to the pixels available:
// every bar has a total weight of 100, its filled part colored by range.
// ---------------------------------------------------------------------------

/** One stretch of a desktop bar: `grow` of 100, in `color`; `live` pulses. */
export type FlexSlice = { grow: number; color: string; live?: boolean }

/** One dot of a desktop dot bar. */
export type FlexDot = { color: string; live?: boolean }

export type FlexSegment = {
  kind: SegmentKind
  label: string
  /** The bar's slices, weights summing to 100; null for a spend limit (no bar). */
  bar: FlexSlice[] | null
  /** The same bar as dots, when the row was built with a dot count; spread evenly by the layout. */
  dots?: FlexDot[]
  pct: Span
  /** The reset time or the token count, drawn after the percent; '' when none. */
  extra: string
  /** The reset in its time color, set under `resetColor: time`: drawn with the percent's halo, and live while fresh. Absent, `extra` is plain text. */
  extraSpan?: Span
}

export type FlexRow = {
  segments: FlexSegment[]
  text: string
  separator: string
  /** The stale marker after the last window segment, when the reading is stale. */
  stale: Span | null
}

function slicesOf(seg: Segment, T: Palette, bars: BarColoring): FlexSlice[] {
  if (seg.loading) return [{ grow: 100, color: T.neutral, live: true }]
  const pct = seg.pct == null ? 0 : Math.min(seg.pct, 100)
  const live = !seg.stale
  const op = seg.stale ? 0.45 : 1
  const out: FlexSlice[] = []
  if (pct > 0) {
    if (bars === 'ramp') {
      // The ranges from the first to the percent's, in equal stretches of the filled part.
      const top = rampIndex(pct)
      for (let i = 0; i <= top; i++) out.push({ grow: pct / (top + 1), color: mix(T.ramp[i]!, T.bg, op), live })
    } else {
      out.push({ grow: pct, color: mix(T.ramp[rampIndex(pct)]!, T.bg, op), live })
    }
  }
  if (pct < 100) out.push({ grow: 100 - pct, color: T.track })
  return out
}

/** A bar of `len` dots, colored exactly as the terminal's cells are (`filledCells`). */
function dotsOf(seg: Segment, len: number, T: Palette, bars: BarColoring): FlexDot[] {
  if (seg.loading) return Array.from({ length: len }, () => ({ color: T.neutral, live: true }))
  const { colors, live, op } = filledCells(seg, len, T, bars)
  const out: FlexDot[] = colors.map(c => (live ? { color: mix(c, T.bg, op), live: true } : { color: mix(c, T.bg, op) }))
  while (out.length < len) out.push({ color: T.track })
  return out
}

/** Claude Code's own theme keys, which every surface paints in its own appearance. */
export const THEME_KEYS = { text: 'text', dim: 'inactive', track: 'subtle' } as const

/**
 * Builds the desktop row: full labels and fields, bars as flex slices, and
 * also as `dotCount` dots per bar when a count is given. Null when there is
 * nothing to draw.
 */
export function flexRow(s: BandInput, theme: Theme, bars: BarColoring, dotCount?: number): FlexRow | null {
  const T = THEMES[theme]
  const segs = segmentsOf(s)
  if (!segs.length) return null
  let lastWin = -1
  segs.forEach((seg, i) => {
    if (seg.kind !== 'ctx') lastWin = i
  })
  const segments: FlexSegment[] = segs.map(seg => {
    const label = seg.label ? seg.label.full : LABELS.full[seg.kind]
    const pctText = seg.loading ? '…' : seg.pct == null ? '--' : Math.round(seg.pct) + '%'
    const pc = pctColor(seg, T)
    let extra = ''
    if (seg.kind === 'ctx') {
      if (seg.pct != null) extra = fmtTok(seg.tokens ?? 0) + '/' + fmtTok(seg.window ?? 0)
    } else if (!seg.loading && seg.resetMin != null) {
      extra = isClock(seg) ? (seg.resetAt ?? '') : 'in ' + fmtDur(seg.resetMin)
    }
    const out: FlexSegment = {
      kind: seg.kind,
      label,
      bar: seg.hasBar ? slicesOf(seg, T, bars) : null,
      pct: sp(T, pctText, pc.color, { live: pc.live, op: pc.op, bold: true }),
      extra,
    }
    if (seg.hasBar && dotCount && dotCount > 0) out.dots = dotsOf(seg, dotCount, T, bars)
    if (extra && s.resetColor === 'time' && seg.kind !== 'ctx' && seg.resetMin != null) {
      const tc = timeColor(seg, T)
      out.extraSpan = sp(T, extra, tc.color, { live: tc.live, op: tc.op })
    }
    return out
  })
  const staleTxt = s.stale && s.auth && !s.loading && lastWin >= 0 ? sp(T, 'stale ' + s.staleAge, T.text, { italic: true, op: 0.7 }) : null
  return { segments, text: T.text, separator: mix(T.text, T.bg, 0.4), stale: staleTxt }
}

// ---------------------------------------------------------------------------
// The turns a band takes and the desktop's dot count: pure functions of the
// input and the row, used by the hooks module and by the README's generator.
// ---------------------------------------------------------------------------

/**
 * One band input per weekly window, for the Weekly segment to rotate through:
 * the all-models window (`Weekly` / `7d`) first, then each per-model one
 * (`Fable` / `Fab`). Labels are padded to one width per tier so the bars
 * stay put as the windows take turns. A single weekly window is one input,
 * unchanged.
 */
export function weeklyVariants(input: BandInput): BandInput[] {
  const weekly = input.windows.filter(w => w.kind === 'seven_day')
  if (weekly.length <= 1) return [input]
  const labels = weekly.map(w => w.label ?? { full: 'Weekly', short: '7d' })
  const full = Math.max(...labels.map(l => l.full.length))
  const short = Math.max(...labels.map(l => l.short.length))
  const others = input.windows.filter(w => w.kind !== 'seven_day')
  return weekly.map((w, i) => ({
    ...input,
    windows: [...others, { ...w, label: { full: labels[i]!.full.padEnd(full), short: labels[i]!.short.padEnd(short) } }],
  }))
}

/**
 * The single layout's turns: one input per segment, in the `segments` option's
 * order, each drawn alone across the whole row. The Weekly segment gives one
 * turn per weekly window (the all-models week, then one per model); a segment
 * the account has no data for is skipped, as in the full row. With nothing to
 * draw it is the input itself, so the band falls back as before.
 */
export function singleVariants(input: BandInput): BandInput[] {
  const out: BandInput[] = []
  const windowsOf = (kind: WindowInput['kind']) => input.windows.filter(w => w.kind === kind)
  for (const option of input.segments) {
    if (option === 'context') {
      if (input.ctx) out.push({ ...input, segments: ['context'] })
      continue
    }
    if (!input.auth) continue
    if (input.loading) {
      // Before the first reading only the two window placeholders exist.
      if (option === 'five_hour' || option === 'seven_day') out.push({ ...input, segments: [option] })
      continue
    }
    if (option === 'seven_day') {
      const others = input.windows.filter(w => w.kind !== 'seven_day')
      for (const w of windowsOf('seven_day')) out.push({ ...input, windows: [...others, w], segments: ['seven_day'] })
      continue
    }
    if (windowsOf(option === 'spend' ? 'spend_limit' : 'five_hour').length > 0) out.push({ ...input, segments: [option] })
  }
  return out.length > 0 ? out : [input]
}

/**
 * Dots per desktop bar. The desktop font is proportional, so the band holds
 * more characters than its nominal `bodyColumns`: about 1.2 x, measured from
 * two screenshots of the Code tab. What the text leaves, split over the bars
 * at 75% so the dots keep a little air between them instead of overflowing.
 */
export function desktopDotCount(row: FlexRow, bodyColumns: number): number {
  let text = (row.segments.length - 1) * 3 + (row.stale ? row.stale.text.length + 2 : 0)
  let bars = 0
  for (const seg of row.segments) {
    text += seg.label.length + 1 + seg.pct.text.length + (seg.extra ? seg.extra.length + 1 : 0)
    if (seg.bar) {
      bars++
      text += 1
    }
  }
  if (bars === 0) return 0
  return Math.max(4, Math.floor(((bodyColumns * 1.2 - text) / bars) * 0.75))
}
