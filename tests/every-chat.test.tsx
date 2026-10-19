import { expect, test } from 'claude-code/testing'

import { parseOptions, showsBand } from '../hooks/register'

import { isEngineRow, mountBand, setup, start } from './kit'

// The band shows in every open chat by default: the desktop app draws each
// chat's band, side by side in split view included. With `everyChat` off it
// shows in the chat a prompt was last sent in alone, which the plugin store
// names for every session.

test('everyChat is on by default', () => {
  expect(parseOptions({}).parsed.everyChat).toBe(true)
  expect(parseOptions({ everyChat: false }).parsed.everyChat).toBe(false)
  expect(parseOptions({ everyChat: 'no' }).parsed.everyChat).toBe(true)
})

test('off, a chat shows the band when it is the one named, or before any is', async () => {
  const at = (stored: unknown) => ({ store: { get: async () => stored } }) as unknown as Parameters<typeof showsBand>[0]
  expect(await showsBand(at(undefined), 'band-a')).toBe(true)
  expect(await showsBand(at({ band: 'band-a', at: 1 }), 'band-a')).toBe(true)
  expect(await showsBand(at({ band: 'band-b', at: 1 }), 'band-a')).toBe(false)
})

test('on, every chat draws the band whatever the store names', async ($, on) => {
  const world = setup(on, { store: { active: { band: 'band-another-chat', at: 1 } } })
  await start($, world)
  const ui = await mountBand($, 'desktop', 95)
  expect(await isEngineRow(ui)).toBe(false)
  await ui.unmount()
})

test('off, a chat the store does not name yields to the engine', { options: { everyChat: false } }, async ($, on) => {
  const world = setup(on, { store: { active: { band: 'band-another-chat', at: 1 } } })
  await start($, world)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await mountBand($, surface, 95)
    expect(await isEngineRow(ui)).toBe(true)
    await ui.unmount()
  }
})

test('off, a prompt sent here takes the band back', { options: { everyChat: false } }, async ($, on) => {
  const world = setup(on, { store: { active: { band: 'band-another-chat', at: 1 } } })
  await start($, world)
  await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' } } as Parameters<typeof $.prompt.submit>[0])
  const ui = await mountBand($, 'desktop', 95)
  expect(await isEngineRow(ui)).toBe(false)
  await ui.unmount()
})
