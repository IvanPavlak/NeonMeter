# Changelog

All notable changes to NeonMeter are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The desktop pulse costs less to draw and looks the same. Each drawing now brightens through one white copy of its live shapes whose opacity breathes, instead of one color animation per dot or slice; all of a dot bar's halos are blurred as one group instead of one blur per dot; and every glow filter covers only the drawing's own canvas instead of three times the element's width and five times its height. A rendered frame differs from 1.3.2 by at most a few shades, where neighbouring dot halos overlap. The option pictures in the README are redrawn to match.

## [1.3.2] - 2026-10-07

### Fixed

- The desktop band's drawings sit on the labels' centre line again. The app centres each drawing on the middle of its own text, so the lift NeonMeter 1.3.0 gave them put the dots about 0.75 px, and the percents and colored resets about 2 px, above the labels beside them. The option pictures in the README are redrawn to match.

## [1.3.1] - 2026-10-06

### Fixed

- The README shows again in the GitHub Android app, which left it blank from 1.3.0 on: the "Every option at a glance" pictures sit under plain headings instead of collapsible sections.
- The README's install steps work in the desktop app. Its Code tab has no `/plugin` command: a message starting with `/plugin` reaches Claude as plain text and installs nothing. The README now gives a message to paste into the Code tab, which runs `claude plugin marketplace add` and `claude plugin install` through the tab's own copy of Claude Code, so it works even when `claude` is not on your PATH.

### Added

- A contents list at the top of the README, under the hero image, linking to every section.

### Changed

- The README's sections are reordered: Install and Configuration come right after the introduction, then Using it, The color scheme and the option pictures.
- The marketplace install is the one way to use NeonMeter, in the terminal and the desktop app alike. A clone is for development only, loaded for one session with `claude --plugin-dir`. The README no longer shows listing a clone in `CLAUDE_CODE_PLUGIN_DIRS` of `~/.claude/settings.json`: every session then loaded a second copy next to the installed one, and that copy ignored your options, because they are saved under `neonmeter@neonmeter` and a folder-loaded copy reads `neonmeter`. If you added such an entry, remove it and start a new session.

## [1.3.0] - 2026-10-06

### Added

- The `weeklyReset` option. `countdown`, the default, shows the time left until a weekly limit resets, as the 5-hour window does (`in 2d15h`, then `in 8h50m`); `clock` shows the day and time it resets (`Thu 14:05`), as before 1.3.0. It applies to the all-models week and to every per-model limit such as `Fable`, so the Weekly rotation keeps its bars still.
- The `fiveHourReset` option. `countdown`, the default, is the time left as before (`in 3h13m`); `clock` shows the time the window resets (`14:05`), without the day, since it falls within five hours.
- The `resetColor` option. `plain`, the default, keeps the reset in the text color; `time` colors it by how much of its window is still to run, measured against the window's length (5 hours, 7 days) and drawn on the same six colors as the percents. A reset that is close is blue and one far off red, whatever the percent used, so the all-models week and a per-model limit that reset together share a color. It pulses with the percents, glows in the desktop app and fades when the reading is stale; under the responsive pulse a reset moving into the next range is a change, the minutes in between are not.
- The `timeRanges` option: where each of the six time colors starts, as the share of the window still to run, written like `ranges`. The default, `"17,33,50,67,83"`, splits every window into six even steps, about 50 minutes of a 5-hour window and 1.2 days of a week per color; the percents keep `ranges`.
- Both reset options change the widest layout only; narrower layouts keep counting down for every window, as they did, because a clock time does not fit their field.
- An "Every option at a glance" section in the README: one small picture per option, its values as the desktop and the terminal band draw them, on your GitHub theme, each in a collapsible section. `node design/readme/options.mjs` draws them from the plugin's code; CI checks they are current. Every band in the README's pictures now sits in its box, the terminal's with its rule and prompt and the desktop app's rounded, and the graphics' background and captions follow your system's light or dark theme, black on white or white on black; only the boxes keep the theme they show.

### Changed

- The weekly limits show the time until they reset, `in 3d4h`, the way the 5-hour window does, instead of the day and time, `Thu 14:05`. Set `weeklyReset` to `clock` for the day and time.

### Fixed

- In the desktop app the bars, dots and percents sat about 2 px below the labels beside them: each drawing was centered on its own canvas, while the app's text sits above the middle of the row. They are now drawn on the labels' centre line, so the whole row reads as one straight line.

## [1.2.1] - 2026-10-05

### Fixed

- A per-model weekly limit (`Fable`) went stale during a conversation and only caught up once the session fell idle. Claude Code hands the band the 5-hour and all-models windows after every reply, and each of those readings counted as fresh enough to skip the usage fetch, which is the only source of the per-model windows; with a reply every few seconds the fetch never ran. The fetch now runs once per `pollSeconds` whatever the engine reports, and the per-model window shows the endpoint's newest figure within a period of the reply that moved it.
- A per-model window the fetch has not refreshed in twice `pollSeconds` now fades and freezes on its own (and is marked `~` on the narrow tiers) while the rest of the band stays live, instead of looking as fresh as the windows Claude Code just reported. The stored reading records when its per-model windows were fetched.
- The weekly reset time rounds to the minute. The endpoint stamps a per-model reset a few milliseconds before the hour, such as 23:59:59.975, which the band truncated to `Wed 23:59` while `/usage` showed Thursday midnight; it now reads `Thu 00:00`.

## [1.2.0] - 2026-10-05

### Added

- The `pulseMode` option. `responsive`, the new default, pulses the band each time a value changes (a percent, the context, the reading going stale or coming back, the first reading arriving) and holds the glow still otherwise; the first drawing of a session and a turn of the Weekly rotation are no change. `always` is the pulse of 1.1.1, which never stops.
- The `pulseCount` option, 1 to 20 and 3 by default: how many cycles the responsive pulse runs after each change. The whole band pulses together, in phase, on both surfaces.
- A Resource use section at the bottom of the README with the measured cost of each mode and how it was measured.

### Changed

- The pulse no longer runs all the time by default. The desktop app draws each bar and percent as an image, and an animated image is drawn again on every display frame, so the never-ending pulse kept about a third of a CPU core and 7% of the GPU busy for as long as the band was on screen. Under `responsive` the band costs what a still band costs between changes. The breath itself, its glow and its 800 ms cycle are unchanged; set `"pulseMode":"always"` to keep it going.

## [1.1.1] - 2026-10-05

### Changed

- The README's Configuration section shows how to set every option: `claude plugin configure neonmeter@neonmeter --values-stdin` from any shell (how to write numbers, true/false and lists, how to check and reset, the Windows PowerShell 5.1 encoding step), `/plugin` in a terminal session, `--config` at install time, a table of common setups, every option at its default, and where the options are stored.

### Fixed

- The Weekly segment could stop taking turns with the per-model limits (Fable) for a minute or more, in every look and on both surfaces. When a session started, or the plugin reloaded, as it does whenever an option changes, the windows Claude Code reports, which carry only the all-models week, replaced the stored reading for every open session, and the fetch that brings the per-model limits back was skipped because that reading looked fresh. A session start now keeps the per-model limits and a spend limit from the stored reading, as the reading after each response already did.
- `segments`, `colorsDark` and `colorsLight` set through `claude plugin configure` or `/plugin` took no effect. Claude Code stores a list option as comma-separated text, which NeonMeter did not read, so the band kept the default segments and colors (the colors with a "not valid" line in the debug log). Both comma-separated text and a list now work.

## [1.1.0] - 2026-10-05

### Added

- The `layout` option. `single` draws one segment across the whole row and takes turns, `rotateSeconds` each: 5-hour, Weekly, each per-model weekly limit, the spend limit when the account has one, and Context, in the order of `segments`. It works with every bar style: ramp and level coloring, the terminal's cells, the desktop's smooth bars and dots. `all`, the default, is the row as before.
- `uninstall.sh` and `uninstall.ps1`: remove the plugin, its marketplace, the folders Claude Code can leave behind and NeonMeter's settings, and nothing else. A marketplace named `neonmeter` from another source stays, and so does `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` while another plugin may use hooks modules.
- `install.sh` and `install.ps1`: one command adds the marketplace, installs or updates the plugin and sets `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` in the `env` block of `~/.claude/settings.json` when it is not set. They stop with the right update command when `claude` is older than 2.1.286, reinstall an install whose recorded files are missing, check the install afterwards, keep the previous settings as `settings.json.neonmeter.bak` (never over a backup of yours), write `settings.json` back in the same two-space format Claude Code uses (Windows PowerShell 5.1 would otherwise re-indent the whole file), and under `irm | iex` never close the calling shell.
- `design/readme/rows.mjs` writes the README's terminal rows from the plugin's own builder; `--check` verifies them.
- The `release` workflow publishes the GitHub release of every `v*` tag with that version's `CHANGELOG.md` section as its notes, after checking the tag against both manifests. `master` is protected by a ruleset kept in `.github/rulesets/` (pull request, code owner review, a green `plugin` check, linear history); the repository admin bypasses it.

### Changed

- `barColoring` defaults to `level`: every filled cell takes the color of its segment's percent. `ramp`, the previous default, stays one setting away. The README's graphics show level bars first, then ramp bars, then dots in level and in ramp coloring.
- The README leads with the official install: `/plugin install neonmeter --marketplace IvanPavlak/NeonMeter` in a session, or `claude plugin marketplace add` and `claude plugin install` from a shell, and the desktop app's **+** › **Plugins**. The scripts are optional. It names every requirement (Claude Code 2.1.286 or newer; on 2.1.286 the hooks-modules variable, which 2.1.287 and later ignore), how to uninstall, and what to check when the band does not appear.
- The README explains what the context number is: the last request's input, measured by Claude Code after each turn, which is why it can trail Claude Code's own indicator.
- The README's graphics show the single layout on the desktop and in the terminal, taking turns through every segment, and the terminal graphic shows every look the desktop one does: level coloring, ramp coloring and dotted cells in either coloring. Both group their examples by layout under each theme.

### Fixed

- The README's terminal illustration no longer runs out of its panels on phones: each monospace line is pinned to its cell width, so a fallback font wider than Cascadia Mono (Android's) is fitted instead of overflowing.
- The README's illustrations no longer keep the browser's CPU busy. They carried the band's 800 ms pulse as SVG animations, and a browser rasterizes a whole SVG image again in software whenever any value in it changes, so an open README cost Firefox four to seven CPU cores. The drawings now hold still, with the glow and the 5-second Weekly rotation kept; they cost nothing between turns.

## [1.0.0] - 2026-10-04

The first release.

### Added

- The NeonMeter band above the prompt, on the terminal and in the desktop app's Code tab: 5-hour and weekly rate-limit windows with reset times, a spend limit when the account reports one, and the session's context fill, drawn edge to edge in six neon ranges with an 8-frame pulse that blends every live cell and percent toward white.
- In the terminal, four layouts chosen by fit (full, compact, narrow, micro) so the row always fits the prompt area, under a rule in the input box's border color, clear of Claude Code's own collapse button.
- In the desktop app, full labels with bars and percents drawn as vectors that glow: every filled dot, bar and percent sits on a blurred halo of its own color, the design's `text-shadow`, which widens with the pulse. Bars are smooth with rounded ends (the default) or a row of dots. The pulse is an animation inside each drawing, so the band redraws only when its data changes.
- The Weekly segment takes turns between every weekly limit the account reports: the all-models week, then one per model (today `Fable`), each with its own percent, range color and reset time, read from the usage endpoint's `limits` list so a per-model limit added later joins by itself.
- Usage fetched through the engine's own HTTP call with the account credential attached by Claude Code, plus the windows the engine reports after each response. Every open session shares one fetch schedule and the latest reading through the plugin store, so the account's endpoint rate limit is not exhausted; a 429 doubles the shared wait, up to 30 minutes. A failed fetch or a reading older than twice the poll interval is marked stale with its age; the last reading is cached so a new session shows it at once.
- The desktop band follows the desktop app's light or dark appearance by itself: the app's own theme setting and, when the app follows the system, the operating system's appearance (the Windows apps theme, macOS's interface style, the GNOME color scheme), checked every minute. Labels, separators and empty cells on the desktop are Claude Code theme colors, painted for either appearance.
- The terminal band's Client is keyed by the session, so sessions drawn by one renderer never share an instance. (The desktop app itself shows one band per window; see the README's known limitations.)
- Ramp coloring runs the filled part of a bar through every range from the first up to the percent's, in equal stretches, so a bar always ends in its percent's color and shows every range below it; a 69% bar is blue, lime and darker green. (The design canvas colored cells by their position along the whole bar, which left the upper ranges a sliver wide.)
- Options: `barColoring`, `desktopBars`, `glow`, `pulse`, `pulseMs`, `segments`, `pollSeconds`, `theme`, `desktopTheme`, `ranges`, `colorsDark`, `colorsLight`, `glyph` and `rotateSeconds`. Every default is the approved design; an invalid value keeps its default and is logged once.
- The repository is its own plugin marketplace (`.claude-plugin/marketplace.json`): `claude plugin marketplace add IvanPavlak/NeonMeter` and `claude plugin install neonmeter@neonmeter` install it, `claude plugin update` updates it, and the options are configured through `/plugin`.
- The approved design canvas under `design/`, matching the shipped defaults, with a playground, the palette and every state on both themes.
- Tests against the engine's own test kit, including all fifty golden rows of the design specification, and a CI workflow that validates and tests on every push against a pinned Claude Code release.

[Unreleased]: https://github.com/IvanPavlak/NeonMeter/compare/v1.3.2...HEAD
[1.3.2]: https://github.com/IvanPavlak/NeonMeter/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/IvanPavlak/NeonMeter/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/IvanPavlak/NeonMeter/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/IvanPavlak/NeonMeter/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/IvanPavlak/NeonMeter/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/IvanPavlak/NeonMeter/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/IvanPavlak/NeonMeter/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/IvanPavlak/NeonMeter/releases/tag/v1.0.0
