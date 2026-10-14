import { describe, expect, test } from 'claude-code/testing'
import type { FoundElement } from 'claude-code/testing'

import { buttonColumns } from '../hooks/band'
import { buttonAction, HANDOFF_LABEL, HANDOFF_PROMPT } from '../hooks/handoff'
import { buttonShown } from '../hooks/register'

import { contextWith, mountBand, partsOf, rowOf, setup, spansOf, start } from './kit'

// The button submits a prompt as the person's own words: by default the
// built-in handoff prompt, else `buttonPrompt`. By default it appears once the
// context reaches 75% and sits at the end of the row; it is colored by the
// context percent on the same six ranges as everything else, and its hover
// card names what it does.
const HIGH = { context: { tokens: 160000, window: 200000, percent: 80 } }
const LOW = { context: { tokens: 128000, window: 200000, percent: 64 } }

test('appear shows the button from buttonAt on; always and off do what they say', () => {
  const at = (button: 'appear' | 'always' | 'off', percent: number, buttonAt = 75) => buttonShown({ button, buttonAt }, { tokens: percent * 1000, window: 100000, percent })
  expect([at('appear', 74), at('appear', 75), at('appear', 90)]).toEqual([false, true, true])
  expect([at('always', 1), at('off', 99), at('appear', 50, 50)]).toEqual([true, false, true])
  expect(buttonShown({ button: 'always', buttonAt: 75 }, { window: 200000 }), 'nothing to hand on before the first response').toBe(false)
})

test('the action: the built-in handoff prompt, or a custom prompt named by its label or its first line', () => {
  expect(buttonAction('', '')).toEqual({ prompt: HANDOFF_PROMPT, label: HANDOFF_LABEL, builtIn: true })
  expect(buttonAction('  ', 'Hand over'), 'a label of its own for the built-in prompt').toEqual({ prompt: HANDOFF_PROMPT, label: 'Hand over', builtIn: true })
  expect(buttonAction('/compact', 'Compact the conversation')).toEqual({ prompt: '/compact', label: 'Compact the conversation', builtIn: false })
  expect(buttonAction('\nSummarize what we did.\nThen stop.', ''), 'the first line names it').toEqual({ prompt: 'Summarize what we did.\nThen stop.', label: 'Summarize what we did.', builtIn: false })
  const long = 'Write down every decision we made in this session and why we made it, one per line'
  expect(buttonAction(long, '').label).toBe('Write down every decision we made in this session and why w…')
  expect(Array.from(buttonAction(long, '').label)).toHaveLength(60)
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

/** The button's ring drawing, with the hover card's text for a reader as its `alt`. */
async function ringOf(ui: Awaited<ReturnType<typeof mountBand>>): Promise<FoundElement> {
  const ring = (await ui.find({ type: 'Box', key: 'button' }))!.children as FoundElement[]
  return ring.find(c => c.type === 'Svg')!
}

describe('the desktop button', () => {
  test('it is hidden below 75% and shows, at the end of the row, from there on', async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const low = await mountBand($, 'desktop', 95)
    expect(await low.find({ type: 'Box', key: 'button' })).toBeUndefined()
    await low.unmount()

    await $.session.measure({ ...HIGH, rateLimits: [], changed: ['context'] })
    const ui = await mountBand($, 'desktop', 95)
    const pieces = await piecesOf(ui)
    expect(pieces.slice(-2), 'a cell of room, then the button').toEqual(['button-gap', 'button'])
    const svg = await ringOf(ui)
    expect(String(svg.props.alt), 'the hover card names the built-in action').toBe('Write a handoff for the next session (80% of the context used)')
    // 80% is the fifth range, orangered, drawn over the track for 80% of the way round.
    expect(partsOf(String(svg.props.source), 'ring').map(p => p.attrs.stroke)).toEqual(['#FF5F1F'])
    expect(await ui.find({ type: 'Button', key: 'button-press' })).toBeDefined()
    await ui.unmount()
  })

  test('a press submits the handoff prompt as the person', { options: { button: 'always' } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    await ui.press({ key: 'button-press' })
    await world.clock.settle()
    expect(world.prompts).toEqual([{ text: HANDOFF_PROMPT, asUser: true }])
    expect(world.compactions, 'nothing is compacted').toBe(0)
    await ui.unmount()
  })

  test('buttonPrompt and buttonLabel set what a press submits and what the card says', { options: { button: 'always', buttonPrompt: 'Summarize this session in five lines.', buttonLabel: 'Summarize the session' } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    expect(String((await ringOf(ui)).props.alt)).toBe('Summarize the session (64% of the context used)')
    await ui.press({ key: 'button-press' })
    await world.clock.settle()
    expect(world.prompts).toEqual([{ text: 'Summarize this session in five lines.', asUser: true }])
    await ui.unmount()
  })

  test('a custom prompt without a label is named by its first line', { options: { button: 'always', buttonPrompt: '\nList the open questions.\nThen stop.\n' } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    expect(String((await ringOf(ui)).props.alt)).toBe('List the open questions. (64% of the context used)')
    await ui.press({ key: 'button-press' })
    await world.clock.settle()
    expect(world.prompts, 'the prompt goes as typed, trimmed').toEqual([{ text: 'List the open questions.\nThen stop.', asUser: true }])
    await ui.unmount()
  })

  test('a double click submits once; a later press submits again', { options: { button: 'always' } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    await ui.press({ key: 'button-press' })
    await ui.press({ key: 'button-press' })
    await world.clock.settle()
    expect(world.prompts).toHaveLength(1)
    await world.clock.advance(1500)
    await ui.press({ key: 'button-press' })
    await world.clock.settle()
    expect(world.prompts).toHaveLength(2)
    await ui.unmount()
  })

  test('a press during a turn still submits: the engine runs the prompt once the turn ends', { options: { button: 'always' } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95, false, true)
    await ui.press({ key: 'button-press' })
    await world.clock.settle()
    expect(world.prompts).toHaveLength(1)
    await ui.unmount()
  })

  test('after a compaction the meter shows the context it left', async ($, on) => {
    const world = setup(on, { usage: HIGH })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    expect(await ui.find({ type: 'Box', key: 'button' })).toBeDefined()
    await ui.unmount()
    // A compaction as /compact raises it, through the plugin's hook (a compaction leaves at least one message).
    await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'the work so far', toolUses: [] }] })
    await world.clock.settle()
    expect(world.compactions).toBe(1)
    // 20k of 200k is 10%: below 75% the button goes, before any response.
    const after = await mountBand($, 'desktop', 95)
    expect(await after.find({ type: 'Box', key: 'button' })).toBeUndefined()
    await after.unmount()
  })

  for (const [position, expected] of [
    ['start', (p: string[]) => p.slice(0, 2)],
    ['end', (p: string[]) => p.slice(-2)],
  ] as const) {
    test(`buttonPosition: ${position}`, { options: { button: 'always', buttonPosition: position } }, async ($, on) => {
      const world = setup(on, { usage: LOW })
      await start($, world)
      const ui = await mountBand($, 'desktop', 95)
      const pieces = await piecesOf(ui)
      expect(expected(pieces)).toEqual(position === 'start' ? ['button', 'button-gap'] : ['button-gap', 'button'])
      await ui.unmount()
    })
  }

  test('buttonPosition: context puts it before the Context label', { options: { button: 'always', buttonPosition: 'context' } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    const pieces = await piecesOf(ui)
    const at = pieces.indexOf('button')
    expect(pieces.slice(at - 1, at + 3)).toEqual(['sep-ctx', 'button', 'button-gap', 'label-ctx'])
    await ui.unmount()
  })

  test('buttonGlow and buttonPulse turn its halo and its pulse off', { options: { button: 'always', buttonGlow: false, buttonPulse: false, pulseMode: 'always' } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    const source = String((await ringOf(ui)).props.source)
    expect(partsOf(source, 'ring-halo')).toEqual([])
    expect(source).not.toContain('<animate')
    await ui.unmount()
  })

  test('under ramp coloring the ring runs through the ranges', { options: { button: 'always', barColoring: 'ramp' } }, async ($, on) => {
    const world = setup(on, { usage: HIGH })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    expect(partsOf(String((await ringOf(ui)).props.source), 'ring').map(p => p.attrs.stroke)).toEqual(['#1E90FF', '#39FF14', '#00D45A', '#FFF01F', '#FF5F1F'])
    await ui.unmount()
  })

  test('button: off never shows it', { options: { button: 'off' } }, async ($, on) => {
    const world = setup(on, { usage: HIGH })
    await start($, world)
    const ui = await mountBand($, 'desktop', 95)
    expect(await ui.find({ type: 'Box', key: 'button' })).toBeUndefined()
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

  test('a click on its cell submits the prompt', { options: { button: 'always' } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const ui = await mountBand($, 'terminal', 120)
    await ui.pointer({ type: 'up', x: 50, y: 0, button: 'left', in: 'band' })
    await world.clock.settle()
    expect(world.prompts, 'a click elsewhere does nothing').toEqual([])
    await ui.pointer({ type: 'up', x: 119, y: 0, button: 'left', in: 'band' })
    await world.clock.settle()
    expect(world.prompts).toEqual([{ text: HANDOFF_PROMPT, asUser: true }])
    await ui.unmount()
  })

  test('buttonPosition: start and context sit inside the row', { options: { button: 'always', buttonPosition: 'context' } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const ui = await mountBand($, 'terminal', 120)
    const row = await rowOf(ui)
    expect(row).toHaveLength(120)
    expect(row).toContain('│ ◉ Context ')
    await ui.unmount()
  })

  test('buttonPulse: false holds its cell still', { options: { button: 'always', buttonPulse: false } }, async ($, on) => {
    const world = setup(on, { usage: LOW })
    await start($, world)
    const ui = await mountBand($, 'terminal', 120)
    expect((await spansOf(ui)).find(s => s.button)?.live).toBeFalsy()
    await ui.unmount()
  })
})

// The context's breakdown comes with the button: they are independent.
test('the button and the breakdown together', { options: { button: 'always', segments: 'context' } }, async ($, on) => {
  const world = setup(on, { usage: { context: contextWith(160000, 200000, [['Messages', 120000], ['System tools', 40000], ['Autocompact buffer', 33000, 'buffer']]) } })
  await start($, world)
  const ui = await mountBand($, 'desktop', 95)
  expect(await ui.find({ type: 'Box', key: 'button' })).toBeDefined()
  expect((await ui.find({ type: 'Box', key: 'bar-ctx' }))!.children).toHaveLength(2)
  await ui.unmount()
})
