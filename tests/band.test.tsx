import { describe, expect, test } from 'claude-code/testing'

import { CONTEXT, FAIL, MINUTE, NOW, SURFACES, barsOf, clientProps, dotBarsOf, isEngineRow, mountBand, ok, partsOf, peakOf, rowOf, setup, spansOf, start, textOf, usageBody } from './kit'

// The terminal draws the cell row: one character per cell, exactly as wide as
// the row's columns, the golden rows' layout.
describe('terminal', () => {
  test('a fresh reading shows both windows and the context', async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    expect(await rowOf(ui)).toBe(`5-hour ━━━━━━━━━━━━━━━━  42% in 3h13m │ Weekly ━━━━━━━━━━━━━━━━  55% in 3d4h   │ Context ━━━━━━━━━━━━━━━━  64% 128k/200k`)
    await ui.unmount()
  })

  test('the row is exactly as wide as its columns at every tested width', async ($, on) => {
    const world = setup(on)
    await start($, world)

    for (const cols of [120, 96, 72, 56, 40]) {
      const ui = await mountBand($, 'terminal', cols)
      expect((await rowOf(ui)).length, `at ${cols}`).toBe(cols)
      await ui.unmount()
    }
  })

  test('56 columns is the narrow tier: no bar glyphs, one row', async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'terminal', 56)
    const row = await rowOf(ui)
    expect(row).not.toContain('━')
    expect(row).toBe('5h 42% 3h13m      ·      7d 55% 3d4h      ·      Ctx 64%')
    await ui.unmount()
  })

  test('a stale reading shows its age in whole minutes and counts up', async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    expect(await rowOf(ui)).not.toContain('stale')

    world.response = FAIL
    await world.clock.advance(60_000)
    expect(await rowOf(ui)).toContain('  stale 1m')
    await world.clock.advance(60_000)
    expect(await rowOf(ui)).toContain('  stale 2m')
    expect((await rowOf(ui)).length).toBe(120)
    await ui.unmount()
  })

  test('a reading older than twice pollSeconds is stale even without a failure', async ($, on) => {
    const world = setup(on)
    // The fetch never answers, so only the age rule can mark the reading stale.
    world.hang = true
    world.hangMs = 1_000_000_000
    await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
    // The session's own windows made a fresh reading at NOW.
    await $.session.measure({
      context: CONTEXT,
      rateLimits: [{ kind: 'five_hour', percentUsed: 42.3 }, { kind: 'seven_day', percentUsed: 55 }],
      changed: ['rateLimits'],
    })
    const ui = await mountBand($, 'terminal', 72)
    expect(await rowOf(ui)).not.toContain('stale')

    // The minute tick redraws the band; at the third tick the reading is 180 s old.
    // With the marker the compact tier no longer fits 72 columns, so the row is narrow and marks each window with `~`.
    await world.clock.advance(180_000)
    const row = await rowOf(ui)
    expect(row).toContain('~42%')
    expect(row).toContain('~55%')
    expect(row).toContain('Ctx 64%')
    await ui.unmount()
  })

  test('stale windows carry no live flag while the context still does', async ($, on) => {
    const world = setup(on)
    await start($, world)
    world.response = FAIL
    await world.clock.advance(60_000)

    const ui = await mountBand($, 'terminal', 120)
    // Only the context's filled cells (as ramp runs) and its percent are live.
    const live = (await spansOf(ui)).filter(s => s.live).map(s => s.text)
    expect(live.join('')).toBe('━'.repeat(8) + ' 64%')
    expect((await spansOf(ui)).find(s => s.text === ' 42%')?.live).toBeUndefined()
    expect((await textOf(ui, ' 42%'))?.color).toBe('#154A7F')
    expect(await textOf(ui, '  stale 1m')).toMatchObject({ color: '#B6B8B9', italic: true })
    await ui.unmount()
  })

  test('a null authorization hides the windows and stretches the context across the row', async ($, on) => {
    const world = setup(on, { auth: null })
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    // 120 less the fixed text (label, spaces, percent, tokens) leaves 97 cells.
    expect(await rowOf(ui)).toBe('Context ' + '━'.repeat(97) + '  64% 128k/200k')
    await ui.unmount()
  })

  test('the first load shows pulsing loading cells and an ellipsis', async ($, on) => {
    const world = setup(on)
    world.hang = true
    await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

    const ui = await mountBand($, 'terminal', 120)
    const row = await rowOf(ui)
    expect(row).toBe('5-hour ' + '━'.repeat(23) + '    … │ Weekly ' + '━'.repeat(22) + '    … │ Context ' + '━'.repeat(22) + '  64% 128k/200k')
    expect(row).toHaveLength(120)
    expect(await textOf(ui, '   …')).toMatchObject({ color: '#6E7681', bold: true })
    expect((await spansOf(ui)).find(s => s.text === '   …')?.live).toBe(true)
    await ui.unmount()
  })

  test('before the first response the context shows -- and does not pulse', async ($, on) => {
    const world = setup(on, { usage: { context: { window: 200000 } } })
    await start($, world)

    const ui = await mountBand($, 'terminal', 72)
    const row = await rowOf(ui)
    expect(row).toBe('5h ' + '━'.repeat(10) + '  42% 3h13m │ 7d ' + '━'.repeat(10) + '  55% 3d4h  │ Ctx ' + '━'.repeat(9) + '   --')
    expect(row).toHaveLength(72)
    expect((await spansOf(ui)).find(s => s.text === '  --')?.live).toBeUndefined()
    expect(await textOf(ui, '  --')).toMatchObject({ color: '#FFFFFF' })
    await ui.unmount()
  })

  test('segments orders and filters the row', { options: { segments: ['context', 'five_hour'] } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'terminal', 96)
    const row = await rowOf(ui)
    expect(row.startsWith('Context ')).toBe(true)
    expect(row).toContain('5-hour')
    expect(row).not.toContain('Weekly')
    expect(row).toHaveLength(96)
    await ui.unmount()
  })

  test('unknown and repeated segments are dropped and logged once', { options: { segments: ['five_hour', 'bogus', 'five_hour', 'context'] } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'terminal', 96)
    const row = await rowOf(ui)
    expect(row).toContain('5-hour')
    expect(row).toContain('Context')
    expect(row).not.toContain('Weekly')
    const lines = world.logs.filter(line => line.includes('ignoring unknown or repeated segments'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('bogus, five_hour')
    await ui.unmount()
  })

  test('each percent carries its range color for the resolved theme', async ($, on) => {
    const world = setup(on, { response: ok(usageBody(81.6, 18.2)) })
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    expect(await textOf(ui, ' 82%')).toMatchObject({ color: '#FF5F1F', bold: true })
    expect(await textOf(ui, ' 18%')).toMatchObject({ color: '#1E90FF', bold: true })
    expect(await textOf(ui, ' 64%')).toMatchObject({ color: '#00D45A', bold: true })
    expect(await textOf(ui, ' │ ')).toMatchObject({ color: '#6E7074' })
    await ui.unmount()
  })

  test('barColoring: ramp runs the ranges across the filled part', { options: { barColoring: 'ramp' } }, async ($, on) => {
    const world = setup(on, { response: ok(usageBody(81.6, 18.2)) })
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    // The 5-hour bar: 16 cells, 13 filled. 82% is in the fifth range, so the fill runs through
    // five ranges in near-equal stretches and ends in the percent's own color (orangered).
    const runs = (await spansOf(ui)).slice(1, 7).map(s => [s.text.length, s.color])
    expect(runs).toEqual([
      [3, '#1E90FF'],
      [3, '#39FF14'],
      [2, '#00D45A'],
      [3, '#FFF01F'],
      [2, '#FF5F1F'],
      [3, '#21262D'],
    ])
    await ui.unmount()
  })

  test('level coloring by default colors every filled cell by the percent', async ($, on) => {
    const world = setup(on, { response: ok(usageBody(81.6, 18.2)) })
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    expect((await spansOf(ui)).slice(1, 3).map(s => [s.text.length, s.color])).toEqual([
      [13, '#FF5F1F'],
      [3, '#21262D'],
    ])
    await ui.unmount()
  })

  test('the pulse brightens live spans at the peak frame, in phase, with no background, and leaves the rest alone', { options: { pulseMode: 'always' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    expect(await textOf(ui, ' 42%')).toMatchObject({ color: '#1E90FF' })

    await ui.advance(400)
    expect(await textOf(ui, ' 42%')).toMatchObject({ color: '#83C2FF' })
    expect(await textOf(ui, ' 55%')).toMatchObject({ color: '#92FF7E' })
    expect(await textOf(ui, ' 64%')).toMatchObject({ color: '#73E7A4' })
    expect((await textOf(ui, ' 42%'))?.backgroundColor, 'no background tint at the peak').toBeUndefined()
    expect(await textOf(ui, '5-hour ')).toMatchObject({ color: '#FFFFFF' })

    await ui.advance(400)
    expect(await textOf(ui, ' 42%')).toMatchObject({ color: '#1E90FF' })
    await ui.unmount()
  })

  test('pulse: false draws every span at rest and never moves', { options: { pulse: false } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    await ui.advance(400)
    expect(await textOf(ui, ' 42%')).toMatchObject({ color: '#1E90FF' })
    expect((await clientProps(ui))?.pulse).toBe(false)
    await ui.unmount()
  })

  test('pulseMs scales the frame interval', { options: { pulseMs: 1600, pulseMode: 'always' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    expect((await clientProps(ui))?.pulseMs).toBe(1600)
    await ui.advance(400)
    // 400 ms is frame 2 of a 1600 ms cycle: half intensity (blended 22.5% toward white), not the peak.
    expect(await textOf(ui, ' 42%')).toMatchObject({ color: '#51A9FF' })
    await ui.advance(400)
    expect(await textOf(ui, ' 42%')).toMatchObject({ color: '#83C2FF' })
    await ui.unmount()
  })

  // The engine holds a stored option to the manifest's `min` and `max` before the
  // module loads, so an out-of-range pulseMs refuses the load, naming the field.
  test('pulseMs: 100 refuses the load', { options: { pulseMs: 100 } }, async ($, on) => {
    setup(on)
    await expect($.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })).rejects.toThrow(/Pulse cycle \(ms\) must be at least 400/)
  })

  test('theme: auto follows the Claude Code theme row and swaps on config.set', async ($, on) => {
    const world = setup(on, { themeRow: 'light-daltonized' })
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    expect(await textOf(ui, ' 42%')).toMatchObject({ color: '#1874D2' })
    expect(await textOf(ui, '5-hour ')).toMatchObject({ color: '#000000' })
    expect((await clientProps(ui))?.ground).toBe('#FFFFFF')

    await $.config.set({ key: 'theme', value: 'dark', previous: 'light-daltonized', provider: { plugin: 'engine', tier: 'core' }, origin: { kind: 'composer' } })
    expect(await textOf(ui, ' 42%')).toMatchObject({ color: '#1E90FF' })
    expect((await clientProps(ui))?.ground).toBe('#0D1117')
    await ui.unmount()
  })

  test('theme: light forces the light palette whatever the row says', { options: { theme: 'light' } }, async ($, on) => {
    const world = setup(on, { themeRow: 'dark' })
    await start($, world)

    const ui = await mountBand($, 'terminal', 120)
    expect(await textOf(ui, ' 42%')).toMatchObject({ color: '#1874D2' })
    await $.config.set({ key: 'theme', value: 'dark', previous: 'dark', provider: { plugin: 'engine', tier: 'core' }, origin: { kind: 'composer' } })
    expect(await textOf(ui, ' 42%')).toMatchObject({ color: '#1874D2' })
    await ui.unmount()
  })

  test('a session.measure updates the percent without a fetch', async ($, on) => {
    const world = setup(on)
    await start($, world)
    expect(world.fetches).toHaveLength(1)

    const ui = await mountBand($, 'terminal', 72)
    await $.session.measure({
      context: { tokens: 148000, window: 200000, percent: 74 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 77, resetsAt: new Date(NOW + 64 * MINUTE).toISOString() },
        { kind: 'seven_day', percentUsed: 18.2, resetsAt: new Date(NOW + 4560 * MINUTE).toISOString() },
      ],
      changed: ['context', 'rateLimits'],
    })
    expect(await rowOf(ui)).toBe('5h ━━━━━━━  77% 1h04m │ 7d ━━━━━━  18% 3d4h  │ Ctx ━━━━━━  74% 148k/200k')
    expect(world.fetches).toHaveLength(1)
    await ui.unmount()
  })

  test('a spend limit from the session draws without a bar and survives the next fetch', async ($, on) => {
    const world = setup(on, {
      usage: {
        rateLimits: [
          { kind: 'five_hour', percentUsed: 38, resetsAt: new Date(NOW + 201 * MINUTE).toISOString() },
          { kind: 'seven_day', percentUsed: 21, resetsAt: new Date(NOW + 4560 * MINUTE).toISOString() },
          { kind: 'spend_limit', percentUsed: 112 },
        ],
      },
      response: ok(usageBody(38, 21)),
    })
    await start($, world)

    // The session's own windows never postpone the fetch, so session start fetches at once: the body's
    // windows replace the session's (its 5-hour reset is 193 minutes from NOW), and the spend limit stays.
    expect(world.fetches).toHaveLength(1)
    const ui = await mountBand($, 'terminal', 120)
    expect(await rowOf(ui)).toBe(`5-hour ${'━'.repeat(12)}  38% in 3h13m │ Weekly ${'━'.repeat(12)}  21% in 3d4h   │ Spend 112% │ Context ${'━'.repeat(11)}  64% 128k/200k`)
    expect(await textOf(ui, '112%')).toMatchObject({ color: '#FF073A', bold: true })

    // A period later the poll fetches again, and the spend limit still stays.
    await world.clock.advance(60_000)
    expect(world.fetches).toHaveLength(2)
    const row = await rowOf(ui)
    expect(row).toContain(' 38% in 3h12m')
    expect(row).toContain(' │ Spend 112% │ ')
    expect(row).toHaveLength(120)
    await ui.unmount()
  })
})

// The desktop band is drawn in a proportional font, so the hooks module draws
// it as full labels and fields plus bar drawings that stretch to the pixels
// available: smooth bars (the default) or dots.
describe('desktop, desktopBars: dots', () => {
  test('a fresh reading draws dot bars of one length, colored like the terminal cells', { options: { desktopBars: 'dots', barColoring: 'ramp' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    expect(await rowOf(ui)).toContain('5-hour ')
    expect((await barsOf(ui)).length, 'no smooth bars').toBe(0)
    const dots = await dotBarsOf(ui)
    expect(dots.map(d => d.kind)).toEqual(['five_hour', 'seven_day', 'ctx'])
    const len = dots[0]!.colors.length
    expect(len).toBeGreaterThanOrEqual(4)
    for (const bar of dots) expect(bar.colors.length, bar.kind).toBe(len)

    // 42.3% fills round(0.423 x len) dots, all dodgerblue (ramp below 50); the rest is the track.
    const filled = Math.max(1, Math.round(0.423 * len))
    expect(dots[0]!.colors.slice(0, filled).every(c => c === '#1E90FF')).toBe(true)
    expect(dots[0]!.colors.slice(filled).every(c => c === '#21262D'), 'the track').toBe(true)
    // 64% is in the third range: the fill runs blue, lime, darker green.
    expect(dots[2]!.colors).toContain('#39FF14')
    expect(dots[2]!.colors).toContain('#00D45A')
    await ui.unmount()
  })

  test('the dot count grows with the band', { options: { desktopBars: 'dots' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const narrow = await mountBand($, 'desktop', 80)
    const few = (await dotBarsOf(narrow))[0]!.colors.length
    await narrow.unmount()
    const wide = await mountBand($, 'desktop', 200)
    const many = (await dotBarsOf(wide))[0]!.colors.length
    await wide.unmount()
    expect(many).toBeGreaterThan(few)
  })

  test('live dots pulse and empty dots stay still', { options: { desktopBars: 'dots', pulseMode: 'always' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    const bar = (await dotBarsOf(ui))[0]!
    // A live dot's fill animates to its peak and back; its halo widens with it.
    expect(bar.peaks[0]).toBe('#83C2FF')
    expect(bar.source).toContain('attributeName="stdDeviation" values="3;6;3" dur="800ms"')
    expect(bar.peaks[bar.peaks.length - 1], 'empty dot still').toBeUndefined()
    expect(bar.colors[bar.colors.length - 1]).toBe('#21262D')
    await ui.unmount()
  })

  test('stale window dots fade and freeze', { options: { desktopBars: 'dots', barColoring: 'ramp', pulseMode: 'always' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)
    world.response = FAIL
    await world.clock.advance(60_000)

    const ui = await mountBand($, 'desktop', 95)
    const dots = await dotBarsOf(ui)
    expect(dots[0]!.colors[0]).toBe('#154A7F')
    expect(dots[0]!.peaks[0], 'stale dot frozen').toBeUndefined()
    expect(dots[2]!.peaks[0], 'context still pulsing').toBe('#83C2FF')
    await ui.unmount()
  })
})

describe('desktop, desktopBars: bars (the default)', () => {
  test('a fresh reading shows full labels, fields and three weighted bars', { options: { desktopBars: 'bars', barColoring: 'ramp', pulseMode: 'always' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    expect(await rowOf(ui)).toBe(`5-hour  42% in 3h13m │ Weekly  55% in 3d4h │ Context  64% 128k/200k`)
    const bars = await barsOf(ui)
    expect(bars.map(b => b.kind)).toEqual(['five_hour', 'seven_day', 'ctx'])
    // The filled slices, in hundredths of the bar; the rest of the rounded bar is the track.
    for (const bar of bars) {
      expect(bar.slices.reduce((n, s) => n + s.grow, 0), bar.kind).toBeLessThanOrEqual(100)
      expect(bar.track, bar.kind).toBe('#21262D')
    }
    // Ramp coloring: the fill runs through the ranges up to the percent's in equal stretches.
    // 42.3 is all dodgerblue; 55 is half dodgerblue, half lime; 64 is thirds up to darker green.
    expect(bars[0]?.slices).toEqual([{ grow: 42.3, color: '#1E90FF' }])
    expect(bars[1]?.slices).toEqual([
      { grow: 27.5, color: '#1E90FF' },
      { grow: 27.5, color: '#39FF14' },
    ])
    expect(bars[2]?.slices).toEqual([
      { grow: 21.3, color: '#1E90FF' },
      { grow: 21.3, color: '#39FF14' },
      { grow: 21.3, color: '#00D45A' },
    ])
    // The filled part is clipped to the rounded shape and sits on its halo.
    expect(bars[0]?.source).toContain('<clipPath id="c">')
    expect(bars[0]?.source).toContain('filter="url(#g)"')
    expect(await textOf(ui, '42%')).toMatchObject({ color: '#1E90FF', bold: true, glow: true })
    expect(await textOf(ui, ' │ ')).toMatchObject({ color: 'inactive' })
    await ui.unmount()
  })

  test('level coloring by default draws one slice in the range color', { options: { desktopBars: 'bars' } }, async ($, on) => {
    const world = setup(on, { response: ok(usageBody(81.6, 18.2)) })
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    const bars = await barsOf(ui)
    expect(bars[0]?.slices).toEqual([{ grow: 81.6, color: '#FF5F1F' }])
    await ui.unmount()
  })

  test('a stale reading fades the window bars and shows the age; the context stays live', { options: { desktopBars: 'bars', barColoring: 'ramp', pulseMode: 'always' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)
    world.response = FAIL
    await world.clock.advance(60_000)

    const ui = await mountBand($, 'desktop', 95)
    expect(await rowOf(ui)).toContain('  stale 1m')
    expect(await textOf(ui, '  stale 1m')).toMatchObject({ color: 'inactive', italic: true })
    const bars = await barsOf(ui)
    expect(bars[0]?.slices[0]).toEqual({ grow: 42.3, color: '#154A7F' })
    expect(await textOf(ui, '42%')).toMatchObject({ color: '#154A7F' })
    expect((await textOf(ui, '42%'))?.peak, 'stale percent frozen').toBeUndefined()
    expect((await textOf(ui, '64%'))?.peak, 'context percent pulsing').toBe('#73E7A4')
    expect(bars[0]?.peaks[0], 'stale bar frozen').toBeUndefined()
    expect(bars[2]?.peaks[0], 'context bar pulsing').toBe('#83C2FF')
    await ui.unmount()
  })

  test('a null authorization leaves the context alone with its bar', { options: { desktopBars: 'bars' } }, async ($, on) => {
    const world = setup(on, { auth: null })
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    expect(await rowOf(ui)).toBe('Context  64% 128k/200k')
    expect((await barsOf(ui)).map(b => b.kind)).toEqual(['ctx'])
    await ui.unmount()
  })

  test('the first load shows grey pulsing bars and an ellipsis', { options: { desktopBars: 'bars', pulseMode: 'always' } }, async ($, on) => {
    const world = setup(on)
    world.hang = true
    await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

    const ui = await mountBand($, 'desktop', 95)
    expect(await rowOf(ui)).toBe('5-hour  … │ Weekly  … │ Context  64% 128k/200k')
    const bars = await barsOf(ui)
    expect(bars[0]?.slices).toEqual([{ grow: 100, color: '#6E7681' }])
    expect(await textOf(ui, '…')).toMatchObject({ color: '#6E7681', bold: true })
    expect(bars[0]?.peaks[0], 'the loading bar pulses').toBe('#AFB4BA')
    await ui.unmount()
  })

  test('before the first response the context bar is empty and shows --', { options: { desktopBars: 'bars' } }, async ($, on) => {
    const world = setup(on, { usage: { context: { window: 200000 } } })
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    expect(await rowOf(ui)).toBe(`5-hour  42% in 3h13m │ Weekly  55% in 3d4h │ Context  --`)
    expect((await barsOf(ui))[2]?.slices, 'nothing filled').toEqual([])
    expect((await barsOf(ui))[2]?.track).toBe('#21262D')
    expect(await textOf(ui, '--')).toMatchObject({ color: 'text' })
    await ui.unmount()
  })

  test('the pulse brightens live bars and percents at the peak frame and leaves the rest alone', { options: { desktopBars: 'bars', barColoring: 'ramp', pulseMode: 'always' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    const bars = await barsOf(ui)
    expect(bars[0]?.peaks[0]).toBe('#83C2FF')
    expect(bars[0]?.slices[0]?.color, 'at rest in its own color').toBe('#1E90FF')
    expect(bars[1]?.peaks[1]).toBe('#92FF7E')
    expect(await textOf(ui, '55%')).toMatchObject({ color: '#39FF14', peak: '#92FF7E' })
    expect(await textOf(ui, '5-hour ')).toMatchObject({ color: 'text' })
    await ui.unmount()
  })

  test('glow: false draws bars, dots and percents without a halo; the pulse stays', { options: { glow: false, pulseMode: 'always' } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    const bar = (await barsOf(ui))[0]!
    expect(bar.source).not.toContain('filter="url(#')
    expect(bar.peaks[0], 'still pulsing').toBe('#83C2FF')
    expect(await textOf(ui, '42%')).toMatchObject({ color: '#1E90FF', glow: false, peak: '#83C2FF' })
    await ui.unmount()
  })

  test('pulse: false keeps every bar at rest', { options: { desktopBars: 'bars', pulse: false } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    const bar = (await barsOf(ui))[0]!
    expect(bar.slices[0]?.color).toBe('#1E90FF')
    expect(bar.peaks[0]).toBeUndefined()
    expect(bar.source).not.toContain('<animate')
    expect(bar.source, 'the halo stays, at rest').toContain('filter="url(#r)"')
    await ui.unmount()
  })

  test('theme: auto follows the Claude Code theme row', { options: { desktopBars: 'bars' } }, async ($, on) => {
    const world = setup(on, { themeRow: 'light' })
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    expect((await barsOf(ui))[0]?.slices).toEqual([{ grow: 42.3, color: '#1874D2' }])
    expect((await barsOf(ui))[0]?.track).toBe('#EBEDF0')
    expect(await textOf(ui, '5-hour ')).toMatchObject({ color: 'text' })
    await ui.unmount()
  })

  test('segments orders and filters the row', { options: { desktopBars: 'bars', segments: ['context', 'five_hour'] } }, async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    expect(await rowOf(ui)).toBe('Context  64% 128k/200k │ 5-hour  42% in 3h13m')
    expect((await barsOf(ui)).map(b => b.kind)).toEqual(['ctx', 'five_hour'])
    await ui.unmount()
  })

  test('a spend limit draws without a bar', { options: { desktopBars: 'bars' } }, async ($, on) => {
    const world = setup(on, {
      usage: { rateLimits: [{ kind: 'five_hour', percentUsed: 38 }, { kind: 'seven_day', percentUsed: 21 }, { kind: 'spend_limit', percentUsed: 112 }] },
      response: ok(usageBody(38, 21)),
    })
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    expect(await rowOf(ui)).toContain(' │ Spend 112% │ ')
    expect((await barsOf(ui)).map(b => b.kind)).toEqual(['five_hour', 'seven_day', 'ctx'])
    expect(await textOf(ui, '112%')).toMatchObject({ color: '#FF073A', bold: true })
    await ui.unmount()
  })
})

// Both surfaces.
test('hasSurvey yields to the engine', async ($, on) => {
  const world = setup(on)
  await start($, world)

  for (const surface of SURFACES) {
    const ui = await mountBand($, surface, 120, true)
    expect(await isEngineRow(ui)).toBe(true)
    await ui.unmount()
  }
})

test('segments with windows only and no credential yields to the engine', { options: { segments: ['five_hour', 'seven_day'] } }, async ($, on) => {
  const world = setup(on, { auth: null })
  await start($, world)

  for (const surface of SURFACES) {
    const ui = await mountBand($, surface, 120)
    expect(await isEngineRow(ui)).toBe(true)
    await ui.unmount()
  }
})

// The desktop app's light or dark appearance is not readable by a mod: its
// neutral colors are theme keys the app paints itself, and its neon palette
// is `desktopTheme`, the terminal's resolved theme under `auto`.
test('desktop neutrals are theme keys on either palette', async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await mountBand($, 'desktop', 95)
  expect(await textOf(ui, '5-hour ')).toMatchObject({ color: 'text' })
  expect(await textOf(ui, ' │ ')).toMatchObject({ color: 'inactive' })
  await ui.unmount()
})

test('desktopTheme: light draws the light neon palette on the desktop while the terminal stays dark', { options: { desktopTheme: 'light', pulse: false } }, async ($, on) => {
  const world = setup(on, { themeRow: 'dark' })
  await start($, world)

  const desktop = await mountBand($, 'desktop', 95)
  expect(await textOf(desktop, '42%')).toMatchObject({ color: '#1874D2' })
  await desktop.unmount()

  const terminal = await mountBand($, 'terminal', 120)
  expect(await textOf(terminal, ' 42%')).toMatchObject({ color: '#1E90FF' })
  expect(await textOf(terminal, '5-hour ')).toMatchObject({ color: '#FFFFFF' })
  await terminal.unmount()
})

test('desktopTheme: auto follows the terminal theme', { options: { pulse: false } }, async ($, on) => {
  const world = setup(on, { themeRow: 'light' })
  await start($, world)

  const ui = await mountBand($, 'desktop', 95)
  expect(await textOf(ui, '42%')).toMatchObject({ color: '#1874D2' })
  await ui.unmount()
})

// The bar's tip always shows the percent's own range color: a 74% bar ends
// yellow even when its last cell's center falls in the darker green range.
test("the last filled cell or dot takes the percent's range color", { options: { pulse: false, desktopBars: 'dots' } }, async ($, on) => {
  const world = setup(on, { usage: { context: { tokens: 148000, window: 200000, percent: 74 } } })
  await start($, world)

  const terminal = await mountBand($, 'terminal', 72)
  const cells = (await spansOf(terminal)).filter(s => s.text.includes('━') && s.color !== '#21262D')
  expect(cells[cells.length - 1]?.color, 'terminal tip').toBe('#FFF01F')
  await terminal.unmount()

  const desktop = await mountBand($, 'desktop', 95)
  const dots = (await dotBarsOf(desktop))[2]!.colors.filter(c => c !== '#21262D')
  expect(dots[dots.length - 1], 'desktop tip').toBe('#FFF01F')
  await desktop.unmount()
})

// The kit reads the desktop drawings by `data-role`, so attribute order and
// position in the markup do not matter to any assertion above.
test('drawing parts are found by role whatever their attribute order', () => {
  const a = '<svg><g><rect data-role="slice" fill="#1E90FF" data-grow="42.0"><animate attributeName="fill" values="#1E90FF;#83C2FF;#1E90FF"/></rect></g></svg>'
  const b = '<svg><g><rect data-grow="42.0" fill="#1E90FF" x="1" data-role="slice"><animate values="#1E90FF;#83C2FF;#1E90FF" attributeName="fill"/></rect></g></svg>'
  for (const markup of [a, b]) {
    const [slice] = partsOf(markup, 'slice')
    expect(slice?.attrs.fill).toBe('#1E90FF')
    expect(slice?.attrs['data-grow']).toBe('42.0')
    expect(peakOf(slice!.inner)).toBe('#83C2FF')
  }
  expect(partsOf(a, 'track')).toEqual([])
})
