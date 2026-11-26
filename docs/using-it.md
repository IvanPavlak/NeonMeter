---
title: Using it
nav_order: 5
---

# Using it

Left to right the row shows:

- **5-hour**
- **Weekly**
- **Spend**
    - only when your account reports a spend limit
- **Context**

Before the first of them stands the reset chip, when `resetChips` lists a limit reset you hold (off by default, see below).

Each window segment is its label, a bar, the percent used and its reset: every window counts down to it, `in 3h13m` for the 5-hour window and `in 3d4h` for a weekly limit on the widest layout, `3h13m` and `3d4h` on narrower ones. `fiveHourReset` and `weeklyReset` switch either one to the other form, and `resetColor` set to `time` colors the reset by how much of its window is still to run. The context segment shows the percent and the tokens used against the model's window. The band is the strip Claude Code gives the plugin above the prompt; the row is the single line of cells or drawings it holds.

**In the desktop app** the band shows the full labels and the bars stretch to fill whatever room the text leaves. Bars are smooth with rounded ends by default, or a row of dots with `desktopBars` set to `dots`. Everything filled glows. In a narrow chat, a split view's pane say, the row steps down until it fits, as the terminal's layouts do: the segment borders give way first (the outline stays), then the labels shorten (`5h`, `7d`, `Ctx`), then the resets lose their `in ` and the context its token count, then the fields go, and last the bars (sketched here in text):

```text
5-hour ━━━━━━  22% in 2h57m │ Weekly ━━━━━━  3% in 2d9h │ Context ━━━━━━  57% 566k/1M ◉
5h ━━━━  22% in 2h57m │ 7d ━━━━  3% in 2d9h │ Ctx ━━━━  57% 566k/1M ◉
5h ━━━  22% 2h57m │ 7d ━━━  3% 2d9h │ Ctx ━━━  57% ◉
5h ━━  22% │ 7d ━━  3% │ Ctx ━━  57% ◉
5h 22% │ 7d 3% │ Ctx 57% ◉
```

**The border** marks what runs high. With the defaults, a segment that reaches 90% sits in a rounded neon frame in its own range color, red from 90 up, and the separator beside it gives way to a space; at 92% on the 5-hour window and 40% elsewhere, only the 5-hour segment is framed. It glows and breathes with the band: three breaths after a change under the default `pulseMode`, or all the time under `always`. Some ways to set it:

- `{"border":"always"}` frames every segment, each in its own color: a calm blue frame at 30%, a red one at 95%.
- `{"borderAt":"75"}` frames a segment from 75% on, in its range color: yellow at 75, orangered at 85, red from 90.
- `{"borderScope":"band"}` draws one frame around the whole row instead, in the color of its fullest segment.
- `{"outline":"sections"}` draws one border along the edges of the whole card instead of the segment borders, each section's stretch in its own color: orangered over the 5-hour window at 82%, dodgerblue over the weekly limit at 18%, red over the context at 93%. `{"outline":"single"}` draws it in one color, the fullest segment's.
- `{"outline":"single","border":"always","borderColor":"#FF073A"}` keeps the card's border always on, in red.

In the terminal the band is one row of cells, so a border lights the rule above the row instead: a `━` stretch in the border's color over each framed segment, or across the whole rule for `borderScope: band` and the outline.

**The pace** is off by default; three options turn it on, each on its own. A window's pace is the share of it already gone: 2h15m into a 5-hour window, 45%, and that is where an even use of the limit would stand. Used 62% by then, you are ahead of it, and at this rate the limit is gone in 1h23m, before the reset; used 30%, you have room to spare. `pace` draws that on the 5-hour bar and every weekly bar: `tick` a notch at the pace, `stripes` the stretch between the pace and the fill (bright on the fill where you are ahead, dim past it where you are behind), `both` the two, `projection` stripes from the fill to where the use lands at the reset. `paceWarn` trades the reset for the time the window runs out (`out in 1h23m`, in red) while it would, and only then. `windowPopup` opens a card over a window's bar in the desktop app with all of it in words. It is all worked out from the percent and the reset the band already has: no history is kept and nothing more is fetched. The projection is a straight line through the use so far, so it says nothing in the first tenth of a window, and it runs high for a weekly limit during working hours. Some ways to set it:

- `{"pace":"tick"}` marks each window bar where an even pace would be, and changes nothing else.
- `{"pace":"both"}` adds the stripes: 62% used with 45% of the window gone stripes the fill from 45 to 62, 30% used with 55% gone stripes the track from 30 to 55, dim.
- `{"pace":"projection"}` stripes from the fill to where the use lands: 62% at 45% of the window lands at 138%, so to the bar's end, in red.
- `{"paceWarn":"five_hour"}` leaves the bars alone and shows `out in 1h23m` in place of the 5-hour reset while that window would run out; `"all"` does it for the weekly limits too.
- `{"pace":"both","paceWarn":"five_hour","windowPopup":"true"}` turns all of it on. The card then reads, for that 5-hour window: `5-hour limit: 62% used`, `Even pace now: 45%`, `Ahead of pace: +17%`, `Projected at reset: 138%`, `Runs out: in 1h23m`, `Resets: 14:45, in 2h45m`.

**The reset chip** counts the limit resets you hold, the ones the app lists in Settings under Usage. It is off by default; `resetChips` turns it on:

```bash
echo '{"resetChips":"fable:2027-03-09,weekly:2026-12-10"}' | claude plugin configure neonmeter@neonmeter --values-stdin
```

One chip reading `+2` then stands before everything else in the row, in the rainbow by default (`resetChipColor` takes one color instead), glowing (`resetChipGlow`). It moves with the band's pulse, the way `resetChipMotion` says: `circle`, the default, turns its rainbow once per cycle, `breathe` holds the rainbow in place and brightens it, `still` holds it. Under the default `pulseMode` that is three cycles after a change; under `always` it never stops, in phase with the clock, so a redraw of the band never sets it back. The plugin cannot read your resets, so the list is yours: take an entry out when you use its reset; one past its day drops out by itself, and the count falls with it. **In the desktop app, point at the chip** and a card lists every reset, centered, the one that expires first on top:

```text
      2 limit resets available

            Weekly reset

     Refills your weekly limit.

 ● Expires Dec 10, 2026, in 14 days

            Fable reset

Refills your Fable allowance and gives back
   what Fable used on your weekly limit.

 ● Expires Mar 9, 2027, in 103 days

    Use them in Settings > Usage.
```

The title and each reset's name are in the chip's rainbow, what a reset refills in the text color, and the last line in grey. Each expiry is colored by how close it is, the other way round from a window's reset under `resetColor: time`: red when the reset is about to be lost, blue with a month or more to go (the six range colors over 30 days, where `timeRanges` says). A reset listed without a day has no expiry line and comes last. `dateFormat` sets how the day is written: `{"dateFormat":"DD.MM.YYYY"}` reads `Expires 10.12.2026, in 14 days`. The chip only tells; a click on it does nothing, and a reset is used in Settings. In the terminal the chip is its characters in the rainbow's colors, without a card.

**The rainbow** is a theme for the whole band, off by default. With `rainbow` set, everything the percents color takes the rainbow instead of the range colors: the window bars and dots, the context bar when it is colored by its percent, the percents, the resets colored by the time left, the button's ring, the borders and the outline, in red, orangered, yellow, lime, blue and violet. `still` holds it; `breathe` brightens it and widens the halo with the pulse, as the range colors do; `circle` runs it along the bars and the text and around the ring, once per pulse cycle: three cycles after a change under the default `pulseMode`, or without a stop under `always`, in phase with the clock, so a redraw of the band never sets it back. Under `circle` the borders go round too: a segment's border and the band's run their top edge to the right and their bottom edge to the left, and the outline is one line round the whole card, the rainbow following it along the top, down the right end, back along the bottom and up the left end, a whole number of rainbows to the lap, so it has no joint. What names something keeps its own color: a context bar split by category, a run-out warning in red, a border in the `borderColor` you set, the pace tick. A percent's level is then read from its bar's length and its number, not from its color. A stale segment takes the rainbow too, faded, and moves with the rest: a per-model window such as Fable, which only the usage fetch refreshes, dims between fetches and stays in the rainbow. In the terminal the bar cells and the percents' characters take the colors in turn and pulse; nothing runs there. Some ways to set it:

- `{"rainbow":"still"}` paints the band in the rainbow and moves nothing.
- `{"rainbow":"breathe"}` breathes three times after each change.
- `{"rainbow":"circle","pulseMode":"always"}` keeps everything running, the chip included; set `pulseMs` higher (`"2000"`) for a slower run.
- `{"rainbow":"circle","outline":"single","border":"always"}` runs the rainbow round the whole card at any percent.
- `{"preset":"rainbow"}` is all of it in one option: everything in the rainbow, running without a stop, the resets and the outline included.

**A preset** is a look by name. `preset` sets a group of options at once, over whatever they are set to, so switching looks is one option and not a dozen: `rainbow` is the only one so far. The options it replaces stay saved, and `{"preset":"off"}` brings them back; an option the preset does not name (the bar coloring, dots or bars, the context bar, the button) stays as you set it. [Configuration](configuration.md) lists what the preset sets.

**In every chat** the band shows by default, each chat its own, side by side in the desktop app's split view too. With `{"everyChat":"false"}` one chat shows it: the one you last sent a prompt in.

**The context bar** is split by what fills the context, as the desktop app's own context indicator splits it: Messages in dodgerblue, System tools in orangered, MCP tools in darker green, Skills in yellow and everything else (the system prompt, memory files, MCP server instructions, agents) as Other in lime, together as long as the percent says, then the autocompact buffer in grey, the room the engine keeps free for compacting, which neither glows nor pulses. The percent keeps its range color, so 93% still reads red. The breakdown is the engine's own estimate, the one `/context` lists, counted locally after each response; `contextBar` set to `percent` colors the bar by its percent instead, like the others. **In the desktop app, point at the Context segment** and a card opens above it with everything the app's own context panel lists: the window's fill (`Context window: 61.8k / 1M (6%)`), then Messages, System tools, MCP tools and Skills in their colors and the system prompt, memory files, MCP server instructions and agents each on its own row in Other's color, largest first, with their tokens and share of the window (`Messages: 25.5k, 2.6%`), glowing and pulsing with the band, then the autocompact buffer, the free space and the tools loaded on demand, which sit outside the window; `contextPopup` turns the card off.

**The button** is a ring the size of the app's own context ring beside the model picker: the track, and the context percent drawn over it in its range color (every range up to it under ramp coloring), glowing and pulsing with the band. It appears from 75% of the context on (`button`, `buttonAt`), at the end of the row (`buttonPosition`), and a click submits a prompt as if you had typed it. The engine runs a plugin's prompt once the session is idle, so a click while Claude works waits for the turn to end. In the desktop app the pointer on it shows the app's own button highlight and a card naming what it does; in the terminal it is a `◉` cell in the same color, at the same place, and a click on it does the same where the terminal reports clicks.

**The handoff** is what the button asks for by default: a `HANDOFF.md` in the project root, written for a reader who has the repository but not the conversation, so the next session can carry on where this one stops, before the context runs out or when you want to start fresh. The prompt asks for facts, not the story of how they were found, specific down to paths, commands and exact error text, honest about what is not done, not verified or uncertain, free of secrets, and as short as it can be while complete. It asks for these sections, each left out when empty: the task, in your own words where they matter, and what finished looks like; the state of the work, what is done and verified, done but not verified, in progress and not started, with the branch and what the working tree holds uncommitted; the decisions and why, what was rejected, and every instruction or correction you gave; a map of the files that matter, the entry points and the commands that were seen to work; the open problems, with exact output; the next steps in order, the first concrete enough to start at once; and the dead ends, so they are not tried again. It also tells Claude to read an existing `HANDOFF.md` first and keep only what is still true, to commit nothing and change no other file, and to end with the line to paste into the next session: `Read HANDOFF.md and continue from its next steps.` The exact text is in `hooks/handoff.ts`. `buttonPrompt` replaces it with any prompt of yours, sent exactly as typed, a slash command included: `/compact` asks for the compaction the button ran before 1.5.0, and a command of your own (a skill with a `/wrap-up` command, say) for whatever that command does. Whether the engine runs a slash command a plugin sends as a command, rather than reading it as text, is not confirmed in 1.5.0; a prompt in words always reaches Claude. `buttonLabel` names the action on the desktop's card; empty, the card names the built-in prompt, or a custom prompt by its first line.

**In the terminal** the row is built from character cells and picks the most detailed layout that fits the width, from full labels and wide bars down to a text-only line:

<p align="center">
  <img src="../design/readme/terminal.svg" alt="The terminal band on the dark and the light theme, grouped by layout: the default layout at 120 columns with level coloring, ramp coloring and dotted cells in either coloring, then at 72 and 40 columns, and the single layout at 120 columns in the same four looks, taking turns through every segment; the context cells are split by category and the button sits at the right end of every row" width="100%">
</p>

The terminal band opens with a rule in the input box's border color, the same line the input box has at its top. The `[-]` at its right end is Claude Code's own button for collapsing the band; `ctrl+x ctrl+a` does the same. While a border shows, the rule's stretch above the framed segment (all of it under `borderScope: band`) is drawn `━` in the border's color and pulses with the row.

**With `layout` set to `single`** the band shows one segment at a time across the whole row and takes turns, `rotateSeconds` each: 5-hour, Weekly, then each per-model weekly limit, the spend limit when your account has one, and Context, in the order of `segments`. Every bar style works the same way: ramp or level coloring, the terminal's cells, and the desktop's smooth bars or dots. Both graphics group their examples by layout: **Layout: All (Default)** first, then **Layout: Single (One Segment at a Time)**, each in four looks: level bars (the default), ramp bars, and dots in either coloring (on the desktop `desktopBars: dots`, in the terminal `glyph` set to `●`). Dots follow `barColoring` like bars do: under `level` every filled dot takes the percent's color, under `ramp` the filled dots run through the ranges. For one glowing dot bar at a time, colored by its percent (the default level coloring):

```json
{
	"pluginConfigs": {
		"neonmeter": {
			"options": {
				"layout": "single",
				"desktopBars": "dots"
			}
		}
	}
}
```

What the states mean:

- **Pulse**

Live cells and percents brighten toward white and back on an 800 ms cycle, all in phase; on the desktop the halo widens with them. Labels, separators and empty cells stay still. By default the pulse runs three cycles each time a value changes and the band holds still in between; a session start and a turn of the Weekly rotation are no change (`pulseMode` and `pulseCount` below).

- **Stale**

The usage fetch failed or the last reading is older than twice the poll interval: the window segments freeze and fade and the row shows the reading's age. Narrow terminal layouts put a `~` before each window percent instead.

- **First load**

Until the first reading lands, the window bars are grey loading cells and the percent is `…`, pulsing under `pulseMode: always`; the reading arriving is a change, so the band pulses then by default.

- **No subscription**

Signed in with an API key or without a first-party credential, the window segments are hidden and the context takes the whole row.

- **Before the first response**

The context bar is empty and shows `--` until the model has answered once, and the button waits too: there is no conversation to hand on yet.

## The color scheme

<p align="center">
  <img src="../design/readme/palette.svg" alt="The six ranges on the dark and the light theme" width="100%">
</p>

Filled cells and percents take the color of the range the percent falls in. A range includes its lower bound, so 50 is lime green and anything from 90 up is red. Under the default `level` coloring the whole bar takes the percent's color. With `barColoring` set to `ramp` the filled part runs through every range from the first up to the percent's, in equal stretches, so an 85% bar runs blue, lime, darker green, yellow, orangered and a 69% bar runs blue, lime, darker green. The light palette is the same six hues darkened for a white ground. The button's ring takes the context percent's colors the same way.

The context bar's categories have six colors of their own, the desktop app's hues in neon: Messages dodgerblue, System tools orangered, MCP tools darker green, Skills yellow, Other lime, and the autocompact buffer grey (`contextColorsDark` and `contextColorsLight` change them).
