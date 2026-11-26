import { describe, expect, test } from 'claude-code/testing'

import type { BandInput } from '../hooks/builder'
import { band, CHIP_TEXT, flexRow, rainbowOf, textOf as textOfSpans, THEMES } from '../hooks/builder'
import type { DesktopOptions } from '../hooks/drawings'
import { resetChipSvg } from '../hooks/drawings'
import { changeKey, parseOptions, parseResets, resetChipsOf } from '../hooks/register'
import { NOW, mountBand, rowOf, setup, start } from './kit'

// The reset chips: one `+1` per limit reset the `resetChips` option lists,
// before everything else in the row, in the rainbow or one color. Off by
// default (the list is empty), and the golden rows pin that the default row is
// unchanged. A chip names its reset on hover and takes no press.

const DAY = 86_400_000
const held = parseResets('fable:2027-03-09,weekly:2026-12-10')!
const chips = (color = 'rainbow') => resetChipsOf(held, color, NOW)!

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

test('the list reads a kind and the day it expires; anything else is refused', () => {
  expect(held.map(r => r.kind)).toEqual(['fable', 'weekly'])
  expect(new Date(held[0]!.expires!).getFullYear()).toBe(2027)
  expect(parseResets('5-hour, full')).toEqual([{ kind: 'five_hour', expires: null }, { kind: 'full', expires: null }])
  // Two of a kind are two entries.
  expect(parseResets('fable,fable')!.length).toBe(2)
  expect(parseResets('')).toEqual([])
  expect(parseResets('monthly')).toBeNull()
  expect(parseResets('fable:soon')).toBeNull()
  expect(parseResets('fable:2027-03-09:x')).toBeNull()
})

test('the options default to no chips, the rainbow, glow and pulse on', () => {
  const d = parseOptions({}).parsed
  expect([d.resetChips, d.resetChipColor, d.resetChipGlow, d.resetChipPulse]).toEqual([[], 'rainbow', true, true])
  const set = parseOptions({ resetChips: 'fable,weekly', resetChipColor: '#b24bff', resetChipGlow: false, resetChipPulse: false }).parsed
  expect([set.resetChips.length, set.resetChipColor, set.resetChipGlow, set.resetChipPulse]).toEqual([2, '#B24BFF', false, false])
  const bad = parseOptions({ resetChips: 'monthly', resetChipColor: 'pink' })
  expect([bad.parsed.resetChips, bad.parsed.resetChipColor]).toEqual([[], 'rainbow'])
  expect(bad.problems.length).toBe(2)
})

test('a chip names its reset, what it refills and when it expires; an expired one is left out', () => {
  expect(chips().chips.map(c => c.lines[0])).toEqual(['Fable reset', 'Weekly reset'])
  expect(chips().chips[1]!.lines[1]).toBe('Refills your weekly limit.')
  expect(chips().chips[0]!.lines[2]).toMatch(/^Expires Mar 9, 2027 \(in \d+ days\)\.$/)
  // The day after the weekly reset's last day only the Fable one is left; after both, none.
  expect(resetChipsOf(held, 'rainbow', held[1]!.expires! + DAY)!.chips.length).toBe(1)
  expect(resetChipsOf(held, 'rainbow', held[0]!.expires! + DAY)).toBeNull()
})

describe('terminal', () => {
  test('the chips stand before everything, the button at the start included, and the row keeps its width', () => {
    const plain = band(input({ button: 'start' }), 120, 'dark', 'level')!
    const row = band(input({ button: 'start', resets: chips() }), 120, 'dark', 'level')!
    const text = textOfSpans(row.spans)
    expect(text.length).toBe(120)
    expect(text.startsWith(`${CHIP_TEXT} ${CHIP_TEXT} ◉ 5-hour `)).toBe(true)
    // The bars give up the room; the text is the same.
    expect(text.replace(/━+/g, '━')).toBe(`${CHIP_TEXT} ${CHIP_TEXT} ` + textOfSpans(plain.spans).replace(/━+/g, '━'))
  })

  test('the rainbow runs through the characters, live; one color draws each chip in it', () => {
    const rainbow = rainbowOf('dark')
    const cells = band(input({ resets: chips() }), 120, 'dark', 'level')!.spans.filter(s => s.chip)
    expect(cells.map(s => s.text).join('')).toBe('+1+1')
    expect(cells.map(s => s.color)).toEqual(rainbow.slice(0, 4))
    expect(cells.every(s => s.live && s.bold)).toBe(true)
    const one = band(input({ resets: chips('#B24BFF') }), 120, 'dark', 'level')!.spans.filter(s => s.chip)
    expect(one.map(s => [s.text, s.color])).toEqual([['+1', '#B24BFF'], ['+1', '#B24BFF']])
  })

  test('a frame on the rule stays over its segment when the chips move the row', () => {
    const border = { show: 'always', at: 90, scope: 'segment' } as const
    const row = band(input({ border, resets: chips() }), 120, 'dark', 'level')!
    const text = textOfSpans(row.spans)
    const rule = textOfSpans(row.rule!)
    expect(rule.length).toBe(120)
    expect(rule.indexOf('━')).toBe(text.indexOf('5-hour'))
  })

  test('a chip expiring is a change; without chips the key is the one it always was', () => {
    expect(changeKey(input({ resets: chips() }))).not.toBe(changeKey(input()))
    expect(changeKey(input({ resets: chips() }))).not.toBe(changeKey(input({ resets: resetChipsOf(held, 'rainbow', held[1]!.expires! + DAY)! })))
  })

  test('the option reaches the band the engine draws', { options: { resetChips: 'fable,weekly' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    const row = await rowOf(ui)
    expect(row.length).toBe(120)
    expect(row.startsWith('+1 +1 5-hour ')).toBe(true)
    await ui.unmount()
  })
})

describe('desktop', () => {
  const T = THEMES.dark
  const still: DesktopOptions = { pulse: true, pulseMs: 800, pulseMode: 'responsive', burst: { gen: 0, elapsedMs: 0, totalMs: 0 }, glow: true, palette: T, dotCount: 20 }
  const always: DesktopOptions = { ...still, pulseMode: 'always' }

  test('off, the row has no chips', () => {
    expect(flexRow(input(), 'dark', 'level')!.resets).toBeUndefined()
  })

  test('each chip carries its text, the six rainbow colors and its card', () => {
    const row = flexRow(input({ resets: chips() }), 'dark', 'level')!
    expect(row.resets!.map(c => c.text)).toEqual(['+1', '+1'])
    expect(row.resets![0]!.colors).toEqual(rainbowOf('dark'))
    expect(row.resets![1]!.lines[0]).toBe('Weekly reset')
    expect(flexRow(input({ resets: chips('#B24BFF') }), 'dark', 'level')!.resets![0]!.colors).toEqual(['#B24BFF'])
  })

  test('the rainbow lies still between changes and turns once per cycle while the band pulses', () => {
    const chip = flexRow(input({ resets: chips() }), 'dark', 'level')!.resets![0]!
    const rest = resetChipSvg(chip, still)
    expect(rest).toContain('<linearGradient id="rb"')
    expect(rest.split('<stop ').length - 1).toBe(6)
    expect(rest).not.toContain('<animate')
    expect(rest).toContain('data-role="chip-halo"')
    const moving = resetChipSvg(chip, always)
    expect(moving).toContain('<animateTransform attributeName="gradientTransform" type="rotate"')
    expect(moving).toContain('dur="800ms" repeatCount="indefinite"')
    // During a responsive burst it is in phase with the band and ends with it.
    const burst = resetChipSvg(chip, { ...still, burst: { gen: 3, elapsedMs: 400, totalMs: 2400 } })
    expect(burst).toContain('begin="-400ms" repeatDur="2400ms"')
    expect(burst).toContain('data-burst="3"')
  })

  test('glow off draws no halo and no filter; pulse off, no animation; one color brightens as a frame does', () => {
    const chip = flexRow(input({ resets: chips() }), 'dark', 'level')!.resets![0]!
    const crisp = resetChipSvg(chip, { ...always, glow: false })
    expect(crisp).not.toContain('chip-halo')
    expect(crisp).not.toContain('<filter')
    expect(resetChipSvg(chip, { ...always, pulse: false })).not.toContain('<animate')
    const one = resetChipSvg({ ...chip, colors: ['#B24BFF'] }, always)
    expect(one).not.toContain('linearGradient')
    expect(one).toContain('attributeName="stroke" values="#B24BFF;')
  })
})
