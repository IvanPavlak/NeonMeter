// The desktop band's layout: the flex row's text pieces as `Text` in Claude
// Code's theme keys, and every bar, dot bar, percent and colored reset as an
// `Svg` drawn by drawings.ts, which holds the geometry, the glow and the pulse.

import type { BoxProps, ElementConstructor, RenderElement, SvgProps, TextProps } from 'claude-code'

import type { FlexRow, FlexSegment } from './builder'
import { THEME_KEYS } from './builder'
import type { DesktopOptions } from './drawings'
import { DISPLAY_HEIGHT, dotBarSvg, HEX, pctSvg, resetSvg, smoothBarSvg } from './drawings'

export type { DesktopOptions } from './drawings'

export type DesktopElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Svg: ElementConstructor<SvgProps>
}

/**
 * The desktop band from a flex row (its colors as the builder made them, in
 * `#RRGGBB`): labels, separators, reset fields and the stale marker as `Text`
 * in theme keys the app paints for its own appearance; bars and percents as
 * drawings. A percent in the theme's plain text color (`--`) stays text.
 */
export function desktopBand(row: FlexRow, els: DesktopElements, o: DesktopOptions): RenderElement {
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
  row.segments.forEach((seg: FlexSegment, n) => {
    if (n > 0) children.push(fixed(`sep-${seg.kind}`, <Text color={THEME_KEYS.dim}> │ </Text>))
    children.push(fixed(`label-${seg.kind}`, <Text color={THEME_KEYS.text}>{seg.label} </Text>))
    if (seg.dots) {
      const filled = seg.dots.filter(d => HEX.test(d.color) && d.color.toUpperCase() !== o.palette.track.toUpperCase()).length
      children.push(
        <Box key={`dots-${seg.kind}`} flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
          <Svg source={dotBarSvg(seg.dots, o)} alt={`${filled} of ${seg.dots.length} dots`} height={DISPLAY_HEIGHT} />
        </Box>,
      )
      children.push(fixed(`gap-${seg.kind}`, <Text color={THEME_KEYS.text}> </Text>))
    } else if (seg.bar) {
      children.push(
        <Box key={`bar-${seg.kind}`} flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
          <Svg source={smoothBarSvg(seg.bar, o)} alt={`${seg.kind} bar`} height={DISPLAY_HEIGHT} />
        </Box>,
      )
      children.push(fixed(`gap-${seg.kind}`, <Text color={THEME_KEYS.text}> </Text>))
    }
    if (!seg.pct.live && seg.pct.color.toUpperCase() === o.palette.text.toUpperCase()) {
      children.push(
        fixed(
          `pct-${seg.kind}`,
          <Text color={THEME_KEYS.text} bold>
            {seg.pct.text}
          </Text>,
        ),
      )
    } else {
      children.push(fixed(`pct-${seg.kind}`, <Svg source={pctSvg(seg.pct, o)} alt={seg.pct.text} height={DISPLAY_HEIGHT} />))
    }
    if (seg.extra && seg.extraSpan) {
      // The gap is text and the reset a drawing, so the row reads as it does in plain text.
      children.push(fixed(`extra-gap-${seg.kind}`, <Text color={THEME_KEYS.text}> </Text>))
      children.push(fixed(`extra-${seg.kind}`, <Svg source={resetSvg(seg.extraSpan, o)} alt={seg.extra} height={DISPLAY_HEIGHT} />))
    } else if (seg.extra) {
      children.push(fixed(`extra-${seg.kind}`, <Text color={THEME_KEYS.text}> {seg.extra}</Text>))
    }
    if (n === lastWin && row.stale) {
      children.push(
        fixed(
          `stale-${seg.kind}`,
          <Text color={THEME_KEYS.dim} italic>
            {'  ' + row.stale.text}
          </Text>,
        ),
      )
    }
  })
  return (
    <Box key="band" flexDirection="row" width="100%" alignItems="center">
      {children}
    </Box>
  )
}
