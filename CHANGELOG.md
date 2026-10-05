# Changelog

All notable changes to NeonMeter are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/IvanPavlak/NeonMeter/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/IvanPavlak/NeonMeter/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/IvanPavlak/NeonMeter/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/IvanPavlak/NeonMeter/releases/tag/v1.0.0
