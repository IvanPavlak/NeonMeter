---
title: Known limitations
nav_order: 7
---

# Known limitations

- **No glow in the terminal.** A terminal paints each cell with one foreground and one background color, so the halo is the desktop's alone. The terminal keeps the pulse.
- **The breakdown card is the desktop's.** The terminal splits the context bar the same way but has no card on hover; the same goes for a window's pace card (`windowPopup`).
- **The reset chips are a list you keep.** The usage endpoint does not report the limit resets an account holds, so the chips show what `resetChips` says, and a reset you used stays until you take it out of the list. A chip takes no click.
- **The pace is a straight line.** The projection and the run-out time carry the use so far to the reset at the same rate. They cannot know you are about to stop, and a weekly limit used in working hours projects higher than it lands.
- **The terminal's button needs clicks.** Its `◉` cell submits the prompt on a click where the terminal reports them to Claude Code; where it does not, typing the prompt does the same, and the terminal has no card naming it.
- **The button stays in the band's card.** The desktop app draws the band in a card of its own and clips whatever a plugin draws past its edges, so the button sits inside the row, never beside the card. The breakdown card is the exception: the app floats it above the band.
