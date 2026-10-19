import { describe, expect, test } from 'claude-code/testing'
import type { FoundElement } from 'claude-code/testing'

import { fitDesktop, fitFrames, flexRow, frameOf, THEMES } from '../hooks/builder'
import { frameCapSvg, frameEdgesSvg } from '../hooks/drawings'
import { parseOptions } from '../hooks/register'

import { clientProps, linesOf, mountBand, ok, partsOf, peakOf, rowOf, ruleOf, setup, start, usageBody } from './kit'

// The border: a glowing frame around each segment whose percent reaches
// `borderAt` (90 by default), in that percent's range color, pulsing and
// glowing with the band. `borderScope: band` frames the whole band by its
// fullest segment, `border: always` frames at any percent, `borderColor`
// sets one color for every frame. The terminal draws it on the rule above
// the row: a `━` stretch over each framed segment.
const T = THEMES.dark

test('the options: defaults, choices and a refused color', () => {
  const d = parseOptions({}).parsed
  expect([d.border, d.borderAt, d.borderScope, d.borderGlow, d.borderPulse, d.borderColor]).toEqual(['appear', 90, 'segment', true, true, ''])
  const set = parseOptions({ border: 'always', borderAt: 150, borderScope: 'band', borderGlow: false, borderPulse: false, borderColor: '#f0a' }).parsed
  expect([set.border, set.borderAt, set.borderScope, set.borderGlow, set.borderPulse, set.borderColor]).toEqual(['always', 100, 'band', false, false, '#FF00AA'])
  const bad = parseOptions({ border: 'sometimes', borderColor: 'red' })
  expect([bad.parsed.border, bad.parsed.borderColor]).toEqual(['appear', ''])
  expect(bad.problems).toEqual(['borderColor (one color like "#FF073A", or empty) is not valid; using the default'])
})

test('a frame appears from borderAt on, in the percent\'s range color or the one color set', () => {
  const appear = { show: 'appear', at: 90, scope: 'segment' } as const
  expect(frameOf(89, false, appear, T)).toBeNull()
  expect(frameOf(90, false, appear, T)).toEqual({ color: '#FF073A', live: true })
  expect(frameOf(75, false, { ...appear, at: 70 }, T), 'a lower borderAt frames in the percent\'s own color').toEqual({ color: '#FFF01F', live: true })
  expect(frameOf(30, false, { ...appear, show: 'always' }, T)).toEqual({ color: '#1E90FF', live: true })
  expect(frameOf(95, false, { ...appear, color: '#00FFFF' }, T)).toEqual({ color: '#00FFFF', live: true })
  expect(frameOf(95, true, appear, T), 'stale fades and holds still').toEqual({ color: '#7A0D27', live: false })
  expect(frameOf(null, false, { ...appear, show: 'always' }, T), 'nothing before a reading').toBeNull()
  expect(frameOf(95, false, undefined, T), 'border off').toBeNull()
})

test('the caps and the edges pulse and glow with the band, and draw crisp with the glow off', () => {
  const o = { pulse: true, pulseMs: 800, pulseMode: 'always' as const, burst: { gen: 0, elapsedMs: 0, totalMs: 0 }, glow: true, palette: T, dotCount: 10 }
  for (const svg of [frameCapSvg('left', { color: '#FF073A', live: true }, o), frameCapSvg('right', { color: '#FF073A', live: true }, o), frameEdgesSvg({ color: '#FF073A', live: true }, o)]) {
    expect(partsOf(svg, 'frame').map(p => p.attrs.stroke)).toEqual(['#FF073A'])
    expect(partsOf(svg, 'frame-halo')).toHaveLength(1)
    expect(peakOf(svg)).toBeDefined()
  }
  const still = frameEdgesSvg({ color: '#FF073A', live: false }, { ...o, glow: false })
  expect(partsOf(still, 'frame-halo')).toHaveLength(0)
  expect(still).not.toContain('<animate')
  expect(frameEdgesSvg({ color: '#FF073A', live: true }, o), 'the edges stretch to the frame').toContain('preserveAspectRatio="none"')
})

/** The keys of every frame Box the desktop band draws. */
async function framesOf(ui: Awaited<ReturnType<typeof mountBand>>): Promise<string[]> {
  return (await ui.findAll({ type: 'Box' })).map(b => b.key).filter((k): k is string => typeof k === 'string' && /^frame-[a-z_]+$/.test(k))
}

/** The stroke of a frame's left cap. */
async function capColorOf(ui: Awaited<ReturnType<typeof mountBand>>, key: string): Promise<string | undefined> {
  const cap = (await ui.find({ type: 'Box', key: `${key}-left` }))!.children as FoundElement[]
  return partsOf(String(cap.find(c => c.type === 'Svg')!.props.source), 'frame')[0]?.attrs.stroke
}

describe('the desktop border', () => {
  test('by default only a segment at 90% or more is framed, in its range color', async ($, on) => {
    const world = setup(on, { response: ok(usageBody(92, 21)) })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    expect(await framesOf(ui)).toEqual(['frame-five_hour'])
    expect(await capColorOf(ui, 'frame-five_hour')).toBe('#FF073A')
    expect(await rowOf(ui), 'the frame adds no text, and beside it the separator is a space').toBe('5-hour  92% in 3h13m Weekly  21% in 3d4h │ Context  64% 128k/200k')
    await ui.unmount()
  })

  test('always frames every segment in its own color', { options: { border: 'always' } }, async ($, on) => {
    const world = setup(on, { response: ok(usageBody(38, 21)) })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    expect(await framesOf(ui)).toEqual(['frame-five_hour', 'frame-seven_day', 'frame-ctx'])
    expect(await capColorOf(ui, 'frame-five_hour')).toBe('#1E90FF')
    expect(await capColorOf(ui, 'frame-ctx'), '64% is darker green').toBe('#00D45A')
    await ui.unmount()
  })

  test('band scope frames the whole band by its fullest segment, in borderColor when set', { options: { border: 'always', borderScope: 'band', borderColor: '#00FFFF' } }, async ($, on) => {
    const world = setup(on, { response: ok(usageBody(38, 21)) })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    expect(await framesOf(ui)).toEqual(['frame-band'])
    expect(await capColorOf(ui, 'frame-band')).toBe('#00FFFF')
    await ui.unmount()
  })

  test('borderGlow off draws the frame without a halo; off draws none', { options: { border: 'always', borderGlow: false } }, async ($, on) => {
    const world = setup(on, { response: ok(usageBody(38, 21)) })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    const cap = (await ui.find({ type: 'Box', key: 'frame-five_hour-left' }))!.children as FoundElement[]
    expect(partsOf(String(cap.find(c => c.type === 'Svg')!.props.source), 'frame-halo')).toHaveLength(0)
    await ui.unmount()
  })

  test('border off draws no frame at any percent', { options: { border: 'off' } }, async ($, on) => {
    const world = setup(on, { response: ok(usageBody(99, 99)) })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    expect(await framesOf(ui)).toEqual([])
    await ui.unmount()
  })
})

describe('the terminal border', () => {
  test('a framed segment lights its stretch of the rule, which the band then draws', async ($, on) => {
    const world = setup(on, { response: ok(usageBody(92, 21)) })
    await start($, world)
    const ui = await mountBand($, 'terminal', 120)
    const { rule, row } = await linesOf(ui)
    expect(await ruleOf(ui), 'no plain rule outside the band').toBeUndefined()
    const from = row.indexOf('5-hour')
    const to = row.indexOf(' │ Weekly')
    expect(rule!.slice(from, to)).toBe('━'.repeat(to - from))
    expect(rule!.slice(to)).toBe('─'.repeat(120 - to))
    const lit = (await clientProps(ui))!.rules![0]!.find(sp => sp.text.startsWith('━'))!
    expect(lit).toMatchObject({ color: '#FF073A', live: true })
    await ui.unmount()
  })

  test('band scope lights the whole rule; borderPulse off holds it still', { options: { border: 'always', borderScope: 'band', borderPulse: false } }, async ($, on) => {
    const world = setup(on, { response: ok(usageBody(38, 21)) })
    await start($, world)
    const ui = await mountBand($, 'terminal', 120)
    expect((await linesOf(ui)).rule).toBe('━'.repeat(120))
    expect((await clientProps(ui))!.rules![0]!.every(sp => !sp.live)).toBe(true)
    await ui.unmount()
  })

  test('with nothing framed the plain rule stays outside the band', async ($, on) => {
    const world = setup(on, { response: ok(usageBody(38, 21)) })
    await start($, world)
    const ui = await mountBand($, 'terminal', 120)
    expect((await ruleOf(ui))?.text).toBe('─'.repeat(120))
    expect((await clientProps(ui))!.rules).toBeUndefined()
    expect((await linesOf(ui)).rule).toBeNull()
    await ui.unmount()
  })
})

describe('the outline', () => {
  test('the options: off by default, single or sections; borderScope none', () => {
    expect(parseOptions({}).parsed.outline).toBe('off')
    expect(parseOptions({ outline: 'sections', borderScope: 'none' }).parsed).toMatchObject({ outline: 'sections', borderScope: 'none' })
    expect(parseOptions({ outline: 'rainbow' }).parsed.outline).toBe('off')
  })

  test('sections: each section draws its stretch in its own color, the caps the first and last', { options: { outline: 'sections' } }, async ($, on) => {
    const world = setup(on, { response: ok(usageBody(92, 21)) })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    const edges = (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.source)).filter(src => src.includes('preserveAspectRatio="none"') && !src.includes('data-role="frame-room"'))
    const strokes = edges.map(src => partsOf(src, 'frame').map(p => p.attrs.stroke))
    // 5-hour 92% red (its own frame's edges too), the separator split red to blue, Weekly blue, the next separator blue to darker green, Context 64% darker green.
    expect(strokes).toContainEqual(['#FF073A', '#1E90FF'])
    expect(strokes).toContainEqual(['#1E90FF'])
    expect(strokes).toContainEqual(['#00D45A'])
    const left = (await ui.find({ type: 'Box', key: 'outline-left' }))!.children as FoundElement[]
    const right = (await ui.find({ type: 'Box', key: 'outline-right' }))!.children as FoundElement[]
    expect(partsOf(String(left.find(c => c.type === 'Svg')!.props.source), 'frame')[0]?.attrs.stroke).toBe('#FF073A')
    expect(partsOf(String(right.find(c => c.type === 'Svg')!.props.source), 'frame')[0]?.attrs.stroke).toBe('#00D45A')
    expect(await framesOf(ui), 'the segment frames stay').toEqual(['frame-five_hour'])
    await ui.unmount()
  })

  test('single: one color all round, the fullest segment\'s; nothing below borderAt', { options: { outline: 'single', borderScope: 'none' } }, async ($, on) => {
    const world = setup(on, { response: ok(usageBody(38, 21)) })
    await start($, world)
    const low = await mountBand($, 'desktop', 95)
    expect(await low.find({ type: 'Box', key: 'outline' })).toBeUndefined()
    await low.unmount()

    world.response = ok(usageBody(92, 21))
    await world.clock.advance(60_000)
    const ui = await mountBand($, 'desktop', 95)
    expect(await framesOf(ui), 'borderScope none: no segment frames').toEqual([])
    const strokes = (await ui.findAll({ type: 'Svg' })).flatMap(s => partsOf(String(s.props.source), 'frame').map(p => p.attrs.stroke))
    expect(new Set(strokes)).toEqual(new Set(['#FF073A']))
    await ui.unmount()
  })

  test('the terminal lights the whole rule, each section\'s stretch in its color', { options: { outline: 'sections', border: 'always' } }, async ($, on) => {
    const world = setup(on, { response: ok(usageBody(38, 21)) })
    await start($, world)
    const ui = await mountBand($, 'terminal', 120)
    expect((await linesOf(ui)).rule).toBe('━'.repeat(120))
    const colors = (await clientProps(ui))!.rules![0]!.map(sp => sp.color).filter((c, i, all) => c !== all[i - 1])
    expect(colors, '5-hour and Weekly blue, then Context darker green').toEqual(['#1E90FF', '#00D45A'])
    await ui.unmount()
  })
})

test('in a band too narrow for their room the frames give way, and the outline stays', () => {
  const input = {
    auth: true,
    loading: false,
    stale: false,
    staleAge: '',
    windows: [{ kind: 'five_hour' as const, pct: 92, resetMin: 100 }, { kind: 'seven_day' as const, pct: 21, resetMin: 4000 }],
    ctx: { pct: 64, tokens: 128000, window: 200000 },
    segments: ['five_hour', 'seven_day', 'spend', 'context'] as const,
    border: { show: 'always' as const, at: 90, scope: 'segment' as const, outline: 'single' as const },
  }
  const row = flexRow({ ...input, segments: [...input.segments] }, 'dark', 'level')!
  expect(fitFrames(row, 120), 'room to spare: unchanged').toBe(row)
  const narrow = fitFrames(row, 60)
  expect(narrow.segments.some(seg => seg.frame)).toBe(false)
  expect(narrow.outline).toEqual(row.outline)
})

test('a narrow desktop band steps down until it fits: frames, labels, fields, then bars', () => {
  const input = {
    auth: true,
    loading: false,
    stale: false,
    staleAge: '',
    windows: [{ kind: 'five_hour' as const, pct: 22, resetMin: 177 }, { kind: 'seven_day' as const, pct: 3, resetMin: 3300 }],
    ctx: { pct: 57, tokens: 566000, window: 1000000 },
    segments: ['five_hour', 'seven_day', 'spend', 'context'] as ('five_hour' | 'seven_day' | 'spend' | 'context')[],
    button: 'end' as const,
    border: { show: 'always' as const, at: 90, scope: 'segment' as const, outline: 'single' as const },
  }
  const row = flexRow(input, 'dark', 'level')!
  const text = (r: typeof row) => r.segments.map(seg => `${seg.label} ${seg.bar ? '[bar] ' : ''}${seg.pct.text}${seg.extra ? ' ' + seg.extra : ''}`).join(' | ')
  expect(fitDesktop(row, 160), 'room to spare: the full row').toBe(row)
  expect(fitDesktop(row, 70).segments.some(seg => seg.frame), 'the frames give way first').toBe(false)
  expect(text(fitDesktop(row, 70))).toBe('5-hour [bar] 22% in 2h57m | Weekly [bar] 3% | Context [bar] 57% 566k/1M')
  expect(text(fitDesktop(row, 59))).toBe('5h [bar] 22% in 2h57m | 7d [bar] 3% | Ctx [bar] 57% 566k/1M')
  expect(text(fitDesktop(row, 49))).toBe('5h [bar] 22% 2h57m | 7d [bar] 3% | Ctx [bar] 57%')
  expect(text(fitDesktop(row, 39))).toBe('5h [bar] 22% | 7d [bar] 3% | Ctx [bar] 57%')
  expect(text(fitDesktop(row, 30))).toBe('5h 22% | 7d 3% | Ctx 57%')
  expect(fitDesktop(row, 30).outline, 'the outline stays').toEqual(row.outline)
})
