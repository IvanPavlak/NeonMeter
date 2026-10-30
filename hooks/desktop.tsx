// The desktop band's layout: the flex row's text pieces as `Text` in Claude
// Code's theme keys, and every bar, dot bar, percent and colored reset as an
// `Svg` drawn by drawings.ts, which holds the geometry, the glow and the pulse.
// Two more pieces when they show: the button, a ring drawing under a
// plain `Button` whose label is blank (a drawing takes no press, a Button
// does, and the app draws its own hover mark around it), and the context
// breakdown, a card revealed while the pointer is over the Context segment.
// The app floats a revealed card above the band, over everything; anything
// else the band draws stays inside the band's own frame.

import type { BoxProps, ButtonProps, ElementConstructor, RenderElement, SvgProps, TextProps } from 'claude-code'

import type { FlexButton, Frame, FlexRow, FlexSegment } from './builder'
import { THEME_KEYS } from './builder'
import type { DesktopOptions, OutlinePad } from './drawings'
import { buttonSvg, contextRowSvg, DISPLAY_HEIGHT, dotBarSvg, FRAME_CAP, FRAME_DISPLAY_HEIGHT, frameCapSvg, frameEdgesSvg, frameSpacerSvg, HEX, OUTLINE_CAP, outlineCapSvg, outlineEdgesSvg, outlineHeight, pctSvg, resetSvg, smoothBarSvg } from './drawings'

export type { DesktopOptions } from './drawings'

export type DesktopElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Svg: ElementConstructor<SvgProps>
  Button: ElementConstructor<ButtonProps>
}

/** What the band needs beyond the drawings' options: the button's press and look, and the hover cards. */
export type DesktopExtras = {
  /** Submits the button's prompt: its press. */
  onPress: () => void
  /** The button's pulse and glow: the band's, less what `buttonPulse` and `buttonGlow` turn off. */
  button: DesktopOptions
  /** The frame's pulse and glow: the band's, less what `borderPulse` and `borderGlow` turn off. */
  frame: DesktopOptions
  /** Show the context breakdown while the pointer is over the Context segment. */
  popup: boolean
  /** The hover cards' ground and border, in the app's appearance. */
  card: { background: string; border: string }
  /** The card's padding above and below the band on this operating system, which the outline reaches across. */
  outlinePad: OutlinePad
}

/** A blank label: the button's Button draws nothing of its own over the ring, only the app's hover mark. */
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

/** The button: its ring, the blank Button over it that takes the press, and a card naming what it does. */
function actionButton(c: FlexButton, els: DesktopElements, x: DesktopExtras): RenderElement {
  const { Box, Text, Svg, Button } = els
  return (
    <Box key="button" position="relative" flexShrink={0}>
      <Svg source={buttonSvg(c.ring, x.button)} alt={c.label} height={DISPLAY_HEIGHT} />
      <Box position="absolute" left={0} top={0}>
        <Button key="button-press" plain onPress={() => x.onPress()}>
          {BLANK}
        </Button>
      </Box>
      {hoverCard(els, x, [<Text color={THEME_KEYS.text}>{c.label}</Text>])}
    </Box>
  )
}

/**
 * `content` in a frame: under it, the caps at either end and the edges'
 * drawing stretched between them to the width the content takes; in the
 * flow, room as wide and tall as a cap at either end, so the text keeps
 * clear of the corners and the row is as tall as the frame.
 */
function framed(key: string, f: Frame, content: RenderElement[], els: DesktopElements, o: DesktopOptions, grow: boolean): RenderElement {
  const { Box, Svg } = els
  const cap = (side: 'left' | 'right') => (
    <Box key={`${key}-${side}`} flexShrink={0}>
      <Svg source={frameCapSvg(side, f, o)} alt="border" height={FRAME_DISPLAY_HEIGHT} />
    </Box>
  )
  const room = (side: 'left' | 'right') => (
    <Box key={`${key}-room-${side}`} flexShrink={0}>
      <Svg source={frameSpacerSvg(FRAME_CAP)} alt="border" height={FRAME_DISPLAY_HEIGHT} />
    </Box>
  )
  return (
    // The frame shrinks with its bar. The app would let it shrink past its text too, spilling it over the line, so
    // in a band too narrow for a frame's room the frames are left out beforehand (builder.ts `fitFrames`).
    <Box key={key} position="relative" flexDirection="row" alignItems="center" flexGrow={grow ? 1 : 0} flexShrink={1}>
      <Box position="absolute" top={0} left={0} right={0} bottom={0} flexDirection="row" alignItems="center">
        {cap('left')}
        <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
          <Svg source={frameEdgesSvg(f, o)} alt="border" height={FRAME_DISPLAY_HEIGHT} />
        </Box>
        {cap('right')}
      </Box>
      {room('left')}
      {content}
      {room('right')}
    </Box>
  )
}

/**
 * One piece of the band and the outline's stretch over it: whose section it
 * belongs to (a segment's index, or a separator's two, split between them),
 * and whether it grows and shrinks with the row (a bar, a frame) or keeps its
 * size (text, a percent, the button).
 */
type Section = { owner: number | [number, number]; grow: boolean; els: RenderElement[] }

/**
 * The band's pieces with the outline drawn around the card: each piece in a
 * Box that flexes as the piece does, so the row lays out as it does without
 * the outline, with its stretch of the top and bottom edges laid under it,
 * overflowing the row to the card's edges. The first and the last piece reach
 * one cell further out, to the card's own edges (a margin of minus one cell,
 * and a cell of padding so their text stays put), and hold the caps beside
 * their stretch, so no two drawings ever draw one line.
 */
function outlined(sections: Section[], colors: readonly Frame[], els: DesktopElements, o: DesktopOptions, rowHeight: number, pad: number): RenderElement[] {
  const { Box, Svg } = els
  // Not `h`: that is the JSX factory here.
  const tallness = outlineHeight(rowHeight, pad)
  const shown = (tallness * DISPLAY_HEIGHT) / 30
  const colorOf = (n: number) => colors[Math.max(0, Math.min(colors.length - 1, n))]!
  const last = sections.length - 1
  return sections.map((sec, n) => {
    const look = Array.isArray(sec.owner) ? colorOf(sec.owner[0]) : colorOf(sec.owner)
    const right = Array.isArray(sec.owner) ? colorOf(sec.owner[1]) : undefined
    const cap = (side: 'left' | 'right') => (
      <Box key={`outline-${side}`} flexShrink={0}>
        <Svg source={outlineCapSvg(side, side === 'left' ? look : (right ?? look), tallness, o)} alt="border" height={shown} />
      </Box>
    )
    const reach = { ...(n === 0 ? { marginLeft: -1, paddingLeft: 1 } : {}), ...(n === last ? { marginRight: -1, paddingRight: 1 } : {}) }
    return (
      <Box key={`section-${n}`} position="relative" flexDirection="row" alignItems="center" flexGrow={sec.grow ? 1 : 0} flexShrink={sec.grow ? 1 : 0} {...(sec.grow ? { minWidth: 0 } : {})} {...reach}>
        <Box position="absolute" top={0} bottom={0} left={0} right={0} flexDirection="row" alignItems="center">
          {n === 0 ? cap('left') : null}
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Svg source={outlineEdgesSvg(look, tallness, o, right)} alt="border" height={shown} />
          </Box>
          {n === last ? cap('right') : null}
        </Box>
        {sec.els}
      </Box>
    )
  })
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
  const button = row.button
  const hasCtx = row.segments.some(seg => seg.kind === 'ctx')
  const at = button ? (button.position === 'context' && !hasCtx ? 'end' : button.position) : null
  // The same pieces by section, for the outline: each segment's, each separator's, and the button with its neighbour.
  const sections: Section[] = []
  const into = (owner: Section['owner'], grow: boolean, ...items: RenderElement[]) => sections.push({ owner, grow, els: items })
  if (button && at === 'start') {
    children.push(actionButton(button, els, x), gap('button-gap'))
    for (const piece of children) into(0, false, piece)
  }
  row.segments.forEach((seg: FlexSegment, n) => {
    // A frame marks where its segment ends: beside one, the separator is room alone.
    if (n > 0) {
      const sep = fixed(`sep-${seg.kind}`, <Text color={THEME_KEYS.dim}>{seg.frame || row.segments[n - 1]!.frame ? ' ' : ' │ '}</Text>)
      children.push(sep)
      into([n - 1, n], false, sep)
    }
    const pieces: RenderElement[] = []
    if (button && at === 'context' && seg.kind === 'ctx') pieces.push(actionButton(button, els, x), gap('button-gap'))
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
    if (seg.frame) {
      const frame = framed(`frame-${seg.kind}`, seg.frame, pieces, els, x.frame, Boolean(seg.bar))
      children.push(frame)
      into(n, true, frame)
    } else {
      children.push(...pieces)
      // A bar's Box grows and shrinks with the row; every other piece keeps its size.
      for (const piece of pieces) into(n, /^(bar|dots)-/.test(String((piece as { props?: { key?: unknown } }).props?.key ?? '')), piece)
    }
  })
  if (button && at === 'end') {
    const tail = [gap('button-gap'), actionButton(button, els, x)]
    children.push(...tail)
    for (const piece of tail) into(row.segments.length - 1, false, piece)
  }
  if (row.outline) {
    // The row is as tall as its tallest piece: a frame's height while one shows, a drawing's otherwise.
    const tall = Boolean(row.frame) || row.segments.some(seg => seg.frame)
    const inner = outlined(sections, row.outline, els, x.frame, tall ? FRAME_DISPLAY_HEIGHT : DISPLAY_HEIGHT, x.outlinePad)
    return (
      // Every section as tall as the row, so each one's stretch of the edges lands on the same line: centered in the
      // row, a text section is shorter than a drawing's, and its bottom edge drew a pixel lower (measured on macOS).
      <Box key="band" position="relative" flexDirection="row" width="100%" alignItems="stretch">
        {inner}
      </Box>
    )
  }
  return (
    <Box key="band" flexDirection="row" width="100%" alignItems="center">
      {row.frame ? framed('frame-band', row.frame, children, els, x.frame, true) : children}
    </Box>
  )
}
