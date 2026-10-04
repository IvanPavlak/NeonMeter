import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, PluginOptions, Register, SessionContextUsage, SessionRateLimit, Timer } from 'claude-code'

import type { NeonMeterContext, NeonMeterHealth, NeonMeterReading, NeonMeterTheme, NeonMeterWindow } from '../types'
import type { BandProps } from './band'
import { band, configureDesign, DEFAULT_BOUNDS, DEFAULT_CELL, DEFAULT_RAMPS, flexRow, fmtAge, fmtResetAt, THEMES } from './builder'
import type { BandInput, FlexRow, OptionSegment, WindowInput, WindowKind } from './builder'
import { desktopBand } from './desktop'

/** The usage endpoint the built-in /usage command reads; the engine attaches the credential. */
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const USAGE_HEADERS = { 'anthropic-beta': 'oauth-2025-04-20', accept: 'application/json' }
/** The `$.store` key the last reading is mirrored to, so a new session shows it (stale) at once. */
const STORE_KEY = 'reading'

const WINDOW_KINDS: readonly WindowKind[] = ['five_hour', 'seven_day', 'spend_limit']

/**
 * On the terminal the band opens with a rule, `─` across the whole width in
 * the prompt border's color, the same line the input box has at its top. The
 * engine paints its collapse button, ` [-]`, over the band's top-right cells,
 * so the button sits on the rule and the meter row below keeps every cell.
 */
export const RULE = '─'
export const RULE_COLOR = 'promptBorder'

/**
 * Dots per desktop bar. The desktop font is proportional, so the band holds
 * more characters than its nominal `bodyColumns`: about 1.2 x, measured from
 * two screenshots of the Code tab. What the text leaves, split over the bars
 * at 75% so the dots keep a little air between them instead of overflowing.
 */
export function desktopDotCount(row: FlexRow, bodyColumns: number): number {
  let text = (row.segments.length - 1) * 3 + (row.stale ? row.stale.text.length + 2 : 0)
  let bars = 0
  for (const seg of row.segments) {
    text += seg.label.length + 1 + seg.pct.text.length + (seg.extra ? seg.extra.length + 1 : 0)
    if (seg.bar) {
      bars++
      text += 1
    }
  }
  if (bars === 0) return 0
  return Math.max(4, Math.floor(((bodyColumns * 1.2 - text) / bars) * 0.75))
}


// State the band draws from. Named values the host holds for the session, so
// they survive a hot reload of this module; `reading` is mirrored to `$.store`.
const DEFAULT_HEALTH: NeonMeterHealth = { hasAuth: true, isStale: false, lastAttemptAt: 0 }

const reading = atom({ plugin: 'neonmeter', key: 'reading' } as const, null as NeonMeterReading | null)
const context = atom({ plugin: 'neonmeter', key: 'context' } as const, null as NeonMeterContext | null)
const health = atom({ plugin: 'neonmeter', key: 'health' } as const, DEFAULT_HEALTH)
const theme = atom({ plugin: 'neonmeter', key: 'theme' } as const, 'dark' as NeonMeterTheme)
const tick = atom({ plugin: 'neonmeter', key: 'tick' } as const, 0)
const appearance = atom({ plugin: 'neonmeter', key: 'appearance' } as const, null as NeonMeterTheme | null)

// The fourteen userConfig options, parsed and clamped once per activation. A
// new session reads a changed option; a changed file hot-reloads the module.
export type SegmentKind = OptionSegment

export type Options = {
  barColoring: 'level' | 'ramp'
  /** How bars draw on the desktop: dots spread across the bar, or smooth solid bars. */
  desktopBars: 'dots' | 'bars'
  pulse: boolean
  pulseMs: number
  /** Draw the desktop's halo under filled bars, dots and percents. */
  glow: boolean
  segments: SegmentKind[]
  pollSeconds: number
  theme: 'auto' | 'dark' | 'light'
  /** The desktop's neon palette: `auto` uses the resolved theme, `dark` or `light` sets it. */
  desktopTheme: 'auto' | 'dark' | 'light'
  /** The lower bounds of ranges 2 to 6, five strictly ascending integers between 1 and 99. */
  ranges: number[]
  /** The six range colors on the dark palette, `#RRGGBB`. */
  colorsDark: string[]
  /** The six range colors on the light palette, `#RRGGBB`. */
  colorsLight: string[]
  /** The bar cell, one single-width character. */
  glyph: string
  /** How long each weekly limit holds the Weekly segment, in seconds. */
  rotateSeconds: number
}

const SEGMENT_KINDS: readonly SegmentKind[] = ['five_hour', 'seven_day', 'spend', 'context']

const DEFAULTS: Options = {
  barColoring: 'ramp',
  desktopBars: 'bars',
  pulse: true,
  pulseMs: 800,
  glow: true,
  segments: [...SEGMENT_KINDS],
  pollSeconds: 60,
  theme: 'auto',
  desktopTheme: 'auto',
  ranges: [...DEFAULT_BOUNDS],
  colorsDark: [...DEFAULT_RAMPS.dark],
  colorsLight: [...DEFAULT_RAMPS.light],
  glyph: DEFAULT_CELL,
  rotateSeconds: 5,
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, n))
}

/** Five strictly ascending integers between 1 and 99 from `"50,60,70,80,90"`, or null. */
export function parseRanges(value: unknown): number[] | null {
  if (typeof value !== 'string') return null
  const parts = value.split(',').map(p => p.trim())
  if (parts.length !== 5 || !parts.every(p => /^\d{1,2}$/.test(p))) return null
  const nums = parts.map(Number)
  if (nums.some(n => n < 1 || n > 99)) return null
  for (let i = 1; i < nums.length; i++) if (nums[i]! <= nums[i - 1]!) return null
  return nums
}

/** Six `#RGB` or `#RRGGBB` colors, normalized to upper-case `#RRGGBB`, or null. */
export function parseColors(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== 6) return null
  const out: string[] = []
  for (const raw of value) {
    const s = String(raw).trim()
    if (/^#[0-9a-fA-F]{6}$/.test(s)) out.push(s.toUpperCase())
    else if (/^#[0-9a-fA-F]{3}$/.test(s)) out.push(('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toUpperCase())
    else return null
  }
  return out
}

/**
 * One character that takes one terminal cell, or null: no combining marks,
 * controls, East Asian wide characters or emoji, which would break the
 * edge-to-edge layout.
 */
export function parseGlyph(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const chars = Array.from(value)
  if (chars.length !== 1) return null
  const cp = chars[0]!.codePointAt(0)!
  // Nothing invisible (format, space, combining marks) and no emoji, which terminals draw two cells wide.
  if (/[\p{Cf}\p{Zs}\p{Mn}]|\p{Extended_Pictographic}/u.test(chars[0]!)) return null
  const wide =
    cp < 0x20 ||
    (cp >= 0x7f && cp < 0xa0) ||
    (cp >= 0x300 && cp <= 0x36f) ||
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f000 && cp <= 0x1faff) ||
    cp >= 0x20000
  return wide ? null : chars[0]!
}

/**
 * Reads the options the manifest declares, filling defaults and clamping the
 * numbers. `rejected` lists the `segments` entries that were dropped (unknown
 * names and duplicates) so the module can log them once.
 */
export function parseOptions(options: PluginOptions): { parsed: Options; rejected: string[]; problems: string[] } {
  const problems: string[] = []
  const pick = <T,>(key: string, parse: (v: unknown) => T | null, fallback: T, what: string): T => {
    if (options[key] === undefined) return fallback
    const value = parse(options[key])
    if (value === null) {
      problems.push(`${key} (${what}) is not valid; using the default`)
      return fallback
    }
    return value
  }
  const ranges = pick('ranges', parseRanges, [...DEFAULT_BOUNDS], 'five ascending whole numbers from 1 to 99, such as "50,60,70,80,90"')
  const colorsDark = pick('colorsDark', parseColors, [...DEFAULT_RAMPS.dark], 'six colors like "#1E90FF"')
  const colorsLight = pick('colorsLight', parseColors, [...DEFAULT_RAMPS.light], 'six colors like "#1874D2"')
  const glyph = pick('glyph', parseGlyph, DEFAULT_CELL, 'one single-width character')
  const rotateSeconds = clamp(options.rotateSeconds, DEFAULTS.rotateSeconds, 2, 60)
  const barColoring = options.barColoring === 'level' ? 'level' : DEFAULTS.barColoring
  const desktopBars = options.desktopBars === 'dots' ? 'dots' : DEFAULTS.desktopBars
  const pulse = typeof options.pulse === 'boolean' ? options.pulse : DEFAULTS.pulse
  const glow = typeof options.glow === 'boolean' ? options.glow : DEFAULTS.glow
  const pulseMs = clamp(options.pulseMs, DEFAULTS.pulseMs, 400, 3000)
  const pollSeconds = clamp(options.pollSeconds, DEFAULTS.pollSeconds, 10, 3600)
  const themeOption = options.theme === 'dark' || options.theme === 'light' ? options.theme : DEFAULTS.theme
  const desktopTheme = options.desktopTheme === 'dark' || options.desktopTheme === 'light' ? options.desktopTheme : DEFAULTS.desktopTheme

  const raw = Array.isArray(options.segments) ? options.segments : DEFAULTS.segments
  const segments: SegmentKind[] = []
  const rejected: string[] = []
  for (const entry of raw) {
    const name = String(entry)
    if ((SEGMENT_KINDS as readonly string[]).includes(name) && !segments.includes(name as SegmentKind)) {
      segments.push(name as SegmentKind)
    } else {
      rejected.push(name)
    }
  }

  return { parsed: { barColoring, desktopBars, pulse, pulseMs, glow, segments, pollSeconds, theme: themeOption, desktopTheme, ranges, colorsDark, colorsLight, glyph, rotateSeconds }, rejected, problems }
}

/** Maps Claude Code's `theme` row to a palette; `null` when it names neither. */
export function paletteOf(value: unknown): NeonMeterTheme | null {
  if (typeof value !== 'string') return null
  if (value.includes('light')) return 'light'
  if (value.includes('dark')) return 'dark'
  return null
}

/** The palette: the option when forced, else Claude Code's `theme` row, else dark. */
async function resolveTheme($: EngineInterface, option: Options['theme']): Promise<NeonMeterTheme> {
  if (option !== 'auto') return option
  const rows = await $.config.list()
  return paletteOf(rows.find(row => row.key === 'theme')?.value) ?? 'dark'
}

/** The desktop app's own theme setting, from its `config.json` text: `light`, `dark`, `system`, or null when absent. */
export function appThemeMode(text: string): 'light' | 'dark' | 'system' | null {
  try {
    const mode = (JSON.parse(text) as Record<string, unknown>).userThemeMode
    return mode === 'light' || mode === 'dark' || mode === 'system' ? mode : null
  } catch {
    return null
  }
}

/** The Windows apps theme from `reg query` output: `AppsUseLightTheme` 1 is light, 0 dark. */
export function windowsAppearance(stdout: string): NeonMeterTheme | null {
  const match = /AppsUseLightTheme\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(stdout)
  if (!match) return null
  return Number.parseInt(match[1]!, 16) ? 'light' : 'dark'
}

const REG_PERSONALIZE = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'

/** The operating system's light or dark appearance, or null when it cannot be read. */
async function systemAppearance($: EngineInterface, isWindows: boolean): Promise<NeonMeterTheme | null> {
  if (isWindows) {
    const run = await $.process.run(['reg', 'query', REG_PERSONALIZE, '/v', 'AppsUseLightTheme'], { timeoutMs: 5_000 })
    return windowsAppearance(run.stdout)
  }
  try {
    // macOS keeps the key only in dark mode: in light mode `defaults` exits non-zero with nothing on stdout.
    const run = await $.process.run(['defaults', 'read', '-g', 'AppleInterfaceStyle'], { timeoutMs: 5_000 })
    return run.exitCode === 0 && /dark/i.test(run.stdout) ? 'dark' : 'light'
  } catch {
    // No `defaults` binary, so not macOS: the GNOME color scheme, where there is one.
    const run = await $.process.run(['gsettings', 'get', 'org.gnome.desktop.interface', 'color-scheme'], { timeoutMs: 5_000 })
    if (run.exitCode !== 0) return null
    return /dark/i.test(run.stdout) ? 'dark' : 'light'
  }
}

/**
 * The desktop app's appearance, which the mod API does not report: the app's
 * own `userThemeMode` from its `config.json`, and for `system` (its
 * default) the operating system's. Null when neither can be read.
 */
async function desktopAppearance($: EngineInterface): Promise<NeonMeterTheme | null> {
  try {
    const appData = await $.env.get('APPDATA')
    const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
    const xdg = await $.env.get('XDG_CONFIG_HOME')
    const paths = appData
      ? [`${appData}\\Claude\\config.json`]
      : home
        ? [`${home}/Library/Application Support/Claude/config.json`, `${xdg ?? `${home}/.config`}/Claude/config.json`]
        : []
    let mode: ReturnType<typeof appThemeMode> = null
    for (const path of paths) {
      try {
        mode = appThemeMode(await $.fs.read(path))
        break
      } catch {
        // Not this platform's location.
      }
    }
    if (mode === 'light' || mode === 'dark') return mode
    return await systemAppearance($, Boolean(appData))
  } catch {
    return null
  }
}

/** The band's Client key: `band-<session id>` where the session has an id, else `band`. */
export function bandKeyFor(sessionId: string | undefined): string {
  const id = (sessionId ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
  return id ? `band-${id}` : 'band'
}

async function resolveBandKey($: EngineInterface): Promise<string> {
  if (env.bandKey) return env.bandKey
  try {
    // The session id from the API: CLAUDE_CODE_SESSION_ID is not in a plugin's environment.
    env.bandKey = bandKeyFor(await $.session.id())
  } catch {
    env.bandKey = 'band'
  }
  return env.bandKey
}

/** Detects the desktop appearance and stores it when it changed, so the band redraws in the other palette. */
async function refreshAppearance($: EngineInterface): Promise<void> {
  const found = await desktopAppearance($)
  const { value } = await $.state.get({ plugin: 'neonmeter', key: 'appearance' })
  if ((value ?? null) !== found) await $.state.set({ plugin: 'neonmeter', key: 'appearance' }, found)
}

/** The windows the engine reports, kept to the kinds the band draws. */
function windowsOf(rateLimits: readonly SessionRateLimit[]): NeonMeterWindow[] {
  const out: NeonMeterWindow[] = []
  for (const w of rateLimits) {
    if (!(WINDOW_KINDS as readonly string[]).includes(w.kind)) continue
    const win: NeonMeterWindow = { kind: w.kind, percentUsed: w.percentUsed }
    if (w.resetsAt) win.resetsAt = w.resetsAt
    out.push(win)
  }
  return out
}

function contextOf(c: SessionContextUsage): NeonMeterContext {
  const out: NeonMeterContext = { window: c.window }
  if (typeof c.tokens === 'number') out.tokens = c.tokens
  if (typeof c.percent === 'number') out.percent = c.percent
  return out
}

/** The name a scoped limit carries: its model's display name, else its surface's. */
function scopeName(scope: unknown): string | null {
  if (!scope || typeof scope !== 'object') return null
  const { model, surface } = scope as Record<string, unknown>
  for (const part of [model, surface]) {
    if (typeof part === 'string' && part.trim()) return part.trim()
    if (part && typeof part === 'object') {
      const name = (part as Record<string, unknown>).display_name
      if (typeof name === 'string' && name.trim()) return name.trim()
    }
  }
  return null
}

/**
 * Reads the generic `limits` list: the `session` group is the 5-hour window,
 * every `weekly` entry a weekly window, the scoped ones (`weekly_scoped`, one
 * per model) labelled with their model's name. Null when the list is absent
 * or holds none of them.
 */
function parseLimits(limits: unknown): NeonMeterWindow[] | null {
  if (!Array.isArray(limits)) return null
  let session: NeonMeterWindow | null = null
  const weekly: NeonMeterWindow[] = []
  const scoped: NeonMeterWindow[] = []
  for (const entry of limits) {
    if (!entry || typeof entry !== 'object') continue
    const { kind, group, percent, resets_at: resetsAt, scope } = entry as Record<string, unknown>
    if (typeof percent !== 'number') continue
    const pct = Math.round(percent * 10) / 10
    if (group === 'session' || kind === 'session') {
      if (!session) {
        session = { kind: 'five_hour', percentUsed: pct }
        if (typeof resetsAt === 'string') session.resetsAt = resetsAt
      }
      continue
    }
    if (group !== 'weekly') continue
    const win: NeonMeterWindow = { kind: 'seven_day', percentUsed: pct }
    if (typeof resetsAt === 'string') win.resetsAt = resetsAt
    const name = kind === 'weekly_all' ? null : scopeName(scope)
    if (name) {
      win.label = name
      scoped.push(win)
    } else if (weekly.length === 0) {
      weekly.push(win)
    }
  }
  const out = [...(session ? [session] : []), ...weekly, ...scoped]
  return out.length ? out : null
}

/**
 * Reads the usage endpoint's body. The generic `limits` list wins when it is
 * there, so every weekly window the account reports (the all-models one and
 * one per model, such as `Fable`) comes through; otherwise `five_hour` and
 * `seven_day`, each with `utilization` (0 to 100) and `resets_at`. Null when
 * the body has none of them, so a changed shape shows as stale instead of as
 * an empty band.
 */
export function parseUsage(text: string): NeonMeterWindow[] | null {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  if (!json || typeof json !== 'object') return null
  const body = json as Record<string, unknown>
  const fromLimits = parseLimits(body.limits)
  if (fromLimits) return fromLimits
  const out: NeonMeterWindow[] = []
  for (const kind of ['five_hour', 'seven_day'] as const) {
    const w = body[kind]
    if (!w || typeof w !== 'object') continue
    const { utilization, resets_at: resetsAt } = w as Record<string, unknown>
    if (typeof utilization !== 'number') continue
    const win: NeonMeterWindow = { kind, percentUsed: Math.round(utilization * 10) / 10 }
    if (typeof resetsAt === 'string') win.resetsAt = resetsAt
    out.push(win)
  }
  return out.length ? out : null
}

/**
 * The windows an incoming reading leaves out that the previous one had and
 * that only one source reports: a gateway's spend limit comes only from the
 * engine after a response, the per-model weekly windows only from the fetch.
 */
export function carryOver(previous: readonly NeonMeterWindow[], incoming: readonly NeonMeterWindow[]): NeonMeterWindow[] {
  const id = (w: NeonMeterWindow) => `${w.kind}|${w.label ?? ''}`
  const have = new Set(incoming.map(id))
  const kept = previous.filter(w => (w.kind === 'spend_limit' || w.label) && !have.has(id(w)))
  return [...incoming, ...kept]
}

/** Stores a fresh reading in state and in `$.store`, clearing staleness. */
async function setReading($: EngineInterface, windows: NeonMeterWindow[], source: NeonMeterReading['source'], now: number): Promise<void> {
  const next: NeonMeterReading = { windows, at: now, source }
  await update($, reading, () => next)
  await update($, health, h => ({ ...(h ?? DEFAULT_HEALTH), hasAuth: true, isStale: false, lastError: undefined, lastAttemptAt: now }))
  await $.store.set(STORE_KEY, next)
}

// The module's own environment: reset by a reload, which is what re-arms the
// timers through `ensurePolling`.
type Env = {
  options: Options
  rejected: string[]
  loggedOptions: boolean
  inFlight: boolean
  pollTimer: Timer | null
  tickTimer: Timer | null
  /** The desktop's Weekly rotation: which row shows, and the timer that advances it with its interval. */
  turn: number
  rotateTimer: { timer: Timer; ms: number } | null
  /** True once the band was drawn on the desktop: only then is the appearance looked up. */
  onDesktop: boolean
  /** Options that were not valid and fell back to their default, logged once. */
  problems: string[]
  /**
   * The terminal band's Client key, `band-<session id>`: a Client is one
   * instance per plugin, drawing and key, so the key carries the session id
   * and sessions drawn by one renderer never share an instance. Null until
   * looked up.
   */
  bandKey: string | null
}

const env: Env = { options: DEFAULTS, rejected: [], loggedOptions: false, inFlight: false, pollTimer: null, tickTimer: null, turn: 0, rotateTimer: null, onDesktop: false, problems: [], bandKey: null }


/**
 * The fetch schedule every session shares through `$.store`: when one last
 * tried, how many 429s in a row, and until when nobody tries again. The usage
 * endpoint rate-limits the account, not the session, so N sessions polling on
 * their own soon get nothing but 429s.
 */
type FetchSchedule = { at: number; failures: number; backoffUntil: number }

const FETCH_KEY = 'fetch'
const MAX_BACKOFF_MS = 30 * 60_000
/** Timers fire a little early or late; a period this close to done counts as done. */
const JITTER_MS = 1_000

/**
 * A reading another session stored, or null when the entry is not one this
 * version wrote: a corrupt or older-format entry is ignored, never drawn.
 */
function storedReading(raw: unknown): NeonMeterReading | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<NeonMeterReading>
  if (!Array.isArray(r.windows) || typeof r.at !== 'number' || !Number.isFinite(r.at)) return null
  const windows: NeonMeterWindow[] = []
  for (const item of r.windows as unknown[]) {
    if (!item || typeof item !== 'object') return null
    const w = item as Partial<NeonMeterWindow>
    if (typeof w.kind !== 'string' || typeof w.percentUsed !== 'number' || !Number.isFinite(w.percentUsed)) return null
    const win: NeonMeterWindow = { kind: w.kind, percentUsed: w.percentUsed }
    if (typeof w.resetsAt === 'string') win.resetsAt = w.resetsAt
    if (typeof w.label === 'string') win.label = w.label
    windows.push(win)
  }
  return { windows, at: r.at, source: 'store' }
}

async function readSchedule($: EngineInterface): Promise<FetchSchedule> {
  const raw = (await $.store.get(FETCH_KEY)) as Partial<FetchSchedule> | undefined
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return { at: num(raw?.at), failures: num(raw?.failures), backoffUntil: num(raw?.backoffUntil) }
}

/**
 * Takes a reading another session stored when it is newer than this
 * session's, so every session shows the latest fetch. Returns the newer of
 * the two, or null when neither exists.
 */
async function adoptStored($: EngineInterface, now: number, periodMs: number): Promise<NeonMeterReading | null> {
  const local = (await $.state.get({ plugin: 'neonmeter', key: 'reading' })).value ?? null
  const stored = storedReading(await $.store.get(STORE_KEY))
  if (!stored) return local
  if (local && local.at >= stored.at) return local
  const adopted = stored
  await update($, reading, () => adopted)
  if (now - stored.at <= 2 * periodMs) {
    await update($, health, h => ({ ...(h ?? DEFAULT_HEALTH), hasAuth: true, isStale: false, lastError: undefined }))
  }
  return adopted
}

/**
 * One fetch of the usage endpoint with the session's credential, unless one
 * is not due: the reading (from the engine after a response, or stored by
 * another session) is younger than `pollSeconds`, another session tried
 * within the period, or a 429 put every session in backoff. Success replaces
 * the reading; failure keeps the last one and marks it stale; a 429 doubles
 * the shared wait up to 30 minutes. A `null` authorization (no first-party
 * login) or an API key hides the windows.
 */
async function refresh($: EngineInterface): Promise<void> {
  if (env.inFlight) return
  env.inFlight = true
  let now = 0
  try {
    now = await $.clock.now()
    const periodMs = env.options.pollSeconds * 1000
    const auth = await $.session.authorize()
    if (!auth || auth.kind === 'api-key') {
      await update($, health, h => ({ ...(h ?? DEFAULT_HEALTH), hasAuth: false, lastAttemptAt: now }))
      return
    }

    const current = await adoptStored($, now, periodMs)
    if (current && now - current.at < periodMs - JITTER_MS) return
    const schedule = await readSchedule($)
    if (schedule.backoffUntil > now + MAX_BACKOFF_MS) {
      // A stored wait longer than the maximum is not one this version wrote: cap it.
      schedule.backoffUntil = now + MAX_BACKOFF_MS
      await $.store.set(FETCH_KEY, schedule)
    }
    if (now < schedule.backoffUntil) return
    if (now - schedule.at < periodMs - JITTER_MS) return
    // Claim this period before the request, so a session that wakes meanwhile waits.
    await $.store.set(FETCH_KEY, { ...schedule, at: now })

    const res = await $.http.fetch(USAGE_URL, { auth: auth.handle, headers: USAGE_HEADERS })
    if (!res.ok) {
      const retryAfter = res.headers['retry-after']
      if (res.status === 429) {
        const failures = schedule.failures + 1
        // The doubled period, or the endpoint's own retry-after when that is longer, up to the maximum.
        const retryAfterMs = Number(retryAfter) > 0 ? Number(retryAfter) * 1000 : 0
        const waitMs = Math.min(Math.max(periodMs * 2 ** failures, retryAfterMs), MAX_BACKOFF_MS)
        await $.store.set(FETCH_KEY, { at: now, failures, backoffUntil: now + waitMs })
        $.ui.log(`neonmeter: usage endpoint rate-limited (429, ${failures} in a row): every session waits ${Math.round(waitMs / 1000)} s`, { to: 'debug' })
      }
      $.ui.log(`neonmeter: usage endpoint answered ${res.status}${retryAfter ? `, retry-after ${retryAfter}` : ''}`, { to: 'debug' })
      throw new Error(`HTTP ${res.status}`)
    }
    await $.store.set(FETCH_KEY, { at: now, failures: 0, backoffUntil: 0 })
    const windows = parseUsage(res.text)
    if (!windows) throw new Error('unrecognized usage response')
    // A gateway's spend limit only ever arrives through session.measure; keep it.
    const previous = (await $.state.get({ plugin: 'neonmeter', key: 'reading' })).value
    const spend = previous?.windows.find(w => w.kind === 'spend_limit')
    if (spend && !windows.some(w => w.kind === 'spend_limit')) windows.push(spend)
    await setReading($, windows, 'http', now)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    try {
      await update($, health, h => ({ ...(h ?? DEFAULT_HEALTH), isStale: true, lastError: message, lastAttemptAt: now }))
      $.ui.log(`neonmeter: usage fetch failed: ${message}`, { to: 'debug' })
    } catch {
      // The environment is gone (a reload, a test's end): nothing left to mark.
    }
  } finally {
    env.inFlight = false
  }
}

/**
 * Arms the poll and the minute tick once per module environment. Called from
 * every hook so a hot reload, which drops the old environment's timers,
 * re-arms them at the next event.
 */
function ensurePolling($: EngineInterface): void {
  if (!env.pollTimer) {
    env.pollTimer = $.clock.every(env.options.pollSeconds * 1000, () => {
      void refresh($)
    })
  }
  if (!env.tickTimer) {
    env.tickTimer = $.clock.every(60_000, () => {
      void update($, tick, n => (n ?? 0) + 1).catch(() => undefined)
      // A system theme switch reaches the desktop band within a minute.
      if (env.onDesktop) void refreshAppearance($).catch(() => undefined)
    })
  }
}

/**
 * The desktop's Weekly rotation: with more than one row to show, a timer
 * moves to the next every `rotateSeconds` and redraws the band; with one, no
 * timer. The terminal's Client rotates on its own frame clock instead.
 */
function ensureRotation($: EngineInterface, rowCount: number): void {
  const ms = env.options.rotateSeconds * 1000
  if (rowCount > 1) {
    if (env.rotateTimer && env.rotateTimer.ms === ms) return
    env.rotateTimer?.timer.cancel()
    env.rotateTimer = null
    try {
      const timer = $.clock.every(ms, () => {
        env.turn += 1
        $.ui.invalidate('ui.render')
      })
      env.rotateTimer = { timer, ms }
    } catch {
      // A timer refused from a render dispatch is armed at the next draw.
    }
  } else if (env.rotateTimer) {
    env.rotateTimer.timer.cancel()
    env.rotateTimer = null
    env.turn = 0
  }
}

/** Turns the state into the builder's input: staleness, ages and reset fields resolved against `now`. */
function inputOf(r: NeonMeterReading | null, c: NeonMeterContext | null, h: NeonMeterHealth, now: number, options: Options): BandInput {
  const staleByAge = r !== null && now - r.at > 2 * options.pollSeconds * 1000
  const stale = r !== null && (h.isStale || staleByAge)
  const windows: WindowInput[] = []
  for (const w of r?.windows ?? []) {
    if (!(WINDOW_KINDS as readonly string[]).includes(w.kind)) continue
    const win: WindowInput = { kind: w.kind as WindowKind, pct: w.percentUsed }
    if (w.label) win.label = { full: w.label, short: w.label.slice(0, 3) }
    if (w.resetsAt) {
      const at = Date.parse(w.resetsAt)
      if (Number.isFinite(at)) {
        win.resetMin = Math.max(0, Math.round((at - now) / 60000))
        win.resetAt = fmtResetAt(at)
      }
    }
    windows.push(win)
  }
  return {
    auth: h.hasAuth,
    loading: h.hasAuth && r === null,
    stale,
    staleAge: r ? fmtAge((now - r.at) / 60000) : '',
    windows,
    ctx: c ? { pct: c.percent ?? 0, tokens: c.tokens ?? null, window: c.window } : null,
    segments: options.segments,
  }
}


/**
 * One band input per weekly window, for the Weekly segment to rotate through:
 * the all-models window (`Weekly` / `7d`) first, then each per-model one
 * (`Fable` / `Fab`). Labels are padded to one width per tier so the bars
 * stay put as the windows take turns. A single weekly window is one input,
 * unchanged.
 */
export function weeklyVariants(input: BandInput): BandInput[] {
  const weekly = input.windows.filter(w => w.kind === 'seven_day')
  if (weekly.length <= 1) return [input]
  const labels = weekly.map(w => w.label ?? { full: 'Weekly', short: '7d' })
  const full = Math.max(...labels.map(l => l.full.length))
  const short = Math.max(...labels.map(l => l.short.length))
  const others = input.windows.filter(w => w.kind !== 'seven_day')
  return weekly.map((w, i) => ({
    ...input,
    windows: [...others, { ...w, label: { full: labels[i]!.full.padEnd(full), short: labels[i]!.short.padEnd(short) } }],
  }))
}

export const register: Register = (on, options) => {
  const { parsed, rejected, problems } = parseOptions(options)
  env.options = parsed
  env.rejected = rejected
  env.problems = problems
  configureDesign({ bounds: parsed.ranges, dark: parsed.colorsDark, light: parsed.colorsLight, cell: parsed.glyph })

  on('session.start', async ($, e, next) => {
    if (!env.loggedOptions) {
      env.loggedOptions = true
      if (env.rejected.length > 0) $.ui.log(`neonmeter: ignoring unknown or repeated segments: ${env.rejected.join(', ')}`, { to: 'debug' })
      for (const problem of env.problems) $.ui.log(`neonmeter: ${problem}`, { to: 'debug' })
    }
    const now = await $.clock.now()
    await $.state.set({ plugin: 'neonmeter', key: 'theme' }, await resolveTheme($, env.options.theme))

    // The latest stored reading (this or another session's), shown at its true age: the age
    // rule marks it stale once it is older than twice pollSeconds, and not before.
    const restored = storedReading(await $.store.get(STORE_KEY))
    if (restored) await update($, reading, () => restored)

    const usage = await $.session.usage()
    await update($, context, () => contextOf(usage.context))
    if (usage.rateLimits.length > 0) await setReading($, windowsOf(usage.rateLimits), 'measure', now)

    if (e.surface === 'desktop') {
      env.onDesktop = true
      await refreshAppearance($).catch(() => undefined)
    }

    void refresh($)
    ensurePolling($)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, context, () => contextOf(e.context))
    if (e.rateLimits.length > 0) {
      // The engine reports the all-models windows only; keep the per-model weekly ones the fetch brought.
      const previous = (await $.state.get({ plugin: 'neonmeter', key: 'reading' })).value
      await setReading($, carryOver(previous?.windows ?? [], windowsOf(e.rateLimits)), 'measure', await $.clock.now())
    }
    ensurePolling($)
    return next(e)
  })

  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    if (env.options.theme === 'auto') {
      await $.state.set({ plugin: 'neonmeter', key: 'theme' }, await resolveTheme($, env.options.theme))
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const bandKey = await resolveBandKey($)
    try {
      ensurePolling($)
    } catch {
      // A timer refused from a render dispatch is re-armed at the next session event.
    }

    // `h` is the JSX factory in this environment, so the health value is not named that here.
    const [r, c, hv, t, now] = await Promise.all([read($, reading), read($, context), read($, health), read($, theme), $.clock.now()])
    await read($, tick)

    const palette = THEMES[t ?? 'dark']
    const input = inputOf(r, c, hv ?? DEFAULT_HEALTH, now, env.options)
    const base = { pulse: env.options.pulse, pulseMs: env.options.pulseMs, ground: palette.bg }
    const variants = weeklyVariants(input)
    const { Box } = $.ui.resolve(e)

    if (e.surface === 'desktop') {
      // The desktop band is drawn in a proportional font: cells are nominal
      // there, so the row is text pieces plus bars that stretch to fill the
      // band, drawn as dots spread across the bar or as smooth slices. Its
      // neutral colors are theme keys the app paints for its own appearance;
      // the neon palette follows the app's detected appearance under `auto`
      // (else the terminal theme), or the `desktopTheme` option when set.
      // The desktop app starts sessions as an SDK host, whose session start names no
      // surface: the first desktop draw schedules the lookup (a render may not write
      // state, a timer may), instead of leaving it to the minute tick.
      if (!env.onDesktop) {
        env.onDesktop = true
        try {
          $.clock.after(0, () => {
            void refreshAppearance($).catch(() => undefined)
          })
        } catch {
          // The minute tick looks it up instead.
        }
      }
      const seen = await read($, appearance)
      const dt: NeonMeterTheme = env.options.desktopTheme === 'auto' ? (seen ?? t ?? 'dark') : env.options.desktopTheme
      const plain = flexRow(input, dt, env.options.barColoring)
      if (!plain) return next(e)
      const dotCount = desktopDotCount(plain, e.props.bodyColumns)
      const rows = variants
        .map(v => flexRow(v, dt, env.options.barColoring, env.options.desktopBars === 'dots' ? dotCount : undefined))
        .filter((r): r is FlexRow => r !== null)
      ensureRotation($, rows.length)
      const row = rows[env.turn % Math.max(1, rows.length)] ?? plain
      const { Text, Svg } = $.ui.resolve(e)
      return (
        <Box width="100%">
          {desktopBand(row, { Box, Text, Svg }, { pulse: env.options.pulse, pulseMs: env.options.pulseMs, glow: env.options.glow, palette: THEMES[dt], dotCount })}
        </Box>
      )
    }

    const cols = Math.max(1, e.props.bodyColumns)
    const rows = variants.map(v => band(v, cols, t ?? 'dark', env.options.barColoring)).filter(r => r !== null)
    const row = rows[0]
    if (!row) return next(e)
    const props: BandProps = { ...base, layout: 'cells', spans: row.spans }
    if (rows.length > 1) Object.assign(props, { alternates: rows.slice(1).map(r => r!.spans), rotateMs: env.options.rotateSeconds * 1000 })
    // Every surface with a `Client` draws the band this way; the desktop returned above.
    const { Text, Client } = $.ui.resolve(e) as ElementTable<'terminal'>
    return (
      <Box flexDirection="column" width={cols}>
        <Text color={RULE_COLOR} wrap="truncate">
          {RULE.repeat(cols)}
        </Text>
        <Client key={bandKey} module="./band.tsx" width="100%" props={props} />
      </Box>
    )
  })
}
