// NeonMeter's state contract: every value the mod keeps in `$.state`, declared
// under its plugin name so `claude plugin validate` can hold the module to it.

/** One rate-limit window as the account reports it. */
export type NeonMeterWindow = {
  /** `five_hour`, `seven_day`, or a gateway's `spend_limit`. */
  kind: string
  /** 0 to 100 with at most one decimal; past 100 on an exceeded spend limit. */
  percentUsed: number
  /** When the window resets, an ISO 8601 timestamp; absent for a spend limit. */
  resetsAt?: string
  /**
   * A weekly window scoped to one model (or surface), named as the account
   * reports it (`Fable`); absent for the all-models weekly window. Every
   * `seven_day` window takes a turn in the Weekly segment.
   */
  label?: string
}

/** The last set of windows the mod holds, where it came from and when. */
export type NeonMeterReading = {
  windows: NeonMeterWindow[]
  /** `$.clock.now()` when the reading was taken. */
  at: number
  /** `http` from the usage fetch, `measure` from `session.measure`, `store` restored at session start. */
  source: 'http' | 'measure' | 'store'
}

/** The live context window, as `$.session.usage()` reports it. */
export type NeonMeterContext = {
  /** Input tokens of the last response; absent before the first response. */
  tokens?: number
  /** The model's context window in tokens. */
  window: number
  /** `tokens` over `window`, 0 to 100; absent before the first response. */
  percent?: number
}

/** Whether the account can be read and whether the reading is current. */
export type NeonMeterHealth = {
  /** False when `$.session.authorize()` answered null: no first-party credential. */
  hasAuth: boolean
  /** True after a failed fetch until a fetch or a measurement succeeds. */
  isStale: boolean
  /** The last fetch failure, for the debug log. */
  lastError?: string
  /** `$.clock.now()` of the last fetch attempt, 0 before the first. */
  lastAttemptAt: number
}

/** The resolved palette: the `theme` option when forced, else Claude Code's theme, else dark. */
export type NeonMeterTheme = 'dark' | 'light'

declare module 'claude-code' {
  interface PluginState {
    neonmeter: {
      reading: NeonMeterReading | null
      context: NeonMeterContext | null
      health: NeonMeterHealth
      theme: NeonMeterTheme
      /**
       * The desktop app's appearance as detected (its own setting, else the
       * system's), null until known or when it cannot be read.
       */
      appearance: NeonMeterTheme | null
      /** Bumped once a minute so the stale age redraws on time. */
      tick: number
    }
  }
}
