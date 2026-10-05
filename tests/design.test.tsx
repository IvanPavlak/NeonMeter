import { expect, test } from 'claude-code/testing'

import { listOf, parseColors, parseGlyph, parseOptions, parseRanges } from '../hooks/register'
import { dotBarsOf, limitsBody, mountBand, ok, rowOf, setup, spansOf, start, textOf, usageBody } from './kit'

// Every part of the look is an option; at the defaults the band is the
// approved design. An invalid value falls back to its default and is logged.

test('ranges, colors and the glyph validate', () => {
  expect(parseRanges('50,60,70,80,90')).toEqual([50, 60, 70, 80, 90])
  expect(parseRanges(' 40, 55,70 ,85,95')).toEqual([40, 55, 70, 85, 95])
  expect(parseRanges('50,60,70,80')).toBeNull()
  expect(parseRanges('50,50,70,80,90')).toBeNull()
  expect(parseRanges('0,60,70,80,90')).toBeNull()
  expect(parseRanges('50,60,70,80,100')).toBeNull()

  expect(parseColors(['#111', '#222222', '#333333', '#444444', '#555555', '#abcdef'])).toEqual(['#111111', '#222222', '#333333', '#444444', '#555555', '#ABCDEF'])
  expect(parseColors(['#111111'])).toBeNull()
  expect(parseColors(['red', '#222222', '#333333', '#444444', '#555555', '#666666'])).toBeNull()

  expect(parseGlyph('■')).toBe('■')
  expect(parseGlyph('█')).toBe('█')
  expect(parseGlyph('ab')).toBeNull()
  expect(parseGlyph('🔥')).toBeNull()
  expect(parseGlyph('漢')).toBeNull()
  expect(parseGlyph('')).toBeNull()
})

test('custom range bounds move the colors', { options: { ranges: '30,40,45,50,60', pulse: false } }, async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  // 42 now falls in the third range (40 to 44): darker green, not dodgerblue.
  expect(await textOf(ui, ' 42%')).toMatchObject({ color: '#00D45A' })
  // 64 is past the last bound (60): red.
  expect(await textOf(ui, ' 64%')).toMatchObject({ color: '#FF073A' })
  await ui.unmount()
})

test('custom colors replace the palette, with stale shades and the pulse derived from them', { options: { colorsDark: ['#112233', '#223344', '#334455', '#445566', '#556677', '#667788'], barColoring: 'level' } }, async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  expect(await textOf(ui, ' 42%')).toMatchObject({ color: '#112233' })
  const filled = (await spansOf(ui)).find(s => s.text.includes('━') && s.live)
  expect(filled?.color).toBe('#112233')
  await ui.advance(400)
  expect((await textOf(ui, ' 42%'))?.color, 'pulse peak derived from the custom color').not.toBe('#112233')
  await ui.unmount()
})

test('the light colors apply on the light palette', { options: { colorsLight: ['#000001', '#000002', '#000003', '#000004', '#000005', '#000006'], pulse: false } }, async ($, on) => {
  const world = setup(on, { themeRow: 'light' })
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  expect(await textOf(ui, ' 42%')).toMatchObject({ color: '#000001' })
  await ui.unmount()
})

test('a custom glyph draws every cell, and the row keeps its width', { options: { glyph: '■', desktopBars: 'dots' } }, async ($, on) => {
  const world = setup(on)
  await start($, world)

  const terminal = await mountBand($, 'terminal', 120)
  const row = await rowOf(terminal)
  expect(row).toContain('■')
  expect(row).not.toContain('━')
  expect(row).toHaveLength(120)
  await terminal.unmount()

  // The desktop draws its dots as circles in a drawing: the glyph is the terminal's.
  const desktop = await mountBand($, 'desktop', 95)
  expect((await dotBarsOf(desktop)).map(d => d.kind)).toEqual(['five_hour', 'seven_day', 'ctx'])
  await desktop.unmount()
})

test('a glyph that is invisible or an emoji is refused', async () => {
  for (const bad of ['\u200B', '\uFEFF', ' ', '\u0301', '\u2705', '\u26A1', '\u{1F525}', '\u4E2D']) expect(parseGlyph(bad), JSON.stringify(bad)).toBeNull()
  for (const ok of ['━', '●', '■', '█', '•', '#']) expect(parseGlyph(ok), ok).toBe(ok)
})

test('invalid values fall back to the defaults and are logged once each', { options: { ranges: '90,80', colorsDark: ['nope'], glyph: '🔥' } }, async ($, on) => {
  const world = setup(on, { response: ok(usageBody(42.3, 55)) })
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  expect(await rowOf(ui)).toContain('━')
  expect(await textOf(ui, ' 42%')).toMatchObject({ bold: true })
  for (const key of ['ranges', 'colorsDark', 'glyph']) {
    expect(world.logs.filter(l => l.includes(`${key} (`)), key).toHaveLength(1)
  }
  await ui.unmount()
})

test('rotateSeconds sets how long each weekly limit shows', { options: { rotateSeconds: 10 } }, async ($, on) => {
  const world = setup(on, { response: ok(limitsBody(47, 28, { Fable: 35 })) })
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  await ui.advance(5_000)
  expect(await rowOf(ui)).toContain('│ Weekly ')
  await ui.advance(5_000)
  expect(await rowOf(ui)).toContain('│ Fable  ')
  await ui.unmount()
})

test('bar coloring is level by default and takes ramp or level as set; anything else is the default', () => {
  expect(parseOptions({}).parsed.barColoring).toBe('level')
  expect(parseOptions({ barColoring: 'ramp' }).parsed.barColoring).toBe('ramp')
  expect(parseOptions({ barColoring: 'level' }).parsed.barColoring).toBe('level')
  expect(parseOptions({ barColoring: 'rainbow' }).parsed.barColoring).toBe('level')
  expect(parseOptions({}).parsed.layout).toBe('all')
  expect(parseOptions({ layout: 'single' }).parsed.layout).toBe('single')
  expect(parseOptions({ layout: 'stacked' }).parsed.layout).toBe('all')
})

test('list options take a list or the comma-separated text Claude Code stores for them', () => {
  expect(listOf(['context', 'five_hour'])).toEqual(['context', 'five_hour'])
  expect(listOf('context, five_hour,')).toEqual(['context', 'five_hour'])
  expect(listOf('')).toBeNull()
  expect(listOf(7)).toBeNull()
  expect(parseOptions({ segments: 'context,five_hour' }).parsed.segments).toEqual(['context', 'five_hour'])
  expect(parseOptions({ segments: '' }).parsed.segments).toEqual(['five_hour', 'seven_day', 'spend', 'context'])
  expect(parseColors('#112233,#223344,#334455,#445566,#556677,#667788')).toEqual(['#112233', '#223344', '#334455', '#445566', '#556677', '#667788'])
  expect(parseColors('#112233,#223344')).toBeNull()
})

test('segments set as comma-separated text order the row', { options: { segments: 'context,five_hour' } }, async ($, on) => {
  const world = setup(on, { response: ok(limitsBody(47, 28)) })
  await start($, world)
  const ui = await mountBand($, 'terminal', 120)
  expect(await rowOf(ui)).toMatch(/^Context .*│ 5-hour /)
  await ui.unmount()
})

test('colors set as comma-separated text replace the palette', { options: { colorsDark: '#112233,#223344,#334455,#445566,#556677,#667788', pulse: false } }, async ($, on) => {
  const world = setup(on, { response: ok(limitsBody(47, 28)) })
  await start($, world)
  const ui = await mountBand($, 'terminal', 120)
  expect(await textOf(ui, ' 28%')).toMatchObject({ color: '#112233' })
  await ui.unmount()
})
