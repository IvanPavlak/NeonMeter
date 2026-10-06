import { expect, test } from 'claude-code/testing'

import { carryOver, parseUsage, weeklyVariants } from '../hooks/register'
import { fmtResetAt } from '../hooks/builder'
import { MINUTE, NOW, clientProps, limitsBody, mountBand, ok, rowOf, setup, start, textOf } from './kit'

// The Weekly segment takes turns between every weekly window the account
// reports: the all-models one, then one per model (today `Fable`), each with
// its own percent, range color and reset time.

const ROTATE = 5_000

test('the limits list yields the 5-hour window, the weekly window and one per model', () => {
  const windows = parseUsage(limitsBody(47, 28, { Fable: 35 }))
  expect(windows?.map(w => [w.kind, w.label ?? null, w.percentUsed])).toEqual([
    ['five_hour', null, 47],
    ['seven_day', null, 28],
    ['seven_day', 'Fable', 35],
  ])
})

test('the reset time rounds to the minute, so a stamp just before midnight reads as the next day', () => {
  // 2026-10-08 00:00 local, a Thursday; the endpoint stamps a weekly reset like 23:59:59.975 the day before.
  const midnight = new Date(2026, 9, 8, 0, 0, 0, 0).getTime()
  expect(fmtResetAt(midnight - 25)).toBe('Thu 00:00')
  expect(fmtResetAt(midnight - 29_999)).toBe('Thu 00:00')
  expect(fmtResetAt(midnight - 30_001)).toBe('Wed 23:59')
})

test('a body without the limits list still reads the legacy fields', () => {
  const body = JSON.stringify({ five_hour: { utilization: 12, resets_at: null }, seven_day: { utilization: 22, resets_at: null } })
  expect(parseUsage(body)?.map(w => [w.kind, w.percentUsed])).toEqual([
    ['five_hour', 12],
    ['seven_day', 22],
  ])
})

test('one weekly window is one variant, untouched; several are padded to one label width', () => {
  const base = { auth: true, loading: false, stale: false, staleAge: '', ctx: null, segments: ['five_hour', 'seven_day', 'spend', 'context'] as const }
  const single = { ...base, windows: [{ kind: 'seven_day' as const, pct: 28 }] }
  expect(weeklyVariants(single)).toEqual([single])

  const two = weeklyVariants({ ...base, windows: [{ kind: 'seven_day' as const, pct: 28 }, { kind: 'seven_day' as const, pct: 35, label: { full: 'Fable', short: 'Fab' } }] })
  expect(two.map(v => v.windows.find(w => w.kind === 'seven_day')?.label)).toEqual([
    { full: 'Weekly', short: '7d ' },
    { full: 'Fable ', short: 'Fab' },
  ])
})

test('the engine\'s windows after a response keep the per-model weekly ones and the spend limit', () => {
  const previous = [
    { kind: 'five_hour', percentUsed: 40 },
    { kind: 'seven_day', percentUsed: 27 },
    { kind: 'seven_day', percentUsed: 34, label: 'Fable' },
    { kind: 'spend_limit', percentUsed: 112 },
  ]
  const incoming = [
    { kind: 'five_hour', percentUsed: 41 },
    { kind: 'seven_day', percentUsed: 28 },
  ]
  expect(carryOver(previous, incoming).map(w => [w.kind, w.label ?? null, w.percentUsed])).toEqual([
    ['five_hour', null, 41],
    ['seven_day', null, 28],
    ['seven_day', 'Fable', 34],
    ['spend_limit', null, 112],
  ])
})

test('the terminal row takes turns between Weekly and Fable, each with its own percent, color and reset', async ($, on) => {
  const world = setup(on, { response: ok(limitsBody(47, 28, { Fable: 62 })) })
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  const weekly = await rowOf(ui)
  expect(weekly).toContain(`│ Weekly `)
  expect(weekly).toContain(` 28% in 3d4h   │`)
  expect(weekly).toHaveLength(120)
  expect(await textOf(ui, ' 28%')).toMatchObject({ color: '#1E90FF', bold: true })

  await ui.advance(ROTATE)
  const fable = await rowOf(ui)
  expect(fable).toContain(`│ Fable  `)
  expect(fable).toContain(` 62% in 3d4h   │`)
  expect(fable).toHaveLength(120)
  // Its range color (darker green for 62) is checked at rest in the pulse-off test below.
  expect(await textOf(ui, ' 62%')).toMatchObject({ bold: true })
  // The bars do not move: the 5-hour segment and the Context segment are the same text.
  expect(fable.slice(0, fable.indexOf('│'))).toBe(weekly.slice(0, weekly.indexOf('│')))
  expect(fable.slice(fable.lastIndexOf('│'))).toBe(weekly.slice(weekly.lastIndexOf('│')))

  await ui.advance(ROTATE)
  expect(await rowOf(ui)).toBe(weekly)
  await ui.unmount()
})

test('with the pulse off, each turn shows its own range color at rest: dodgerblue for 28, darker green for 62', { options: { pulse: false } }, async ($, on) => {
  const world = setup(on, { response: ok(limitsBody(47, 28, { Fable: 62 })) })
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  expect(await textOf(ui, ' 28%')).toMatchObject({ color: '#1E90FF' })
  await ui.advance(ROTATE)
  expect(await textOf(ui, ' 62%')).toMatchObject({ color: '#00D45A' })
  await ui.unmount()
})

test('the narrow tiers use the short labels, padded alike', async ($, on) => {
  const world = setup(on, { response: ok(limitsBody(47, 28, { Fable: 35 })) })
  await start($, world)

  const ui = await mountBand($, 'terminal', 72)
  const weekly = await rowOf(ui)
  expect(weekly).toContain('│ 7d  ')
  await ui.advance(ROTATE)
  const fable = await rowOf(ui)
  expect(fable).toContain('│ Fab ')
  expect(fable).toHaveLength(weekly.length)
  await ui.unmount()
})

test('a response\'s engine windows keep the rotation going', async ($, on) => {
  const world = setup(on, { response: ok(limitsBody(47, 28, { Fable: 35 })) })
  await start($, world)
  await $.session.measure({
    context: { tokens: 1000, window: 200000, percent: 1 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 48 },
      { kind: 'seven_day', percentUsed: 29 },
    ],
    changed: ['rateLimits'],
  })

  const ui = await mountBand($, 'terminal', 120)
  expect(await rowOf(ui)).toContain(' 29% ')
  await ui.advance(ROTATE)
  expect(await rowOf(ui)).toContain('│ Fable  ')
  expect(await rowOf(ui)).toContain(' 35% ')
  await ui.unmount()
})

test('the desktop row rotates too', async ($, on) => {
  const world = setup(on, { response: ok(limitsBody(47, 28, { Fable: 35 })) })
  await start($, world)

  // The desktop band is the hooks module's own tree: its rotation is a timer
  // on the engine's clock that redraws the band.
  const ui = await mountBand($, 'desktop', 95)
  expect(await rowOf(ui)).toContain('Weekly ')
  await world.clock.advance(ROTATE)
  const row = await rowOf(ui)
  expect(row).toContain('Fable  ')
  expect(row).toContain('35%')
  expect(row).toContain('in 3d4h')
  await ui.unmount()
})

test('a single weekly window does not rotate', async ($, on) => {
  const world = setup(on, { response: ok(limitsBody(47, 28)) })
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  expect((await clientProps(ui))?.alternates).toBeUndefined()
  const before = await rowOf(ui)
  await ui.advance(ROTATE)
  expect(await rowOf(ui)).toBe(before)
  await ui.unmount()
})
