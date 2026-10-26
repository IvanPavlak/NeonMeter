import { expect, test } from 'claude-code/testing'

import { barsOf, contextWith, isEngineRow, mountBand, mountPane, setup, start } from './kit'

// A Remote Control viewer (a phone, the web client) attaches as the `mobile`
// surface, which the engine never raises `AbovePrompt` on. While one is
// attached the band is drawn in a pane, which every surface draws.

const HIGH = { context: contextWith(160000, 200000, [['Messages', 160000]]) }

test('a phone attaching opens the pane, the last one leaving closes it', async ($, on) => {
  const world = setup(on)
  await start($, world)

  await $.session.attach({ surface: 'mobile', clientId: 'phone-1', viewport: { columns: 48, rows: 60, isFullscreen: false } })
  expect(world.opened).toEqual([{ id: 'neonmeter', title: 'NeonMeter' }])
  expect(world.logs.find(l => l.includes('remote client attached'))).toBe('neonmeter: remote client attached: mobile phone-1 48x60 inline')
  await $.session.attach({ surface: 'mobile', clientId: 'web-2' })
  await $.session.detach({ surface: 'mobile', clientId: 'phone-1', reason: 'detach' })
  expect(world.closed, 'one viewer still attached').toEqual([])
  await $.session.detach({ surface: 'mobile', clientId: 'web-2', reason: 'detach' })
  expect(world.closed).toEqual(['neonmeter'])
  expect(world.logs.filter(l => l.includes('pane'))).toEqual([])
})

test('a desktop attaching opens nothing; neither does a phone under remote: off', { options: { remote: 'off' } }, async ($, on) => {
  const world = setup(on)
  await start($, world)
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  await $.session.attach({ surface: 'mobile', clientId: 'phone-1' })
  expect(world.opened).toEqual([])
})

test('a pane the engine refuses to place is logged once, and the band goes on', async ($, on) => {
  const world = setup(on)
  world.openResult = { isPlaced: false, reason: 'the attached surfaces place no pane' }
  await start($, world)
  await $.session.attach({ surface: 'mobile', clientId: 'phone-1' })
  expect(world.logs.filter(l => l.includes('remote pane not placed'))).toEqual(['neonmeter: remote pane not placed: the attached surfaces place no pane'])
  const ui = await mountBand($, 'desktop', 95)
  expect(await isEngineRow(ui)).toBe(false)
  await ui.unmount()
})

test('a session start with a phone already attached (a module reload) opens the pane, unless it is still up', async ($, on) => {
  const world = setup(on, { surfaces: ['terminal', 'mobile'] })
  await start($, world)
  expect(world.opened).toEqual([{ id: 'neonmeter', title: 'NeonMeter' }])
  // The viewer adopted at the reload leaves under its own id: the pane closes with it.
  await $.session.detach({ surface: 'mobile', clientId: 'phone-1', reason: 'detach' })
  expect(world.closed).toEqual(['neonmeter'])
})

test('a session start finds the pane still up after a reload and opens no second one', async ($, on) => {
  const world = setup(on, { surfaces: ['terminal', 'mobile'] })
  world.panes = [{ id: 'neonmeter', title: 'NeonMeter', isShown: true, isFocused: false, isPlaced: true }]
  await start($, world)
  expect(world.opened).toEqual([])
})

test('the pane on the mobile surface draws the band, and its button submits the prompt', { options: { pulse: false } }, async ($, on) => {
  const world = setup(on, { usage: HIGH })
  await start($, world)

  const ui = await mountPane($, 'mobile', 90)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
  expect(texts).toContain('5-hour')
  expect(texts).toContain('Context')
  expect((await barsOf(ui)).map(b => b.kind)).toEqual(['five_hour', 'seven_day', 'ctx'])
  expect(await ui.find({ type: 'Button', key: 'button-press' }), 'the button shows at 80% of the context').toBeDefined()
  // No pointer on a phone: no breakdown card hangs on the context bar.
  const bar = await ui.find({ type: 'Box', key: 'bar-ctx' })
  expect(bar?.children, 'the bar drawing alone, no card beside it').toHaveLength(1)
  await ui.press({ key: 'button-press' })
  await world.clock.settle()
  expect(world.prompts).toHaveLength(1)
  expect(world.prompts[0]!.asUser).toBe(true)
  await ui.unmount()
})

test('the pane on the desktop draws the band too; on the terminal a note', async ($, on) => {
  const world = setup(on)
  await start($, world)

  const desktop = await mountPane($, 'desktop', 90)
  expect((await barsOf(desktop)).map(b => b.kind)).toEqual(['five_hour', 'seven_day', 'ctx'])
  await desktop.unmount()

  const terminal = await mountPane($, 'terminal', 90)
  expect((await terminal.findAll({ type: 'Text' })).map(t => t.text).join('')).toContain('above the prompt')
  await terminal.unmount()
})

test('the band above the prompt stays while a phone is attached', async ($, on) => {
  const world = setup(on)
  await start($, world)
  await $.session.attach({ surface: 'mobile', clientId: 'phone-1' })
  const ui = await mountBand($, 'desktop', 95)
  expect(await isEngineRow(ui)).toBe(false)
  await ui.unmount()
})
