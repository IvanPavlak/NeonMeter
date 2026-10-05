// Dumps the terminal rows the README's terminal.svg draws, from the plugin's own builder:
// both themes at 120, 72 and 40 columns in the default layout and level coloring, the
// default (one row per Weekly turn: the all-models week, then Fable), the default layout at
// 120 columns with ramp coloring and with `●` cells in either coloring, and the single
// layout at 120 columns with level coloring, ramp coloring and `●` cells in either coloring
// (one row per turn: 5-hour, Weekly, Fable, Context). Run from anywhere with Node 22.18 or later
// (it imports hooks/builder.ts directly), then draw the graphics:
//
//     node design/readme/rows.mjs
//     python design/readme/make.py
//
// `node design/readme/rows.mjs --check` compares instead of writing and exits 1 on a difference.

import { readFileSync, writeFileSync } from 'node:fs'
import { register } from 'node:module'

// builder.ts imports './color' without an extension, as the engine resolves it; Node needs the `.ts`.
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (/^\\.\\.?\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier)) {
    try { return await next(specifier + '.ts', context) } catch {}
  }
  return next(specifier, context)
}`))

const { band, configureDesign } = await import(new URL('../../hooks/builder.ts', import.meta.url))
const out = new URL('./terminal-rows.json', import.meta.url)

// The account the README shows: 82% of the 5-hour window, 18% of the week and 69% of the
// Fable week, both resetting Sunday 18:00, and 930k of a 1M context.
const fiveHour = { kind: 'five_hour', pct: 82, resetMin: 193 }
const weekly = { kind: 'seven_day', pct: 18.2, resetMin: 4560, resetAt: 'Sun 18:00' }
const fable = { kind: 'seven_day', pct: 69, resetMin: 4560, resetAt: 'Sun 18:00', label: { full: 'Fable', short: 'Fab' } }
const input = {
  auth: true,
  loading: false,
  stale: false,
  staleAge: '',
  windows: [fiveHour],
  ctx: { pct: 93, tokens: 930000, window: 1000000 },
  segments: ['five_hour', 'seven_day', 'spend', 'context'],
}

// The default layout's turns, as the plugin's weeklyVariants makes them: the weekly labels padded to one width.
const allTurns = [
  { ...input, windows: [fiveHour, { ...weekly, label: { full: 'Weekly', short: '7d ' } }] },
  { ...input, windows: [fiveHour, { ...fable, label: { full: 'Fable ', short: 'Fab' } }] },
]
// The single layout's turns, as the plugin's singleVariants makes them: one segment each, unpadded.
const singleTurns = [
  { ...input, windows: [fiveHour], segments: ['five_hour'] },
  { ...input, windows: [fiveHour, weekly], segments: ['seven_day'] },
  { ...input, windows: [fiveHour, fable], segments: ['seven_day'] },
  { ...input, segments: ['context'] },
]

const rows = {}
// `cell` is the `glyph` option: `●` draws the terminal's dotted bars, the default `━` a continuous one.
const draw = (turns, cols, theme, coloring = 'level', cell) => {
  configureDesign(cell ? { cell } : {})
  const drawn = turns.map(t => band(t, cols, theme, coloring))
  configureDesign({})
  return { tier: drawn[0].tier, turns: drawn.map(b => b.spans) }
}
for (const theme of ['dark', 'light']) {
  for (const cols of [120, 72, 40]) rows[`${theme}-${cols}`] = draw(allTurns, cols, theme)
  rows[`${theme}-120-ramp`] = draw(allTurns, 120, theme, 'ramp')
  rows[`${theme}-120-dots`] = draw(allTurns, 120, theme, 'level', '●')
  rows[`${theme}-120-dots-ramp`] = draw(allTurns, 120, theme, 'ramp', '●')
  rows[`${theme}-120-single`] = draw(singleTurns, 120, theme)
  rows[`${theme}-120-single-ramp`] = draw(singleTurns, 120, theme, 'ramp')
  rows[`${theme}-120-single-dots`] = draw(singleTurns, 120, theme, 'level', '●')
  rows[`${theme}-120-single-dots-ramp`] = draw(singleTurns, 120, theme, 'ramp', '●')
}

const text = JSON.stringify(rows, null, 1) + '\n'
if (process.argv.includes('--check')) {
  const same = readFileSync(out, 'utf8').replace(/\r\n/g, '\n') === text
  console.log(same ? 'terminal-rows.json is current' : 'terminal-rows.json differs from the builder')
  process.exit(same ? 0 : 1)
}
writeFileSync(out, text)
console.log('wrote', out.pathname)
