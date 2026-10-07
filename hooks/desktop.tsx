// The desktop band's layout: the flex row's text pieces as `Text` in Claude
// Code's theme keys, and every bar, dot bar, percent and colored reset as an
// `Svg` drawn by drawings.ts, which holds the geometry, the glow and the pulse.
// Two more pieces when they show: the compact button, a ring drawing under a
// plain `Button` whose label is blank (a drawing takes no press, a Button
// does, and the app draws its own hover mark around it), and the context
// breakdown, a card revealed while the pointer is over the Context segment.
// The app floats a revealed card above the band, over everything; anything
// else the band draws stays inside the band's own frame.

import type { BoxProps, ButtonProps, ElementConstructor, RenderElement, SvgProps, TextProps } from 'claude-code'

import type { FlexCompact, FlexRow, FlexSegment } from './builder'
import { THEME_KEYS } from './builder'
import type { DesktopOptions } from './drawings'
import { compactSvg, contextRowSvg, DISPLAY_HEIGHT, dotBarSvg, HEX, pctSvg, resetSvg, smoothBarSvg } from './drawings'

export type { DesktopOptions } from './drawings'

export type DesktopElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Svg: ElementConstructor<SvgProps>
  Button: ElementConstructor<ButtonProps>
}

/** What the band needs beyond the drawings' options: the compact button's press and look, and the hover cards. */
export type DesktopExtras = {
  /** Compacts the conversation: the compact button's press. */
  onCompact: () => void
  /** The compact button's pulse and glow: the band's, less what `compactPulse` and `compactGlow` turn off. */
  compact: DesktopOptions
  /** Show the context breakdown while the pointer is over the Context segment. */
  popup: boolean
  /** The hover cards' ground and border, in the app's appearance. */
  card: { background: string; border: string }
}

/** A blank label: the compact button's Button draws nothing of its own over the ring, only the app's hover mark. */
const BLANK = '  '

/** A card the app shows above `anchor`'s keyed Box while the pointer is over it. */
function hoverCard(els: DesktopElements, x: DesktopExtras, content: RenderElement[]): RenderElement {
  const { Box } = els
  return (
    <Box position="absolute" top={0} left={0} display="none" hover={{ display: 'flex' }} flexDirection="column" backgroundColor={x.card.background} borderStyle="round" borderColor={x.card.border} paddingX={1}>
      {content}
    </Box>
  )
}

/** The compact button: its ring, the blank Button over it that takes the press, and a card naming what it does. */
function compactButton(c: FlexCompact, els: DesktopElements, x: DesktopExtras): RenderElement {
  const { Box, Text, Svg, Button } = els
  return (
    <Box key="compact" position="relative" flexShrink={0}>
      <Svg source={compactSvg(c.ring, x.compact)} alt={c.label} height={DISPLAY_HEIGHT} />
      <Box position="absolute" left={0} top={0}>
        <Button key="compact-press" plain onPress={() => x.onCompact()}>
          {BLANK}
        </Button>
      </Box>
      {hoverCard(els, x, [<Text color={THEME_KEYS.text}>{c.label}</Text>])}
    </Box>
  )
}

/**
 * The desktop band from a flex row (its colors as the builder made them, in
 * `#RRGGBB`): labels, separators, reset fields and the stale marker as `Text`
 * in theme keys the app paints for its own appearance; bars and percents as
 * drawings. A percent in the theme's plain text color (`--`) stays text.
 */
export function desktopBand(row: FlexRow, els: DesktopElements, o: DesktopOptions, x: DesktopExtras): RenderElement {
  const { Box, Text, Svg } = els
  const children: RenderElement[] = []
  let lastWin = -1
  row.segments.forEach((seg, n) => {
    if (seg.kind !== 'ctx') lastWin = n
  })
  const fixed = (key: string, el: RenderElement) => (
    <Box key={key} flexShrink={0}>
      {el}
    </Box>
  )
  const gap = (key: string) => fixed(key, <Text color={THEME_KEYS.text}> </Text>)
  const compact = row.compact
  const hasCtx = row.segments.some(seg => seg.kind === 'ctx')
  const at = compact ? (compact.position === 'context' && !hasCtx ? 'end' : compact.position) : null
  if (compact && at === 'start') children.push(compactButton(compact, els, x), gap('compact-gap'))
  row.segments.forEach((seg: FlexSegment, n) => {
    if (n > 0) children.push(fixed(`sep-${seg.kind}`, <Text color={THEME_KEYS.dim}> │ </Text>))
    const pieces: RenderElement[] = []
    if (compact && at === 'context' && seg.kind === 'ctx') pieces.push(compactButton(compact, els, x), gap('compact-gap'))
    pieces.push(fixed(`label-${seg.kind}`, <Text color={THEME_KEYS.text}>{seg.label} </Text>))
    // The context bar's own Box is the breakdown card's anchor, as the app's own indicator opens its card over its bar.
    const card = seg.kind === 'ctx' && x.popup && row.context?.length ? hoverCard(els, x, row.context.map(r => <Svg source={contextRowSvg(r, o)} alt={r.text} height={DISPLAY_HEIGHT} />)) : null
    if (seg.dots) {
      const filled = seg.dots.filter(d => HEX.test(d.color) && d.color.toUpperCase() !== o.palette.track.toUpperCase()).length
      const svg = <Svg source={dotBarSvg(seg.dots, o)} alt={`${filled} of ${seg.dots.length} dots`} height={DISPLAY_HEIGHT} />
      pieces.push(
        <Box key={`dots-${seg.kind}`} flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden" {...(card ? ({ position: 'relative' } as const) : {})}>
          {card ? [svg, card] : svg}
        </Box>,
      )
      pieces.push(gap(`gap-${seg.kind}`))
    } else if (seg.bar) {
      const svg = <Svg source={smoothBarSvg(seg.bar, o)} alt={`${seg.kind} bar`} height={DISPLAY_HEIGHT} />
      pieces.push(
        <Box key={`bar-${seg.kind}`} flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden" {...(card ? ({ position: 'relative' } as const) : {})}>
          {card ? [svg, card] : svg}
        </Box>,
      )
      pieces.push(gap(`gap-${seg.kind}`))
    }
    if (!seg.pct.live && seg.pct.color.toUpperCase() === o.palette.text.toUpperCase()) {
      pieces.push(
        fixed(
          `pct-${seg.kind}`,
          <Text color={THEME_KEYS.text} bold>
            {seg.pct.text}
          </Text>,
        ),
      )
    } else {
      pieces.push(fixed(`pct-${seg.kind}`, <Svg source={pctSvg(seg.pct, o)} alt={seg.pct.text} height={DISPLAY_HEIGHT} />))
    }
    if (seg.extra && seg.extraSpan) {
      // The gap is text and the reset a drawing, so the row reads as it does in plain text.
      pieces.push(gap(`extra-gap-${seg.kind}`))
      pieces.push(fixed(`extra-${seg.kind}`, <Svg source={resetSvg(seg.extraSpan, o)} alt={seg.extra} height={DISPLAY_HEIGHT} />))
    } else if (seg.extra) {
      pieces.push(fixed(`extra-${seg.kind}`, <Text color={THEME_KEYS.text}> {seg.extra}</Text>))
    }
    if (n === lastWin && row.stale) {
      pieces.push(
        fixed(
          `stale-${seg.kind}`,
          <Text color={THEME_KEYS.dim} italic>
            {'  ' + row.stale.text}
          </Text>,
        ),
      )
    }
    children.push(...pieces)
  })
  if (compact && at === 'end') children.push(gap('compact-gap'), compactButton(compact, els, x))
  if (compact && (at === 'outside-left' || at === 'outside-right')) {
    // Beside the row, a cell away: the row keeps its own layout, only narrower.
    const meter = (
      <Box key="meter" flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} alignItems="center">
        {children}
      </Box>
    )
    const space = <Box key="compact-gap" width={1} flexShrink={0} />
    return (
      <Box key="band" flexDirection="row" width="100%" alignItems="center">
        {at === 'outside-left' ? [compactButton(compact, els, x), space, meter] : [meter, space, compactButton(compact, els, x)]}
      </Box>
    )
  }
  return (
    <Box key="band" flexDirection="row" width="100%" alignItems="center">
      {children}
    </Box>
  )
}
