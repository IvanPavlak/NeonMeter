# NeonMeter design canvas

The complete approved design canvas for NeonMeter, the Claude Code band that shows the 5-hour and weekly rate-limit windows and context fill above the prompt. Exported 2026-10-03 from the Design artifact, version "NeonMeter", and brought up to the shipped 1.0.0 look on 2026-10-04: `━` cells in the terminal, ramp coloring across the fill as the default, and smooth bars under a glowing halo on the desktop.

## Contents

- `index.html` - the whole canvas laid out as in the editor; open it in a browser.
- `artboards/` - the five boards as standalone pages, each opening on its own:
  - `Main.dc.html` - interactive playground (sliders for width, both windows and context; toggles for light theme, ramp coloring (on by default), cell-exact pulse, subscription, showContext, first load and stale).
  - `Palette.dc.html` - the six neon ranges in both themes, pulsing.
  - `StatesDark.dc.html` and `StatesLight.dc.html` - all 10 states for terminal and desktop at 120 columns, then the terminal at 96, 72, 56 and 40.
  - `Spec.dc.html` - the design decisions.
  - `canvas.json` - the canvas layout (board positions and sizes).
  - `support.js` - a small standalone runtime that renders the boards outside the editor.
- `screenshots/` - PNG captures of every board, ready for a README: `hero.png`, `playground.png`, `palette.png`, `palette-cell-exact.png`, `states-dark.png`, `states-light.png` (ramp coloring, the default), `states-dark-level.png`, `states-light-level.png` (level coloring), `decisions.png`.

## Variants

The state boards take `?bars=level` for level coloring (ramp is the default), and the state boards and the palette take `?render=cells` for the cell-exact pulse a terminal draws, for example `artboards/StatesDark.dc.html?bars=level&render=cells`.

The pulse is a CSS animation, so it only moves in a browser; screenshots catch one frame of it. Fonts load from Google Fonts, so open the pages online for the intended typefaces.

## Relation to the shipped plugin

The boards match the plugin's defaults. The canvas runs its own copy of the builder in the browser, so it previews the look rather than running the plugin; the plugin's tests, including the fifty golden rows, are what pin the terminal output. The graphics in the repository README are generated separately by `readme/make.py`, from rows the plugin's builder produced.
