#!/usr/bin/env bash
# Installs NeonMeter from its marketplace and turns on the hooks modules it needs.
# Safe to run again: it updates the plugin and leaves settings that are already right alone.
set -euo pipefail

MIN_VERSION="2.1.286"
SETTINGS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"

say() { printf '%s\n' "$*"; }

command -v claude >/dev/null 2>&1 || { say "NeonMeter: the claude command is not on PATH; install Claude Code first."; exit 1; }

version="$(claude --version 2>/dev/null | awk '{print $1}')"
if [ "$(printf '%s\n%s\n' "$MIN_VERSION" "$version" | sort -t. -k1,1n -k2,2n -k3,3n | head -1)" != "$MIN_VERSION" ]; then
	say "NeonMeter: Claude Code $version is older than $MIN_VERSION, the version NeonMeter is tested on; if the band does not appear, run 'claude update'."
fi

if claude plugin marketplace list 2>/dev/null | grep -q 'neonmeter'; then
	claude plugin marketplace update neonmeter
else
	claude plugin marketplace add IvanPavlak/NeonMeter
fi

if claude plugin list 2>/dev/null | grep -q 'neonmeter@neonmeter'; then
	claude plugin update neonmeter@neonmeter
else
	claude plugin install neonmeter@neonmeter
fi

# Installed plugins' hooks modules are still rolling out; this variable turns them on
# until the rollout reaches the account. It is read from the env block of settings.json,
# so the desktop app gets it too.
merge_py='
import json, os, sys
path = sys.argv[1]
data = {}
if os.path.exists(path):
    with open(path) as f:
        text = f.read()
    data = json.loads(text) if text.strip() else {}
env = data.setdefault("env", {})
if env.get("CLAUDE_CODE_ENABLE_FUNCTION_HOOKS") == "1":
    print("unchanged")
    sys.exit(0)
if os.path.exists(path):
    with open(path + ".bak", "w") as f:
        f.write(text)
env["CLAUDE_CODE_ENABLE_FUNCTION_HOOKS"] = "1"
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
print("updated")
'
merge_js='
const fs = require("fs"), path = require("path");
const file = process.argv[1];
const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const data = text.trim() ? JSON.parse(text) : {};
data.env = data.env || {};
if (data.env.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS === "1") { console.log("unchanged"); process.exit(0); }
if (text) fs.writeFileSync(file + ".bak", text);
data.env.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS = "1";
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
console.log("updated");
'

if command -v python3 >/dev/null 2>&1; then
	result="$(python3 -c "$merge_py" "$SETTINGS")" || result="failed"
elif command -v node >/dev/null 2>&1; then
	result="$(node -e "$merge_js" "$SETTINGS")" || result="failed"
else
	result="failed"
fi

case "$result" in
	updated) say "NeonMeter: turned on hooks modules in $SETTINGS (the previous file is at $SETTINGS.bak)." ;;
	unchanged) say "NeonMeter: hooks modules were already on in $SETTINGS." ;;
	*)
		say "NeonMeter: could not edit $SETTINGS; add this to it by hand:"
		say '  "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" }'
		exit 1
		;;
esac

say "NeonMeter: installed. Start a new session (restart the desktop app) and the band appears above the prompt."
