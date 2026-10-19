---
title: Install
nav_order: 2
---

# Install

Requirements:

1. Claude Code 2.1.286 or newer, in the terminal and in the desktop app. From 2.1.287 on, plugin mods (the hooks modules NeonMeter is built on) are on by default; on 2.1.286 they need one setting, below. The desktop app keeps its own copy of Claude Code and updates it by itself when it starts.
2. A terminal with truecolor or the desktop app's Code tab
3. A Claude subscription for the rate-limit windows (with an API key the windows are hidden and the context takes the whole row)

In a **terminal session** of Claude Code, one command adds this repository as a plugin marketplace and installs NeonMeter. Claude Code shows the marketplace's source and asks before adding it, then opens the plugin so you can choose where to install it.

```text
/plugin install neonmeter --marketplace IvanPavlak/NeonMeter
```

From a shell, the same takes two commands:

```bash
claude plugin marketplace add IvanPavlak/NeonMeter
```

```bash
claude plugin install neonmeter@neonmeter
```

**In the desktop app**, the Code tab has no `/plugin` command. A message that starts with `/plugin` goes to Claude as ordinary text, so nothing gets installed. Ask Claude to run the two shell commands for you instead. Paste this into the Code tab; it uses the Code tab's own copy of Claude Code, so it works even when `claude` is not on your PATH:

```text
Install the NeonMeter plugin: run "$CLAUDE_CODE_EXECPATH" plugin marketplace add IvanPavlak/NeonMeter, then "$CLAUDE_CODE_EXECPATH" plugin install neonmeter@neonmeter, and show me the output of both.
```

You can also run the shell commands above in any terminal that has `claude`. The terminal and the desktop app read the same settings, so a plugin installed in one is installed in the other. Once the marketplace is added, NeonMeter is also listed under **+** › **Plugins** › **Add plugin**, and **Manage plugins** turns it on, off or uninstalls it.

Run `/reload-plugins` in an open session, or start a new one, and the band appears above the prompt, with the last reading at once and the first fetch a moment later. The module loads only in a folder you have trusted.

**On Claude Code 2.1.286**, the version the desktop app bundles at the time of writing (see its About window), mods stay off until one variable is set. A plugin cannot set it itself, because none of its code runs until the variable is on. Add it to `~/.claude/settings.json`; the `env` block reaches every session, the desktop app's included. Claude Code 2.1.287 and later ignore it, so it can go once your copies are that new:

```json
{
	"env": {
		"CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"
	}
}
```

Update later with `claude plugin update neonmeter@neonmeter`, or turn on auto-update for the marketplace in `/plugin`.

**To uninstall**, remove the marketplace. That uninstalls the plugin, deletes Claude Code's copy of the repository and drops both from your settings:

```bash
claude plugin marketplace remove neonmeter
```

`claude plugin uninstall neonmeter@neonmeter` removes only the plugin and keeps the marketplace. Either way Claude Code keeps the plugin's cached copy in `~/.claude/plugins/cache/neonmeter` and deletes it 14 days later; delete that folder to remove it now. If you added the variable above for NeonMeter alone, take it out of `settings.json` too.

**Optional scripts.** The repository also has an installer and an uninstaller for each shell, in `scripts/installation/`, for when you would rather run one command. Read them before you run them; they call the same `claude plugin` commands and touch nothing but NeonMeter. The installer stops with the update command when `claude` is older than 2.1.286, repairs an install whose files are missing (an older `claude` records an install it never copied), sets the variable above, keeping the previous `settings.json` as `settings.json.neonmeter.bak`, and checks the result. The uninstaller removes the plugin, its marketplace, the folders Claude Code can leave behind and NeonMeter's settings; it keeps a marketplace named `neonmeter` that comes from somewhere else, every other plugin and setting, and the variable when another plugin may use it.

```bash
curl -fsSL https://raw.githubusercontent.com/IvanPavlak/NeonMeter/master/scripts/installation/unix/install.sh | bash
```

```bash
curl -fsSL https://raw.githubusercontent.com/IvanPavlak/NeonMeter/master/scripts/installation/unix/uninstall.sh | bash
```

On Windows, in PowerShell:

```powershell
irm https://raw.githubusercontent.com/IvanPavlak/NeonMeter/master/scripts/installation/windows/install.ps1 | iex
```

```powershell
irm https://raw.githubusercontent.com/IvanPavlak/NeonMeter/master/scripts/installation/windows/uninstall.ps1 | iex
```

**If the band does not appear**, start a session with `claude --debug` and look for `hooks module neonmeter@neonmeter not loaded`: the line says why, the switch being off included. A debug log that says `Unrecognized key(s) in object: 'types', 'userConfig'` comes from a `claude` older than 2.1.286; update it (`npm install -g @anthropic-ai/claude-code@latest` for an npm install, `claude update` otherwise) and install again. A desktop app that shows nothing and logs nothing is on 2.1.286 without the variable, or has lost the plugin's cached copy, which `claude plugin uninstall neonmeter@neonmeter` and `claude plugin install neonmeter@neonmeter` restore.

The marketplace install is the one way to use NeonMeter: it works in the terminal and the desktop app alike, keeps the options you set, and updates with `claude plugin update`. A clone is for development only:

```bash
git clone https://github.com/IvanPavlak/NeonMeter.git
```

Load it for one session with `claude --plugin-dir /path/to/NeonMeter` (see [Development](development.md)). Do not list the clone in `CLAUDE_CODE_PLUGIN_DIRS` of `~/.claude/settings.json`: every session would then load a second copy next to the installed one, and that copy ignores your options, because they are saved under `neonmeter@neonmeter` and a folder-loaded copy reads `neonmeter`.

The repository root is the plugin folder: the manifests are in `.claude-plugin/` and the hooks module in `hooks/`.
