import { expect, test } from 'claude-code/testing'

import { FAIL, NOW, limitsBody, mountBand, ok, rowOf, setup, start } from './kit'

// The Weekly segment takes its turns with each per-model weekly limit in every
// look: both surfaces, bars and dots, level and ramp coloring, both layouts.

const ROTATE = 5_000

const LOOKS = [
  { name: 'desktop bars, level', surface: 'desktop', options: {} },
  { name: 'desktop bars, ramp', surface: 'desktop', options: { barColoring: 'ramp' } },
  { name: 'desktop dots, level', surface: 'desktop', options: { desktopBars: 'dots' } },
  { name: 'desktop dots, ramp', surface: 'desktop', options: { desktopBars: 'dots', barColoring: 'ramp' } },
  { name: 'desktop dots, ramp, glyph', surface: 'desktop', options: { desktopBars: 'dots', barColoring: 'ramp', glyph: '●' } },
  { name: 'desktop dots, light theme', surface: 'desktop', options: { desktopBars: 'dots', desktopTheme: 'light' } },
  { name: 'terminal cells, level', surface: 'terminal', options: {} },
  { name: 'terminal cells, ramp', surface: 'terminal', options: { barColoring: 'ramp' } },
  { name: 'terminal dots, ramp', surface: 'terminal', options: { barColoring: 'ramp', glyph: '●' } },
  { name: 'terminal dots, light theme', surface: 'terminal', options: { glyph: '●', theme: 'light' } },
] as const

for (const look of LOOKS) {
  test(`Weekly and Fable take turns: ${look.name}`, { options: look.options }, async ($, on) => {
    const world = setup(on, { response: ok(limitsBody(47, 28, { Fable: 62 })) })
    await start($, world)

    const ui = await mountBand($, look.surface, look.surface === 'terminal' ? 120 : 95)
    const advance = (ms: number) => (look.surface === 'terminal' ? ui.advance(ms) : world.clock.advance(ms))
    expect(await rowOf(ui)).toContain('Weekly')
    await advance(ROTATE)
    const second = await rowOf(ui)
    expect(second).toContain('Fable')
    expect(second).toContain('62%')
    await advance(ROTATE)
    expect(await rowOf(ui)).toContain('Weekly')
    await ui.unmount()
  })
}

// A session starts (or the module reloads, as it does when an option changes) while the
// stored reading holds the Fable limit and the engine reports only the all-models windows.
// The per-model window must survive, in the band and in the store every session shares.
test('a session start keeps the per-model weekly limits the stored reading has', async ($, on) => {
  const stored = {
    windows: [
      { kind: 'five_hour', percentUsed: 47 },
      { kind: 'seven_day', percentUsed: 28 },
      { kind: 'seven_day', percentUsed: 62, label: 'Fable' },
    ],
    at: NOW - 1000,
    source: 'http',
  }
  const world = setup(on, {
    store: { reading: stored },
    usage: { rateLimits: [{ kind: 'five_hour', percentUsed: 48 }, { kind: 'seven_day', percentUsed: 29 }] },
    // No fetch can bring Fable back: the band must keep it on its own.
    response: FAIL,
  })
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  expect(await rowOf(ui)).toContain(' 29% ')
  await ui.advance(ROTATE)
  expect(await rowOf(ui)).toContain('Fable')
  expect(await rowOf(ui)).toContain(' 62% ')
  await ui.unmount()
  const shared = world.store.reading as { windows: { label?: string }[] }
  expect(shared.windows.some(w => w.label === 'Fable')).toBe(true)
})
