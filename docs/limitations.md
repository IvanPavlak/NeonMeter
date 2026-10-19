---
title: Known limitations
nav_order: 7
---

# Known limitations

- **No glow in the terminal.** A terminal paints each cell with one foreground and one background color, so the halo is the desktop's alone. The terminal keeps the pulse.
- **The breakdown card is the desktop's.** The terminal splits the context bar the same way but has no card on hover.
- **The terminal's button needs clicks.** Its `◉` cell submits the prompt on a click where the terminal reports them to Claude Code; where it does not, typing the prompt does the same, and the terminal has no card naming it.
- **The button stays in the band's card.** The desktop app draws the band in a card of its own and clips whatever a plugin draws past its edges, so the button sits inside the row, never beside the card. The breakdown card is the exception: the app floats it above the band.
