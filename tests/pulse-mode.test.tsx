import { expect, test } from 'claude-code/testing'

import { barsOf, clientProps, limitsBody, mountBand, ok, setup, start, textOf, usageBody } from './kit'

// pulseMode: `responsive` (the default) pulses `pulseCount` cycles (3 by
// default) each time a value changes, across the whole band, and holds still
// otherwise: not on the first drawing, not on a rotation turn. `always` never
// stops. The pulse cycle is 800 ms, so 400 ms into a cycle is its peak and a
// default burst lasts 2.4 s.
const PEAK = 400
const BURST = 3 * 800

/** A response that moves the context from 64% to 70%: a change. */
const MEASURE = {
  context: { tokens: 140000, window: 200000, percent: 70 },
  rateLimits: [],
  changed: ['context' as const],
}

test('responsive is the default, and the first drawing is no change', async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  const props = await clientProps(ui)
  expect(props?.pulseMode).toBe('responsive')
  expect(props?.burst.gen).toBe(0)
  await ui.advance(PEAK)
  expect(await textOf(ui, ' 42%'), 'still at what would be the peak').toMatchObject({ color: '#1E90FF' })
  await ui.unmount()
})

test('responsive: a change pulses the whole terminal row pulseCount cycles, then it holds still', async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  await $.session.measure(MEASURE)
  await ui.advance(PEAK)
  expect(await textOf(ui, ' 70%'), 'the changed percent at its peak').toMatchObject({ color: '#FFF784' })
  expect(await textOf(ui, ' 42%'), 'an unchanged one pulses with it, in phase').toMatchObject({ color: '#83C2FF' })
  await ui.advance(BURST - PEAK)
  expect(await textOf(ui, ' 70%'), 'at rest when the burst ends').toMatchObject({ color: '#FFF01F' })
  await ui.advance(PEAK)
  expect(await textOf(ui, ' 70%'), 'and it stays at rest').toMatchObject({ color: '#FFF01F' })
  await ui.advance(10_000)
  expect(await textOf(ui, ' 42%')).toMatchObject({ color: '#1E90FF' })
  await ui.unmount()
})

test('responsive: the same values again are no change', async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  await $.session.measure(MEASURE)
  await ui.advance(BURST + PEAK)
  await $.session.measure(MEASURE)
  await ui.advance(PEAK)
  expect(await textOf(ui, ' 70%')).toMatchObject({ color: '#FFF01F' })
  await ui.unmount()
})

test('responsive: a tenth of a percent the band rounds away is no change; a whole percent is', async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  world.response = ok(usageBody(42.4, 55))
  await world.clock.advance(60_000)
  await ui.advance(PEAK)
  expect(await textOf(ui, ' 42%'), '42.3 to 42.4 still reads 42%').toMatchObject({ color: '#1E90FF' })

  world.response = ok(usageBody(43.2, 55))
  await world.clock.advance(60_000)
  await ui.advance(PEAK)
  expect(await textOf(ui, ' 43%'), '43% is a change').toMatchObject({ color: '#83C2FF' })
  await ui.unmount()
})

test('responsive: a Weekly rotation turn is no change', async ($, on) => {
  const world = setup(on, { response: ok(limitsBody(47, 28, { Fable: 62 })) })
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  await ui.advance(5_000 + PEAK)
  expect(await textOf(ui, ' 62%'), "Fable's turn holds still").toMatchObject({ color: '#00D45A' })
  await ui.unmount()
})

test('pulseCount: 5 pulses five cycles after a change', { options: { pulseCount: 5 } }, async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  await $.session.measure(MEASURE)
  // The fourth cycle's peak: past the default three, within five.
  await ui.advance(3 * 800 + PEAK)
  expect(await textOf(ui, ' 70%')).toMatchObject({ color: '#FFF784' })
  await ui.advance(2 * 800)
  expect(await textOf(ui, ' 70%'), 'at rest after the fifth').toMatchObject({ color: '#FFF01F' })
  await ui.unmount()
})

test('pulseCount: 50 refuses the load', { options: { pulseCount: 50 } }, async ($, on) => {
  setup(on)
  await expect($.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })).rejects.toThrow(/Pulses per change \(?.*must be at most 20/)
})

test('pulseMode: always keeps the terminal row pulsing from the first drawing', { options: { pulseMode: 'always' } }, async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  expect((await clientProps(ui))?.pulseMode).toBe('always')
  await ui.advance(PEAK)
  expect(await textOf(ui, ' 42%')).toMatchObject({ color: '#83C2FF' })
  await ui.advance(10 * 800)
  expect(await textOf(ui, ' 42%')).toMatchObject({ color: '#83C2FF' })
  await ui.unmount()
})

test('responsive: the first desktop drawing holds still', { options: { desktopBars: 'bars' } }, async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await mountBand($, 'desktop', 95)
  for (const bar of await barsOf(ui)) {
    expect(bar.source).not.toContain('<animate')
    expect(bar.source, 'the halo stays, at rest').toContain('filter="url(#r)"')
  }
  await ui.unmount()
})

test('responsive: a change breathes every desktop drawing together for the burst', { options: { desktopBars: 'bars' } }, async ($, on) => {
  const world = setup(on)
  await start($, world)
  const first = await mountBand($, 'desktop', 95)
  await first.unmount()
  await $.session.measure(MEASURE)

  const ui = await mountBand($, 'desktop', 95)
  const bars = await barsOf(ui)
  expect(bars.map(b => b.kind)).toEqual(['five_hour', 'seven_day', 'ctx'])
  for (const bar of bars) {
    // Every drawing carries the change's number, so the unchanged ones are new images too.
    expect(bar.source).toContain('data-burst="1"')
    expect(bar.source).toContain(`begin="-0ms" repeatDur="${BURST}ms"`)
    expect(bar.source).not.toContain('repeatCount="indefinite"')
  }
  expect(bars[0]?.peaks[0]).toBe('#83C2FF')
  expect(await textOf(ui, '70%')).toMatchObject({ color: '#FFF01F', peak: '#FFF784' })
  await ui.unmount()

  // Drawn again partway through, a drawing joins the burst in phase; after it, it holds still.
  await world.clock.advance(1_000)
  const later = await mountBand($, 'desktop', 95)
  expect((await barsOf(later))[0]?.source).toContain(`begin="-1000ms" repeatDur="${BURST}ms"`)
  await later.unmount()
  await world.clock.advance(BURST)
  const after = await mountBand($, 'desktop', 95)
  expect((await barsOf(after))[0]?.source).not.toContain('<animate')
  await after.unmount()
})

test('pulseMode: always breathes every desktop drawing without a stop', { options: { pulseMode: 'always', desktopBars: 'bars' } }, async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await mountBand($, 'desktop', 95)
  const bar = (await barsOf(ui))[0]!
  expect(bar.peaks[0]).toBe('#83C2FF')
  expect(bar.source).toContain('repeatCount="indefinite"')
  expect(bar.source).not.toContain('data-burst')
  await ui.unmount()
})

// The engine reads a stored value outside the manifest's options as the default.
test('pulseMode: an unknown value reads as responsive', { options: { pulseMode: 'sometimes' } }, async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  expect((await clientProps(ui))?.pulseMode).toBe('responsive')
  await ui.unmount()
})
