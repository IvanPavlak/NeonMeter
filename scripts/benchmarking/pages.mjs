// Builds the pages the headless benchmark loads, from the desktop drawings of two
// versions: `base`, hooks/ at a git ref, and `work`, hooks/ in the working tree.
// Run from anywhere with Node 22.18 or later (it imports hooks/drawings.ts directly):
//
//     node scripts/benchmarking/pages.mjs [--base <ref>]
//
// `--base` defaults to `master`. Everything is written to scripts/benchmarking/out/
// (ignored by git):
//
// - `band-<side>-<look>-<mode>.html`: one desktop band, 1460 px wide, as the app shows
//   it: labels as text, every bar and percent as an image 20 px tall. `look` is `bars`
//   or `dots`, `mode` is `always` (pulseMode: always) or `still` (pulse: false).
// - `frame-<side>-<rest|mid|peak>.html`: a dot bar, a ramp bar, a percent and a colored
//   reset, inline and paused at that point of the pulse, for a pixel comparison.

import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'

// drawings.ts imports './color' without an extension, as the engine resolves it; Node needs the `.ts`.
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (/^\\.\\.?\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier)) {
    try { return await next(specifier + '.ts', context) } catch {}
  }
  return next(specifier, context)
}`))

const args = process.argv.slice(2)
const at = args.indexOf('--base')
const base = at >= 0 ? args[at + 1] : 'master'
if (!base) throw new Error('--base needs a git ref')

const repo = fileURLToPath(new URL('../../', import.meta.url))
const out = new URL('./out/', import.meta.url)
const baseHooks = new URL('./base/hooks/', out)
rmSync(new URL('./base/', out), { recursive: true, force: true })
mkdirSync(baseHooks, { recursive: true })

// The base side: every file of hooks/ at the ref, beside each other as in the repository.
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1 << 26 })
for (const file of git('ls-tree', '--name-only', `${base}:hooks`).split('\n').filter(Boolean)) {
  writeFileSync(new URL(file, baseHooks), git('show', `${base}:hooks/${file}`))
}

const sides = {
  base: await import(new URL('./drawings.ts', baseHooks)),
  work: await import(new URL('../../hooks/drawings.ts', import.meta.url)),
}

const palette = { track: '#21262D', text: '#E6EDF3', bg: '#0D1117' }
const ramp = ['#1E90FF', '#39FF14', '#00D45A', '#FFF01F', '#FF5F1F', '#FF073A']
const PULSE_MS = 800
const options = pulse => ({ pulse, pulseMs: PULSE_MS, pulseMode: 'always', burst: { gen: 0, elapsedMs: 0, totalMs: 0 }, glow: true, palette, dotCount: DOTS })

// The band: three segments, each bar about 30 dots wide at 1460 px, as the app lays them out.
const DOTS = 30
const segments = [
  { label: '5-hour', pct: 42, color: '#1E90FF', reset: 'in 3h13m' },
  { label: 'Weekly', pct: 55, color: '#39FF14', reset: 'in 3d4h' },
  { label: 'Context', pct: 64, color: '#00D45A', reset: '128k/200k' },
]
const img = svg => `<img style="height:20px;display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`
const page = body => `<!doctype html><meta charset="utf-8"><body style="margin:0;background:${palette.bg};color:${palette.text};font:14px 'Segoe UI',system-ui,sans-serif">${body}</body>`

let written = 0
const write = (name, html) => {
  writeFileSync(new URL(name, out), html)
  written += 1
}

for (const [side, D] of Object.entries(sides)) {
  for (const look of ['bars', 'dots']) {
    for (const mode of ['always', 'still']) {
      const o = options(mode === 'always')
      const row = segments
        .map((sg, n) => {
          const filled = Math.round((sg.pct / 100) * DOTS)
          const bar =
            look === 'dots'
              ? D.dotBarSvg(Array.from({ length: DOTS }, (_, k) => (k < filled ? { color: sg.color, live: true } : { color: palette.track })), o)
              : D.smoothBarSvg([{ grow: sg.pct, color: sg.color, live: true }, { grow: 100 - sg.pct, color: palette.track }], o)
          const sep = n ? `<span style="color:#6E7681">&nbsp;│&nbsp;</span>` : ''
          return `${sep}<span>${sg.label}&nbsp;</span><div style="flex:1;min-width:0;overflow:hidden">${img(bar)}</div><span>&nbsp;</span>${img(D.pctSvg({ text: `${sg.pct}%`, color: sg.color, live: true }, o))}<span>&nbsp;${sg.reset}</span>`
        })
        .join('')
      write(`band-${side}-${look}-${mode}.html`, page(`<div style="display:flex;align-items:center;width:1460px;height:140px;padding:0 12px;box-sizing:border-box;white-space:nowrap">${row}</div>`))
    }
  }

  // The frames: every kind of drawing, pulsing, each with its own ids, 60 px tall.
  const o = { ...options(true), dotCount: 40 }
  const dots = Array.from({ length: 40 }, (_, k) => (k < 34 ? { color: ramp[Math.floor(k / 6)], live: true } : { color: palette.track }))
  const slices = [
    { grow: 21.3, color: ramp[0], live: true },
    { grow: 21.3, color: ramp[1], live: true },
    { grow: 21.3, color: ramp[2], live: true },
    { grow: 36.1, color: palette.track },
  ]
  const drawings = [D.dotBarSvg(dots, o), D.smoothBarSvg(slices, o), D.pctSvg({ text: '64%', color: ramp[2], live: true }, o), D.resetSvg({ text: 'in 3h13m', color: ramp[4], live: true }, o)]
  const inline = drawings
    .map((svg, i) => `<div style="height:60px">${svg.replace(/id="(\w+)"/g, `id="$1${i}"`).replace(/url\(#(\w+)\)/g, `url(#$1${i})`).replace('<svg ', '<svg style="height:60px;width:auto" ')}</div>`)
    .join('')
  for (const [name, t] of [['rest', 0], ['mid', PULSE_MS / 4], ['peak', PULSE_MS / 2]]) {
    write(`frame-${side}-${name}.html`, page(`${inline}<script>for (const s of document.querySelectorAll('body>div>svg')) { s.pauseAnimations(); s.setCurrentTime(${t / 1000}) }</script>`))
  }
}

console.log(`wrote ${written} pages to scripts/benchmarking/out/, base ${base} (${git('rev-parse', '--short', base).trim()}) against the working tree`)
