---
title: Known limitations
nav_order: 7
---

# Known limitations

- **No glow in the terminal.** A terminal paints each cell with one foreground and one background color, so the halo is the desktop's alone. The terminal keeps the pulse.
- **The hover cards are the desktop's.** The terminal splits the context bar the same way but has no card on hover; the same goes for a window's pace card (`windowPopup`) and the reset chip's list of resets.
- **The reset chip counts a list you keep.** The usage endpoint does not report the limit resets an account holds, so the chip counts what `resetChips` says: a reset you used stays until you take it out of the list, and one you were given is missing until you add it. The chip takes no click; a reset is used in Settings, under Usage.
- **The rainbow runs in the desktop app alone.** In the terminal `rainbow: circle` breathes as `breathe` does, and so does the chip under `resetChipMotion: circle`: cells hold their colors and pulse, they cannot turn. The terminal's rainbow takes the bar cells and the percents; its resets, its button and the rule keep their colors. In the desktop app the rainbow outline is drawn at the band's width as its columns give it, and the app stretches it the last few percent, so its corners can be a hair off round.
- **The pace is a straight line.** The projection and the run-out time carry the use so far to the reset at the same rate. They cannot know you are about to stop, and a weekly limit used in working hours projects higher than it lands. In the first tenth of a window there is no projection and no warning.
- **The terminal's button needs clicks.** Its `◉` cell submits the prompt on a click where the terminal reports them to Claude Code; where it does not, typing the prompt does the same, and the terminal has no card naming it.
- **The button stays in the band's card.** The desktop app draws the band in a card of its own and clips whatever a plugin draws past its edges, so the button sits inside the row, never beside the card. The breakdown card is the exception: the app floats it above the band.
