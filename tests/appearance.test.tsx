import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { appThemeMode, windowsAppearance } from '../hooks/register'
import { mountBand, setup, textOf } from './kit'

// The desktop app's light or dark appearance is not in the mod API, so the
// mod reads it where the app keeps it: the app's own `userThemeMode` in its
// config.json, and for `system` (the app's default) the operating system's.
// Nobody has to set anything for the band to follow it.

const APPDATA = 'C:\\Users\\Someone\\AppData\\Roaming'
const CONFIG = `${APPDATA}\\Claude\\config.json`
const reg = (light: 0 | 1) => `\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize\r\n    AppsUseLightTheme    REG_DWORD    0x${light}\r\n\r\n`

type Machine = { mode: string; light: 0 | 1; reads: string[]; runs: string[][] }

/** A Windows machine: the app's theme mode and the system's light setting, both changeable mid-test. */
function windows(on: On, mode: string, light: 0 | 1): Machine {
  const machine: Machine = { mode, light, reads: [], runs: [] }
  mock.env(on, { APPDATA })
  on('fs.read', ($, e) => {
    machine.reads.push(e.path)
    // A Linux engine resolves the Windows-style path against the working directory, so match its end.
    if (!e.path.endsWith(CONFIG)) throw new Error('ENOENT')
    return { value: JSON.stringify({ userThemeMode: machine.mode, locale: 'en-US' }) }
  })
  on('process.run', ($, e) => {
    machine.runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: reg(machine.light), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return machine
}

async function startOn($: Engine, surface: 'desktop' | 'terminal'): Promise<void> {
  await $.session.start({ cwd: '.', surface, isInteractive: true })
}

test('the app setting and the registry answer parse', () => {
  expect(appThemeMode('{"userThemeMode":"system"}')).toBe('system')
  expect(appThemeMode('{"userThemeMode":"light"}')).toBe('light')
  expect(appThemeMode('{"other":1}')).toBeNull()
  expect(appThemeMode('not json')).toBeNull()
  expect(windowsAppearance(reg(1))).toBe('light')
  expect(windowsAppearance(reg(0))).toBe('dark')
  expect(windowsAppearance('ERROR: unable to find')).toBeNull()
})

test('a desktop app following a light system draws the light palette, with no setting changed', { options: { pulse: false } }, async ($, on) => {
  const world = setup(on, { themeRow: 'dark' })
  const machine = windows(on, 'system', 1)
  await startOn($, 'desktop')
  await world.clock.settle()

  expect(machine.reads.some(path => path.endsWith(CONFIG))).toBe(true)
  expect(machine.runs).toContainEqual(['reg', 'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'AppsUseLightTheme'])
  const desktop = await mountBand($, 'desktop', 95)
  expect(await textOf(desktop, '42%')).toMatchObject({ color: '#1874D2' })
  await desktop.unmount()

  // The terminal keeps following Claude Code's own theme.
  const terminal = await mountBand($, 'terminal', 120)
  expect(await textOf(terminal, ' 42%')).toMatchObject({ color: '#1E90FF' })
  await terminal.unmount()
})

test('the app\'s own light or dark setting wins over the system', { options: { pulse: false } }, async ($, on) => {
  const world = setup(on, { themeRow: 'light' })
  const machine = windows(on, 'dark', 1)
  await startOn($, 'desktop')
  await world.clock.settle()

  expect(machine.runs, 'no system lookup needed').toHaveLength(0)
  const ui = await mountBand($, 'desktop', 95)
  expect(await textOf(ui, '42%')).toMatchObject({ color: '#1E90FF' })
  await ui.unmount()
})

test('switching the system theme reaches the desktop band within a minute', { options: { pulse: false } }, async ($, on) => {
  const world = setup(on)
  const machine = windows(on, 'system', 1)
  await startOn($, 'desktop')
  await world.clock.settle()

  const ui = await mountBand($, 'desktop', 95)
  expect(await textOf(ui, '42%')).toMatchObject({ color: '#1874D2' })

  machine.light = 0
  await world.clock.advance(60_000)
  expect(await textOf(ui, '42%')).toMatchObject({ color: '#1E90FF' })
  await ui.unmount()
})

test('desktopTheme set by hand still wins over the detected appearance', { options: { pulse: false, desktopTheme: 'dark' } }, async ($, on) => {
  const world = setup(on)
  windows(on, 'system', 1)
  await startOn($, 'desktop')
  await world.clock.settle()

  const ui = await mountBand($, 'desktop', 95)
  expect(await textOf(ui, '42%')).toMatchObject({ color: '#1E90FF' })
  await ui.unmount()
})

test('a terminal session never looks up the desktop appearance', async ($, on) => {
  const world = setup(on)
  const machine = windows(on, 'system', 1)
  await startOn($, 'terminal')
  await world.clock.advance(120_000)

  expect(machine.reads).toHaveLength(0)
  expect(machine.runs).toHaveLength(0)
})

test('when nothing can be read the desktop falls back to the terminal theme', { options: { pulse: false } }, async ($, on) => {
  const world = setup(on, { themeRow: 'light' })
  await startOn($, 'desktop')
  await world.clock.settle()

  const ui = await mountBand($, 'desktop', 95)
  expect(await textOf(ui, '42%')).toMatchObject({ color: '#1874D2' })
  await ui.unmount()
})

test('a desktop session started by the SDK (no surface at start) follows the app right after its first draw', { options: { pulse: false } }, async ($, on) => {
  const world = setup(on, { themeRow: 'dark' })
  windows(on, 'system', 1)
  await $.session.start({ cwd: '.', surface: null, isInteractive: false })
  await world.clock.settle()

  const ui = await mountBand($, 'desktop', 95)
  await world.clock.settle()
  expect(await textOf(ui, '42%')).toMatchObject({ color: '#1874D2' })
  await ui.unmount()
})

// macOS and GNOME: no APPDATA, so the app's config.json is looked up under
// HOME (macOS's Application Support, then the XDG config folder), and for a
// `system` app the operating system is asked: `defaults` on macOS, which keeps
// AppleInterfaceStyle only in dark mode, and `gsettings` where `defaults` does
// not exist. Each test sets Claude Code's own theme to the opposite of what the
// system says, so the palette proves the lookup.

type Unix = { mode: string; reads: string[]; runs: string[][]; macDark: boolean; gnome: string | null }

/** A path in POSIX form, whatever the engine's platform made of it. */
const posix = (path: string) => path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')

/**
 * A macOS or Linux machine. `kind: 'mac'` answers `defaults` (dark when
 * `macDark`, else exit 1 with nothing); `kind: 'gnome'` has no `defaults`
 * binary and answers `gsettings` with `gnome` (exit 1 when null).
 */
function unix(on: On, kind: 'mac' | 'gnome', env: Record<string, string>, config: string, mode: string): Unix {
  const machine: Unix = { mode, reads: [], runs: [], macDark: false, gnome: "'default'" }
  mock.env(on, env)
  on('fs.read', ($, e) => {
    // An engine on Windows resolves a POSIX path into a drive path with backslashes: compare in POSIX form.
    const path = posix(e.path)
    machine.reads.push(path)
    if (path !== config) throw new Error('ENOENT')
    return { value: JSON.stringify({ userThemeMode: machine.mode }) }
  })
  on('process.run', ($, e) => {
    machine.runs.push([...e.argv])
    const ok = (exitCode: number, stdout: string) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (e.argv[0] === 'defaults') {
      if (kind !== 'mac') throw new Error('spawn defaults ENOENT')
      return machine.macDark ? ok(0, 'Dark\n') : ok(1, '')
    }
    if (e.argv[0] === 'gsettings') return machine.gnome === null ? ok(1, '') : ok(0, `${machine.gnome}\n`)
    throw new Error(`spawn ${e.argv[0]} ENOENT`)
  })
  return machine
}

const MAC_HOME = '/Users/someone'
const MAC_CONFIG = `${MAC_HOME}/Library/Application Support/Claude/config.json`
const LINUX_HOME = '/home/someone'

async function desktopPct($: Engine, world: { clock: { settle: () => Promise<void> } }): Promise<string | undefined> {
  await world.clock.settle()
  const ui = await mountBand($, 'desktop', 95)
  const color = (await textOf(ui, '42%'))?.color
  await ui.unmount()
  return color
}

test('macOS in dark mode: `defaults` answers Dark and the desktop draws the dark palette', { options: { pulse: false } }, async ($, on) => {
  const world = setup(on, { themeRow: 'light' })
  const machine = unix(on, 'mac', { HOME: MAC_HOME }, MAC_CONFIG, 'system')
  machine.macDark = true
  await startOn($, 'desktop')

  expect(await desktopPct($, world)).toBe('#1E90FF')
  expect(machine.reads).toContain(MAC_CONFIG)
  expect(machine.runs).toContainEqual(['defaults', 'read', '-g', 'AppleInterfaceStyle'])
  expect(machine.runs.some(argv => argv[0] === 'gsettings'), 'macOS never asks gsettings').toBe(false)
})

test('macOS in light mode: `defaults` exits 1 with nothing and the desktop draws the light palette', { options: { pulse: false } }, async ($, on) => {
  const world = setup(on, { themeRow: 'dark' })
  unix(on, 'mac', { HOME: MAC_HOME }, MAC_CONFIG, 'system')
  await startOn($, 'desktop')

  expect(await desktopPct($, world)).toBe('#1874D2')
})

test('macOS: the app\'s own setting wins and the system is not asked', { options: { pulse: false } }, async ($, on) => {
  const world = setup(on, { themeRow: 'dark' })
  const machine = unix(on, 'mac', { HOME: MAC_HOME }, MAC_CONFIG, 'light')
  machine.macDark = true
  await startOn($, 'desktop')

  expect(await desktopPct($, world)).toBe('#1874D2')
  expect(machine.runs).toHaveLength(0)
})

test('GNOME with prefer-dark: no `defaults`, so `gsettings` decides, and the app config is found under ~/.config', { options: { pulse: false } }, async ($, on) => {
  const world = setup(on, { themeRow: 'light' })
  const config = `${LINUX_HOME}/.config/Claude/config.json`
  const machine = unix(on, 'gnome', { HOME: LINUX_HOME }, config, 'system')
  machine.gnome = "'prefer-dark'"
  await startOn($, 'desktop')

  expect(await desktopPct($, world)).toBe('#1E90FF')
  expect(machine.reads).toContain(config)
  expect(machine.runs).toContainEqual(['gsettings', 'get', 'org.gnome.desktop.interface', 'color-scheme'])
})

test('GNOME with the default scheme draws the light palette', { options: { pulse: false } }, async ($, on) => {
  const world = setup(on, { themeRow: 'dark' })
  unix(on, 'gnome', { HOME: LINUX_HOME }, `${LINUX_HOME}/.config/Claude/config.json`, 'system')
  await startOn($, 'desktop')

  expect(await desktopPct($, world)).toBe('#1874D2')
})

test('Linux honors XDG_CONFIG_HOME for the app config', { options: { pulse: false } }, async ($, on) => {
  const world = setup(on, { themeRow: 'light' })
  const config = '/data/someone/config/Claude/config.json'
  const machine = unix(on, 'gnome', { HOME: LINUX_HOME, XDG_CONFIG_HOME: '/data/someone/config' }, config, 'dark')
  await startOn($, 'desktop')

  expect(await desktopPct($, world)).toBe('#1E90FF')
  expect(machine.reads).toContain(config)
})

test('Linux without a readable color scheme (gsettings fails) falls back to the terminal theme', { options: { pulse: false } }, async ($, on) => {
  const world = setup(on, { themeRow: 'light' })
  const machine = unix(on, 'gnome', { HOME: LINUX_HOME }, `${LINUX_HOME}/.config/Claude/config.json`, 'system')
  machine.gnome = null
  await startOn($, 'desktop')

  expect(await desktopPct($, world)).toBe('#1874D2')
})

test('a GNOME switch to dark reaches the desktop band within a minute', { options: { pulse: false } }, async ($, on) => {
  const world = setup(on, { themeRow: 'dark' })
  const machine = unix(on, 'gnome', { HOME: LINUX_HOME }, `${LINUX_HOME}/.config/Claude/config.json`, 'system')
  await startOn($, 'desktop')
  await world.clock.settle()

  const ui = await mountBand($, 'desktop', 95)
  expect(await textOf(ui, '42%')).toMatchObject({ color: '#1874D2' })
  machine.gnome = "'prefer-dark'"
  await world.clock.advance(60_000)
  expect(await textOf(ui, '42%')).toMatchObject({ color: '#1E90FF' })
  await ui.unmount()
})
