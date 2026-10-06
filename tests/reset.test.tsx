import { describe, expect, test } from 'claude-code/testing'

import type { BandInput } from '../hooks/builder'
import { band, fmtDur, fmtResetAt, resetShare, textOf as textOfSpans, THEMES } from '../hooks/builder'
import { mix } from '../hooks/color'
import { changeKey, parseOptions } from '../hooks/register'
import { FAIL, MINUTE, NOW, clientProps, limitsBody, mountBand, ok, rowOf, setup, spansOf, start, textOf } from './kit'

// The reset field after each window's percent: a countdown or a clock time per
// window kind, and optionally colored by the time still to run. The defaults draw
// the design's text, which the golden rows pin; these tests cover the options.

// usageBody's 5-hour window resets in 193 of its 300 minutes: 64% of it still to
// run, the fourth even time range (50 to 66, yellow). The weekly one resets in
// 4560 of 10080 minutes: 45%, the third (33 to 49, darker green).
const FIVE_HOUR_TIME = '#FFF01F'
const WEEKLY_TIME = '#00D45A'

const FIVE_HOUR_CLOCK = fmtResetAt(NOW + 193 * MINUTE, false)
const WEEKLY_CLOCK = fmtResetAt(NOW + 4560 * MINUTE)
const DEFAULT_ROW = `5-hour ━━━━━━━━━━━━━━━━  42% in 3h13m │ Weekly ━━━━━━━━━━━━━━━━  55% in 3d4h   │ Context ━━━━━━━━━━━━━━━━  64% 128k/200k`

test('the countdown spells days, hours and minutes as the 5-hour window does', () => {
  expect(fmtDur(4560)).toBe('3d4h')
  expect(fmtDur(3795)).toBe('2d15h')
  expect(fmtDur(530)).toBe('8h50m')
  expect(fmtDur(1439)).toBe('23h59m')
  expect(fmtDur(47)).toBe('47m')
})

test('the 5-hour clock is the time alone, the weekly clock has its day', () => {
  const at = NOW + 193 * MINUTE
  expect(fmtResetAt(at, false)).toMatch(/^\d\d:\d\d$/)
  expect(fmtResetAt(at)).toBe(`${fmtResetAt(at).slice(0, 3)} ${fmtResetAt(at, false)}`)
})

test('the reset options default to the design and take only their own values', () => {
  const defaults = parseOptions({}).parsed
  expect([defaults.fiveHourReset, defaults.weeklyReset, defaults.resetColor]).toEqual(['countdown', 'countdown', 'plain'])
  const set = parseOptions({ fiveHourReset: 'clock', weeklyReset: 'clock', resetColor: 'time' }).parsed
  expect([set.fiveHourReset, set.weeklyReset, set.resetColor]).toEqual(['clock', 'clock', 'time'])
  // The value of the first draft, which followed the percent, is no longer one.
  expect(parseOptions({ resetColor: 'level' }).parsed.resetColor).toBe('plain')
  const bad = parseOptions({ fiveHourReset: 'sundial', weeklyReset: 'later', resetColor: 'neon' }).parsed
  expect([bad.fiveHourReset, bad.weeklyReset, bad.resetColor]).toEqual(['countdown', 'countdown', 'plain'])
})

describe('terminal', () => {
  test('weeklyReset: clock shows the day and time and keeps every bar in place', { options: { weeklyReset: 'clock' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    expect(await rowOf(ui)).toBe(DEFAULT_ROW.replace('in 3d4h  ', WEEKLY_CLOCK))
    await ui.unmount()
  })

  test('fiveHourReset: clock shows the time it resets and keeps every bar in place', { options: { fiveHourReset: 'clock' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    expect(await rowOf(ui)).toBe(DEFAULT_ROW.replace('in 3h13m', FIVE_HOUR_CLOCK.padEnd(8)))
    await ui.unmount()
  })

  test('below the full tier both windows count down whatever the options say', { options: { fiveHourReset: 'clock', weeklyReset: 'clock' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    for (const cols of [72, 56]) {
      const ui = await mountBand($, 'terminal', cols)
      const row = await rowOf(ui)
      expect(row, `at ${cols}`).toContain('3h13m')
      expect(row, `at ${cols}`).toContain('3d4h')
      expect(row, `at ${cols}`).not.toContain(FIVE_HOUR_CLOCK)
      expect(row.length, `at ${cols}`).toBe(cols)
      await ui.unmount()
    }
  })

  test('the weekly rotation keeps the bars still under the countdown', { options: { weeklyReset: 'countdown' } }, async ($, on) => {
    const world = setup(on, { response: ok(limitsBody(47, 28, { Fable: 35 })) })
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    const weekly = await rowOf(ui)
    expect(weekly).toContain('│ Weekly ')
    expect(weekly).toContain(' 28% in 3d4h ')
    await ui.advance(5_000)
    const fable = await rowOf(ui)
    expect(fable).toContain('│ Fable  ')
    expect(fable).toContain(' 35% in 3d4h ')
    expect(fable.indexOf('│ Context')).toBe(weekly.indexOf('│ Context'))
    await ui.unmount()
  })

  test("a weekly countdown on its last day fits the field the clock had", () => {
    const input = (resetMin: number): BandInput => ({
      auth: true,
      loading: false,
      stale: false,
      staleAge: '',
      windows: [
        { kind: 'five_hour', pct: 42.3, resetMin: 193 },
        { kind: 'seven_day', pct: 55, resetMin, resetAt: 'Thu 14:05', resetAs: 'countdown' },
      ],
      ctx: { pct: 64, tokens: 128000, window: 200000 },
      segments: ['five_hour', 'seven_day', 'context'],
    })
    const lastDay = textOfSpans(band(input(1439), 120, 'dark', 'level')!.spans)
    const days = textOfSpans(band(input(6 * 1440 + 23 * 60), 120, 'dark', 'level')!.spans)
    expect(lastDay).toContain(' 55% in 23h59m │')
    expect(days).toContain(' 55% in 6d23h  │')
    expect(lastDay.indexOf('Context')).toBe(days.indexOf('Context'))
  })

  test('resetColor: plain, the default, draws the reset in the text color', async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    const reset = (await spansOf(ui)).find(s => s.text === ' in 3h13m')
    expect(reset?.color).toBe('#FFFFFF')
    await ui.unmount()
  })

  test('resetColor: time colors each reset by the share of its window still to run, not by its percent', { options: { resetColor: 'time' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    const spans = await spansOf(ui)
    expect(spans.find(s => s.text === ' in 3h13m')).toMatchObject({ color: FIVE_HOUR_TIME, live: true })
    expect(spans.find(s => s.text === ' in 3d4h  ')).toMatchObject({ color: WEEKLY_TIME, live: true })
    expect(spans.find(s => s.text === ' in 3h13m')?.bold).toBeUndefined()
    // The 5-hour percent (42, dodgerblue) and its reset (yellow) are colored apart.
    expect(spans.find(s => s.text === ' 42%')?.color).toBe('#1E90FF')
    // The context's tokens are not a reset: they stay plain.
    expect(spans.find(s => s.text === ' 128k/200k')?.color).toBe('#FFFFFF')
    await ui.unmount()
  })

  test('limits that reset together share a time color whatever their percents', { options: { resetColor: 'time', weeklyReset: 'countdown', pulse: false } }, async ($, on) => {
    const world = setup(on, { response: ok(limitsBody(47, 71, { Fable: 94 })) })
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    const props = await clientProps(ui)
    const resetOf = (spans: readonly { text: string; color: string }[]) => spans.find(s => s.text.startsWith(' in 3d4h'))?.color
    const pctOf = (spans: readonly { text: string; color: string }[], pct: string) => spans.find(s => s.text === pct)?.color
    // Weekly at 71% is yellow and Fable at 94% red; both reset in 3d4h, so both resets are darker green.
    expect(pctOf(props?.spans ?? [], ' 71%')).toBe('#FFF01F')
    expect(pctOf(props?.alternates?.[0] ?? [], ' 94%')).toBe('#FF073A')
    expect(resetOf(props?.spans ?? [])).toBe(WEEKLY_TIME)
    expect(resetOf(props?.alternates?.[0] ?? [])).toBe(WEEKLY_TIME)
    await ui.unmount()
  })

  test('resetColor: time pulses the reset with the percents', { options: { resetColor: 'time', pulseMode: 'always' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    expect((await textOf(ui, ' in 3h13m'))?.color).toBe(FIVE_HOUR_TIME)
    await ui.advance(400)
    expect((await textOf(ui, ' in 3h13m'))?.color, 'the reset brightens at the peak frame').not.toBe(FIVE_HOUR_TIME)
    await ui.unmount()
  })

  test('resetColor: time fades the reset and holds it still when the reading is stale', { options: { resetColor: 'time' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    world.response = FAIL
    await world.clock.advance(60_000)
    const ui = await mountBand($, 'terminal', 120)
    // A minute has passed, so the countdown reads one minute less: 192 of 300 minutes, still the fourth time range.
    const reset = (await spansOf(ui)).find(s => s.text === ' in 3h12m')
    expect(reset?.color).toBe(mix(FIVE_HOUR_TIME, THEMES.dark.bg, 0.45))
    expect(reset?.live).toBeUndefined()
    await ui.unmount()
  })

  test('resetColor: time reaches the narrow tier too', { options: { resetColor: 'time' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'terminal', 56)
    const spans = await spansOf(ui)
    expect(spans.find(s => s.text === ' 3h13m')?.color).toBe(FIVE_HOUR_TIME)
    expect(spans.find(s => s.text === ' 3d4h')?.color).toBe(WEEKLY_TIME)
    await ui.unmount()
  })
})

describe('desktop', () => {
  /** The element the desktop drew for a reset: the Box keyed `extra-<kind>` and what it holds. */
  async function resetOf(ui: Awaited<ReturnType<typeof mountBand>>, kind: string) {
    const box = await ui.find({ type: 'Box', key: `extra-${kind}` })
    const child = box?.children[0] as { type?: string; props?: Record<string, unknown> } | undefined
    return { type: child?.type, source: String(child?.props?.source ?? '') }
  }

  test('resetColor: plain draws the reset as theme text', { options: { desktopBars: 'bars' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    expect((await resetOf(ui, 'five_hour')).type).toBe('Text')
    expect(await ui.find({ type: 'Box', key: 'extra-gap-five_hour' })).toBeUndefined()
    await ui.unmount()
  })

  test('resetColor: time draws the reset in its time color under the halo, breathing with the percents', { options: { resetColor: 'time', pulseMode: 'always' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    // The row reads as it does in plain text: the gap is text, the reset's drawing stands for its text.
    expect(await rowOf(ui)).toBe(`5-hour  42% in 3h13m │ Weekly  55% in 3d4h │ Context  64% 128k/200k`)
    expect(await textOf(ui, 'in 3h13m')).toMatchObject({ color: FIVE_HOUR_TIME, bold: false, glow: true })
    expect((await textOf(ui, 'in 3h13m'))?.peak, 'the reset pulses').toBeDefined()
    expect(await textOf(ui, 'in 3d4h')).toMatchObject({ color: WEEKLY_TIME })
    const five = await resetOf(ui, 'five_hour')
    expect(five.type).toBe('Svg')
    expect(five.source).toContain('<animate')
    expect((await resetOf(ui, 'ctx')).type).toBe('Text')
    await ui.unmount()
  })

  test('resetColor: time holds still between changes under the responsive pulse', { options: { resetColor: 'time' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    expect((await resetOf(ui, 'five_hour')).source).not.toContain('<animate')
    await ui.unmount()
  })

  test('resetColor: time with glow off draws the reset without a halo', { options: { resetColor: 'time', glow: false } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    expect(await textOf(ui, 'in 3h13m')).toMatchObject({ color: FIVE_HOUR_TIME, glow: false })
    await ui.unmount()
  })

  test('weeklyReset: clock and fiveHourReset: clock reach the desktop row', { options: { weeklyReset: 'clock', fiveHourReset: 'clock' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    expect(await rowOf(ui)).toBe(`5-hour  42% ${FIVE_HOUR_CLOCK} │ Weekly  55% ${WEEKLY_CLOCK} │ Context  64% 128k/200k`)
    await ui.unmount()
  })
})

test('the share of a window still to run is measured against its length', () => {
  expect(resetShare('five_hour', 150)).toBe(50)
  expect(resetShare('seven_day', 10080)).toBe(100)
  expect(resetShare('seven_day', 20000)).toBe(100)
  expect(resetShare('five_hour', 0)).toBe(0)
  expect(resetShare('spend_limit', 10)).toBeNull()
  expect(resetShare('five_hour', null)).toBeNull()
})

test('under resetColor: time a reset moving to the next range is a change; the minutes between are not', () => {
  const input = (resetMin: number, resetColor?: 'plain' | 'time'): BandInput => ({
    auth: true,
    loading: false,
    stale: false,
    staleAge: '',
    windows: [{ kind: 'five_hour', pct: 42.3, resetMin }],
    ctx: null,
    segments: ['five_hour'],
    ...(resetColor ? { resetColor } : {}),
  })
  // 193 and 192 minutes are both 64% of the window: the same time range.
  expect(changeKey(input(193, 'time'))).toBe(changeKey(input(192, 'time')))
  // 140 minutes is 47%: the time range below.
  expect(changeKey(input(193, 'time'))).not.toBe(changeKey(input(140, 'time')))
  // Without the option a reset never starts a pulse.
  expect(changeKey(input(193))).toBe(changeKey(input(140)))
})

test('the time ranges default to six even steps and take five ascending bounds', () => {
  expect(parseOptions({}).parsed.timeRanges).toEqual([17, 33, 50, 67, 83])
  expect(parseOptions({ timeRanges: '10,20,30,40,50' }).parsed.timeRanges).toEqual([10, 20, 30, 40, 50])
  const bad = parseOptions({ timeRanges: '50,40' })
  expect(bad.parsed.timeRanges).toEqual([17, 33, 50, 67, 83])
  expect(bad.problems.some(p => p.startsWith('timeRanges ('))).toBe(true)
})

test('timeRanges moves the time colors and leaves the percent colors alone', { options: { resetColor: 'time', timeRanges: '10,20,30,40,90', pulse: false } }, async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  const spans = await spansOf(ui)
  // 64% left is now the fifth time range (40 to 89, orangered), 45% too.
  expect(spans.find(s => s.text === ' in 3h13m')?.color).toBe('#FF5F1F')
  expect(spans.find(s => s.text === ' in 3d4h  ')?.color).toBe('#FF5F1F')
  // The percents keep the default ranges: 42 is dodgerblue, 55 lime green.
  expect(spans.find(s => s.text === ' 42%')?.color).toBe('#1E90FF')
  expect(spans.find(s => s.text === ' 55%')?.color).toBe('#39FF14')
  await ui.unmount()
})
