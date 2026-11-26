import { describe, expect, test } from 'claude-code/testing'

import type { BandInput } from '../hooks/builder'
import { band, expiryColor, flexRow, rainbowOf, textOf as textOfSpans, THEMES } from '../hooks/builder'
import type { DesktopOptions } from '../hooks/drawings'
import { resetChipSvg } from '../hooks/drawings'
import { changeKey, parseOptions, parseResets, resetChipsOf } from '../hooks/register'
import { NOW, mountBand, rowOf, setup, start } from './kit'

// The reset chip: one chip counting the limit resets the `resetChips` option
// lists (`+2`), before everything else in the row, in the rainbow or one
// color. Off by default (the list is empty), and the golden rows pin that the
// default row is unchanged. On hover it lists every reset, the one that
// expires first on top, each expiry colored by how close it is. It takes no press.

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

test('one chip counts the resets, and its card lists them all, the one that expires first on top', () => {
  const { chips: all } = chips()
  expect(all.length).toBe(1)
  expect(all[0]!.text).toBe('+2')
  const lines = all[0]!.lines
  // The list names Fable first; the weekly reset expires sooner, so it leads.
  expect(lines.map(l => l.text.replace(/in \d+ days/, 'in N days'))).toEqual([
    '2 limit resets available',
    'Weekly reset',
    'Refills your weekly limit.',
    'Expires Dec 10, 2026, in N days',
    'Fable reset',
    'Refills your Fable allowance and gives back',
    'what Fable used on your weekly limit.',
    'Expires Mar 9, 2027, in N days',
    'Use them in Settings > Usage.',
  ])
  // A reset without a day comes last and has no expiry line.
  const mixed = resetChipsOf(parseResets('full,weekly:2026-12-10')!, 'rainbow', NOW)!.chips[0]!.lines.map(l => l.text)
  expect(mixed.slice(1, 6)).toEqual(['Weekly reset', 'Refills your weekly limit.', mixed[3], 'Full reset', 'Refills every limit, on every model.'])
  expect(mixed.length).toBe(7)
  // No line is longer than the card shows at full size.
  expect(Math.max(...lines.map(l => l.text.length))).toBeLessThanOrEqual(44)
  // The day after the weekly reset's last day only the Fable one is left; after both, none.
  const one = resetChipsOf(held, 'rainbow', held[1]!.expires! + DAY)!.chips[0]!
  expect([one.text, one.lines[0]!.text, one.lines[one.lines.length - 1]!.text]).toEqual(['+1', '1 limit reset available', 'Use it in Settings > Usage.'])
  expect(resetChipsOf(held, 'rainbow', held[0]!.expires! + DAY)).toBeNull()
})

test('an expiry is colored by how close it is, the other way round from a reset: red when close, blue with a month to go', () => {
  const T = THEMES.dark
  const leftAt = (daysBefore: number) => resetChipsOf(held, 'rainbow', held[1]!.expires! - daysBefore * DAY)!.chips[0]!.lines.find(l => l.left !== undefined)!.left!
  // The weekly reset with 2, 12 and 40 days to go, of a 30-day horizon.
  expect(expiryColor(leftAt(2), T)).toBe('#FF073A')
  expect(expiryColor(leftAt(12), T)).toBe('#FFF01F')
  expect(expiryColor(leftAt(40), T)).toBe('#1E90FF')
  expect(leftAt(40)).toBe(100)
  // On the desktop the expiry rows carry that color under a halo, with a dot; the other rows are plain.
  const rows = flexRow(input({ resets: resetChipsOf(held, 'rainbow', held[1]!.expires! - 2 * DAY)! }), 'dark', 'level')!.resets![0]!.rows
  expect(rows[3]).toMatchObject({ color: '#FF073A', halo: true, live: false })
  expect(rows[7]).toMatchObject({ color: '#1E90FF', halo: true })
  expect(rows[0]).toMatchObject({ color: T.text, halo: false, dot: false })
})

describe('terminal', () => {
  test('the chip stands before everything, the button at the start included, and the row keeps its width', () => {
    const plain = band(input({ button: 'start' }), 120, 'dark', 'level')!
    const row = band(input({ button: 'start', resets: chips() }), 120, 'dark', 'level')!
    const text = textOfSpans(row.spans)
    expect(text.length).toBe(120)
    expect(text.startsWith('+2 ◉ 5-hour ')).toBe(true)
    // The bars give up the room; the text is the same.
    expect(text.replace(/━+/g, '━')).toBe('+2 ' + textOfSpans(plain.spans).replace(/━+/g, '━'))
  })

  test('the rainbow runs through the characters, live; one color draws each chip in it', () => {
    const rainbow = rainbowOf('dark')
    const cells = band(input({ resets: chips() }), 120, 'dark', 'level')!.spans.filter(s => s.chip)
    expect(cells.map(s => s.text).join('')).toBe('+2')
    expect(cells.map(s => s.color)).toEqual(rainbow.slice(0, 2))
    expect(cells.every(s => s.live && s.bold)).toBe(true)
    const one = band(input({ resets: chips('#B24BFF') }), 120, 'dark', 'level')!.spans.filter(s => s.chip)
    expect(one.map(s => [s.text, s.color])).toEqual([['+2', '#B24BFF']])
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
    expect(row.startsWith('+2 5-hour ')).toBe(true)
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

  test('the chip carries its count, the six rainbow colors and its card', () => {
    const row = flexRow(input({ resets: chips() }), 'dark', 'level')!
    expect(row.resets!.map(c => c.text)).toEqual(['+2'])
    expect(row.resets![0]!.colors).toEqual(rainbowOf('dark'))
    expect(row.resets![0]!.rows[1]!.text).toBe('Weekly reset')
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
    // Given the clock, it is in phase with it: drawn again 300 ms into a cycle, it carries on from there.
    expect(resetChipSvg(chip, { ...always, nowMs: 8 * 800 + 300 })).toContain('dur="800ms" begin="-300ms" repeatCount="indefinite"')
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
