// The world beneath the plugin, mocked for every test: the clock, the store,
// the credential, the session's usage, Claude Code's theme row, the usage
// endpoint and the engine's own rows. A test's hooks are the engine beneath the
// plugin: an op event answers `{ value }`, a lifecycle event its result.

import type { On, SessionUsage } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { Engine, FoundElement, MockClock, Mounted } from 'claude-code/testing'

import type { BandProps, Span } from '../hooks/band'

/** 2026-10-01 12:00:00 UTC. */
export const NOW = Date.UTC(2026, 9, 1, 12, 0, 0)
export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const HANDLE = 'credential-handle'
export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'

export type FetchCall = { url: string; init?: { auth?: string; headers?: Record<string, string>; method?: string } }
export type Response = { status: number; ok: boolean; headers: Record<string, string>; text: string }

export type World = {
  clock: MockClock
  /** Every `$.http.fetch` the plugin made, in order. */
  fetches: FetchCall[]
  /** What the next fetch answers; a test reassigns it. */
  response: Response
  /** What Claude Code's `theme` row holds; `config.set` on it writes here. */
  themeRow: string
  /** Every `$.ui.log` line the plugin wrote. */
  logs: string[]
  /** Set to true to leave the next fetch hanging until the clock moves `hangMs`. */
  hang: boolean
  hangMs: number
  /** The store entries the plugin started with (`mock.store` keeps its own copy; writes are not visible here). */
  store: Record<string, unknown>
}

export type Auth = 'bearer' | 'api-key' | null

export type Setup = {
  auth?: Auth
  store?: Record<string, unknown>
  themeRow?: string
  usage?: Partial<SessionUsage>
  response?: Response
}

export const CONTEXT = { tokens: 128000, window: 200000, percent: 64 }

/** The endpoint's body for a 5-hour and a weekly window, resets relative to `now`. */
export function usageBody(fiveHour: number, sevenDay: number, now = NOW): string {
  return JSON.stringify({
    five_hour: { utilization: fiveHour, resets_at: new Date(now + 193 * MINUTE).toISOString() },
    seven_day: { utilization: sevenDay, resets_at: new Date(now + 4560 * MINUTE).toISOString() },
  })
}

/**
 * The endpoint's body in its current shape: the legacy fields and the generic
 * `limits` list, with a per-model weekly window (`Fable`) when `scoped` is given.
 */
export function limitsBody(session: number, weekly: number, scoped: Record<string, number> = {}, now = NOW): string {
  const resets = (min: number) => new Date(now + min * MINUTE).toISOString()
  return JSON.stringify({
    five_hour: { utilization: session, resets_at: resets(193) },
    seven_day: { utilization: weekly, resets_at: resets(4560) },
    seven_day_opus: null,
    limits: [
      { kind: 'session', group: 'session', percent: session, resets_at: resets(193), scope: null },
      { kind: 'weekly_all', group: 'weekly', percent: weekly, resets_at: resets(4560), scope: null },
      ...Object.entries(scoped).map(([name, percent]) => ({
        kind: 'weekly_scoped',
        group: 'weekly',
        percent,
        resets_at: resets(4561),
        scope: { model: { id: null, display_name: name }, surface: null },
      })),
    ],
  })
}

export function ok(text: string): Response {
  return { status: 200, ok: true, headers: {}, text }
}

export const FAIL: Response = { status: 500, ok: false, headers: {}, text: 'upstream error' }

export function setup(on: On, options: Setup = {}): World {
  const clock = mock.clock(on, { now: NOW })
  const store: Record<string, unknown> = { ...options.store }
  mock.store(on, store)
  const world: World = {
    clock,
    fetches: [],
    response: options.response ?? ok(usageBody(42.3, 55)),
    themeRow: options.themeRow ?? 'dark',
    logs: [],
    hang: false,
    hangMs: 10_000,
    store,
  }
  const auth: Auth = options.auth === undefined ? 'bearer' : options.auth

  on('session.authorize', () => ({ value: auth ? { handle: HANDLE, kind: auth } : null }))
  on('session.usage', () => ({
    value: { startedAt: NOW - HOUR, context: CONTEXT, rateLimits: [], ...options.usage },
  }))
  on('config.list', () => ({
    value: [
      {
        key: 'theme',
        label: 'Theme',
        kind: 'choice',
        value: world.themeRow,
        options: ['dark', 'light', 'dark-daltonized', 'light-daltonized'],
        provider: { plugin: 'engine', tier: 'core' },
        isLocked: false,
      },
    ],
  }))
  on('config.set', ($, e) => {
    if (e.key === 'theme') world.themeRow = String(e.value)
    return { value: e.value }
  })
  on('http.fetch', async ($, e) => {
    world.fetches.push(e as FetchCall)
    if (world.hang) await clock.sleep(world.hangMs)
    return { value: world.response }
  })
  on('ui.log', ($, e) => {
    world.logs.push(e.text)
    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box key="engine">
        <Text>engine row</Text>
      </Box>
    )
  })

  return world
}

/** Starts the session and lets the first fetch settle. */
export async function start($: Engine, world: World): Promise<void> {
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  await world.clock.settle()
}

export const SURFACES = ['terminal', 'desktop'] as const
export type Surface = (typeof SURFACES)[number]

/**
 * The row is as wide as the band on both surfaces: on the terminal the
 * engine's ` [-]` button sits on the band's rule, not over the meter row.
 */
export function bodyColumnsFor(_surface: Surface, rowColumns: number): number {
  return rowColumns
}

/** The terminal band's rule row, the Text drawn outside the Client. */
export async function ruleOf(ui: Drawing) {
  const texts = await ui.findAll({ type: 'Text' })
  return texts.find(t => /^─+$/.test(t.text))
}

export function bandProps(bodyColumns: number, hasSurvey = false) {
  return {
    plugin: 'neonmeter',
    component: 'AbovePrompt',
    props: {
      hasSurvey,
      isWorking: false,
      maxRows: 4,
      bodyColumns,
      scroll: { offset: 0, bodyRows: 4 },
      view: {},
    },
  } as const
}

export type Drawing = Mounted<Surface, 'AbovePrompt'>

/** Mounts the band so that its row is `rowColumns` wide on `surface`. */
export async function mountBand($: Engine, surface: Surface, rowColumns: number, hasSurvey = false): Promise<Drawing> {
  return $.ui.mount({ ...bandProps(bodyColumnsFor(surface, rowColumns), hasSurvey), surface })
}

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] } | string

/** The drawing's text in document order: Text contents, and a Svg's `alt` for what it draws. */
function textOfTree(node: unknown): string {
  if (typeof node === 'string') return node
  if (!node || typeof node !== 'object') return ''
  const n = node as Exclude<Node, string>
  const key = n.props?.key
  // A bar drawing stands for no text: the row reads as label, gap and percent.
  if (typeof key === 'string' && (key.startsWith('dots-') || key.startsWith('bar-'))) return ''
  if (n.type === 'Svg') return String(n.props?.alt ?? '')
  return (n.children ?? []).map(textOfTree).join('')
}

/**
 * The row's characters: on the terminal as the Client drew them; on the
 * desktop the hooks module's own tree, a drawing (bar or percent) standing
 * for its `alt` text.
 */
export async function rowOf(ui: Drawing): Promise<string> {
  if (ui.surface === 'terminal') {
    const texts = await ui.findAll({ type: 'Text', in: 'band' })
    return texts.map(t => t.text).join('')
  }
  return textOfTree(await ui.drawn())
}

/** Every Svg of the desktop drawing with the key of the Box it sits in. */
async function svgsOf(ui: Drawing): Promise<{ key: string; source: string; alt: string }[]> {
  const boxes = await ui.findAll({ type: 'Box' })
  const out: { key: string; source: string; alt: string }[] = []
  for (const b of boxes) {
    if (typeof b.key !== 'string') continue
    for (const c of b.children as FoundElement[]) {
      if (c && typeof c === 'object' && c.type === 'Svg') out.push({ key: b.key, source: String(c.props.source), alt: String(c.props.alt) })
    }
  }
  return out
}

/** One element of a drawing: its attributes by name, whatever their order, and the markup inside it. */
export type Part = { attrs: Record<string, string>; inner: string }

/**
 * The elements of a drawing whose `data-role` is `role`, in document order.
 * The desktop module tags every element it draws, so a test names what it
 * reads instead of depending on attribute order or position.
 */
export function partsOf(markup: string, role: string): Part[] {
  const out: Part[] = []
  // Every opening tag, nested ones included; an element's inside runs to its own closing tag.
  for (const m of markup.matchAll(/<(\w+)\b([^>]*?)(\/?)>/g)) {
    const attrs: Record<string, string> = {}
    for (const a of m[2]!.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]!] = a[2]!
    if (attrs['data-role'] !== role) continue
    const start = m.index! + m[0].length
    const end = m[3] ? start : markup.indexOf(`</${m[1]}>`, start)
    out.push({ attrs, inner: end < 0 ? '' : markup.slice(start, end) })
  }
  return out
}

/** The pulse's peak color of a drawing's part, from its SMIL `fill` animation; undefined when it does not pulse. */
export function peakOf(markup: string): string | undefined {
  for (const m of markup.matchAll(/<animate\b([^>]*)\/>/g)) {
    const name = /attributeName="([^"]*)"/.exec(m[1]!)?.[1]
    const values = /values="([^"]*)"/.exec(m[1]!)?.[1]
    if (name === 'fill' && values) return values.split(';')[1]
  }
  return undefined
}

/** The Client's props: the spans with their live flags, and the pulse settings. */
export async function clientProps(ui: Drawing): Promise<BandProps | undefined> {
  const client = await ui.find({ type: 'Client', key: 'band' })
  return client?.props.props as BandProps | undefined
}

/** The cell spans the terminal Client was handed. */
export async function spansOf(ui: Drawing): Promise<Span[]> {
  const props = await clientProps(ui)
  return props?.spans ?? []
}

export type DotBar = { kind: string; colors: string[]; peaks: (string | undefined)[]; source: string }

/** The desktop dot bars as drawn: one entry per dot drawing, each dot's color (its `dot` parts, in order) and its pulse peak. */
export async function dotBarsOf(ui: Drawing): Promise<DotBar[]> {
  return (await svgsOf(ui))
    .filter(s => s.key.startsWith('dots-'))
    .map(s => {
      const dots = partsOf(s.source, 'dot')
      return { kind: s.key.slice(5), colors: dots.map(d => d.attrs.fill!), peaks: dots.map(d => peakOf(d.inner)), source: s.source }
    })
}

export type Slice = { grow: number; color: string }
export type Bar = { kind: string; slices: Slice[]; track: string; peaks: (string | undefined)[]; source: string }

/**
 * The desktop bars as drawn: one entry per bar drawing, its filled slices
 * (`slice` parts, `data-grow` in hundredths of the bar) and the track's color.
 * Empty room is the track; a slice of the track color is never drawn.
 */
export async function barsOf(ui: Drawing): Promise<Bar[]> {
  return (await svgsOf(ui))
    .filter(s => s.key.startsWith('bar-'))
    .map(s => {
      const slices = partsOf(s.source, 'slice')
      return {
        kind: s.key.slice(4),
        slices: slices.map(sl => ({ grow: Math.round(Number(sl.attrs['data-grow']) * 10) / 10, color: sl.attrs.fill! })),
        track: partsOf(s.source, 'track')[0]?.attrs.fill ?? '',
        peaks: slices.map(sl => peakOf(sl.inner)),
        source: s.source,
      }
    })
}

export type TextProps = { color?: string; backgroundColor?: string; bold?: boolean; italic?: boolean; peak?: string; glow?: boolean }

/**
 * The element drawn for exactly this text, with its colors: a Text's props,
 * or, on the desktop, a percent or reset drawing's: its fill as `color`,
 * `bold`, the pulse peak and whether it has a halo.
 */
export async function textOf(ui: Drawing, text: string): Promise<TextProps | undefined> {
  const scope = ui.surface === 'terminal' ? { in: 'band' } : {}
  const found = (await ui.findAll({ type: 'Text', ...scope })).find(t => t.text === text)
  if (found) return found.props as TextProps
  if (ui.surface === 'terminal') return undefined
  // A percent's drawing, or a reset's under `resetColor: time`; the key's prefix names the text's role.
  const svg = (await svgsOf(ui)).find(s => (s.key.startsWith('pct-') || s.key.startsWith('extra-')) && s.alt === text)
  if (!svg) return undefined
  const role = svg.key.startsWith('pct-') ? 'pct' : 'extra'
  const main = partsOf(svg.source, role)[0]
  if (!main) return undefined
  const props: TextProps = { color: main.attrs.fill, bold: main.attrs['font-weight'] === '700', glow: partsOf(svg.source, `${role}-halo`).length > 0 }
  const peak = peakOf(main.inner)
  if (peak) props.peak = peak
  return props
}

/** True when the engine's own row is what the drawing shows: the plugin yielded. */
export async function isEngineRow(ui: Drawing): Promise<boolean> {
  return (await ui.find({ type: 'Text', text: 'engine row' })) !== undefined
}
