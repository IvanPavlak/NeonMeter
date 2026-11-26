import { describe, expect, test } from 'claude-code/testing'

import type { BandInput } from '../hooks/builder'
import { band, flexRow, rainbowOf, textOf as textOfSpans, THEMES } from '../hooks/builder'
import type { DesktopOptions, Rainbow } from '../hooks/drawings'
import { buttonSvg, dotBarSvg, frameCapSvg, frameEdgesSvg, outlineEdgesSvg, pctSvg, RAINBOW_PERIOD, smoothBarSvg } from '../hooks/drawings'
import { parseOptions } from '../hooks/register'
import { mountBand, setup, spansOf, start } from './kit'

// The rainbow theme (`rainbow`): everything the percents color is painted in
// the rainbow instead, held still, breathing with the pulse or running with
// it. Off by default, and the golden rows pin that the default row is
// unchanged.

const T = THEMES.dark
const COLORS = rainbowOf('dark')
const base: DesktopOptions = { pulse: true, pulseMs: 800, pulseMode: 'always', burst: { gen: 0, elapsedMs: 0, totalMs: 0 }, glow: true, palette: T, dotCount: 20 }
const with_ = (motion: Rainbow['motion'], more: Partial<DesktopOptions> = {}): DesktopOptions => ({ ...base, rainbow: { colors: COLORS, motion }, ...more })

const input = (more: Partial<BandInput> = {}): BandInput => ({
  auth: true,
  loading: false,
  stale: false,
  staleAge: '',
  windows: [
    { kind: 'five_hour', pct: 62, resetMin: 165 },
    { kind: 'seven_day', pct: 30, resetMin: 4536, resetAs: 'countdown' },
  ],
  ctx: { pct: 80, tokens: 160000, window: 200000 },
  segments: ['five_hour', 'seven_day', 'context'],
  ...more,
})

const bar = flexRow(input(), 'dark', 'level')!.segments[0]!.bar!
const animations = (svg: string) => svg.split('<animate').length - 1

test('the option is off by default and takes only its own values', () => {
  expect(parseOptions({}).parsed.rainbow).toBe('off')
  for (const value of ['still', 'breathe', 'circle'] as const) expect(parseOptions({ rainbow: value }).parsed.rainbow).toBe(value)
  expect(parseOptions({ rainbow: 'on' }).parsed.rainbow).toBe('off')
})

test('the rainbow is the range colors from red to blue without the second green, then violet', () => {
  expect(COLORS).toEqual(['#FF073A', '#FF5F1F', '#FFF01F', '#39FF14', '#1E90FF', '#B24BFF'])
})

describe('desktop', () => {
  test('off, a bar is drawn as ever', () => {
    expect(smoothBarSvg(bar, base)).not.toContain('id="rb"')
  })

  test('a bar takes the one paint: the colors and the first again, repeating along the bar', () => {
    const svg = smoothBarSvg(bar, with_('still'))
    expect(svg).toContain(`<linearGradient id="rb" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${RAINBOW_PERIOD}" y2="0" spreadMethod="repeat">`)
    // Seven stops: six colors, then the first again, so a repeat has no seam.
    const stops = [...svg.matchAll(/<stop offset="[\d.]+" stop-color="(#[0-9A-F]{6})"/g)].map(m => m[1])
    expect(stops).toEqual([...COLORS, COLORS[0]])
    expect(svg).toContain('data-role="slice" x="12.00"')
    expect(svg).toMatch(/data-role="slice"[^>]*fill="url\(#rb\)"/)
    // The halo is the same paint, so it is a rainbow too.
    expect(svg).toMatch(/data-role="slice-halo"[^>]*fill="url\(#rb\)"/)
  })

  test('still holds it: no animation at all, whatever the pulse', () => {
    for (const svg of [smoothBarSvg(bar, with_('still')), pctSvg({ text: '62%', color: '#00D45A', live: true }, with_('still')), buttonSvg(bar, with_('still'))]) expect(animations(svg)).toBe(0)
  })

  test('breathe brightens every stop with the pulse and widens the halo; nothing runs', () => {
    const svg = smoothBarSvg(bar, with_('breathe'))
    expect(svg.split('attributeName="stop-color"').length - 1).toBe(7)
    expect(svg).not.toContain('animateTransform')
    expect(svg).toContain('attributeName="stdDeviation"')
  })

  test('circle runs the bar and the text one period per cycle, and turns the ring once per cycle', () => {
    const run = `<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="${RAINBOW_PERIOD} 0" dur="800ms" repeatCount="indefinite"/>`
    expect(smoothBarSvg(bar, with_('circle'))).toContain(run)
    expect(pctSvg({ text: '62%', color: '#00D45A', live: true }, with_('circle'))).toContain(run)
    expect(buttonSvg(bar, with_('circle'))).toContain('<animateTransform attributeName="gradientTransform" type="rotate" from="0 15 15" to="360 15 15" dur="800ms" repeatCount="indefinite"/>')
    // The colors themselves hold: the stops do not brighten while they run.
    expect(smoothBarSvg(bar, with_('circle'))).not.toContain('attributeName="stop-color"')
  })

  test('given the clock, a rainbow that never stops is in phase with it, so a band drawn again carries on', () => {
    const at = (nowMs: number) => smoothBarSvg(bar, with_('circle', { nowMs }))
    expect(at(10 * 800 + 250)).toContain('dur="800ms" begin="-250ms" repeatCount="indefinite"')
    expect(at(11 * 800 + 250)).toBe(at(10 * 800 + 250))
  })

  test('under the responsive pulse it runs for the burst and lies still between changes', () => {
    const responsive = with_('circle', { pulseMode: 'responsive' })
    expect(animations(smoothBarSvg(bar, responsive))).toBe(0)
    expect(smoothBarSvg(bar, { ...responsive, burst: { gen: 2, elapsedMs: 100, totalMs: 2400 } })).toContain('begin="-100ms" repeatDur="2400ms"')
  })

  test('dots take the same paint, and their halos are one blurred copy of them', () => {
    const dots = flexRow(input(), 'dark', 'level', 20)!.segments[0]!.dots!
    const svg = dotBarSvg(dots, with_('circle'))
    const filled = dots.filter(d => d.live).length
    expect(svg.split('data-role="dot" ').length - 1).toBe(dots.length)
    expect(svg.split('fill="url(#rb)"').length - 1).toBe(2 * filled)
    expect(svg.split('<filter').length - 1).toBe(2)
    expect(dotBarSvg(dots, with_('circle', { glow: false }))).not.toContain('<filter')
  })

  test('a stale bar keeps its faded range color: the rainbow is for what is live', () => {
    const stale = flexRow(input({ stale: true, staleAge: '5m' }), 'dark', 'level')!.segments[0]!.bar!
    expect(smoothBarSvg(stale, with_('circle'))).not.toContain('id="rb"')
  })

  test('a bar split by category and a run-out warning are marked, so the band leaves them their own colors', () => {
    const parts = { messages: 100000, systemTools: 20000, mcpTools: 20000, skills: 10000, other: 10000, buffer: 20000 }
    const row = flexRow(input({ contextBar: 'breakdown', ctx: { pct: 80, tokens: 160000, window: 200000, parts }, paceWarn: 'five_hour' }), 'dark', 'level')!
    expect(row.segments.map(s => s.split ?? false)).toEqual([false, false, true])
    expect(row.segments.map(s => s.warns ?? false)).toEqual([true, false, false])
  })

  test('a frame runs the whole rainbow along its edges and ends where it began, its caps in the first color; it does not run', () => {
    const frame = { color: '#00D45A', live: true }
    const edges = frameEdgesSvg(frame, with_('circle'))
    expect(edges).toContain('x2="100" y2="0" spreadMethod="repeat"')
    expect(edges).toContain('stroke="url(#rb)"')
    expect(edges).not.toContain('animateTransform')
    expect(frameCapSvg('left', frame, with_('circle'))).toContain(`stroke="${COLORS[0]}"`)
    // An outline's separator stretch is one run too, not two halves.
    const sep = outlineEdgesSvg(frame, 60, with_('still'), { color: '#1E90FF', live: true })
    expect(sep.split('data-role="frame"').length - 1).toBe(1)
  })
})

describe('terminal', () => {
  test('the bar cells and the percent characters take the colors in turn, live; still holds them', () => {
    const colors = COLORS
    const row = band(input({ rainbow: { colors, still: false } }), 120, 'dark', 'level')!
    expect(textOfSpans(row.spans)).toBe(textOfSpans(band(input(), 120, 'dark', 'level')!.spans))
    const first = row.spans.findIndex(s => s.text === '━' && s.live)
    expect(row.spans.slice(first, first + 7).map(s => s.color)).toEqual([...colors, colors[0]])
    const pct = row.spans.filter(s => ['6', '2', '%'].includes(s.text)).slice(0, 3)
    expect(pct.map(s => [s.text, s.color, s.bold, s.live])).toEqual([['6', colors[0], true, true], ['2', colors[1], true, true], ['%', colors[2], true, true]])
    const still = band(input({ rainbow: { colors, still: true } }), 120, 'dark', 'level')!
    expect(still.spans.filter(s => s.text === '━' && s.color !== T.track).every(s => !s.live)).toBe(true)
  })

  test('the option reaches the band the engine draws', { options: { rainbow: 'breathe' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    const cells = (await spansOf(ui)).filter(s => s.text === '━' && s.live)
    expect(cells.slice(0, 6).map(s => s.color)).toEqual(COLORS)
    await ui.unmount()
  })
})
