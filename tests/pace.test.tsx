import { describe, expect, test } from 'claude-code/testing'

import type { BandInput, PaceStyle, Span } from '../hooks/builder'
import { band, flexRow, paceOf, textOf as textOfSpans, THEMES, TICK_GLYPH, warnMin } from '../hooks/builder'
import { mix } from '../hooks/color'
import type { DesktopOptions } from '../hooks/drawings'
import { dotBarSvg, smoothBarSvg } from '../hooks/drawings'
import { changeKey, parseOptions } from '../hooks/register'
import { mountBand, rowOf, setup, start } from './kit'

// The pace: the share of a window already gone, marked on its bar (`pace`),
// the time it runs out in place of its reset (`paceWarn`) and its hover card
// (`windowPopup`). All three are off by default, and the golden rows pin that
// the default row is unchanged; these tests cover the options.

// The 5-hour window: 62% used with 165 of 300 minutes to run, so 45% of it is
// gone: ahead of the pace, landing at 138% and running out in 83 minutes. The
// weekly one: 30% used with 4536 of 10080 minutes to run, 55% gone: behind it.
const input = (more: Partial<BandInput> = {}): BandInput => ({
  auth: true,
  loading: false,
  stale: false,
  staleAge: '',
  windows: [
    { kind: 'five_hour', pct: 62, resetMin: 165, resetAt: '14:45' },
    { kind: 'seven_day', pct: 30, resetMin: 4536, resetAt: 'Sun 15:36', resetAs: 'countdown' },
  ],
  ctx: { pct: 64, tokens: 128000, window: 200000 },
  segments: ['five_hour', 'seven_day', 'context'],
  ...more,
})

const GREEN = '#00D45A'
const BLUE = '#1E90FF'
const RED = '#FF073A'
const T = THEMES.dark

/** Each bar of a full-tier row: the cells between a label and its percent, with the spans that draw them. */
function barsOf(spans: readonly Span[]): { text: string; spans: Span[] }[] {
  const out: { text: string; spans: Span[] }[] = []
  let at: { text: string; spans: Span[] } | null = null
  for (const span of spans) {
    const isBar = /^[━╍┃]+$/.test(span.text)
    if (isBar) {
      at ??= { text: '', spans: [] }
      at.text += span.text
      at.spans.push(span)
    } else if (at) {
      out.push(at)
      at = null
    }
  }
  if (at) out.push(at)
  return out
}

const rowWith = (pace: PaceStyle) => band(input({ pace }), 120, 'dark', 'level')!

test('the pace is the share of the window gone, and the projection the use so far carried to the reset', () => {
  const pace = paceOf('five_hour', 62, 165)!
  expect(pace.elapsed).toBe(45)
  expect(Math.round(pace.projected!)).toBe(138)
  expect(pace.outMin).toBe(83)
  // Behind the pace nothing runs out.
  expect(paceOf('seven_day', 30, 4536)).toMatchObject({ elapsed: 55, outMin: null })
  // In the first tenth of a window a few minutes' use is no projection.
  expect(paceOf('five_hour', 8, 285)).toMatchObject({ elapsed: 5, projected: null, outMin: null })
  // A spend limit has no length, a window without a reset no pace.
  expect(paceOf('spend_limit', 40, 100)).toBeNull()
  expect(paceOf('five_hour', 40, null)).toBeNull()
})

test('the three options are off by default and take only their own values', () => {
  const defaults = parseOptions({}).parsed
  expect([defaults.pace, defaults.paceWarn, defaults.windowPopup]).toEqual(['off', 'off', false])
  const set = parseOptions({ pace: 'both', paceWarn: 'all', windowPopup: true }).parsed
  expect([set.pace, set.paceWarn, set.windowPopup]).toEqual(['both', 'all', true])
  const bad = parseOptions({ pace: 'sprint', paceWarn: 'appear', windowPopup: 'yes' }).parsed
  expect([bad.pace, bad.paceWarn, bad.windowPopup]).toEqual(['off', 'off', false])
})

describe('terminal', () => {
  test('off, the row is the design: no tick, no stripes, the resets as ever', () => {
    const off = band(input(), 120, 'dark', 'level')!
    expect(textOfSpans(off.spans)).not.toMatch(/[╍┃]/)
    expect(textOfSpans(off.spans)).toContain(' 62% in 2h45m')
  })

  test('tick puts one still cell in the text color where the even pace is, and moves nothing', () => {
    const off = band(input(), 120, 'dark', 'level')!
    const on = rowWith('tick')
    expect(textOfSpans(on.spans).length).toBe(120)
    expect(textOfSpans(on.spans).replace(/┃/g, '━')).toBe(textOfSpans(off.spans))
    const [five, weekly, ctx] = barsOf(on.spans)
    expect(five!.text.indexOf(TICK_GLYPH)).toBe(Math.floor(0.45 * five!.text.length))
    expect(weekly!.text.indexOf(TICK_GLYPH)).toBe(Math.floor(0.55 * weekly!.text.length))
    // The context has no window: no pace.
    expect(ctx!.text).not.toContain(TICK_GLYPH)
    const tick = five!.spans.find(s => s.text === TICK_GLYPH)!
    expect(tick.color).toBe(T.text)
    expect(tick.live).toBeUndefined()
  })

  test('stripes: ahead of the pace the fill past it is striped and live; behind it the room up to it, dim and still', () => {
    const [five, weekly] = barsOf(rowWith('stripes').spans)
    const len = five!.text.length
    const filled = Math.round(0.62 * len)
    const from = Math.round(0.45 * len)
    expect(five!.text).toBe('━'.repeat(from) + '╍'.repeat(filled - from) + '━'.repeat(len - filled))
    // Striped or not, the fill is one live run in the percent's color.
    expect(five!.spans[0]).toMatchObject({ text: '━'.repeat(from) + '╍'.repeat(filled - from), color: GREEN, live: true })

    const wlen = weekly!.text.length
    const wfilled = Math.round(0.3 * wlen)
    const to = Math.round(0.55 * wlen)
    expect(weekly!.text).toBe('━'.repeat(wfilled) + '╍'.repeat(to - wfilled) + '━'.repeat(wlen - to))
    const room = weekly!.spans.find(s => s.text.startsWith('╍'))!
    expect(room.color).toBe(mix(BLUE, T.bg, 0.45))
    expect(room.live).toBeUndefined()
  })

  test('both draws the stripes and the tick', () => {
    const [five] = barsOf(rowWith('both').spans)
    expect(five!.text).toContain('╍')
    expect(five!.text.indexOf(TICK_GLYPH)).toBe(Math.floor(0.45 * five!.text.length))
  })

  test('projection stripes from the fill to where the use lands at the reset, in that range color', () => {
    const [five, weekly] = barsOf(rowWith('projection').spans)
    const len = five!.text.length
    const filled = Math.round(0.62 * len)
    // 138%: past the end, so to the end, in the last range's color.
    expect(five!.text).toBe('━'.repeat(filled) + '╍'.repeat(len - filled))
    expect(five!.spans.find(s => s.text.startsWith('╍'))!.color).toBe(mix(RED, T.bg, 0.6))
    // 30% of a week at 55% of it lands at 55%: lime green.
    const wlen = weekly!.text.length
    expect(weekly!.text).toBe('━'.repeat(Math.round(0.3 * wlen)) + '╍'.repeat(Math.round((30 / 55) * wlen) - Math.round(0.3 * wlen)) + '━'.repeat(wlen - Math.round((30 / 55) * wlen)))
    expect(weekly!.spans.find(s => s.text.startsWith('╍'))!.color).toBe(mix('#39FF14', T.bg, 0.6))
  })

  test('a stale window keeps its marks, faded and still', () => {
    const [five] = barsOf(band(input({ pace: 'stripes', stale: true, staleAge: '5m' }), 120, 'dark', 'level')!.spans)
    expect(five!.text).toContain('╍')
    expect(five!.spans.every(s => !s.live)).toBe(true)
  })

  test('paceWarn: five_hour trades the 5-hour reset for the time it runs out, in red, live', () => {
    const row = band(input({ paceWarn: 'five_hour' }), 120, 'dark', 'level')!
    const text = textOfSpans(row.spans)
    expect(text.length).toBe(120)
    expect(text).toContain(' 62% out in 1h23m │')
    expect(text).toContain(' 30% in 3d3h')
    expect(row.spans.find(s => s.text === ' out in 1h23m')).toMatchObject({ color: RED, live: true })
  })

  test('the weekly limit warns under all alone, and no window warns while it is behind the pace', () => {
    const hot = (warn: 'five_hour' | 'all') => input({ paceWarn: warn, windows: [{ kind: 'seven_day', pct: 80, resetMin: 4536, resetAs: 'countdown' }] })
    expect(textOfSpans(band(hot('five_hour'), 120, 'dark', 'level')!.spans)).toContain(' 80% in 3d3h')
    expect(textOfSpans(band(hot('all'), 120, 'dark', 'level')!.spans)).toContain(' 80% out in 23h06m')
    expect(warnMin('all', { kind: 'seven_day', pct: 30, resetMin: 4536 })).toBeNull()
  })

  test('narrower layouts say out without the in, and the narrowest drops the field', () => {
    const at = (cols: number) => textOfSpans(band(input({ paceWarn: 'five_hour' }), cols, 'dark', 'level')!.spans)
    expect(at(80)).toContain(' 62% out 1h23m')
    expect(at(80)).not.toContain('out in')
    expect(at(30)).not.toContain('out')
  })

  test('a window starting to warn is a change for the responsive pulse; the minutes it counts are not', () => {
    const key = (pct: number, resetMin: number) => changeKey(input({ paceWarn: 'five_hour', windows: [{ kind: 'five_hour', pct, resetMin }] }))
    expect(key(44, 165)).not.toBe(key(46, 165))
    expect(changeKey(input({ paceWarn: 'five_hour' }))).toBe(changeKey(input({ paceWarn: 'five_hour', windows: [{ kind: 'five_hour', pct: 62, resetMin: 164, resetAt: '14:45' }, input().windows[1]!] })))
    // Without the option the key is the one it always was.
    expect(changeKey(input())).toContain('["five_hour","",62,null]')
  })

  test('the option reaches the band the engine draws', { options: { pace: 'tick' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    const row = await rowOf(ui)
    expect(row.length).toBe(120)
    // The 5-hour and the weekly bar, not the context's.
    expect(row.split(TICK_GLYPH).length - 1).toBe(2)
    await ui.unmount()
  })
})

describe('desktop', () => {
  const o: DesktopOptions = { pulse: true, pulseMs: 800, pulseMode: 'responsive', burst: { gen: 0, elapsedMs: 0, totalMs: 0 }, glow: true, palette: T, dotCount: 20 }

  test('off, no segment carries a pace or a card and the bar draws neither mark', () => {
    const row = flexRow(input(), 'dark', 'level')!
    expect(row.segments.every(seg => seg.pace === undefined && seg.card === undefined)).toBe(true)
    expect(smoothBarSvg(row.segments[0]!.bar!, o)).not.toContain('pace-')
  })

  test('both: the stripes are cut out of the fill ahead of the pace, drawn on the track behind it, with the tick', () => {
    const row = flexRow(input({ pace: 'both' }), 'dark', 'level')!
    const [five, weekly, ctx] = row.segments
    expect(five!.pace).toEqual({ tick: 45, stripe: { from: 45, to: 62, color: GREEN, cut: true } })
    expect(weekly!.pace).toEqual({ tick: 55, stripe: { from: 30, to: 55, color: mix(BLUE, T.bg, 0.45), cut: false } })
    expect(ctx!.pace).toBeUndefined()

    const cut = smoothBarSvg(five!.bar!, o, five!.pace)
    expect(cut).toContain('data-role="pace-tick"')
    expect(cut).toContain('data-role="pace-stripe" data-cut="true"')
    // Cut stripes are the track's color, inside the fill's own clip.
    expect(cut).toContain(`<pattern id="st"`)
    expect(cut).toMatch(new RegExp(`<pattern id="st"[^>]*><rect[^>]*fill="${T.track}"`))
    const room = smoothBarSvg(weekly!.bar!, o, weekly!.pace)
    expect(room).toContain('<g clip-path="url(#t)"><rect data-role="pace-stripe" data-cut="false"')
    expect(room).toMatch(new RegExp(`<pattern id="st"[^>]*><rect[^>]*fill="${mix(BLUE, T.bg, 0.45).toUpperCase()}"`))
    // The marks hold still: they add no animation of their own.
    const plain = smoothBarSvg(five!.bar!, o)
    expect(cut.split('<animate').length).toBe(plain.split('<animate').length)
  })

  test('dots: a striped cell is a ring, and the tick stands across the bar', () => {
    const row = flexRow(input({ pace: 'both' }), 'dark', 'level', 20)!
    const five = row.segments[0]!
    expect(five.dots!.filter(d => d.hollow).length).toBe(Math.round(0.62 * 20) - Math.round(0.45 * 20))
    const svg = dotBarSvg(five.dots!, o, five.pace?.tick)
    expect(svg.split('data-role="dot-ring"').length - 1).toBe(3)
    expect(svg).toContain('data-role="pace-tick"')
    const weekly = row.segments[1]!
    expect(weekly.dots!.filter(d => d.hollow).every(d => d.halo === false && !d.live)).toBe(true)
  })

  test('paceWarn draws the warning as the reset is drawn under resetColor: time, and a narrow band shortens it', () => {
    const row = flexRow(input({ paceWarn: 'five_hour' }), 'dark', 'level')!
    expect(row.segments[0]!.extra).toBe('out in 1h23m')
    expect(row.segments[0]!.extraSpan).toMatchObject({ text: 'out in 1h23m', color: RED, live: true })
    expect(row.segments[1]!.extraSpan).toBeUndefined()
  })

  test('windowPopup gives each window a card: its use, the pace, the projection, the run-out and the reset', () => {
    const row = flexRow(input({ windowCard: true }), 'dark', 'level')!
    expect(row.segments[0]!.card!.map(r => r.text)).toEqual(['5-hour limit: 62% used', 'Even pace now: 45%', 'Ahead of pace: +17%', 'Projected at reset: 138%', 'Runs out: in 1h23m', 'Resets: 14:45, in 2h45m'])
    expect(row.segments[1]!.card!.map(r => r.text)).toEqual(['Weekly limit: 30% used', 'Even pace now: 55%', 'Behind pace: -25%', 'Projected at reset: 55%', 'Resets: Sun 15:36, in 3d3h'])
    expect(row.segments[2]!.card).toBeUndefined()
    // A reading, not a meter: no row pulses.
    expect(row.segments[0]!.card!.every(r => !r.live)).toBe(true)
    // The card alone marks nothing on the bar.
    expect(row.segments[0]!.pace).toBeUndefined()
  })
})
