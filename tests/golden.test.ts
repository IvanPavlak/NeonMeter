import { expect, test } from 'claude-code/testing'

import { band, textOf } from '../hooks/builder'
import { GOLDEN } from './golden'
import { STATES } from './states'

// The builder reproduces every golden row of the design specification,
// character for character, at its width and tier, and every row is exactly as
// wide as its column count.
test('the builder reproduces every golden row', () => {
  const failures: string[] = []
  for (const g of GOLDEN) {
    const fixture = STATES.find(s => s.n === g.state)
    if (!fixture) {
      failures.push(`state ${g.state}: no fixture`)
      continue
    }
    const result = band(fixture.input, g.cols, 'dark', 'ramp')
    if (!result) {
      failures.push(`state ${g.state} at ${g.cols}: nothing drawn`)
      continue
    }
    const row = textOf(result.spans)
    if (row !== g.row || result.tier !== g.tier) {
      failures.push(`state ${g.state} at ${g.cols} (${result.tier}, expected ${g.tier}):\n  got      |${row}|\n  expected |${g.row}|`)
    }
    if (row.length !== g.cols && g.tier !== 'micro') {
      failures.push(`state ${g.state} at ${g.cols}: row is ${row.length} wide`)
    }
  }
  expect(failures, failures.join('\n')).toEqual([])
  expect(GOLDEN.length).toBe(50)
})

// Level coloring draws the same characters as ramp coloring: only cell colors differ.
test('level coloring changes colors, never characters', () => {
  for (const g of GOLDEN) {
    const fixture = STATES.find(s => s.n === g.state)!
    const ramp = band(fixture.input, g.cols, 'dark', 'ramp')!
    const level = band(fixture.input, g.cols, 'dark', 'level')!
    expect(textOf(level.spans)).toBe(textOf(ramp.spans))
  }
})
