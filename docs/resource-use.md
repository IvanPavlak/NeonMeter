---
title: Resource use
nav_order: 8
---

# Resource use

Measured on Windows 11, for future reference: the pulse's modes for NeonMeter 1.2.0 on 2026-10-05, and the pulse of 1.4.0 against 1.3.2 on 2026-10-07. The plugin's own code is light; nearly all of the cost of a moving band is the drawing Claude Code does for it.

**The pulse's modes (1.2.0).** The desktop app draws every bar and percent as an image, and an animated image is drawn again on every display frame, blur and all, for as long as it moves. Each mode below ran in headless Microsoft Edge (the same Chromium engine the app draws with) with GPU rasterization on, the band's own drawings shown as images the way the app shows them, at 1,460 by 140 pixels, for 20 seconds, three rounds. CPU is the median across all of Edge's processes as a percent of one core; GPU is the average utilization of its GPU engines.

| `pulseMode`                             | Bars: CPU | Bars: GPU | Dots: CPU | Dots: GPU |
| --------------------------------------- | --------- | --------- | --------- | --------- |
| `always`                                | 43%       | 7.2%      | 42%       | 17.5%     |
| `responsive` (default), between changes | 0.4%      | 0%        | 0.4%      | 0%        |
| `responsive`, a change every 10 seconds | 6.0%      | 1.7%      | 13.6%     | 3.4%      |
| `pulse: false`                          | 0.1%      | 0%        | 0.4%      | 0%        |

A change every 10 seconds is a stress case: the 5-hour and weekly percents move a few times an hour and the context once per response, so in use `responsive` sits at the still band's cost almost all of the time. `always` measured between 20% and 55% of a core across rounds and earlier runs, about a third of a core typically. Inside the app the numbers can differ somewhat; the ratios between the modes hold.

**In the desktop app itself**, with the dots layout and ramp coloring, every Claude process summed over 60 to 120 seconds with the band on screen and the session idle:

| `pulseMode`                                 | CPU       | GPU       |
| ------------------------------------------- | --------- | --------- |
| `always` (1.1.1, and 1.2.0 set to `always`) | 37 to 43% | 11 to 16% |
| `responsive`, between changes               | 4.4%      | 0.4%      |
| `pulse: false`                              | 2.2%      | 0.1%      |

The app does work of its own when idle, so `pulse: false` is the floor. One sample per mode, so the two points between `responsive` and the floor are within noise.

**The pulse in 1.4.0.** Until 1.3.2 every filled dot's halo was a blur of its own, an offscreen pass per dot on every frame of the pulse. 1.4.0 draws each halo as a radial gradient through the exact profile of that blurred disc, so a dot bar runs no blur at all; a drawing with nothing live is never animated, and the blurs that remain (one per bar, percent and reset) cover only their drawing. A frame looks as it did: none of its pixels differs from 1.3.2's by more than 8 of 255 in any channel, at rest, mid-pulse or at the peak, and the pulse keeps 1.3.2's timing. In the desktop app, with `scripts/benchmarking/inapp.ps1 -Repeat 3` (see [Development](development.md)), under `pulseMode: always` with ramp coloring and `resetColor: time`, taking turns between the versions three times, 20 seconds each, every Claude process summed; the median of the three, each round in brackets:

| `pulseMode: always`                         | Dots: CPU                | Dots: GPU | Bars: CPU                | Bars: GPU |
| ------------------------------------------- | ------------------------ | --------- | ------------------------ | --------- |
| 1.3.2                                       | 25.2% (29, 24.9, 25.2)   | 4.6%      | 21.3% (21.6, 18.7, 21.3) | 1.6%      |
| 1.4.0, the new parts off                    | 22.0% (20.2, 22, 24)     | 1.4%      | 20.6% (20.6, 20.7, 16.8) | 1.6%      |
| 1.4.0, the new parts on, the button showing | 25.1% (27.3, 25.1, 23.6) | 1.8%      | 22.8% (25.5, 22.8, 21.7) | 2.1%      |

With the pulse off the same session measured 3.5%, the app's own idle work. So in the same look the pulse itself costs about a sixth less CPU with dots and under a third of the GPU; with bars, whose halo was always one blur, about the same. The new parts (the context bar split by category, its breakdown card, which the app keeps undrawn until the pointer is over it, and the button, one more drawing that pulses) take back about what the dots saved: 1.4.0 at its defaults costs what 1.3.2 did. `contextBar: percent`, `contextPopup: false` and `button: off` turn them off. The app's own cost drifts by more than most changes save, so a comparison takes turns, as `-Repeat` does; one pass per version is not enough to tell.

In headless Microsoft Edge (`headless.ps1`'s method: the band as images at 1,460 pixels, five rounds of 10 seconds), where nothing else runs, the same drawings measured:

| `pulseMode: always` | Dots: CPU | Dots: GPU | Bars: CPU | Bars: GPU |
| ------------------- | --------- | --------- | --------- | --------- |
| 1.3.2               | 39.2%     | 6.5%      | 28.1%     | 1.4%      |
| 1.4.0               | 29.8%     | 1.1%      | 25.6%     | 1.4%      |
| The pulse off       | 14.1%     | 0%        |           |           |

There the pulse's own CPU falls by more than a third with dots and its GPU by five sixths. Splitting each bar into a still drawing and a pulsing one laid over it, and stepping the pulse at 30 frames a second instead of on every display frame, were measured too and saved nothing, so 1.4.0 does neither.

**The terminal band.** The terminal's band redraws its row once per pulse frame, ten times a second at the default 800 ms cycle. Over one hour with a response every two minutes, `always` redraws it 36,000 times and `responsive` 720 times (30 changes, three cycles of eight frames each), 98% fewer; a still row redraws only when a value changes.

**The plugin itself**, timed with Node on the same machine (1.4.0; the frame and memory rows are 1.2.0's, with Bun):

| What                                                         | Cost                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Building the terminal row, 120 / 240 columns                 | 3.2 / 4.1 µs                                                                         |
| Building the desktop row with its drawings, bars / dots (40) | 14 / 33 µs                                                                           |
| One terminal pulse frame                                     | 2.3 µs, 0.002% of a core at ten frames a second                                      |
| Memory over a million redraws                                | flat, about 850 KiB of heap                                                          |
| Usage fetches                                                | one per `pollSeconds` (a minute) for the whole account, shared by every open session |
| The context's breakdown                                      | about 20 ms of the engine's own estimate after each response, no request             |
| Appearance check, desktop only                               | one `reg query` (about 10 ms) and one config file read per minute per session        |

---
