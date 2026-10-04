// Color math shared by the builder (hooks module) and the band (surface
// module). Every value is a `#RRGGBB` string; nothing here is terminal dim or
// alpha: a strength below 100% is a precomputed blend toward the ground.

export type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: Rgb): string {
  const part = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0').toUpperCase()
  return `#${part(r)}${part(g)}${part(b)}`
}

/**
 * `color` blended toward `ground` by `strength` (1 is the color itself, 0 the
 * ground): `ground + (color - ground) x strength` per channel, rounded.
 */
export function mix(color: string, ground: string, strength: number): string {
  if (strength >= 1) return color.toUpperCase()
  const c = hexToRgb(color)
  const g = hexToRgb(ground)
  return rgbToHex([g[0] + (c[0] - g[0]) * strength, g[1] + (c[1] - g[1]) * strength, g[2] + (c[2] - g[2]) * strength])
}


/** The pulse's intensity at `frame` of an 8-frame cycle: 0 at rest, 1 at the peak. */
export function pulseIntensity(frame: number): number {
  return (1 - Math.cos((2 * Math.PI * frame) / 8)) / 2
}

/** How far toward white the pulse blends at its peak. */
export const PULSE_LIFT = 0.45

/**
 * The pulse's foreground at intensity `i`: the color blended toward white, up
 * to `PULSE_LIFT` at the peak. Blending (unlike scaling the channels) moves
 * every color visibly, saturated ones too: lime `#39FF14`, whose green channel
 * is already 255, barely changed under a x1.3 scale.
 */
export function pulseForeground(color: string, i: number): string {
  if (i <= 0) return color.toUpperCase()
  return mix(color, '#FFFFFF', 1 - PULSE_LIFT * i)
}

