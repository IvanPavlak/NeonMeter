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
// - `chips-<look>-<mode>.html`: the working tree's smooth-bar band with the reset chip
//   before it: `look` is `rainbow`, `one` (one color) or `crisp` (rainbow, no halo),
//   `mode` as above. Compare with `band-work-bars-<mode>.html`, the same band without them.
// - `rainbow-<side>-<look>-<mode>.html`: the band under `preset: rainbow`, when both sides
//   have it: the chip, every segment in its frame with its label, bar, percent and field
//   as drawings, the button, and the outline's one drawing under the row.
// - `frame-<side>-<rest|mid|peak>.html`: a dot bar, a ramp bar, a percent and a colored
//   reset, inline and paused at that point of the pulse, for a pixel comparison; when both
//   sides have the rainbow, its drawings too (a bar, a percent, a label, the chip, the
//   button, a frame's cap and edges, the outline).

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
const rainbow = [ramp[5], ramp[4], ramp[3], ramp[1], ramp[0], '#B24BFF']
// The rainbow's pages need its drawings on both sides: a base from before them is compared without.
const rainbowBoth = Object.values(sides).every(D => D.outlineRingSvg && D.labelSvg && D.resetChipSvg)
const PULSE_MS = 800
const options = pulse => ({ pulse, pulseMs: PULSE_MS, pulseMode: 'always', burst: { gen: 0, elapsedMs: 0, totalMs: 0 }, glow: true, palette, dotCount: DOTS })

// The band: three segments, each bar about 30 dots wide at 1460 px, as the app lays them out.
const DOTS = 30
const segments = [
  { label: '5-hour', pct: 42, color: '#1E90FF', reset: 'in 3h13m' },
  { label: 'Weekly', pct: 55, color: '#39FF14', reset: 'in 3d4h' },
  { label: 'Context', pct: 64, color: '#00D45A', reset: '128k/200k' },
]
const img = (svg, height = 20, style = '') => `<img style="height:${height}px;display:block;flex-shrink:0;${style}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`
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
      // The same band behind two reset chips, in each of their looks (the working tree's smooth bars only).
      if (side === 'work' && look === 'bars' && D.resetChipSvg) {
        for (const [name, colors, glow] of [['rainbow', rainbow, true], ['one', ['#B24BFF'], true], ['crisp', rainbow, false]]) {
          const chip = img(D.resetChipSvg({ text: '+2', colors, rows: [] }, { ...o, glow })) + '<span>&nbsp;</span>'
          write(`chips-${name}-${mode}.html`, page(`<div style="display:flex;align-items:center;width:1460px;height:140px;padding:0 12px;box-sizing:border-box;white-space:nowrap">${chip}${row}</div>`))
        }
      }
      if (rainbowBoth) write(`rainbow-${side}-${look}-${mode}.html`, rainbowBand(D, look, o))
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
  const drawings = [D.dotBarSvg(dots, o), D.smoothBarSvg(slices, o), D.pctSvg({ text: '64%', color: ramp[2], live: true }, o), D.resetSvg({ text: 'in 3h13m', color: ramp[4], live: true }, o)].map(svg => [svg, 30])
  if (rainbowBoth) {
    // The rainbow's drawings, running: `[drawing, its height in its own pixels, the width a stretched one is shown at]`.
    const r = { ...o, rainbow: { colors: rainbow, motion: 'circle' }, nowMs: 0 }
    const f = { color: ramp[2], live: true }
    drawings.push(
      [D.smoothBarSvg(slices, r), 30],
      [D.dotBarSvg(dots, r), 30],
      [D.pctSvg({ text: '64%', color: ramp[2], live: true }, r), 30],
      [D.labelSvg({ text: 'Weekly', color: palette.text, live: true }, r), 30],
      [D.resetChipSvg({ text: '+2', colors: rainbow, rows: [] }, { ...o, nowMs: 0 }), 30],
      [D.buttonSvg(slices, r), 30],
      [D.frameCapSvg('left', f, r), 50],
      [D.frameEdgesSvg(f, r), 50, 600],
      [D.outlineRingSvg(1300, 80, r), 80, 860],
    )
  }
  const inline = drawings
    .map(([svg, tall, wide], i) => `<div>${svg.replace(/id="(\w+)"/g, `id="$1${i}"`).replace(/url\(#(\w+)\)/g, `url(#$1${i})`).replace('<svg ', `<svg style="display:block;height:${tall * 2}px;width:${wide ? `${wide}px` : 'auto'}" `)}</div>`)
    .join('')
  for (const [name, t] of [['rest', 0], ['mid', PULSE_MS / 4], ['peak', PULSE_MS / 2]]) {
    write(`frame-${side}-${name}.html`, page(`${inline}<script>for (const s of document.querySelectorAll('body>div>svg')) { s.pauseAnimations(); s.setCurrentTime(${t / 1000}) }</script>`))
  }
}

/**
 * The band under `preset: rainbow` as the app lays it out, 1440 px wide: the reset chip, each segment in its frame
 * (its caps, and the edges stretched between them) with its label, bar, percent and field as drawings, the button,
 * and under the row the outline's one drawing, stretched to the band.
 */
function rainbowBand(D, look, o) {
  const r = { ...o, rainbow: { colors: rainbow, motion: 'circle' }, nowMs: 0 }
  const tall = D.FRAME_DISPLAY_HEIGHT
  const room = `<div style="width:${(D.FRAME_CAP * 2) / 3}px;height:${tall}px;flex-shrink:0"></div>`
  const gap = '<span>&nbsp;</span>'
  const text = t => ({ text: t, color: palette.text, live: true })
  const pieces = [img(D.resetChipSvg({ text: '+2', colors: rainbow, rows: [] }, { ...o, nowMs: 0 })), gap]
  segments.forEach((sg, n) => {
    const filled = Math.round((sg.pct / 100) * DOTS)
    const bar =
      look === 'dots'
        ? D.dotBarSvg(Array.from({ length: DOTS }, (_, k) => (k < filled ? { color: sg.color, live: true } : { color: palette.track })), r)
        : D.smoothBarSvg([{ grow: sg.pct, color: sg.color, live: true }, { grow: 100 - sg.pct, color: palette.track }], r)
    const f = { color: sg.color, live: true }
    const frame = `<div style="position:absolute;inset:0;display:flex;align-items:center">${img(D.frameCapSvg('left', f, r), tall)}<div style="flex:1;min-width:0;overflow:hidden">${img(D.frameEdgesSvg(f, r), tall, 'width:100%')}</div>${img(D.frameCapSvg('right', f, r), tall)}</div>`
    const inner = `${img(D.labelSvg(text(sg.label), r))}<div style="flex:1;min-width:0;overflow:hidden;display:flex">${img(bar)}</div>${gap}${img(D.pctSvg({ text: `${sg.pct}%`, color: sg.color, live: true }, r))}${gap}${img(D.resetSvg(n < 2 ? { text: sg.reset, color: ramp[3], live: true } : text(sg.reset), r))}`
    pieces.push(`${n ? gap : ''}<div style="position:relative;display:flex;align-items:center;flex:1 1 0;min-width:0">${frame}${room}${inner}${room}</div>`)
  })
  pieces.push(gap, img(D.buttonSvg([{ grow: 64, color: ramp[2], live: true }, { grow: 36, color: palette.track }], r)))
  // The outline reaches the app's padding above and below the row (10 px), and is drawn at about the band's width.
  const ringTall = D.outlineHeight(tall, 10)
  const ring = `<div style="position:absolute;left:0;right:0;top:-10px">${img(D.outlineRingSvg(2160, ringTall, r), (ringTall * 2) / 3, 'width:100%')}</div>`
  return page(`<div style="padding:50px 10px"><div style="position:relative;display:flex;align-items:center;width:1440px;height:${tall}px;white-space:nowrap">${ring}${pieces.join('')}</div></div>`)
}

console.log(`wrote ${written} pages to scripts/benchmarking/out/, base ${base} (${git('rev-parse', '--short', base).trim()}) against the working tree`)
