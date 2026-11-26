import { expect, test } from 'claude-code/testing'

import { mountBand, setup, start, SURFACES } from './kit'

// The band is one row and holds still: the desktop app's card has a few pixels
// to scroll, and the wheel over the band moved the row by them, half out of
// the card. The band's own scrolling is refused; a survey's band, and a pane,
// scroll as the engine moves them.

const wheel = (component: 'AbovePrompt' | 'Pane', by = 1) => ({ component, requestId: 'site', offset: Math.max(0, by), by, bodyRows: 4, contentRows: 6, origin: { kind: 'person' } }) as const

for (const surface of SURFACES) {
  test(`${surface}: the wheel over the band moves nothing, either way`, async ($, on) => {
    const world = setup(on)
    await start($, world)
    const ui = await mountBand($, surface, 95)
    expect((await $.ui.scroll(wheel('AbovePrompt', 1)))?.deny).toBeDefined()
    expect((await $.ui.scroll(wheel('AbovePrompt', -1)))?.deny).toBeDefined()
    await ui.unmount()
  })
}

test('a pane scrolls as the engine moves it', async ($, on) => {
  const world = setup(on)
  let moved = 0
  on('ui.scroll', () => (moved++, {}))
  await start($, world)
  const ui = await mountBand($, 'desktop', 95)
  expect((await $.ui.scroll(wheel('Pane')))?.deny).toBeUndefined()
  expect(moved).toBe(1)
  await ui.unmount()
})

test('a survey holding the band scrolls as the engine moves it', async ($, on) => {
  const world = setup(on)
  let moved = 0
  on('ui.scroll', () => (moved++, {}))
  await start($, world)
  const ui = await mountBand($, 'desktop', 95, true)
  expect((await $.ui.scroll(wheel('AbovePrompt')))?.deny).toBeUndefined()
  expect(moved).toBe(1)
  await ui.unmount()
})
