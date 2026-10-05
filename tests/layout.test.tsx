import { expect, test } from 'claude-code/testing'

import { band, flexRow } from '../hooks/builder'
import { desktopDotCount, singleVariants } from '../hooks/register'
import { barsOf, dotBarsOf, limitsBody, mountBand, ok, rowOf, setup, start } from './kit'

// The single layout draws one segment across the whole row and takes turns:
// 5-hour, then every weekly window (the all-models week, then one per model),
// then spend when the account has one, then context, in the `segments` order.

const ROTATE = 5_000
const SINGLE = { layout: 'single' }

const base = { auth: true, loading: false, stale: false, staleAge: '', ctx: { pct: 64, tokens: 128000, window: 200000 }, segments: ['five_hour', 'seven_day', 'spend', 'context'] as const }
const windows = [
  { kind: 'five_hour' as const, pct: 47 },
  { kind: 'seven_day' as const, pct: 28 },
  { kind: 'seven_day' as const, pct: 62, label: { full: 'Fable', short: 'Fab' } },
]

test('one turn per segment, the weekly segment once per weekly window, spend only when there is one', () => {
  const turns = singleVariants({ ...base, windows })
  expect(turns.map(t => t.segments)).toEqual([['five_hour'], ['seven_day'], ['seven_day'], ['context']])
  // Each weekly turn holds only its own weekly window, unpadded.
  expect(turns[1]!.windows.filter(w => w.kind === 'seven_day').map(w => w.label ?? null)).toEqual([null])
  expect(turns[2]!.windows.filter(w => w.kind === 'seven_day').map(w => w.label?.full)).toEqual(['Fable'])

  const withSpend = singleVariants({ ...base, windows: [...windows, { kind: 'spend_limit' as const, pct: 112 }] })
  expect(withSpend.map(t => t.segments)).toEqual([['five_hour'], ['seven_day'], ['seven_day'], ['spend'], ['context']])
})

test('the turns follow the segments option, a missing segment is skipped, and nothing to draw is the input itself', () => {
  expect(singleVariants({ ...base, windows, segments: ['context', 'five_hour'] }).map(t => t.segments)).toEqual([['context'], ['five_hour']])
  // Without a subscription only the context takes turns, and alone it does not rotate.
  expect(singleVariants({ ...base, auth: false, windows }).map(t => t.segments)).toEqual([['context']])
  const empty = { ...base, auth: false, windows, ctx: null }
  expect(singleVariants(empty)).toEqual([empty])
  // Before the first reading the two window placeholders take turns with the context.
  expect(singleVariants({ ...base, loading: true, windows: [] }).map(t => t.segments)).toEqual([['five_hour'], ['seven_day'], ['context']])
})

test('the terminal row draws one segment edge to edge and takes turns', { options: SINGLE }, async ($, on) => {
  const world = setup(on, { response: ok(limitsBody(47, 28, { Fable: 62 })) })
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  const seen: string[] = []
  for (let i = 0; i < 5; i++) {
    const row = await rowOf(ui)
    expect(row).toHaveLength(120)
    expect(row).not.toContain('│')
    seen.push(row)
    await ui.advance(ROTATE)
  }
  expect(seen[0]).toMatch(/^5-hour ━+ +47% /)
  expect(seen[1]).toMatch(/^Weekly ━+ +28% /)
  expect(seen[2]).toMatch(/^Fable ━+ +62% /)
  expect(seen[3]).toMatch(/^Context ━+ +64% 128k\/200k$/)
  // Then it starts over.
  expect(seen[4]).toBe(seen[0])
  await ui.unmount()
})

test('ramp and level draw the same characters in the single layout', () => {
  // The coloring only changes cell colors; the characters come from one builder.
  const rows = (['ramp', 'level'] as const).map(coloring =>
    singleVariants({ ...base, windows }).map(t => band(t, 120, 'dark', coloring)!.spans.map(s => s.text).join('')),
  )
  expect(rows[1]).toEqual(rows[0])
  expect(rows[0]).toHaveLength(4)
})

test('a single-layout turn gets the dots of the whole row, not a share of it', () => {
  const all = flexRow({ ...base, windows: windows.slice(0, 2) }, 'dark', 'ramp')!
  const one = flexRow(singleVariants({ ...base, windows: windows.slice(0, 2) })[0]!, 'dark', 'ramp')!
  expect(desktopDotCount(one, 95)).toBeGreaterThan(2 * desktopDotCount(all, 95))
})

test('the terminal row follows the segments option order', { options: { ...SINGLE, segments: ['context', 'five_hour'] } }, async ($, on) => {
  const world = setup(on, { response: ok(limitsBody(47, 28, { Fable: 62 })) })
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  expect(await rowOf(ui)).toMatch(/^Context /)
  await ui.advance(ROTATE)
  expect(await rowOf(ui)).toMatch(/^5-hour /)
  await ui.advance(ROTATE)
  expect(await rowOf(ui)).toMatch(/^Context /)
  await ui.unmount()
})

test('the desktop row draws one smooth bar at a time and takes turns', { options: SINGLE }, async ($, on) => {
  const world = setup(on, { response: ok(limitsBody(47, 28, { Fable: 62 })) })
  await start($, world)

  const ui = await mountBand($, 'desktop', 95)
  const labels: string[] = []
  for (let i = 0; i < 4; i++) {
    const row = await rowOf(ui)
    expect(row).not.toContain('│')
    expect(await barsOf(ui)).toHaveLength(1)
    labels.push(row.split(' ')[0]!)
    await world.clock.advance(ROTATE)
  }
  expect(labels).toEqual(['5-hour', 'Weekly', 'Fable', 'Context'])
  await ui.unmount()
})

test('the desktop dots fill the whole row in the single layout', { options: { ...SINGLE, desktopBars: 'dots' } }, async ($, on) => {
  const world = setup(on, { response: ok(limitsBody(47, 28, { Fable: 62 })) })
  await start($, world)

  const ui = await mountBand($, 'desktop', 95)
  expect(await dotBarsOf(ui)).toHaveLength(1)
  expect(await rowOf(ui)).toMatch(/^5-hour /)
  await world.clock.advance(ROTATE)
  expect(await dotBarsOf(ui)).toHaveLength(1)
  expect(await rowOf(ui)).toMatch(/^Weekly /)
  await ui.unmount()
})

test('the default layout keeps every segment in one row', async ($, on) => {
  const world = setup(on, { response: ok(limitsBody(47, 28, { Fable: 62 })) })
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  const row = await rowOf(ui)
  expect(row).toMatch(/^5-hour .*│ Weekly .*│ Context /)
  await ui.unmount()
})
