// The ten states of the design canvas (the appendix's STATES fixture), as the
// builder's input. The stale state uses an age of 5 minutes, as the golden rows do.

import type { BandInput, OptionSegment } from '../hooks/builder'

export const ALL_SEGMENTS: readonly OptionSegment[] = ['five_hour', 'seven_day', 'spend', 'context']

const BASE: BandInput = {
  auth: true,
  loading: false,
  stale: false,
  staleAge: '5m',
  windows: [],
  ctx: null,
  segments: ALL_SEGMENTS,
}

export type StateFixture = { n: number; title: string; input: BandInput }

function state(n: number, title: string, input: Partial<BandInput>): StateFixture {
  return { n, title, input: { ...BASE, ...input } }
}

export const STATES: readonly StateFixture[] = [
  state(1, 'Live, fresh', {
    windows: [
      { kind: 'five_hour', pct: 42.3, resetMin: 193 },
      { kind: 'seven_day', pct: 55, resetMin: 4560, resetAt: 'Thu 14:05' },
    ],
    ctx: { pct: 64, tokens: 128000, window: 200000 },
  }),
  state(2, 'One window high, context high', {
    windows: [
      { kind: 'five_hour', pct: 81.6, resetMin: 64 },
      { kind: 'seven_day', pct: 18.2, resetMin: 4560, resetAt: 'Thu 14:05' },
    ],
    ctx: { pct: 74, tokens: 148000, window: 200000 },
  }),
  state(3, 'Critical', {
    windows: [
      { kind: 'five_hour', pct: 93.4, resetMin: 47 },
      { kind: 'seven_day', pct: 61, resetMin: 1510, resetAt: 'Tue 09:30' },
    ],
    ctx: { pct: 91, tokens: 910000, window: 1000000 },
  }),
  state(4, 'Stale, last reading 5m old', {
    stale: true,
    windows: [
      { kind: 'five_hour', pct: 64, resetMin: 151 },
      { kind: 'seven_day', pct: 29.5, resetMin: 4560, resetAt: 'Thu 14:05' },
    ],
    ctx: { pct: 45, tokens: 90000, window: 200000 },
  }),
  state(5, 'No subscription or API key', {
    auth: false,
    ctx: { pct: 52, tokens: 104000, window: 200000 },
  }),
  state(6, 'First load', {
    loading: true,
    ctx: { pct: 12, tokens: 24000, window: 200000 },
  }),
  state(7, 'High across the board', {
    windows: [
      { kind: 'five_hour', pct: 95.2, resetMin: 22 },
      { kind: 'seven_day', pct: 84, resetMin: 1890, resetAt: 'Tue 15:50' },
    ],
    ctx: { pct: 77, tokens: 154000, window: 200000 },
  }),
  state(8, 'Turn running (isWorking)', {
    windows: [
      { kind: 'five_hour', pct: 42.3, resetMin: 193 },
      { kind: 'seven_day', pct: 55, resetMin: 4560, resetAt: 'Thu 14:05' },
    ],
    ctx: { pct: 64, tokens: 128000, window: 200000 },
  }),
  state(9, 'New session, before the first response', {
    windows: [
      { kind: 'five_hour', pct: 12, resetMin: 284 },
      { kind: 'seven_day', pct: 22, resetMin: 4560, resetAt: 'Thu 14:05' },
    ],
    ctx: { pct: 0, tokens: null, window: 200000 },
  }),
  state(10, 'Gateway spend limit present', {
    windows: [
      { kind: 'five_hour', pct: 38, resetMin: 201 },
      { kind: 'seven_day', pct: 21, resetMin: 4560, resetAt: 'Thu 14:05' },
      { kind: 'spend_limit', pct: 112 },
    ],
    ctx: { pct: 30, tokens: 60000, window: 200000 },
  }),
]
