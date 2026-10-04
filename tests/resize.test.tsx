import { expect, test } from 'claude-code/testing'

import { bandKeyFor } from '../hooks/register'
import { bandProps, barsOf, bodyColumnsFor, mountBand, rowOf, ruleOf, setup, start } from './kit'

// A width change re-runs the hook with the new bodyColumns; the terminal
// Client under the same key receives the new spans and redraws at the new width.
test('a redraw at another width stretches the terminal row to it', async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await mountBand($, 'terminal', 93)
  expect((await rowOf(ui)).length).toBe(93)

  await ui.redraw(bandProps(bodyColumnsFor('terminal', 213)).props)
  expect((await rowOf(ui)).length, 'after widening').toBe(213)

  await ui.redraw(bandProps(bodyColumnsFor('terminal', 60)).props)
  const narrow = await rowOf(ui)
  expect(narrow.length, 'after narrowing').toBe(60)
  expect(narrow).not.toContain('━')
  await ui.unmount()
})

// The terminal band opens with a rule across the whole width in the prompt
// border's color, the line the input box has at its top; the engine's ` [-]`
// button sits on that rule, so the meter row below keeps every cell.
test('the terminal band opens with a full-width rule and a full-width meter row', async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await $.ui.mount({ ...bandProps(120), surface: 'terminal' })
  const rule = await ruleOf(ui)
  expect(rule?.text).toBe('─'.repeat(120))
  expect(rule?.props.color).toBe('promptBorder')
  const row = await rowOf(ui)
  expect(row.length).toBe(120)
  expect(row.endsWith('128k/200k')).toBe(true)

  await ui.redraw(bandProps(80).props)
  expect((await ruleOf(ui))?.text).toBe('─'.repeat(80))
  await ui.unmount()
})

test('the desktop band has no rule', async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await $.ui.mount({ ...bandProps(120), surface: 'desktop' })
  expect(await ruleOf(ui)).toBeUndefined()
  await ui.unmount()
})

// The desktop row does not depend on bodyColumns at all: the same text and
// bars at any width, the bars stretching in the layout.
test('the desktop row with smooth bars is the same at every width', { options: { desktopBars: 'bars' } }, async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await mountBand($, 'desktop', 60)
  const narrow = await rowOf(ui)
  const shape = (b: Awaited<ReturnType<typeof barsOf>>[number]) => ({ kind: b.kind, slices: b.slices, peaks: b.peaks })
  const narrowBars = (await barsOf(ui)).map(shape)
  await ui.redraw(bandProps(200).props)
  expect(await rowOf(ui)).toBe(narrow)
  expect((await barsOf(ui)).map(shape)).toEqual(narrowBars)
  expect(narrow).not.toContain('━')
  await ui.unmount()
})

// A Client is one instance per plugin, drawing and key: the key carries the
// session id so two sessions drawn by one renderer each keep their own band.
test('the band key is unique per session', async () => {
  expect(bandKeyFor('5aa9f352-083e-4123-b8d4-d6bb89dd80d9')).toBe('band-5aa9f352-083e-4123-b8d4-d6bb89dd80d9')
  expect(bandKeyFor('a/b c')).toBe('band-abc')
  expect(bandKeyFor(undefined)).toBe('band')
  expect(bandKeyFor('')).toBe('band')
})

test('a session with an id draws its band under that id', async ($, on) => {
  const world = setup(on)
  on('session.id', () => ({ value: 'session-one' }))
  await start($, world)

  const ui = await $.ui.mount({ ...bandProps(120), surface: 'terminal' })
  expect(await ui.find({ type: 'Client', key: 'band-session-one' })).toBeDefined()
  expect(await ui.find({ type: 'Client', key: 'band' })).toBeUndefined()
  await ui.unmount()
})
