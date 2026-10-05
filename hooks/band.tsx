import type { ClientModule } from 'claude-code'

import type { Burst } from './color'
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
  /**
   * The `pulseMode` option: `responsive` pulses only during `burst`, after a
   * value changed, and then stops its timer; `always` never stops.
   */
  pulseMode: 'responsive' | 'always'
  /** The responsive pulse as of the hooks module's drawing: which change, how far it has run, how long it runs. */
  burst: Burst
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
/** The change each instance last pulsed for, so a redraw within or after it does not start it again. */
const pulsed = new WeakMap<object, number>()

/** How many rows take turns: the main one and its alternates. */
function turnsOf(props: BandProps): number {
  return 1 + (props.alternates?.length ?? 0)
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
 * only while something on the row is live and the `pulse` option is on, and
 * under `pulseMode: responsive` only for the `burst` after a value changed,
 * picked up where it stands when the row is drawn partway through it; a
 * rotation turn is no change. A row that holds still costs no redraws.
 */
const Band: ClientModule<BandProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements

  rotate(props, surface)
  const turn = (surface.state?.turn ?? 0) % turnsOf(props)
  const spans = turn === 0 ? (props.spans ?? []) : (props.alternates?.[turn - 1] ?? props.spans ?? [])
  const isLive = props.pulse && spans.some(s => s.live)
  const always = props.pulseMode === 'always'
  const frameMs = Math.max(1, Math.round(props.pulseMs / 8))
  const burst = props.burst ?? { gen: 0, elapsedMs: 0, totalMs: 0 }
  const fresh = !always && burst.gen > 0 && pulsed.get(surface) !== burst.gen && burst.elapsedMs < burst.totalMs

  const timer = timers.get(surface)
  if (isLive && (always ? !timer || timer.ms !== props.pulseMs : fresh)) {
    timer?.stop()
    if (!always) pulsed.set(surface, burst.gen)
    // 8 frames a cycle, counted from where the burst stands; it ends on the rest frame and stops its timer.
    let n = always ? 0 : Math.floor(burst.elapsedMs / frameMs)
    const last = always ? Infinity : Math.round(burst.totalMs / frameMs)
    const stop = surface.every(frameMs, () => {
      const state = surface.state ?? { frame: 0, turn: 0 }
      n += 1
      if (n >= last) {
        stop()
        timers.delete(surface)
        surface.setState({ ...state, frame: 0 })
        return
      }
      surface.setState({ ...state, frame: n % 8 })
    })
    timers.set(surface, { stop, ms: props.pulseMs })
  } else if (!isLive && timer) {
    timer.stop()
    timers.delete(surface)
  }

  const frame = isLive && timers.has(surface) ? (surface.state?.frame ?? 0) : 0
  const i = pulseIntensity(frame)
  const colorOf = (color: string, live: boolean | undefined) => (isLive && live ? pulseForeground(color, i) : color)

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
