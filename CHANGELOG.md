# Changelog

All notable changes to NeonMeter are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/IvanPavlak/NeonMeter/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/IvanPavlak/NeonMeter/releases/tag/v1.0.0
