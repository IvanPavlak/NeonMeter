import { expect, test } from 'claude-code/testing'

import { rainbowOf } from '../hooks/builder'
import { parseOptions, PRESETS } from '../hooks/register'
import { mountBand, setup, spansOf, start } from './kit'

// A preset (`preset`) is a look by name: it sets a group of options at once,
// over whatever they are set to, so one option switches the look and `off`
// returns every option to its own value.

test('the option is off by default and takes only the name of a preset', () => {
  expect(parseOptions({}).parsed.preset).toBe('off')
  expect(parseOptions({ preset: 'rainbow' }).parsed.preset).toBe('rainbow')
  for (const value of ['on', 'toString', '', 7]) expect(parseOptions({ preset: value }).parsed.preset).toBe('off')
})

test('off, every option is as set', () => {
  const set = { rainbow: 'still', pulseMode: 'responsive', outline: 'sections', border: 'appear' }
  expect(parseOptions({ ...set, preset: 'off' }).parsed).toEqual(parseOptions(set).parsed)
})

test('rainbow puts everything in the rainbow, running without a stop, over whatever those options are set to', () => {
  const mine = { pulse: false, pulseMode: 'responsive', glow: false, rainbow: 'off', resetColor: 'plain', border: 'off', outline: 'sections', borderColor: '#FF073A', borderGlow: false, borderPulse: false, buttonGlow: false, buttonPulse: false, resetChipColor: '#B24BFF', resetChipGlow: false, resetChipPulse: false, resetChipMotion: 'still' }
  const { parsed, problems } = parseOptions({ ...mine, preset: 'rainbow' })
  expect(problems).toEqual([])
  expect(parsed).toMatchObject({ rainbow: 'circle', pulse: true, pulseMode: 'always', glow: true, resetColor: 'time', border: 'always', outline: 'single', borderColor: '', borderGlow: true, borderPulse: true, buttonGlow: true, buttonPulse: true, resetChipColor: 'rainbow', resetChipGlow: true, resetChipPulse: true, resetChipMotion: 'circle' })
  // Every option the preset names is one of those, and it names nothing else.
  expect(Object.keys(PRESETS.rainbow).sort()).toEqual(Object.keys(mine).sort())
})

test('an option a preset does not name stays as set', () => {
  const { parsed } = parseOptions({ preset: 'rainbow', barColoring: 'ramp', desktopBars: 'dots', contextBar: 'percent', button: 'always', pulseMs: 2000 })
  expect(parsed).toMatchObject({ barColoring: 'ramp', desktopBars: 'dots', contextBar: 'percent', button: 'always', pulseMs: 2000 })
})

test('the preset reaches the band the engine draws', { options: { preset: 'rainbow', rainbow: 'off' } }, async ($, on) => {
  const world = setup(on)
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  const cells = (await spansOf(ui)).filter(s => s.text === '━' && s.live)
  expect(cells.slice(0, 6).map(s => s.color)).toEqual(rainbowOf('dark'))
  await ui.unmount()
})
