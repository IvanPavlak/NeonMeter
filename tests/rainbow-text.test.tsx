import { describe, expect, test } from 'claude-code/testing'

import type { BandInput } from '../hooks/builder'
import { band, fitDesktop, flexRow, rainbowOf, textOf as textOfSpans, THEMES } from '../hooks/builder'
import type { DesktopOptions } from '../hooks/drawings'
import { labelSvg, resetSvg } from '../hooks/drawings'
import { mix } from '../hooks/color'
import { parseOptions, PRESETS } from '../hooks/register'
import { mountBand, setup, spansOf, start } from './kit'

// `rainbowText`: with the rainbow on, the text takes it too, each segment's
// label and its plain field (the token count, a reset in the text color).
// Off by default, so `rainbow` alone paints what the percents color, as ever.

const T = THEMES.dark
const COLORS = rainbowOf('dark')

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
const rainbow = (text: boolean, still = false) => ({ colors: COLORS, still, ...(text ? { text: true } : {}) })

test('the option is off by default, takes a boolean, and the rainbow preset turns it on', () => {
  expect(parseOptions({}).parsed.rainbowText).toBe(false)
  expect(parseOptions({ rainbowText: true }).parsed.rainbowText).toBe(true)
  expect(parseOptions({ rainbowText: 'yes' }).parsed.rainbowText).toBe(false)
  expect(PRESETS.rainbow.rainbowText).toBe(true)
  expect(parseOptions({ preset: 'rainbow', rainbowText: false }).parsed.rainbowText).toBe(true)
})

describe('terminal', () => {
  const spans = (more: Partial<BandInput>) => band(input(more), 120, 'dark', 'level')!.spans
  // The run of one-character spans that spell `word`, wherever it starts.
  const word = (all: ReturnType<typeof spans>, text: string) => {
    const chars = Array.from(text)
    for (let i = 0; i + chars.length <= all.length; i++) if (chars.every((ch, k) => all[i + k]!.text === ch)) return all.slice(i, i + chars.length)
    return null
  }

  test('off, the labels and the token count are plain text and the row reads the same', () => {
    const plain = spans({ rainbow: rainbow(false) })
    expect(plain.find(s => s.text === '5-hour ')).toMatchObject({ color: T.text })
    expect(plain.find(s => s.text === ' 160k/200k')).toMatchObject({ color: T.text })
    expect(textOfSpans(spans({ rainbow: rainbow(true) }))).toBe(textOfSpans(plain))
  })

  test('on, a label and the token count take the colors in turn, a character each, live', () => {
    const all = spans({ rainbow: rainbow(true) })
    const label = word(all, 'Weekly')!
    expect(label.map(s => s.color)).toEqual(COLORS)
    expect(label.every(s => s.live)).toBe(true)
    const tokens = word(all, '160k/200k')!
    expect(tokens.map(s => s.color)).toEqual([...COLORS, ...COLORS.slice(0, 3)])
    // A reset in the text color is a plain field too; the separators stay as they are.
    expect(word(all, '2h45m')!.map(s => s.color)).toEqual(COLORS.slice(2, 5).concat(COLORS.slice(5), COLORS.slice(0, 1)))
    expect(all.find(s => s.text === ' │ ')).toBeDefined()
  })

  test('still holds them; a reset colored by its time and a run-out warning keep their own span', () => {
    expect(word(spans({ rainbow: rainbow(true, true) }), 'Weekly')!.some(s => s.live)).toBe(false)
    const timed = spans({ rainbow: rainbow(true), resetColor: 'time' })
    expect(timed.find(s => s.text === ' in 2h45m')).toBeDefined()
    expect(word(timed, 'Weekly')!.map(s => s.color)).toEqual(COLORS)
  })

  test('a stale segment takes them faded, as its percent is', () => {
    const label = word(spans({ rainbow: rainbow(true), stale: true, staleAge: '5m' }), 'Weekly')!
    expect(label.map(s => s.color)).toEqual(COLORS.map(c => mix(c, T.bg, 0.45)))
  })

  test('without the rainbow the option does nothing', { options: { rainbowText: true } }, async ($, on) => {
    const world = setup(on)
    await start($, world)
    const ui = await mountBand($, 'terminal', 120)
    expect((await spansOf(ui)).find(s => s.text === '5-hour ')).toBeDefined()
    await ui.unmount()
  })

  test('with it, the option reaches the band the engine draws', { options: { rainbow: 'breathe', rainbowText: true } }, async ($, on) => {
    const world = setup(on)
    await start($, world)
    const ui = await mountBand($, 'terminal', 120)
    const all = await spansOf(ui)
    expect(all.find(s => s.text === '5-hour ')).toBeUndefined()
    expect(word(all, 'Weekly')!.map(s => s.color)).toEqual(COLORS)
    await ui.unmount()
  })
})

describe('desktop', () => {
  const o: DesktopOptions = { pulse: true, pulseMs: 800, pulseMode: 'always', burst: { gen: 0, elapsedMs: 0, totalMs: 0 }, glow: true, palette: T, dotCount: 20, rainbow: { colors: COLORS, motion: 'circle' } }

  test('the row marks its segments for the band, and keeps the mark as it steps down in a narrow band', () => {
    const row = flexRow(input({ rainbow: rainbow(true) }), 'dark', 'level')!
    expect(row.segments.every(seg => seg.rainbowText === true)).toBe(true)
    expect(flexRow(input({ rainbow: rainbow(false) }), 'dark', 'level')!.segments.some(seg => seg.rainbowText)).toBe(false)
    expect(flexRow(input(), 'dark', 'level')!.segments.some(seg => seg.rainbowText)).toBe(false)
    const narrow = fitDesktop(row, 40)
    expect(narrow.segments.map(seg => seg.label)).toEqual(['5h', '7d', 'Ctx'])
    expect(narrow.segments.every(seg => seg.rainbowText === true)).toBe(true)
  })

  test('a label and a plain field are drawings the rainbow paints, under the halo', () => {
    const label = labelSvg({ text: 'Weekly', color: T.text, live: true }, o)
    expect(label).toContain('id="rb"')
    expect(label).toContain('data-role="label"')
    expect(label).toContain('data-role="label-halo"')
    expect(label).toContain('font-weight="400"')
    expect(label).toContain('fill="url(#rb)"')
    const field = resetSvg({ text: '160k/200k', color: T.text, live: true }, o)
    expect(field).toContain('fill="url(#rb)"')
    // Without the rainbow the same drawing is plain text in its color.
    const { rainbow: _r, ...plain } = o
    expect(labelSvg({ text: 'Weekly', color: T.text, live: false }, plain)).not.toContain('id="rb"')
  })
})
