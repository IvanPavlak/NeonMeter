// The band builder: a line-for-line port of the design canvas's builder (the
// appendix of the approved design specification), with three deliberate
// differences: the cell is `━` (a continuous bar); ramp coloring, an option beside the default level coloring;
// and the reset field's display and color options (`resetAs`, `resetColor`), whose defaults draw the design's
// text. Pure functions from a reading to the spans of one row; no `$`, no elements.

import { mix } from './color'
import { HANDOFF_LABEL } from './handoff'

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
  /** The six context category colors, in `CONTEXT_PARTS` order. */
  parts: readonly string[]
}

/**
 * The context's categories as the desktop app's own breakdown lists them, in
 * its order: the five that fill the window, then the autocompact buffer, the
 * room the engine keeps free for compacting.
 */
export const CONTEXT_PARTS = ['messages', 'systemTools', 'mcpTools', 'skills', 'other', 'buffer'] as const
export type ContextPartKey = (typeof CONTEXT_PARTS)[number]

/** Each category's name, as the desktop app's breakdown spells it. */
export const CONTEXT_PART_LABELS: Record<ContextPartKey, string> = {
  messages: 'Messages',
  systemTools: 'System tools',
  mcpTools: 'MCP tools',
  skills: 'Skills',
  other: 'Other',
  buffer: 'Autocompact buffer',
}

/**
 * The default category colors per theme: the desktop app's own hues (blue,
 * orange, green, amber, and grey for the buffer) in the band's neon, lime for
 * the rest, which the app draws in no color of its own.
 */
export const DEFAULT_PART_COLORS: Record<Theme, readonly string[]> = {
  dark: ['#1E90FF', '#FF5F1F', '#00D45A', '#FFF01F', '#39FF14', '#6E7681'],
  light: ['#1874D2', '#E84A00', '#139A43', '#A89200', '#32A800', '#8C959F'],
}

export const THEMES: Record<Theme, Palette> = {
  dark: {
    bg: '#0D1117',
    text: '#FFFFFF',
    track: '#21262D',
    neutral: '#6E7681',
    ramp: ['#1E90FF', '#39FF14', '#00D45A', '#FFF01F', '#FF5F1F', '#FF073A'],
    parts: DEFAULT_PART_COLORS.dark,
  },
  light: {
    bg: '#FFFFFF',
    text: '#000000',
    track: '#EBEDF0',
    neutral: '#8C959F',
    ramp: ['#1874D2', '#32A800', '#139A43', '#A89200', '#E84A00', '#E8001F'],
    parts: DEFAULT_PART_COLORS.light,
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
 * range bounds, the five time range bounds, the six range colors and the six
 * context category colors per theme, and the bar cell. Anything left out is
 * the default, so calling it with nothing restores the design.
 */
export function configureDesign(
  design: {
    bounds?: readonly number[]
    timeBounds?: readonly number[]
    dark?: readonly string[]
    light?: readonly string[]
    partsDark?: readonly string[]
    partsLight?: readonly string[]
    cell?: string
  } = {},
): void {
  bounds = design.bounds ?? DEFAULT_BOUNDS
  timeBounds = design.timeBounds ?? DEFAULT_TIME_BOUNDS
  THEMES.dark.ramp = design.dark ?? DEFAULT_RAMPS.dark
  THEMES.light.ramp = design.light ?? DEFAULT_RAMPS.light
  THEMES.dark.parts = design.partsDark ?? DEFAULT_PART_COLORS.dark
  THEMES.light.parts = design.partsLight ?? DEFAULT_PART_COLORS.light
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
/** `breakdown` splits the context bar into its categories; `percent` colors it by its percent, as every other bar. */
export type ContextBar = 'breakdown' | 'percent'
/**
 * Where the button sits in the row: before the first segment, before
 * the Context segment or after the last, taking room from the bars like any
 * other piece.
 */
export type ButtonPosition = 'start' | 'context' | 'end'

/**
 * The frame, a glowing border: `appear` draws it once a percent reaches `at`,
 * `always` whenever there is a percent; around each segment that qualifies
 * (`segment`), around the band's row (`band`) or neither (`none`); in the
 * percent's range color, or in `color` when one is set. `outline` adds a
 * border around the whole band's card, shown by the same rule once any
 * segment qualifies: in one color (`single`) or each section's stretch of it
 * in that section's color (`sections`).
 */
export type BorderInput = { show: 'appear' | 'always'; at: number; scope: 'segment' | 'band' | 'none'; color?: string; outline?: 'single' | 'sections' }

/** A frame as the desktop draws it: its color, and whether it pulses with the band. */
export type Frame = { color: string; live: boolean }

/** One run of same-styled characters. `color` is final: blends are applied. */
export type Span = {
  text: string
  color: string
  bold?: boolean
  italic?: boolean
  /** A live cell run or percent: it pulses in its own color. */
  live?: boolean
  /** The button's cell: a press on it compacts the conversation. */
  button?: boolean
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
  /**
   * The window by category, in tokens (the engine's estimates, as /context
   * counts them): absent until the engine gave a breakdown, and then the bar
   * is colored by its percent whatever `contextBar` says.
   */
  parts?: Readonly<Record<ContextPartKey, number>> & { rows?: readonly ContextDetailRow[] }
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
  /** How the context bar is colored; absent, by its percent. */
  contextBar?: ContextBar
  /** Where the button sits; absent or null, no button. */
  button?: ButtonPosition | null
  /** What the button's hover card says it does; absent, the built-in handoff prompt's name. */
  buttonLabel?: string
  /** The frame; absent, none. */
  border?: BorderInput
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
  /** The context bar's categories, when it is split by them. */
  parts?: Readonly<Record<ContextPartKey, number>> & { rows?: readonly ContextDetailRow[] }
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
    const ctx: Segment = { kind: 'ctx', pct: s.ctx.tokens == null ? null : s.ctx.pct, tokens: s.ctx.tokens, window: s.ctx.window, hasBar: true }
    if (s.contextBar === 'breakdown' && s.ctx.parts && s.ctx.tokens != null) ctx.parts = s.ctx.parts
    all.push(ctx)
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

/** The context's tokens in the five categories that fill the window. */
function usedOf(parts: Readonly<Record<ContextPartKey, number>>): number {
  let used = 0
  for (const key of CONTEXT_PARTS) if (key !== 'buffer') used += Math.max(0, parts[key])
  return used
}

/** The autocompact buffer's share of the bar, in hundredths, within what the percent leaves. */
function bufferShare(seg: Segment, pct: number): number {
  const parts = seg.parts!
  const share = seg.window ? (Math.max(0, parts.buffer) / seg.window) * 100 : 0
  return Math.max(0, Math.min(100 - pct, share))
}

/** One cell of a context bar split by category: its color, whether it pulses and whether it glows. */
type PartCell = { color: string; live: boolean; halo: boolean }

/**
 * The filled cells of a context bar of `len` split by category: the percent's
 * cells shared among the five used categories in proportion to their tokens
 * (largest remainder, in the breakdown's order), then the autocompact buffer's
 * cells, still and without a halo, as the room kept free is not use. Null
 * when the breakdown names no use, so the bar is colored by its percent.
 */
function partCells(seg: Segment, len: number, T: Palette): PartCell[] | null {
  const parts = seg.parts
  if (!parts) return null
  const used = usedOf(parts)
  if (used <= 0) return null
  const pct = seg.pct == null ? 0 : Math.min(seg.pct, 100)
  const f = pct <= 0 ? 0 : Math.max(1, Math.round((pct / 100) * len))
  const keys = CONTEXT_PARTS.filter(k => k !== 'buffer')
  const quotas = keys.map(k => (f * Math.max(0, parts[k])) / used)
  const counts = quotas.map(Math.floor)
  let left = f - counts.reduce((a, b) => a + b, 0)
  const order = quotas.map((q, i) => ({ i, rest: q - Math.floor(q) })).sort((a, b) => b.rest - a.rest || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    counts[i]! += 1
    left -= 1
  }
  const out: PartCell[] = []
  keys.forEach((k, i) => {
    for (let n = 0; n < counts[i]!; n++) out.push({ color: T.parts[CONTEXT_PARTS.indexOf(k)]!, live: true, halo: true })
  })
  const buffer = Math.min(len - out.length, Math.round((bufferShare(seg, pct) / 100) * len))
  for (let n = 0; n < buffer; n++) out.push({ color: T.parts[5]!, live: false, halo: false })
  return out
}

/** The slices of a context bar split by category, weights in hundredths of the bar (see `partCells`). */
function partSlices(seg: Segment, T: Palette): FlexSlice[] | null {
  const parts = seg.parts
  if (!parts) return null
  const used = usedOf(parts)
  if (used <= 0) return null
  const pct = seg.pct == null ? 0 : Math.min(seg.pct, 100)
  const out: FlexSlice[] = []
  CONTEXT_PARTS.forEach((k, i) => {
    if (k === 'buffer' || parts[k] <= 0 || pct <= 0) return
    out.push({ grow: (pct * parts[k]) / used, color: T.parts[i]!, live: true })
  })
  const buffer = bufferShare(seg, pct)
  if (buffer > 0) out.push({ grow: buffer, color: T.parts[5]!, halo: false })
  if (pct + buffer < 100) out.push({ grow: 100 - pct - buffer, color: T.track })
  return out
}

function pushBar(out: Span[], seg: Segment, len: number, T: Palette, bars: BarColoring): void {
  if (seg.loading) {
    out.push(sp(T, rep(CELL, len), T.neutral, { live: true }))
    return
  }
  const cells = partCells(seg, len, T)
  if (cells) {
    // Cells of one color and liveness become one span.
    let run = ''
    let at: PartCell | null = null
    for (const c of cells) {
      if (at && (c.color !== at.color || c.live !== at.live)) {
        out.push(sp(T, run, at.color, { live: at.live }))
        run = ''
      }
      at = c
      run += CELL
    }
    if (run && at) out.push(sp(T, run, at.color, { live: at.live }))
    if (len - cells.length > 0) out.push(sp(T, rep(CELL, len - cells.length), T.track))
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

/**
 * The layouts below fill `starts` with the index of the span each segment's
 * label opens with (after its separator), where the button can go.
 */
function layoutBars(segs: Segment[], tier: Tier, s: BandInput, cols: number, T: Palette, bars: BarColoring, starts: number[] = []): Span[] | null {
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
    starts[i] = out.length
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

function layoutJustified(segs: Segment[], tier: Tier, cols: number, T: Palette, force: boolean, color: ResetColor | undefined, starts: number[] = []): Span[] | null {
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
    starts[i] = out.length
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

/**
 * `rule` is the line the terminal draws over the band when a frame shows: the
 * rule's own `─` in the prompt border's theme key, and over each framed
 * segment (or the whole width under scope `band`) a `━` stretch in the
 * frame's color, live while it pulses.
 */
export type Band = { tier: Tier; spans: Span[]; rule?: Span[] }

/** The terminal rule's glyph and theme key, and the glyph of a frame's stretch of it. */
export const RULE_GLYPH = '─'
export const RULE_KEY = 'promptBorder'
export const FRAME_GLYPH = '━'

/** The columns each segment takes in `spans`, from its label to the end of its last field: `starts` holds the span each opens with. */
function segmentColumns(spans: readonly Span[], starts: readonly number[]): [number, number][] {
  const colOf: number[] = []
  let col = 0
  for (const span of spans) {
    colOf.push(col)
    col += Array.from(span.text).length
  }
  colOf.push(col)
  // A segment ends where the next one's separator begins, the span before its label.
  return starts.map((start, i) => [colOf[start] ?? col, i + 1 < starts.length ? (colOf[starts[i + 1]! - 1] ?? col) : col])
}

/** The rule over `cols` columns with each frame's stretch drawn in, or null when no frame shows. */
function ruleOf(cols: number, stretches: { from: number; to: number; frame: Frame }[]): Span[] | null {
  if (!stretches.length) return null
  const out: Span[] = []
  let at = 0
  for (const { from, to, frame } of [...stretches].sort((a, b) => a.from - b.from)) {
    const a = Math.max(at, Math.min(cols, from))
    const b = Math.max(a, Math.min(cols, to))
    if (a > at) out.push({ text: rep(RULE_GLYPH, a - at), color: RULE_KEY })
    if (b > a) out.push(frame.live ? { text: rep(FRAME_GLYPH, b - a), color: frame.color, live: true } : { text: rep(FRAME_GLYPH, b - a), color: frame.color })
    at = b
  }
  if (cols > at) out.push({ text: rep(RULE_GLYPH, cols - at), color: RULE_KEY })
  return out
}

/**
 * Builds one row of exactly `cols` cells: the most detailed tier that fits.
 * Null when there is nothing to draw.
 */
export function band(s: BandInput, cols: number, theme: Theme, bars: BarColoring): Band | null {
  const T = THEMES[theme]
  const segs = segmentsOf(s)
  if (!segs.length) return null
  // The button takes its cell and a space.
  const button = s.button && s.ctx && s.ctx.tokens != null ? buttonSpan(s.ctx, T) : null
  const width = button ? Math.max(1, cols - 2) : cols
  const starts: number[] = []
  let spans = layoutBars(segs, 'full', s, width, T, bars, starts)
  let tier: Tier = 'full'
  if (!spans) {
    spans = layoutBars(segs, 'compact', s, width, T, bars, starts)
    tier = 'compact'
  }
  if (!spans) {
    spans = layoutJustified(segs, 'narrow', width, T, false, s.resetColor, starts)
    tier = 'narrow'
  }
  if (!spans) {
    spans = truncate(layoutJustified(segs, 'micro', width, T, true, s.resetColor, starts)!, width)
    tier = 'micro'
  }
  const ctxAt = segs.findIndex(seg => seg.kind === 'ctx')
  // The button's cell and its space (two columns) shift every segment from where it goes on.
  const shiftFrom = button ? (s.button === 'start' ? 0 : s.button === 'context' && ctxAt >= 0 ? ctxAt : segs.length) : -1
  const columns = segmentColumns(spans, starts).map(([a, b], i): [number, number] => (shiftFrom >= 0 && i >= shiftFrom ? [a + 2, b + 2] : [a, b]))
  if (button) spans = placeButton(spans, s.button!, button, T, starts[ctxAt])
  const out: Band = { tier, spans }
  const rule = s.border ? ruleOf(cols, frameStretches(segs, columns, s, T, cols)) : null
  if (rule) out.rule = rule
  return out
}

/**
 * Where the frames sit on the rule: the outline across the whole width (under
 * `sections` each segment's stretch reaching halfway to its neighbours), else
 * the whole width under scope `band`, else over each framed segment's columns.
 */
function frameStretches(segs: readonly Segment[], columns: readonly [number, number][], s: BandInput, T: Palette, cols: number): { from: number; to: number; frame: Frame }[] {
  const outline = outlineOf(segs, s.border, T)
  if (outline) {
    return outline.map((frame, i) => {
      const from = i === 0 ? 0 : Math.ceil((columns[i - 1]![1] + columns[i]![0]) / 2)
      const to = i === outline.length - 1 ? cols : Math.ceil((columns[i]![1] + columns[i + 1]![0]) / 2)
      return { from, to, frame }
    })
  }
  if (s.border!.scope === 'band') {
    const frame = bandFrame(segs, s.border, T)
    return frame ? [{ from: 0, to: cols, frame }] : []
  }
  if (s.border!.scope === 'none') return []
  const out: { from: number; to: number; frame: Frame }[] = []
  segs.forEach((seg, i) => {
    const frame = seg.loading ? null : frameOf(seg.pct, seg.stale === true, s.border, T)
    const at = columns[i]
    if (frame && at) out.push({ from: at[0], to: at[1], frame })
  })
  return out
}

/** The button's cell: `◉` in the context percent's range color, pulsing with the band. */
export const BUTTON_GLYPH = '◉'

function buttonSpan(ctx: ContextInput, T: Palette): Span {
  return { text: BUTTON_GLYPH, color: T.ramp[rampIndex(ctx.pct)]!, bold: true, live: true, button: true }
}

/**
 * The row with the button in its place, one space from its neighbor:
 * `start`, before the Context segment's label at `ctxStart`, or `end`.
 * Without a Context segment in the row, `context` is the end.
 */
function placeButton(spans: Span[], at: ButtonPosition, button: Span, T: Palette, ctxStart: number | undefined): Span[] {
  const gap = (n: number) => sp(T, rep(' ', n), T.text)
  if (at === 'start') return [button, gap(1), ...spans]
  if (at === 'context' && ctxStart !== undefined && ctxStart < spans.length) return [...spans.slice(0, ctxStart), button, gap(1), ...spans.slice(ctxStart)]
  return [...spans, gap(1), button]
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

/** One stretch of a desktop bar: `grow` of 100, in `color`; `live` pulses; `halo: false` draws it without a halo (the autocompact buffer). */
export type FlexSlice = { grow: number; color: string; live?: boolean; halo?: false }

/** One dot of a desktop dot bar; `halo: false` draws it without a halo. */
export type FlexDot = { color: string; live?: boolean; halo?: false }

export type FlexSegment = {
  kind: SegmentKind
  label: string
  /** The narrow tiers' label (`5h`, `7d`, `Ctx`, `Fab`), which `fitDesktop` takes when the full one does not fit. */
  short?: string
  /** The bar's slices, weights summing to 100; null for a spend limit (no bar). */
  bar: FlexSlice[] | null
  /** The same bar as dots, when the row was built with a dot count; spread evenly by the layout. */
  dots?: FlexDot[]
  pct: Span
  /** The reset time or the token count, drawn after the percent; '' when none. */
  extra: string
  /** The reset in its time color, set under `resetColor: time`: drawn with the percent's halo, and live while fresh. Absent, `extra` is plain text. */
  extraSpan?: Span
  /** The frame around this segment, under `border` scope `segment`. */
  frame?: Frame
}

/**
 * The button as the desktop draws it: where it sits, its ring (the
 * context percent as slices of 100, colored as the bars are) and its label
 * for a reader of the drawing.
 */
export type FlexButton = { position: ButtonPosition; ring: FlexSlice[]; label: string }

/**
 * One row of the context breakdown the desktop shows on hover: `Messages:
 * 25.5k, 2.6%` in its category color, or the card's title line without a dot.
 */
export type ContextRow = { key: string; text: string; color: string; live: boolean; halo: boolean; dot?: false }

/** One row of the engine's breakdown, as the hooks module keeps it. */
export type ContextDetailRow = { name: string; tokens: number; kind: 'used' | 'free' | 'buffer' | 'deferred' }

export type FlexRow = {
  segments: FlexSegment[]
  text: string
  separator: string
  /** The stale marker after the last window segment, when the reading is stale. */
  stale: Span | null
  /** The button, when it shows. */
  button?: FlexButton
  /** The context breakdown's rows, when the context bar is split by category. */
  context?: ContextRow[]
  /** The frame around the whole band, under `border` scope `band`. */
  frame?: Frame
  /** The outline around the band's card: each segment's color for its stretch, in segment order (one color for all under `single`). */
  outline?: Frame[]
}

function slicesOf(seg: Segment, T: Palette, bars: BarColoring): FlexSlice[] {
  if (seg.loading) return [{ grow: 100, color: T.neutral, live: true }]
  const split = partSlices(seg, T)
  if (split) return split
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
  const cells = partCells(seg, len, T)
  if (cells) {
    const out: FlexDot[] = cells.map(c => (c.live ? { color: c.color, live: true } : c.halo ? { color: c.color } : { color: c.color, halo: false }))
    while (out.length < len) out.push({ color: T.track })
    return out
  }
  const { colors, live, op } = filledCells(seg, len, T, bars)
  const out: FlexDot[] = colors.map(c => (live ? { color: mix(c, T.bg, op), live: true } : { color: mix(c, T.bg, op) }))
  while (out.length < len) out.push({ color: T.track })
  return out
}

/**
 * A segment's frame: none while loading or before its first reading; from
 * `at` percent on, or at any percent under `always`, in the percent's range
 * color as its percent and bar are drawn, or the one `color` set. A stale
 * segment's frame fades and holds still with the rest of it.
 */
export function frameOf(pct: number | null | undefined, stale: boolean, border: BorderInput | undefined, T: Palette): Frame | null {
  if (!border || pct == null) return null
  if (pct < border.at && border.show !== 'always') return null
  const color = border.color ?? T.ramp[rampIndex(pct)]!
  return stale ? { color: mix(color, T.bg, 0.45), live: false } : { color, live: true }
}

/** The band's fullest segment with a percent, fresh before stale at the same percent. */
function fullest(segs: readonly Segment[]): Segment | null {
  let best: Segment | null = null
  for (const seg of segs) {
    if (seg.loading || seg.pct == null) continue
    if (!best || seg.pct > best.pct! || (seg.pct === best.pct && best.stale && !seg.stale)) best = seg
  }
  return best
}

/** The band's frame: that of its fullest segment. */
function bandFrame(segs: readonly Segment[], border: BorderInput | undefined, T: Palette): Frame | null {
  const best = fullest(segs)
  return best ? frameOf(best.pct, best.stale === true, border, T) : null
}

/**
 * The outline's colors, one per segment, or null when it does not show: it
 * shows once the fullest segment's frame would (from `at`, or always), and
 * then every stretch is drawn, under `sections` in its own segment's color
 * at any percent (a segment still loading or before its first reading in the
 * neutral color, still), under `single` in the fullest segment's.
 */
function outlineOf(segs: readonly Segment[], border: BorderInput | undefined, T: Palette): Frame[] | null {
  if (!border?.outline) return null
  const best = fullest(segs)
  const shown = best ? frameOf(best.pct, best.stale === true, border, T) : null
  if (!shown) return null
  if (border.outline === 'single') return segs.map(() => shown)
  const always = { ...border, show: 'always' } as const
  return segs.map(seg => (seg.loading || seg.pct == null ? { color: T.neutral, live: false } : frameOf(seg.pct, seg.stale === true, always, T)!))
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
  // The outline frames the whole band: while it shows, neither the segments nor the row draw a frame of their own.
  const outline = outlineOf(segs, s.border, T)
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
      short: seg.label ? seg.label.short : LABELS.short[seg.kind],
      bar: seg.hasBar ? slicesOf(seg, T, bars) : null,
      pct: sp(T, pctText, pc.color, { live: pc.live, op: pc.op, bold: true }),
      extra,
    }
    if (seg.hasBar && dotCount && dotCount > 0) out.dots = dotsOf(seg, dotCount, T, bars)
    const frame = s.border?.scope === 'segment' && !seg.loading && !outline ? frameOf(seg.pct, seg.stale === true, s.border, T) : null
    if (frame) out.frame = frame
    if (extra && s.resetColor === 'time' && seg.kind !== 'ctx' && seg.resetMin != null) {
      const tc = timeColor(seg, T)
      out.extraSpan = sp(T, extra, tc.color, { live: tc.live, op: tc.op })
    }
    return out
  })
  const staleTxt = s.stale && s.auth && !s.loading && lastWin >= 0 ? sp(T, 'stale ' + s.staleAge, T.text, { italic: true, op: 0.7 }) : null
  const row: FlexRow = { segments, text: T.text, separator: mix(T.text, T.bg, 0.4), stale: staleTxt }
  if (outline) row.outline = outline
  const frame = s.border?.scope === 'band' && !outline ? bandFrame(segs, s.border, T) : null
  if (frame) row.frame = frame
  const ring = s.button && s.ctx ? buttonRing(s.ctx, T, bars) : null
  if (ring) row.button = { position: s.button!, ring, label: `${s.buttonLabel ?? HANDOFF_LABEL} (${Math.round(s.ctx!.pct)}% of the context used)` }
  // The hover card hangs on the Context segment, whichever way its bar is colored.
  if (s.ctx?.parts && s.ctx.tokens != null && usedOf(s.ctx.parts) > 0 && segs.some(seg => seg.kind === 'ctx')) row.context = contextRows(s.ctx.parts, s.ctx.window, T, s.ctx.tokens)
  return row
}

/** The button's ring: the context percent as a bar's slices, colored by `barColoring`; null before the first response. */
function buttonRing(ctx: ContextInput, T: Palette, bars: BarColoring): FlexSlice[] | null {
  if (ctx.tokens == null) return null
  return slicesOf({ kind: 'ctx', pct: ctx.pct, tokens: ctx.tokens, window: ctx.window, hasBar: true }, T, bars)
}

/** Tokens as the desktop app's own breakdown writes them: `850`, `6.7k`, `25.5k`, `33k`, `1.2M`. */
export function fmtTokFine(n: number): string {
  if (n >= 1_000_000) return +(n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1000) return +(n / 1000).toFixed(1) + 'k'
  return String(Math.round(n))
}

/** A share of the window to two significant digits, halves up, as the desktop app writes it: `2.6%`, `0.67%`, `29%`. */
export function fmtShare(pct: number): string {
  // A hair over the value, so 2.55 (which binary keeps as 2.5499...) rounds up as written.
  return pct > 0 ? +(pct * (1 + 1e-9)).toPrecision(2) + '%' : '0%'
}

/**
 * The breakdown's rows in the desktop app's order, one per category that
 * holds tokens: `Messages: 25.5k, 2.6%`, the share of the whole window. The
 * used ones pulse and glow as the bar's slices do; the autocompact buffer is
 * the room kept free, still and without a halo.
 */
export function contextRows(parts: Readonly<Record<ContextPartKey, number>> & { rows?: readonly ContextDetailRow[] }, window: number, T: Palette, tokens?: number): ContextRow[] {
  if (parts.rows?.length) return everyContextRow(parts.rows, window, T, tokens)
  const out: ContextRow[] = []
  CONTEXT_PARTS.forEach((key, i) => {
    const tokens = Math.max(0, parts[key])
    if (tokens <= 0) return
    const used = key !== 'buffer'
    out.push({ key, text: `${CONTEXT_PART_LABELS[key]}: ${fmtTokFine(tokens)}, ${fmtShare(window > 0 ? (tokens / window) * 100 : 0)}`, color: T.parts[i]!, live: used, halo: used })
  })
  return out
}

const PART_KEY_OF: Readonly<Record<string, ContextPartKey>> = { Messages: 'messages', 'System tools': 'systemTools', 'MCP tools': 'mcpTools', Skills: 'skills' }

/**
 * The card as the desktop app's own context panel lists it: a title line
 * (`Context window: 61.8k / 1M (6%)`), the four named categories in their
 * colors, largest first, every other row in use in Other's color (the system
 * prompt, memory files, MCP server instructions, agents), largest first, then
 * the autocompact buffer, the free space and the tools loaded on demand, which
 * sit outside the window (`—` for their share). Only the rows in use pulse
 * and glow.
 */
function everyContextRow(rows: readonly ContextDetailRow[], window: number, T: Palette, tokens?: number): ContextRow[] {
  const share = (n: number) => fmtShare(window > 0 ? (n / window) * 100 : 0)
  const row = (r: ContextDetailRow, color: string, used: boolean, tail = share(r.tokens)): ContextRow => ({ key: r.name, text: `${r.name}: ${fmtTokFine(r.tokens)}, ${tail}`, color, live: used, halo: used })
  const big = (a: ContextDetailRow, b: ContextDetailRow) => b.tokens - a.tokens
  const used = rows.filter(r => r.kind === 'used')
  const out: ContextRow[] = []
  if (tokens != null && window > 0) out.push({ key: 'title', text: `Context window: ${fmtTokFine(tokens)} / ${fmtTokFine(window)} (${Math.round((tokens / window) * 100)}%)`, color: T.text, live: false, halo: false, dot: false })
  for (const r of used.filter(r => PART_KEY_OF[r.name]).sort(big)) out.push(row(r, T.parts[CONTEXT_PARTS.indexOf(PART_KEY_OF[r.name]!)]!, true))
  for (const r of used.filter(r => !PART_KEY_OF[r.name]).sort(big)) out.push(row(r, T.parts[CONTEXT_PARTS.indexOf('other')]!, true))
  for (const r of rows.filter(r => r.kind === 'buffer')) out.push(row(r, T.parts[CONTEXT_PARTS.indexOf('buffer')]!, false))
  for (const r of rows.filter(r => r.kind === 'free')) out.push(row(r, mix(T.text, T.bg, 0.45), false))
  for (const r of rows.filter(r => r.kind === 'deferred')) out.push(row(r, mix(T.text, T.bg, 0.45), false, '—'))
  return out
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
  const { text, bars } = desktopText(row)
  if (bars === 0) return 0
  return Math.max(4, Math.floor(((bodyColumns * 1.2 - text) / bars) * 0.75))
}

/**
 * The characters the desktop row's fixed pieces take, as `desktopDotCount`
 * counts them, and how many bars share the rest. The button's drawing and its
 * gap take about three characters; a frame's room at either end about six,
 * and beside a frame the separator is one space.
 */
function desktopText(row: FlexRow): { text: number; bars: number } {
  let text = (row.stale ? row.stale.text.length + 2 : 0) + (row.button ? 3 : 0) + (row.frame ? FRAME_CHARS : 0)
  row.segments.forEach((seg, i) => {
    if (seg.frame) text += FRAME_CHARS
    if (i > 0) text += seg.frame || row.segments[i - 1]!.frame ? 1 : 3
  })
  let bars = 0
  for (const seg of row.segments) {
    text += seg.label.length + 1 + seg.pct.text.length + (seg.extra ? seg.extra.length + 1 : 0)
    if (seg.bar) {
      bars++
      text += 1
    }
  }
  return { text, bars }
}

/** The characters a frame's room at either end takes in the desktop row. */
const FRAME_CHARS = 6

/** Whether the desktop row's text, and four characters for each bar, fit a band `bodyColumns` wide. */
function fitsDesktop(row: FlexRow, bodyColumns: number): boolean {
  const { text, bars } = desktopText(row)
  return bodyColumns * 1.2 - text >= bars * 4
}

/**
 * The row with its segments' and its row's frames left out when they and the
 * text would leave a bar less than four characters in a band `bodyColumns`
 * wide: a frame's room is fixed. The outline takes no room and stays.
 */
export function fitFrames(row: FlexRow, bodyColumns: number): FlexRow {
  if (!row.frame && !row.segments.some(seg => seg.frame)) return row
  if (fitsDesktop(row, bodyColumns)) return row
  const { frame: _, ...rest } = row
  return { ...rest, segments: row.segments.map(({ frame: _f, ...seg }) => seg) }
}

/** A window's countdown without its `in ` (`3h13m`), a clock time as it is; the context's tokens left out. */
function compactExtra(seg: FlexSegment): FlexSegment {
  if (seg.kind === 'ctx') return { ...seg, extra: '' }
  const extra = seg.extra.startsWith('in ') ? seg.extra.slice(3) : seg.extra
  return seg.extraSpan ? { ...seg, extra, extraSpan: { ...seg.extraSpan, text: extra } } : { ...seg, extra }
}

/**
 * The desktop row in a band `bodyColumns` wide, made narrower one step at a
 * time until its text leaves every bar room, as the terminal's tiers do: the
 * frames left out (`fitFrames`), then the short labels (`5h`, `7d`, `Ctx`),
 * then the resets as bare countdowns and no token count, then no fields and
 * no stale marker, then no bars. The widest step that fits is the row drawn;
 * past the last, what is left is cut at the band's edge.
 */
export function fitDesktop(row: FlexRow, bodyColumns: number): FlexRow {
  let out = fitFrames(row, bodyColumns)
  const steps: ((r: FlexRow) => FlexRow)[] = [
    r => ({ ...r, segments: r.segments.map(seg => ({ ...seg, label: seg.short ?? seg.label })) }),
    r => ({ ...r, segments: r.segments.map(compactExtra) }),
    r => ({ ...r, stale: null, segments: r.segments.map(({ extraSpan: _s, ...seg }) => ({ ...seg, extra: '' })) }),
    r => ({ ...r, segments: r.segments.map(({ dots: _d, ...seg }) => ({ ...seg, bar: null })) }),
  ]
  for (const step of steps) {
    if (fitsDesktop(out, bodyColumns)) return out
    out = step(out)
  }
  return out
}
