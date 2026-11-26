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

**The pace, the reset chip and the rainbow.** The pace's marks (the tick, the stripes, the projection) are drawn into the bar and hold still: they add no animation, and a bar with them animates exactly what it did without them. The reset chip and the rainbow theme follow the pulse like the rest of the band. Under the default `pulseMode: responsive` they lie still between changes, a still drawing that is never drawn again, and move only for the `pulseCount` cycles after a change; under `always` they move without a stop, as everything live does, and the cost of `always` above applies to them too. Under `always` each of their drawings carries the clock's phase, so every redraw of the band (a new reading, a turn of the Weekly rotation) makes those drawings anew; redraws are a few a minute. `scripts/benchmarking/headless.ps1 -Chips` measures the working tree's band with the chip against the same band without it, in headless Microsoft Edge: one run of three rounds of 10 seconds showed no difference with the band at rest, and under `always` differences smaller than the spread between its own rounds, so it does not tell the chip's looks apart. `rainbow: breathe` animates the seven stops of each rainbow gradient where a range color animated one fill, and `circle` one transform per gradient (a bar or a percent has one, a border's edges two, the outline four). For the lightest band the advice above holds: `pulseMode: responsive`, or the pulse off.

**The rainbow preset, and one layer a halo.** `preset: rainbow` is the heaviest band there is: 24 drawings that never stop (the chip, the button, the outline, and for each of three segments its label, bar, percent, field and the three drawings of its frame), 27 halos between them. A trace of headless Edge showed what a halo costs: the app's renderer draws each into a layer of its own, and every layer is render passes on the GPU on every frame, five a halo, 130 a frame for the whole band; the time goes with the number of passes far more than with the pixels blurred. Two of a halo's layers were one too many: the halo's `opacity` sat on the blurred element, so the app drew the halo into a layer for the opacity and that layer into the blur's. Now the opacity is the last step of the blur's own filter (an alpha scale after the blur, pulsing as the opacity did), which is the same halo in one layer: four passes a halo, 103 a frame. It holds for every halo the band draws, the range colors' too. No pixel of any drawing differs from 1.10.0's by more than 2 of 255, in the rainbow (running, breathing, still, faded) or out of it, at rest or anywhere in the pulse. `scripts/benchmarking/headless.ps1 -Rainbow` measures the preset's band, five rounds of 10 seconds, the versions taking turns:

| `preset: rainbow` | Bars: CPU | Bars: GPU | Dots: CPU | Dots: GPU |
| ----------------- | --------- | --------- | --------- | --------- |
| 1.10.0, before    | 39.0%     | 8.9%      | 42.2%     | 8.8%      |
| After             | 36.0%     | 6.9%      | 38.3%     | 6.9%      |
| The pulse off     | 7.3%      | 0%        |           |           |

About a twelfth less CPU and a fifth less GPU in headless Edge, in the same look. In the desktop app itself (`inapp.ps1 -Sides <1.10.0>,work -Repeat 3 -Set @{ preset = 'rainbow' }`, twice, the session idle) the GPU fell from about 3.3% to 2.8% in every round, and the CPU did not measurably fall: 47 to 56% of a core for either version, the rounds further apart than the versions. Split by process, about three quarters of that is the app's own renderer (35 to 46% of a core), which draws its whole page again for every frame an image in it moves and which no drawing of the band's makes cheaper; the GPU process, where the render passes are, is 13 to 18%. So in the app this change is a saving on the GPU alone, and the cost of a band that never stops is the app's to lower. Of what is left, about a third is what any one drawing that never stops costs (a frame drawn sixty times a second), and most of the rest is the 27 blurs, one a drawing, which are the look. What was tried and left out: one blur over both edges of a frame (up to 15 of 255 off at the peak); a halo's opacity on its paint (`fill-opacity`), as few layers but up to 8 of 255 off and more work for the renderer than it saved the GPU; a frame's straight halo drawn as stacked strokes with no blur at all, which tripled the renderer's work (every animated attribute costs it); a blur's region cut to the filled part of a bar or to a cap's own width, which measured nothing. Blurring in sRGB (`color-interpolation-filters`) takes one more pass off every halo, 77 a frame, and measured 23.0% of a core against 24.3% and 4.7% GPU against 5.8% in one comparison; it is the same halo only where a halo is one color, and in the rainbow it moves pixels by up to 9 of 255, so it is not done.

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
