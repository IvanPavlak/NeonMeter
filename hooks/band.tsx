import type { ClientModule } from 'claude-code'

import { pulseForeground, pulseIntensity } from './color'
import type { Span } from './builder'

export type { Span }

/**
 * What the hooks module hands the terminal's Client: the cell row (the
 * builder's spans, one character per cell) and the pulse settings. The
 * desktop band is not a Client: the hooks module draws it (desktop.tsx).
 */
export type BandProps = {
  /** The `pulse` option: false draws every span at rest and starts no timer. */
  pulse: boolean
  /** The `pulseMs` option: one 8-frame cycle, so the frame interval is `pulseMs / 8`. */
  pulseMs: number
  /** The theme's ground. */
  ground: string
  /** How long each row holds the band while `alternates` rotate with it, in milliseconds. */
  rotateMs?: number
  layout: 'cells'
  spans: Span[]
  alternates?: Span[][]
}

/** The pulse frame, and which row of the rotation is showing (0 is `spans`). */
type State = { frame: number; turn: number }

// The timer of each instance and the interval it was started with, keyed by
// the instance's own `surface` (the same object on every call of that
// instance) so a remount after an unmount starts its own.
type Timer = { stop: () => void; ms: number }
const timers = new WeakMap<object, Timer>()
const rotations = new WeakMap<object, Timer>()

/** How many rows take turns: the main one and its alternates. */
function turnsOf(props: BandProps): number {
  return 1 + (props.alternates?.length ?? 0)
}

function hasLive(props: BandProps): boolean {
  return (props.spans ?? []).some(s => s.live)
}

/**
 * Starts, restarts or stops the rotation timer: while there is more than one
 * row (the Weekly segment has a per-model window to show too) it moves to the
 * next row every `rotateMs`; the pulse frame carries on untouched.
 */
function rotate(props: BandProps, surface: Parameters<ClientModule<BandProps, State>>[1]): void {
  const turns = turnsOf(props)
  const ms = props.rotateMs ?? 0
  const timer = rotations.get(surface)
  if (turns > 1 && ms > 0 && (!timer || timer.ms !== ms)) {
    timer?.stop()
    const stop = surface.every(ms, () => {
      const state = surface.state ?? { frame: 0, turn: 0 }
      surface.setState({ ...state, turn: state.turn + 1 })
    })
    rotations.set(surface, { stop, ms })
  } else if ((turns <= 1 || ms <= 0) && timer) {
    timer.stop()
    rotations.delete(surface)
  }
}

/**
 * Draws the row and runs the pulse: an 8-frame cycle on the surface's frame
 * clock, every live span blended toward white in its own color, all in
 * phase. With alternates, the rows take turns every `rotateMs`. No background
 * tint behind glyphs: in cells it reads as a box, not a glow. The timer runs
 * only while something on the row is live and the `pulse` option is on.
 */
const Band: ClientModule<BandProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const isLive = props.pulse && hasLive(props)

  const timer = timers.get(surface)
  if (isLive && (!timer || timer.ms !== props.pulseMs)) {
    timer?.stop()
    const stop = surface.every(Math.max(1, Math.round(props.pulseMs / 8)), () => {
      const state = surface.state ?? { frame: 0, turn: 0 }
      surface.setState({ ...state, frame: (state.frame + 1) % 8 })
    })
    timers.set(surface, { stop, ms: props.pulseMs })
  } else if (!isLive && timer) {
    timer.stop()
    timers.delete(surface)
  }

  rotate(props, surface)
  const turn = (surface.state?.turn ?? 0) % turnsOf(props)

  const frame = isLive ? (surface.state?.frame ?? 0) : 0
  const i = pulseIntensity(frame)
  const colorOf = (color: string, live: boolean | undefined) => (isLive && live ? pulseForeground(color, i) : color)

  const spans = turn === 0 ? (props.spans ?? []) : (props.alternates?.[turn - 1] ?? props.spans ?? [])
  return (
    <Box flexDirection="row">
      {spans.map(span => (
        <Text color={colorOf(span.color, span.live)} bold={span.bold} italic={span.italic} wrap="truncate">
          {span.text}
        </Text>
      ))}
    </Box>
  )
}

export default Band
