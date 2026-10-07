import { describe, expect, test } from 'claude-code/testing'
import type { FoundElement } from 'claude-code/testing'

import { buttonColumns } from '../hooks/band'
import { compactShown } from '../hooks/register'

import { contextWith, mountBand, partsOf, rowOf, setup, spansOf, start } from './kit'

// The compact button compacts the conversation as /compact does. By default it
// appears once the context reaches 75% and sits at the end of the row; it
// is colored by the context percent on the same six ranges as everything else.
const HIGH = { context: { tokens: 160000, window: 200000, percent: 80 } }
const LOW = { context: { tokens: 128000, window: 200000, percent: 64 } }

test('appear shows the button from compactAt on; always and off do what they say', () => {
  const at = (compactButton: 'appear' | 'always' | 'off', percent: number, compactAt = 75) => compactShown({ compactButton, compactAt }, { tokens: percent * 1000, window: 100000, percent })
  expect([at('appear', 74), at('appear', 75), at('appear', 90)]).toEqual([false, true, true])
  expect([at('always', 1), at('off', 99), at('appear', 50, 50)]).toEqual([true, false, true])
  expect(compactShown({ compactButton: 'always', compactAt: 75 }, { window: 200000 }), 'nothing to compact before the first response').toBe(false)
})

/** The desktop band's top-level pieces, by key, in order. */
async function piecesOf(ui: Awaited<ReturnType<typeof mountBand>>): Promise<string[]> {
  const band = await ui.find({ type: 'Box', key: 'band' })
  // A found element's children are the drawn elements themselves: their key sits in their props.
  type Drawn = { props?: { key?: unknown }; children?: unknown[] }
  const keys = (node: Drawn): string[] => {
    const out: string[] = []
    for (const child of (node.children ?? []) as Drawn[]) {
      if (!child || typeof child !== 'object') continue
      const key = child.props?.key
      if (key === 'meter' || key === 'ctx') out.push(`${key}[`, ...keys(child), ']')
      else if (typeof key === 'string') out.push(key)
    }
    return out
  }
  return keys(band! as Drawn)
}

describe('the desktop button', () => {
  test('it is hidden below 75% and shows, at the end of the row, from there on', async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const low = await mountBand($, 'desktop', 95)
    expect(await low.find({ type: 'Box', key: 'compact' })).toBeUndefined()
    await low.unmount()

    await $.session.measure({ ...HIGH, rateLimits: [], changed: ['context'] })
    const ui = await mountBand($, 'desktop', 95)
    const pieces = await piecesOf(ui)
    expect(pieces.slice(-2), 'a cell of room, then the button').toEqual(['compact-gap', 'compact'])
    const ring = (await ui.find({ type: 'Box', key: 'compact' }))!.children as FoundElement[]
    const svg = ring.find(c => c.type === 'Svg')!
    expect(String(svg.props.alt)).toBe('Compact the conversation (80% of the context used)')
    // 80% is the fifth range, orangered, drawn over the track for 80% of the way round.
    expect(partsOf(String(svg.props.source), 'ring').map(p => p.attrs.stroke)).toEqual(['#FF5F1F'])
    expect(await ui.find({ type: 'Button', key: 'compact-press' })).toBeDefined()
    await ui.unmount()
  })

  test('a press compacts the conversation', { options: { compactButton: 'always' } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    await ui.press({ key: 'compact-press' })
    expect(world.compactions).toBe(1)
    await ui.unmount()
  })

  test('after the compaction the meter shows the context it left', async ($, on) => {
    const world = setup(on, { usage: HIGH })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    await ui.press({ key: 'compact-press' })
    await world.clock.advance(1000)
    expect(world.compactions).toBe(1)
    await ui.unmount()
    // 20k of 200k is 10%: below 75% the button goes, before any response.
    const after = await mountBand($, 'desktop', 95)
    expect(await after.find({ type: 'Box', key: 'compact' })).toBeUndefined()
    await after.unmount()
  })

  test('in the desktop app, a headless session, a press runs /compact', { options: { compactButton: 'always' } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    world.headless = true
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    await ui.press({ key: 'compact-press' })
    expect(world.commands).toEqual(['compact'])
    await ui.unmount()
  })

  test('a press during a turn waits for the turn to end', { options: { compactButton: 'always' } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95, false, true)
    await ui.press({ key: 'compact-press' })
    await world.clock.advance(1000)
    expect(world.compactions, 'not while the turn runs').toBe(0)
    await ui.redraw({ hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 95, scroll: { offset: 0, bodyRows: 4 }, view: {} })
    await world.clock.advance(1000)
    expect(world.compactions, 'once it ended').toBe(1)
    await ui.unmount()
  })

  for (const [position, expected] of [
    ['start', (p: string[]) => p.slice(0, 2)],
    ['end', (p: string[]) => p.slice(-2)],
  ] as const) {
    test(`compactPosition: ${position}`, { options: { compactButton: 'always', compactPosition: position } }, async ($, on) => {
      const world = setup(on, { usage: LOW })
      await start($, world)
      const ui = await mountBand($, 'desktop', 95)
      const pieces = await piecesOf(ui)
      expect(expected(pieces)).toEqual(position === 'start' ? ['compact', 'compact-gap'] : ['compact-gap', 'compact'])
      await ui.unmount()
    })
  }

  test('compactPosition: context puts it before the Context label', { options: { compactButton: 'always', compactPosition: 'context' } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    const pieces = await piecesOf(ui)
    const at = pieces.indexOf('compact')
    expect(pieces.slice(at - 1, at + 3)).toEqual(['sep-ctx', 'compact', 'compact-gap', 'label-ctx'])
    await ui.unmount()
  })

  test('compactGlow and compactPulse turn its halo and its pulse off', { options: { compactButton: 'always', compactGlow: false, compactPulse: false, pulseMode: 'always' } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    const svg = ((await ui.find({ type: 'Box', key: 'compact' }))!.children as FoundElement[]).find(c => c.type === 'Svg')!
    const source = String(svg.props.source)
    expect(partsOf(source, 'ring-halo')).toEqual([])
    expect(source).not.toContain('<animate')
    await ui.unmount()
  })

  test('under ramp coloring the ring runs through the ranges', { options: { compactButton: 'always', barColoring: 'ramp' } }, async ($, on) => {
    const world = setup(on, { usage: HIGH })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    const svg = ((await ui.find({ type: 'Box', key: 'compact' }))!.children as FoundElement[]).find(c => c.type === 'Svg')!
    expect(partsOf(String(svg.props.source), 'ring').map(p => p.attrs.stroke)).toEqual(['#1E90FF', '#39FF14', '#00D45A', '#FFF01F', '#FF5F1F'])
    await ui.unmount()
  })

  test('compactButton: off never shows it', { options: { compactButton: 'off' } }, async ($, on) => {
    const world = setup(on, { usage: HIGH })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    expect(await ui.find({ type: 'Box', key: 'compact' })).toBeUndefined()
    await ui.unmount()
  })
})

describe('the terminal button', () => {
  test('at the end: a space after the row, inside its width', async ($, on) => {
    const world = setup(on, { usage: HIGH })
    await start($, world)
    const ui = await mountBand($, 'terminal', 120)
    const row = await rowOf(ui)
    expect(row).toHaveLength(120)
    expect(row.endsWith(' ◉')).toBe(true)
    const spans = await spansOf(ui)
    const button = spans.find(s => s.button)!
    expect(button).toMatchObject({ text: '◉', color: '#FF5F1F', live: true })
    expect(buttonColumns(spans)).toEqual([119, 120])
    await ui.unmount()
  })

  test('a click on its cell compacts the conversation', { options: { compactButton: 'always' } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const ui = await mountBand($, 'terminal', 120)
    await ui.pointer({ type: 'up', x: 50, y: 0, button: 'left', in: 'band' })
    expect(world.compactions, 'a click elsewhere does nothing').toBe(0)
    await ui.pointer({ type: 'up', x: 119, y: 0, button: 'left', in: 'band' })
    expect(world.compactions).toBe(1)
    await ui.unmount()
  })

  test('compactPosition: start and context sit inside the row', { options: { compactButton: 'always', compactPosition: 'context' } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const ui = await mountBand($, 'terminal', 120)
    const row = await rowOf(ui)
    expect(row).toHaveLength(120)
    expect(row).toContain('│ ◉ Context ')
    await ui.unmount()
  })

  test('compactPulse: false holds its cell still', { options: { compactButton: 'always', compactPulse: false } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const ui = await mountBand($, 'terminal', 120)
    expect((await spansOf(ui)).find(s => s.button)?.live).toBeFalsy()
    await ui.unmount()
  })
})

// The context's breakdown comes with the button: they are independent.
test('the button and the breakdown together', { options: { compactButton: 'always', segments: 'context' } }, async ($, on) => {
  const world = setup(on, { usage: { context: contextWith(160000, 200000, [['Messages', 120000], ['System tools', 40000], ['Autocompact buffer', 33000, 'buffer']]) } })
  await start($, world)
  const ui = await mountBand($, 'desktop', 95)
  expect(await ui.find({ type: 'Box', key: 'compact' })).toBeDefined()
  expect((await ui.find({ type: 'Box', key: 'bar-ctx' }))!.children).toHaveLength(2)
  await ui.unmount()
})
