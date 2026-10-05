import { expect, test } from 'claude-code/testing'

import { CONTEXT, FAIL, HANDLE, MINUTE, NOW, USAGE_URL, limitsBody, mountBand, ok, rowOf, setup, start, usageBody } from './kit'

// The test's engine handle has no `state` or `store` noun, so the reading and
// its health are read back through the drawn row.

test('session.start fetches the usage endpoint once with the credential handle', async ($, on) => {
  const world = setup(on)
  await start($, world)

  expect(world.fetches).toHaveLength(1)
  expect(world.fetches[0]?.url).toBe(USAGE_URL)
  expect(world.fetches[0]?.init?.auth).toBe(HANDLE)
  expect(world.fetches[0]?.init?.headers?.['anthropic-beta']).toBe('oauth-2025-04-20')

  const ui = await mountBand($, 'terminal', 120)
  const row = await rowOf(ui)
  expect(row).toContain('5-hour ')
  expect(row).toContain(' 42% in 3h13m')
  expect(row).toContain(' 55%')
  expect(row).not.toContain('stale')
  await ui.unmount()
})

test('the poll adds one fetch per pollSeconds', async ($, on) => {
  const world = setup(on)
  await start($, world)

  await world.clock.advance(59_000)
  expect(world.fetches).toHaveLength(1)
  await world.clock.advance(1_000)
  expect(world.fetches).toHaveLength(2)
  await world.clock.advance(60_000)
  expect(world.fetches).toHaveLength(3)
})

test('pollSeconds: 30 halves the period', { options: { pollSeconds: 30 } }, async ($, on) => {
  const world = setup(on)
  await start($, world)

  await world.clock.advance(30_000)
  expect(world.fetches).toHaveLength(2)
  await world.clock.advance(30_000)
  expect(world.fetches).toHaveLength(3)
})

// The engine holds a stored option to the manifest's `min` and `max` before the
// module loads: an out-of-range value refuses the load, naming the field. The
// module's own clamp is a second line behind that.
test('pollSeconds: 1 refuses the load', { options: { pollSeconds: 1 } }, async ($, on) => {
  setup(on)
  await expect($.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })).rejects.toThrow(/Poll interval \(s\) must be at least 10/)
})

test('pollSeconds: 99999 refuses the load', { options: { pollSeconds: 99999 } }, async ($, on) => {
  setup(on)
  await expect($.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })).rejects.toThrow(/Poll interval \(s\) must be at most 3600/)
})

test('a failing response keeps the previous windows and marks the reading stale', async ($, on) => {
  const world = setup(on)
  await start($, world)
  world.response = FAIL
  await world.clock.advance(60_000)

  expect(world.logs.some(line => line.includes('usage fetch failed: HTTP 500'))).toBe(true)

  const ui = await mountBand($, 'terminal', 120)
  const row = await rowOf(ui)
  expect(row).toContain(' 42%')
  expect(row).toContain(' 55%')
  expect(row).toContain('  stale 1m')
  await ui.unmount()
})

test('a later success clears the stale mark and updates the reading', async ($, on) => {
  const world = setup(on)
  await start($, world)
  world.response = FAIL
  await world.clock.advance(60_000)

  world.response = ok(usageBody(61, 70, NOW + 2 * MINUTE))
  await world.clock.advance(60_000)

  const ui = await mountBand($, 'terminal', 120)
  const row = await rowOf(ui)
  expect(row).toContain(' 61%')
  expect(row).toContain(' 70%')
  expect(row).not.toContain('stale')
  await ui.unmount()
})

test('an unrecognized body counts as a failure and leaves the first load showing', async ($, on) => {
  const world = setup(on, { response: ok('{"unexpected": true}') })
  await start($, world)

  expect(world.logs.some(line => line.includes('unrecognized usage response'))).toBe(true)
  const ui = await mountBand($, 'terminal', 120)
  expect(await rowOf(ui)).toContain('    … │ Weekly ')
  await ui.unmount()
})

test('a null authorization hides the windows and makes no fetch', async ($, on) => {
  const world = setup(on, { auth: null })
  await start($, world)

  expect(world.fetches).toHaveLength(0)
  const ui = await mountBand($, 'terminal', 120)
  expect((await rowOf(ui)).startsWith('Context ')).toBe(true)
  await ui.unmount()
})

test('an API key counts as no subscription', async ($, on) => {
  const world = setup(on, { auth: 'api-key' })
  await start($, world)

  expect(world.fetches).toHaveLength(0)
  const ui = await mountBand($, 'terminal', 120)
  expect((await rowOf(ui)).startsWith('Context ')).toBe(true)
  await ui.unmount()
})

test('a store-seeded reading renders stale before any fetch answers', async ($, on) => {
  const stored = {
    windows: [
      { kind: 'five_hour', percentUsed: 64, resetsAt: new Date(NOW + 151 * MINUTE).toISOString() },
      { kind: 'seven_day', percentUsed: 29.5, resetsAt: new Date(NOW + 4560 * MINUTE).toISOString() },
    ],
    at: NOW - 5 * MINUTE,
    source: 'http',
  }
  const world = setup(on, { store: { reading: stored } })
  world.hang = true
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

  const ui = await mountBand($, 'terminal', 120)
  const row = await rowOf(ui)
  expect(row).toContain('  stale 5m')
  expect(row).toContain(' 64%')
  expect(row).toContain(' 30%')
  expect(row).toHaveLength(120)
  await ui.unmount()
})

test('session.start takes the windows the session already reports as a fresh reading', async ($, on) => {
  const world = setup(on, {
    usage: { rateLimits: [{ kind: 'five_hour', percentUsed: 12 }, { kind: 'seven_day', percentUsed: 22 }] },
  })
  // The fetch never answers: the row below comes from the session's own windows.
  world.hang = true
  world.hangMs = 1_000_000_000
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

  const ui = await mountBand($, 'terminal', 120)
  const row = await rowOf(ui)
  expect(row).toContain(' 12%')
  expect(row).toContain(' 22%')
  expect(row).not.toContain('stale')
  await ui.unmount()
})

// The usage endpoint rate-limits the account, not the session: every session
// shares one fetch schedule and the latest reading through the store.
const SHARED = 'fetch'

test('the engine\'s windows never postpone the fetch: a conversation still refreshes the per-model window every period', async ($, on) => {
  const world = setup(on, {
    usage: { rateLimits: [{ kind: 'five_hour', percentUsed: 12 }, { kind: 'seven_day', percentUsed: 22 }] },
    response: ok(limitsBody(12, 22, { Fable: 75 })),
  })
  await start($, world)
  expect(world.fetches, 'the session\'s own windows carry no per-model window, so the start fetches').toHaveLength(1)

  // A reply every 30 s hands fresh all-models windows; the Fable window rides along from the fetch.
  world.response = ok(limitsBody(13, 23, { Fable: 81 }))
  for (let i = 1; i <= 4; i++) {
    await world.clock.advance(30_000)
    await $.session.measure({ context: CONTEXT, rateLimits: [{ kind: 'five_hour', percentUsed: 12 + i }, { kind: 'seven_day', percentUsed: 23 }], changed: ['rateLimits'] })
  }
  expect(world.fetches, 'one fetch per period, replies or not').toHaveLength(3)

  const ui = await mountBand($, 'terminal', 120)
  expect(await rowOf(ui)).toContain(' 23% ')
  await ui.advance(5_000)
  const fable = await rowOf(ui)
  expect(fable).toContain('│ Fable  ')
  expect(fable).toContain(' 81% ')
  await ui.unmount()
})

test('a per-model window the fetch has not refreshed in twice the period fades alone while the engine keeps the rest fresh', async ($, on) => {
  const world = setup(on, { response: ok(limitsBody(42, 55, { Fable: 75 })) })
  await start($, world)
  expect(world.fetches).toHaveLength(1)

  // Every later fetch hangs; a reply every 30 s keeps the reading itself fresh.
  world.hang = true
  world.hangMs = 1_000_000_000
  for (let i = 1; i <= 5; i++) {
    await world.clock.advance(30_000)
    await $.session.measure({ context: CONTEXT, rateLimits: [{ kind: 'five_hour', percentUsed: 42 + i }, { kind: 'seven_day', percentUsed: 55 }], changed: ['rateLimits'] })
  }

  const ui = await mountBand($, 'terminal', 56)
  const weekly = await rowOf(ui)
  expect(weekly).not.toContain('stale')
  expect(weekly).not.toContain('~')
  await ui.advance(5_000)
  const fable = await rowOf(ui)
  expect(fable).toContain('Fab ~75%')
  expect(fable).not.toContain('stale')
  await ui.unmount()
})

test('another session\'s recent attempt holds this session\'s fetch until the period passes', async ($, on) => {
  const world = setup(on, { store: { [SHARED]: { at: NOW - 20_000, failures: 0, backoffUntil: 0 } } })
  await start($, world)
  expect(world.fetches, 'start waits for the other session\'s period').toHaveLength(0)

  await world.clock.advance(60_000)
  expect(world.fetches).toHaveLength(1)
})

test('a newer reading another session stored is adopted instead of fetching', async ($, on) => {
  const other = {
    windows: [
      { kind: 'five_hour', percentUsed: 71, resetsAt: new Date(NOW + 100 * MINUTE).toISOString() },
      { kind: 'seven_day', percentUsed: 33, resetsAt: new Date(NOW + 4560 * MINUTE).toISOString() },
    ],
    at: NOW - 10_000,
    source: 'http',
  }
  const world = setup(on, { store: { reading: other, [SHARED]: { at: NOW - 10_000, failures: 0, backoffUntil: 0 } } })
  await start($, world)

  expect(world.fetches).toHaveLength(0)
  const ui = await mountBand($, 'terminal', 120)
  const row = await rowOf(ui)
  expect(row).toContain(' 71% in 1h40m')
  expect(row).not.toContain('stale')
  await ui.unmount()
})

test('a 429 doubles the shared wait each time, capped at 30 minutes, and a success resets it', async ($, on) => {
  const world = setup(on, { response: { status: 429, ok: false, headers: { 'retry-after': '0' }, text: '{"error":{"type":"rate_limit_error"}}' } })
  await start($, world)
  expect(world.fetches).toHaveLength(1)
  expect(world.logs.some(l => l.includes('rate-limited (429, 1 in a row): every session waits 120 s'))).toBe(true)

  // Backoff 2 x 60 s: the poll at +60 s waits, the one at +120 s tries again.
  await world.clock.advance(60_000)
  expect(world.fetches).toHaveLength(1)
  await world.clock.advance(60_000)
  expect(world.fetches).toHaveLength(2)

  // Second 429: 4 x 60 s.
  await world.clock.advance(180_000)
  expect(world.fetches).toHaveLength(2)
  await world.clock.advance(60_000)
  expect(world.fetches).toHaveLength(3)

  // A success resets the schedule: the next try is one period later.
  world.response = ok(usageBody(44, 27, world.clock.now()))
  await world.clock.advance(480_000)
  expect(world.fetches).toHaveLength(4)
  await world.clock.advance(60_000)
  expect(world.fetches).toHaveLength(5)
})

test('the 429 wait never exceeds 30 minutes', async ($, on) => {
  const world = setup(on, {
    store: { [SHARED]: { at: NOW - 3_600_000, failures: 9, backoffUntil: 0 } },
    response: { status: 429, ok: false, headers: {}, text: 'rate limited' },
  })
  await start($, world)
  expect(world.logs.some(l => l.includes('rate-limited (429, 10 in a row): every session waits 1800 s'))).toBe(true)
})

test('a 429 with a retry-after longer than the doubled period waits for the retry-after', async ($, on) => {
  const world = setup(on, { response: { status: 429, ok: false, headers: { 'retry-after': '600' }, text: '' } })
  await start($, world)
  expect(world.fetches).toHaveLength(1)
  expect(world.logs.some(l => l.includes('every session waits 600 s'))).toBe(true)

  // The doubled period would be 120 s; the endpoint asked for 600 s, so no poll tries before that.
  await world.clock.advance(540_000)
  expect(world.fetches).toHaveLength(1)
  await world.clock.advance(60_000)
  expect(world.fetches).toHaveLength(2)
})

test('a stored reading this version did not write is ignored, not drawn', async ($, on) => {
  const world = setup(on, {
    store: { reading: { windows: [{ kind: 'five_hour', percentUsed: '42' }], at: NOW - 1000 } },
    response: FAIL,
  })
  await start($, world)

  const ui = await mountBand($, 'terminal', 120)
  const row = await rowOf(ui)
  expect(row).not.toContain('NaN')
  expect(row, 'the first load, since no reading is usable').toContain('…')
  await ui.unmount()
})

test('a server error is stale but not a backoff', async ($, on) => {
  const world = setup(on, { response: FAIL })
  await start($, world)
  await world.clock.advance(60_000)
  expect(world.fetches).toHaveLength(2)
})
