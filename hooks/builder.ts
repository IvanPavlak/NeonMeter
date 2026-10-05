// The band builder: a line-for-line port of the design canvas's builder (the
// appendix of the approved design specification), with two deliberate
// differences: the cell is `━` (a continuous bar) and ramp coloring, an option beside the default level coloring. Pure
// functions from a reading to the spans of one row; no `$`, no elements.

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

/** The default bar cell, filled and empty alike. */
export const DEFAULT_CELL = '━'

let bounds: readonly number[] = DEFAULT_BOUNDS

/** The current range bounds (`configureDesign` sets them). */
export function rangeBounds(): readonly number[] {
  return bounds
}

/**
 * Sets the configurable parts of the design for this activation: the five
 * range bounds, the six colors per theme and the bar cell. Anything left out
 * is the approved default, so calling it with nothing restores the design.
 */
export function configureDesign(design: { bounds?: readonly number[]; dark?: readonly string[]; light?: readonly string[]; cell?: string } = {}): void {
  bounds = design.bounds ?? DEFAULT_BOUNDS
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
  /** The weekly reset as `Thu 14:05`, drawn on the full tier. */
  resetAt?: string
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
}

type Segment = {
  kind: SegmentKind
  hasBar: boolean
  label?: SegmentLabel
  loading?: boolean
  pct?: number | null
  resetMin?: number | null
  resetAt?: string
  stale?: boolean
  tokens?: number | null
  window?: number
}

type Pieces = { label: string; pct: string; extra: string }

/** Which of the six ranges a percent falls in; a range includes its lower bound. */
export function rampIndex(p: number): number {
  let i = 0
  for (const bound of bounds) if (p >= bound) i++
  return i
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

/** The weekly reset on the full tier: local short weekday and 24-hour time, `Thu 14:05`. */
export function fmtResetAt(ms: number): string {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${DAYS[d.getDay()]} ${hh}:${mm}`
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
        const seg: Segment = { kind: w.kind, pct: w.pct, resetMin: w.resetMin, resetAt: w.resetAt, hasBar: w.kind !== 'spend_limit', stale: s.stale }
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
    extra = seg.kind === 'seven_day' && tier === 'full' ? (seg.resetAt ?? '') : (tier === 'full' ? 'in ' : '') + fmtDur(seg.resetMin)
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
    if (p.extra) out.push(sp(T, ' ' + p.extra, T.text))
    if (i === lastWin && staleTxt) out.push(sp(T, staleTxt, T.text, { italic: true, op: 0.7 }))
  })
  return out
}

function layoutJustified(segs: Segment[], tier: Tier, cols: number, T: Palette, force: boolean): Span[] | null {
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
    if (p.extra) out.push(sp(T, ' ' + p.extra, T.text))
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
    spans = layoutJustified(segs, 'narrow', cols, T, false)
    tier = 'narrow'
  }
  if (!spans) {
    spans = truncate(layoutJustified(segs, 'micro', cols, T, true)!, cols)
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
      extra = seg.kind === 'seven_day' ? (seg.resetAt ?? '') : 'in ' + fmtDur(seg.resetMin)
    }
    const out: FlexSegment = {
      kind: seg.kind,
      label,
      bar: seg.hasBar ? slicesOf(seg, T, bars) : null,
      pct: sp(T, pctText, pc.color, { live: pc.live, op: pc.op, bold: true }),
      extra,
    }
    if (seg.hasBar && dotCount && dotCount > 0) out.dots = dotsOf(seg, dotCount, T, bars)
    return out
  })
  const staleTxt = s.stale && s.auth && !s.loading && lastWin >= 0 ? sp(T, 'stale ' + s.staleAge, T.text, { italic: true, op: 0.7 }) : null
  return { segments, text: T.text, separator: mix(T.text, T.bg, 0.4), stale: staleTxt }
}
