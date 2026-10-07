import { describe, expect, test } from 'claude-code/testing'

import { contextRows, fmtShare, fmtTokFine, THEMES } from '../hooks/builder'
import { partsOf } from '../hooks/register'

import { BREAKDOWN_ROWS, barsOf, contextWith, dotBarsOf, mountBand, near, partsOf as rolesOf, setup, spansOf, start } from './kit'

// contextBar: `breakdown` (the default) splits the context bar into the
// categories the desktop app's own context indicator shows, in neon: Messages
// dodgerblue, System tools orangered, MCP tools darker green, Skills yellow,
// Other lime, then the autocompact buffer in grey, without a glow. The desktop
// shows the same breakdown on hover. The engine's example: 73.9k of 1M.
const CONTEXT = contextWith(73900, 1000000, BREAKDOWN_ROWS)
const DARK = ['#1E90FF', '#FF5F1F', '#00D45A', '#FFF01F', '#39FF14', '#6E7681']

test('the engine breakdown groups as the desktop app groups it', () => {
  const parts = partsOf(CONTEXT.breakdown!.categories)
  // Other is the system prompt, the MCP server instructions and the memory files; deferred tools and free space are outside.
  expect({ ...parts, rows: undefined }).toEqual({ messages: 25500, systemTools: 24300, mcpTools: 11800, skills: 6700, other: 5600, buffer: 33000, rows: undefined })
  expect(parts!.rows, 'every row in use, kept for the hover card').toHaveLength(BREAKDOWN_ROWS.length)
  expect(partsOf([]), 'nothing in use').toBeNull()
  expect(partsOf(undefined)).toBeNull()
})

test('tokens and shares read as the desktop app writes them', () => {
  expect([fmtTokFine(25500), fmtTokFine(33000), fmtTokFine(6700), fmtTokFine(850), fmtTokFine(1200000)]).toEqual(['25.5k', '33k', '6.7k', '850', '1.2M'])
  expect([fmtShare(2.55), fmtShare(0.67), fmtShare(28.72), fmtShare(3.3), fmtShare(0)]).toEqual(['2.6%', '0.67%', '29%', '3.3%', '0%'])
  const rows = contextRows({ messages: 25500, systemTools: 24300, mcpTools: 11800, skills: 6700, other: 5600, buffer: 33000 }, 1000000, THEMES.dark)
  expect(rows.map(r => r.text)).toEqual(['Messages: 25.5k, 2.6%', 'System tools: 24.3k, 2.4%', 'MCP tools: 11.8k, 1.2%', 'Skills: 6.7k, 0.67%', 'Other: 5.6k, 0.56%', 'Autocompact buffer: 33k, 3.3%'])
  expect(rows.map(r => r.color)).toEqual(DARK)
  expect(rows.map(r => r.live), 'the buffer holds still').toEqual([true, true, true, true, true, false])
})

describe('the desktop context bar', () => {
  test('a smooth bar runs through the categories up to the percent, then the buffer in grey', { options: { segments: 'context', pulseMode: 'always' } }, async ($, on) => {
    const world = setup(on, { usage: { context: CONTEXT } })
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    const bar = (await barsOf(ui))[0]!
    expect(bar.slices.map(s => s.color)).toEqual(DARK)
    // The used categories share the 7% the percent shows, in proportion; the buffer is its own 3.3% after them.
    const used = bar.slices.slice(0, 5).reduce((n, s) => n + s.grow, 0)
    near(used, 7, 0)
    expect(bar.slices[0]!.grow, 'Messages, the largest').toBeGreaterThan(bar.slices[3]!.grow)
    near(bar.slices[5]!.grow, 3.3, 1)
    expect(bar.peaks.slice(0, 5).every(p => p !== undefined), 'the used slices pulse').toBe(true)
    expect(bar.peaks[5], 'the buffer holds still').toBeUndefined()
    // The buffer stays out of the halo.
    expect(rolesOf(bar.source, 'slice-halo').map(p => p.attrs['data-grow'])).not.toContain(bar.slices[5]!.grow.toFixed(1))
    await ui.unmount()
  })

  test('dots take the category colors in turn, then the buffer, then the track', { options: { segments: 'context', desktopBars: 'dots' } }, async ($, on) => {
    const world = setup(on, { usage: { context: contextWith(400000, 1000000, [['Messages', 250000], ['System tools', 100000], ['Skills', 50000], ['Autocompact buffer', 100000, 'buffer']]) } })
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    const dots = (await dotBarsOf(ui))[0]!
    const len = dots.colors.length
    const filled = Math.round(0.4 * len)
    const colors = dots.colors
    expect(colors.slice(0, Math.round(filled * 0.625)).every(c => c === DARK[0])).toBe(true)
    expect(colors).toContain(DARK[1])
    expect(colors).toContain(DARK[3])
    expect(colors).not.toContain(DARK[2])
    expect(colors.slice(filled, filled + Math.round(0.1 * len)).every(c => c === DARK[5]), 'the buffer').toBe(true)
    expect(colors[len - 1]).toBe('#21262D')
    expect(rolesOf(dots.source, 'dot-halo').length, 'no halo on the buffer dots').toBe(filled)
    await ui.unmount()
  })

  test('contextBar: percent colors it by its percent, as before', { options: { segments: 'context', contextBar: 'percent' } }, async ($, on) => {
    const world = setup(on, { usage: { context: CONTEXT } })
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    expect((await barsOf(ui))[0]!.slices).toEqual([{ grow: 7, color: '#1E90FF' }])
    await ui.unmount()
  })

  test('without a breakdown from the engine the bar is colored by its percent', async ($, on) => {
    const world = setup(on)
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    expect((await barsOf(ui))[2]!.slices.map(s => s.color)).toEqual(['#00D45A'])
    await ui.unmount()
  })
})

describe('the desktop hover card', () => {
  test('the Context segment carries the breakdown, revealed on hover, every row the app lists', { options: { segments: 'context' } }, async ($, on) => {
    const world = setup(on, { usage: { context: CONTEXT } })
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    const anchor = await ui.find({ type: 'Box', key: 'bar-ctx' })
    expect(anchor, 'the context bar is the anchor').toBeDefined()
    const card = (anchor!.children as { type?: string; props?: Record<string, unknown>; hover?: Record<string, unknown>; children?: { type?: string; props?: Record<string, unknown> }[] }[]).find(c => c.props?.position === 'absolute')
    expect(card?.props?.display).toBe('none')
    expect(card?.hover?.display).toBe('flex')
    const rows = (card?.children ?? []).filter(c => c.type === 'Svg').map(c => String(c.props?.alt))
    // As the app's own panel: the title, the named categories largest first, the rest in use, the buffer, the free space, the deferred tools.
    expect(rows).toEqual([
      'Context window: 73.9k / 1M (7%)',
      'Messages: 25.5k, 2.6%',
      'System tools: 24.3k, 2.4%',
      'MCP tools: 11.8k, 1.2%',
      'Skills: 6.7k, 0.67%',
      'System prompt: 4.1k, 0.41%',
      'Memory files: 900, 0.09%',
      'MCP server instructions: 600, 0.06%',
      'Autocompact buffer: 33k, 3.3%',
      'Free space: 893.1k, 89%',
      'MCP tools (deferred): 64.3k, —',
    ])
    await ui.unmount()
  })

  test('contextPopup: false draws no card', { options: { segments: 'context', contextPopup: false } }, async ($, on) => {
    const world = setup(on, { usage: { context: CONTEXT } })
    await start($, world)

    const ui = await mountBand($, 'desktop', 95)
    const anchor = await ui.find({ type: 'Box', key: 'bar-ctx' })
    expect((anchor!.children as { props?: Record<string, unknown> }[]).some(c => c.props?.position === 'absolute')).toBe(false)
    await ui.unmount()
  })

  test('a response brings the new breakdown with the new percent', { options: { segments: 'context' } }, async ($, on) => {
    const world = setup(on, { usage: { context: CONTEXT } })
    await start($, world)
    world.usage = { context: contextWith(146000, 1000000, [['Messages', 100000], ['System tools', 46000], ['Autocompact buffer', 33000, 'buffer']]) }
    await $.session.measure({ context: { tokens: 146000, window: 1000000, percent: 15 }, rateLimits: [], changed: ['context'] })

    const ui = await mountBand($, 'desktop', 95)
    const bar = (await barsOf(ui))[0]!
    expect(bar.slices.map(s => s.color)).toEqual([DARK[0], DARK[1], DARK[5], '#21262D'].slice(0, 3))
    near(bar.slices[0]!.grow + bar.slices[1]!.grow, 15, 0)
    await ui.unmount()
  })
})

test('the terminal context cells run through the categories too', { options: { segments: 'context' } }, async ($, on) => {
  const world = setup(on, { usage: { context: contextWith(400000, 1000000, [['Messages', 300000], ['Skills', 100000], ['Autocompact buffer', 100000, 'buffer']]) } })
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  const spans = await spansOf(ui)
  const cells = spans.filter(s => /^━+$/.test(s.text))
  expect(cells.map(s => s.color)).toEqual([DARK[0], DARK[3], DARK[5], '#21262D'])
  expect(cells.map(s => Boolean(s.live))).toEqual([true, true, false, false])
  await ui.unmount()
})
