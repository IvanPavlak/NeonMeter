// Draws one small picture per option for the README's "Every option at a glance"
// section: each value of the option as the desktop band and the terminal band
// draw it, on the dark and the light theme. Everything comes from the plugin's
// own code: the rows from hooks/builder.ts, every bar, dot bar, percent and
// colored reset from hooks/drawings.ts, so a picture cannot drift from the band.
// Run from anywhere with Node 22.18 or later (it imports the .ts files directly):
//
//     node design/readme/options.mjs
//
// `node design/readme/options.mjs --check` compares instead of writing and exits 1 on a difference.
//
// The pictures hold still, as the README's other graphics do: no pulse.
// The desktop row lays its text out with an estimated width per character, pinned
// with textLength, so a viewer's font cannot push a drawing out of place; the
// terminal row pins every span to its cells the same way.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { register } from 'node:module'

// The hooks import './color' and './builder' without an extension, as the engine resolves them; Node needs the `.ts`.
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (/^\\.\\.?\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier)) {
    try { return await next(specifier + '.ts', context) } catch {}
  }
  return next(specifier, context)
}`))

const B = await import(new URL('../../hooks/builder.ts', import.meta.url))
const D = await import(new URL('../../hooks/drawings.ts', import.meta.url))
const { mix } = await import(new URL('../../hooks/color.ts', import.meta.url))

const OUT = new URL('./options/', import.meta.url)

// The account every picture shows, the one the other README graphics show: 82% of the
// 5-hour window, 18% of the week and 69% of the Fable week, both resetting Sunday 18:00
// (4560 of 10080 minutes away), and 930k of a 1M context. Fixed strings, not the clock,
// so the pictures are the same on every run.
const FIVE = { kind: 'five_hour', pct: 82, resetMin: 193, resetAt: '21:13' }
const WEEK = { kind: 'seven_day', pct: 18.2, resetMin: 4560, resetAt: 'Sun 18:00' }
const FABLE = { kind: 'seven_day', pct: 69, resetMin: 4560, resetAt: 'Sun 18:00', label: { full: 'Fable', short: 'Fab' } }
const CTX = { pct: 93, tokens: 930000, window: 1000000 }

const DEFAULTS = {
  layout: 'all',
  barColoring: 'level',
  desktopBars: 'bars',
  glyph: '━',
  glow: true,
  segments: ['five_hour', 'seven_day', 'spend', 'context'],
  ranges: [...B.DEFAULT_BOUNDS],
  timeRanges: [...B.DEFAULT_TIME_BOUNDS],
  fiveHourReset: 'countdown',
  weeklyReset: 'countdown',
  resetColor: 'plain',
}

// Every option a picture can show. The pulse options (`pulse`, `pulseMode`, `pulseCount`,
// `pulseMs`), `rotateSeconds` and `pollSeconds` move over time, which a still picture cannot show;
// `theme` and `desktopTheme` are the dark and light pictures themselves; the colors are
// your own. `base` sets other options the values need to show anything.
// `title` heads the picture and `names` title each value, in the hero's style
// ("Layout: All (Default)", "Level Bars (Default)").
export const OPTIONS = [
  { key: 'layout', title: 'Layout', values: ['all', 'single'], names: ['All', 'Single (One Segment at a Time)'] },
  { key: 'barColoring', title: 'Bar Coloring', values: ['level', 'ramp'], names: ['Level Bars', 'Ramp Bars'] },
  { key: 'desktopBars', title: 'Desktop Bars', values: ['bars', 'dots'], names: ['Smooth Bars', 'Dots'], surfaces: ['desktop'] },
  { key: 'glyph', title: 'Bar Cell (Terminal)', values: ['━', '●', '■'], names: ['Continuous Bar', 'Dots', 'Squares'], surfaces: ['terminal'] },
  { key: 'glow', title: 'Glow (Desktop)', values: [true, false], names: ['Glow On', 'Glow Off'], surfaces: ['desktop'] },
  { key: 'segments', title: 'Segments', values: [DEFAULTS.segments, ['context', 'five_hour']], names: ['All Four, in Order', 'Context, Then 5-hour'] },
  { key: 'ranges', title: 'Range Bounds', values: [DEFAULTS.ranges, [30, 45, 60, 75, 90]], names: ['From 50 in Steps of 10', 'Wider Steps from 30'] },
  { key: 'fiveHourReset', title: '5-hour Reset', values: ['countdown', 'clock'], names: ['Time Left', 'Clock Time'] },
  { key: 'weeklyReset', title: 'Weekly Reset', values: ['countdown', 'clock'], names: ['Time Left', 'Day and Time'] },
  { key: 'resetColor', title: 'Reset Color', values: ['plain', 'time'], names: ['Plain Text', 'Colored by Time Left'] },
  { key: 'timeRanges', title: 'Time Range Bounds (with Reset Color: Time)', values: [DEFAULTS.timeRanges, [50, 60, 70, 80, 90]], names: ['Six Even Steps', 'The Percent Ranges'], base: { resetColor: 'time' } },
]

const shown = v => (Array.isArray(v) ? v.join(',') : String(v))
const same = (a, b) => shown(a) === shown(b)

/** The band input for a set of options: the account above, with each window's reset display. */
function inputFor(o) {
  const asFive = { ...FIVE, resetAs: o.fiveHourReset }
  const week = { ...WEEK, resetAs: o.weeklyReset }
  const fable = { ...FABLE, resetAs: o.weeklyReset }
  const input = { auth: true, loading: false, stale: false, staleAge: '', windows: [asFive, week, fable], ctx: CTX, segments: o.segments, resetColor: o.resetColor }
  // The default layout's first Weekly turn, or every turn of the single layout, as the hooks module takes them.
  return o.layout === 'single' ? B.singleVariants(input) : B.weeklyVariants(input).slice(0, 1)
}

const PAD = 16
const COLS = 120
const CELL_W = 8.4
// A terminal box, as the README's terminal.svg draws it: the rule with Claude Code's [-], the band's rows, the input
// box's rule and the prompt, each a cell row, 8 px inside a 1-px border.
const CELL_H = 22
const BOX_PAD = 8
const BOX_W = COLS * CELL_W + 2 * BOX_PAD
const PROMPT = '❯ Try "how does <filepath> work?"'
const W = BOX_W + 2 * PAD
// The desktop box: the band's rows 12 px inside a rounded box, one row every 28 px.
const DESK_PAD = 12
const DESK_ROW = 28
const MONO = `font-family="'Cascadia Mono', 'JetBrains Mono', Consolas, 'DejaVu Sans Mono', monospace"`
const SANS = `font-family="'Segoe UI', system-ui, -apple-system, Roboto, sans-serif"`
const TEXT_SIZE = 13
const VALUE_GAP = 30
const SCALE = D.DISPLAY_HEIGHT / D.ROW_HEIGHT

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Rough widths of the desktop's proportional font at 13 px, per character: enough to
// lay the row out, and textLength pins each piece to its width whatever font draws it.
function textWidth(text, bold) {
  let w = 0
  for (const c of text) {
    if (c === ' ') w += 3.6
    else if (/[0-9]/.test(c)) w += 7.2
    else if (/[A-Z]/.test(c)) w += 8.6
    else if (/[mw]/.test(c)) w += 10.2
    else if (/[a-z]/.test(c)) w += 6.6
    else if (c === '%') w += 10.4
    else if (c === '│') w += 4.6
    else if (/[:.,/]/.test(c)) w += 3.6
    else if (c === '-') w += 4.8
    else w += 7
  }
  return bold ? w * 1.06 : w
}

/** A drawing from drawings.ts placed in the picture: its own canvas, shown at the band's row height, ids made unique. */
let uid = 0
function place(svg, x, y) {
  const n = ++uid
  const nw = Number(/width="([\d.]+)"/.exec(svg)[1])
  const w = nw * SCALE
  const body = svg
    .replace(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="[\d.]+" height="[\d.]+"/, `<svg x="${x.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="${D.DISPLAY_HEIGHT}"`)
    .replace(/id="(\w+)"/g, `id="$1${n}"`)
    .replace(/url\(#(\w+)\)/g, `url(#$1${n})`)
  return { body, w }
}

/** The desktop row, `rowW` wide, laid out as desktop.tsx's desktopBand lays it out: fixed pieces, and the bars sharing what is left. */
function desktopRow(turn, o, theme, x0, y, rowW) {
  const T = B.THEMES[theme]
  const dim = mix(T.text, T.bg, 0.55)
  const plain = B.flexRow(turn, theme, o.barColoring)
  const count = B.desktopDotCount(plain, COLS)
  const row = B.flexRow(turn, theme, o.barColoring, o.desktopBars === 'dots' ? count : undefined)
  const opts = { pulse: false, pulseMs: 800, pulseMode: 'responsive', burst: { gen: 0, elapsedMs: 0, totalMs: 0 }, glow: o.glow, palette: T, dotCount: count }
  const items = []
  const text = (t, color, extra = {}) => items.push({ kind: 'text', t, color, ...extra })
  const draw = svg => items.push({ kind: 'svg', svg })
  let lastWin = -1
  row.segments.forEach((seg, n) => {
    if (seg.kind !== 'ctx') lastWin = n
  })
  row.segments.forEach((seg, n) => {
    if (n > 0) text(' │ ', dim)
    text(seg.label + ' ', T.text)
    if (seg.dots) items.push({ kind: 'grow', svg: D.dotBarSvg(seg.dots, opts) })
    else if (seg.bar) items.push({ kind: 'grow', svg: D.smoothBarSvg(seg.bar, opts) })
    if (seg.dots || seg.bar) text(' ', T.text)
    if (!seg.pct.live && seg.pct.color.toUpperCase() === T.text.toUpperCase()) text(seg.pct.text, T.text, { bold: true })
    else draw(D.pctSvg(seg.pct, opts))
    if (seg.extra && seg.extraSpan) {
      text(' ', T.text)
      draw(D.resetSvg(seg.extraSpan, opts))
    } else if (seg.extra) text(' ' + seg.extra, T.text)
    if (n === lastWin && row.stale) text('  ' + row.stale.text, dim, { italic: true })
  })
  const width = it => (it.kind === 'text' ? textWidth(it.t, it.bold) : Number(/width="([\d.]+)"/.exec(it.svg)[1]) * SCALE)
  const fixed = items.filter(it => it.kind !== 'grow').reduce((n, it) => n + width(it), 0)
  const grows = items.filter(it => it.kind === 'grow').length
  const growW = grows ? Math.max(0, (rowW - fixed) / grows) : 0
  // The app draws its text on the drawings' midline (drawings.ts MIDLINE); digits are about 0.7 em tall.
  const baseline = y + D.MIDLINE * SCALE + TEXT_SIZE * 0.35
  let x = x0
  let out = ''
  for (const it of items) {
    if (it.kind === 'text') {
      const w = width(it)
      if (it.t.trim()) {
        const style = (it.bold ? ' font-weight="700"' : '') + (it.italic ? ' font-style="italic"' : '')
        out += `<text x="${x.toFixed(2)}" y="${baseline.toFixed(2)}" ${SANS} font-size="${TEXT_SIZE}" fill="${it.color}"${style} textLength="${w.toFixed(2)}" lengthAdjust="spacing" xml:space="preserve">${esc(it.t)}</text>`
      }
      x += w
    } else if (it.kind === 'grow') {
      // A bar's box grows with the row and clips what does not fit, as the app's `overflow: hidden` box does.
      out += `<svg x="${x.toFixed(2)}" y="${y}" width="${growW.toFixed(2)}" height="${D.DISPLAY_HEIGHT}" overflow="hidden">${place(it.svg, 0, 0).body}</svg>`
      x += growW
    } else {
      const placed = place(it.svg, x, y)
      out += placed.body
      x += placed.w
    }
  }
  return out
}

/** The terminal row: the builder's spans, each pinned to its cells. */
function terminalRow(turn, o, theme, x0, y) {
  const spans = B.band(turn, COLS, theme, o.barColoring).spans
  let col = 0
  let out = ''
  for (const sp of spans) {
    const len = [...sp.text].length
    if (sp.text.trim()) {
      const style = (sp.bold ? ' font-weight="700"' : '') + (sp.italic ? ' font-style="italic"' : '')
      out += `<text x="${(x0 + col * CELL_W).toFixed(2)}" y="${y}" ${MONO} font-size="14" fill="${sp.color}"${style} textLength="${(len * CELL_W).toFixed(2)}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${esc(sp.text)}</text>`
    }
    col += len
  }
  return out
}

// `box` and `line` are the boxes' fill and border, the panel colors of the README's other graphics.
const PANEL = {
  dark: { box: '#161B22', line: '#30363D', caption: '#8B949E', key: '#E6EDF3' },
  light: { box: '#F6F8FA', line: '#D0D7DE', caption: '#656D76', key: '#1F2328' },
}

/** The desktop rows in a rounded box, as the app holds its band above the prompt; returns the markup and its height. */
function desktopBox(turns, o, theme, y) {
  const P = PANEL[theme]
  const h = 2 * DESK_PAD + (turns.length - 1) * DESK_ROW + D.DISPLAY_HEIGHT
  let out = `<rect x="${PAD}" y="${y}" width="${W - 2 * PAD}" height="${h}" rx="10" fill="${P.box}" stroke="${P.line}"/>`
  turns.forEach((t, k) => {
    out += desktopRow(t, o, theme, PAD + DESK_PAD, y + DESK_PAD + k * DESK_ROW, W - 2 * PAD - 2 * DESK_PAD)
  })
  return { out, h }
}

/** The terminal rows in a terminal box, as terminal.svg draws one; returns the markup and its height. */
function terminalBox(turns, o, theme, y) {
  const P = PANEL[theme]
  const T = B.THEMES[theme]
  const h = (turns.length + 3) * CELL_H + 24
  const x = PAD + BOX_PAD
  const at = (line) => y + (line + 1) * CELL_H - 6
  const cells = (n) => `textLength="${(n * CELL_W).toFixed(2)}" lengthAdjust="spacingAndGlyphs"`
  let out = `<rect x="${PAD}" y="${y}" width="${BOX_W}" height="${h}" rx="6" fill="${P.box}" stroke="${P.line}"/>`
  out += `<text x="${x}" y="${at(0)}" ${MONO} font-size="14" ${cells(COLS)} xml:space="preserve"><tspan fill="${P.line}">${'─'.repeat(COLS - 3)}</tspan><tspan fill="${P.caption}">[-]</tspan></text>`
  turns.forEach((t, k) => {
    out += terminalRow(t, o, theme, x, at(1 + k))
  })
  out += `<text x="${x}" y="${at(turns.length + 1)}" ${MONO} font-size="14" ${cells(COLS)} fill="${P.line}" xml:space="preserve">${'─'.repeat(COLS)}</text>`
  out += `<text x="${x}" y="${at(turns.length + 2)}" ${MONO} font-size="14" ${cells([...PROMPT].length)} xml:space="preserve"><tspan fill="${T.text}">❯ </tspan><tspan fill="${P.caption}">${esc(PROMPT.slice(2))}</tspan></text>`
  return { out, h }
}

/** One picture: every value of one option, each as its desktop rows then its terminal rows. */
function picture(option, theme) {
  uid = 0
  const P = PANEL[theme]
  const surfaces = option.surfaces ?? ['desktop', 'terminal']
  let y = PAD
  // The option's title, then each value's: as the hero titles its groups and rows.
  let body = `<text x="${W / 2}" y="${y + 15}" ${SANS} font-size="15" font-weight="600" fill="${P.key}" text-anchor="middle">${esc(option.title)}</text>`
  y += 30
  option.values.forEach((value, i) => {
    const o = { ...DEFAULTS, ...option.base, [option.key]: value }
    B.configureDesign({ bounds: o.ranges, timeBounds: o.timeRanges, cell: o.glyph })
    const name = option.names[i] + (same(value, DEFAULTS[option.key]) ? ' (Default)' : '')
    // The value's name, and its setting centered under it.
    const setting = `${option.key}: ${shown(value)}`
    body += `<text x="${W / 2}" y="${y + 13}" ${SANS} font-size="13" font-weight="600" fill="${P.caption}" text-anchor="middle">${esc(name)}</text>`
    body += `<text x="${W / 2}" y="${y + 30}" ${MONO} font-size="12" fill="${P.caption}" fill-opacity="0.75" text-anchor="middle" xml:space="preserve">${esc(setting)}</text>`
    y += 40
    const turns = inputFor(o)
    // Each surface under a small label of its own, the terminal set a little apart.
    const surfaceLabel = (text) => {
      body += `<text x="${PAD}" y="${y + 11}" ${SANS} font-size="11" font-weight="600" letter-spacing="0.6" fill="${P.caption}" fill-opacity="0.8">${text}</text>`
      y += 16
    }
    if (surfaces.includes('desktop')) {
      surfaceLabel('DESKTOP APP')
      const box = desktopBox(turns, o, theme, y)
      body += box.out
      y += box.h
    }
    if (surfaces.includes('terminal')) {
      if (surfaces.includes('desktop')) y += 14
      surfaceLabel('TERMINAL')
      const box = terminalBox(turns, o, theme, y)
      body += box.out
      y += box.h
    }
    // Room between one value and the next; the last one's is taken back below.
    y += VALUE_GAP
  })
  B.configureDesign({})
  const H = y + PAD - VALUE_GAP
  const T = B.THEMES[theme]
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${T.bg}" stroke="${P.line}"/>` +
    body +
    '</svg>\n'
  )
}

const files = {}
for (const option of OPTIONS) for (const theme of ['dark', 'light']) files[`${option.key}-${theme}.svg`] = picture(option, theme)

if (process.argv.includes('--check')) {
  let current = true
  const have = new Set(readdirSync(OUT).filter(f => f.endsWith('.svg')))
  for (const [name, svg] of Object.entries(files)) {
    if (!have.has(name) || readFileSync(new URL(name, OUT), 'utf8').replace(/\r\n/g, '\n') !== svg) {
      console.log(`${name} differs from the builder`)
      current = false
    }
    have.delete(name)
  }
  for (const stray of have) {
    console.log(`${stray} is not drawn by options.mjs`)
    current = false
  }
  console.log(current ? 'the option pictures are current' : 'run node design/readme/options.mjs')
  process.exit(current ? 0 : 1)
}
mkdirSync(OUT, { recursive: true })
for (const [name, svg] of Object.entries(files)) writeFileSync(new URL(name, OUT), svg)
console.log(`wrote ${Object.keys(files).length} pictures to design/readme/options/`)
