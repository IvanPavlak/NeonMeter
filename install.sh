#!/usr/bin/env bash
# Installs NeonMeter from its marketplace and turns on the hooks modules it needs.
# Safe to run again: it updates the plugin, repairs an install whose files are missing,
# and leaves settings that are already right alone.
set -euo pipefail

MIN_VERSION="2.1.286"
PLUGIN="neonmeter@neonmeter"
SETTINGS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"

say() { printf '%s\n' "$*"; }
fail() { say "NeonMeter: $*" >&2; exit 1; }

# Every claude call reads /dev/null: piped through `curl | bash`, stdin is this script.
claude_run() { claude "$@" </dev/null || fail "'claude $*' failed with exit code $?."; }

# JSON is read and written with python3, or node when python3 does not run (on Windows, python3 can be
# the Microsoft Store stub, which is on PATH but only prints a hint).
if python3 -c '' >/dev/null 2>&1; then
	json_runtime=python3
elif node -e '' >/dev/null 2>&1; then
	json_runtime=node
else
	json_runtime=""
fi

# Runs a Python snippet, or its Node twin, passing the remaining arguments.
run_json() {
	local py="$1" js="$2"
	shift 2
	case "$json_runtime" in
		python3) python3 -c "$py" "$@" ;;
		node) node -e "$js" "$@" ;;
		*) return 2 ;;
	esac
}

command -v claude >/dev/null 2>&1 || fail "the claude command is not on PATH; install Claude Code first."
[ -n "$json_runtime" ] || fail "python3 or node is needed to read claude's JSON output and edit $SETTINGS."

# An older claude cannot load hooks modules and leaves an install the desktop app cannot load either,
# so nothing is written until it is new enough.
claude_path="$(command -v claude)"
version="$(claude --version </dev/null 2>/dev/null | awk '{print $1}')" || version=""
if [ -z "$version" ] || [ "$(printf '%s\n%s\n' "$MIN_VERSION" "$version" | sort -t. -k1,1n -k2,2n -k3,3n | head -1)" != "$MIN_VERSION" ]; then
	update="claude update"
	if command -v npm >/dev/null 2>&1; then
		npm_prefix="$(npm prefix -g 2>/dev/null || true)"
		# Git Bash and Cygwin: npm prints a Windows path, command -v a POSIX one.
		if [ -n "$npm_prefix" ] && command -v cygpath >/dev/null 2>&1; then npm_prefix="$(cygpath -u "$npm_prefix")"; fi
		case "$claude_path" in
			"$npm_prefix"/*|*node_modules*) update="npm install -g @anthropic-ai/claude-code@latest" ;;
		esac
	fi
	say "NeonMeter: Claude Code ${version:-of unknown version} at $claude_path is older than $MIN_VERSION, which NeonMeter needs. Update it, then run this installer again:"
	say "  $update"
	exit 1
fi

# Prints the installed plugin's record as "<installPath>\t<enabled>\t<version>", or nothing when it is not installed.
plugin_py='
import json, sys
for p in json.load(sys.stdin):
    if p.get("id") == sys.argv[1]:
        print("%s\t%s\t%s" % (p.get("installPath", ""), str(p.get("enabled", False)).lower(), p.get("version", "")))
        break
'
plugin_js='
const id = process.argv[1];
const list = JSON.parse(require("fs").readFileSync(0, "utf8"));
const p = list.find((x) => x.id === id);
if (p) console.log([p.installPath || "", String(Boolean(p.enabled)), p.version || ""].join("\t"));
'
has_marketplace_py='
import json, sys
sys.exit(0 if any(m.get("name") == sys.argv[1] for m in json.load(sys.stdin)) else 1)
'
has_marketplace_js='
const name = process.argv[1];
process.exit(JSON.parse(require("fs").readFileSync(0, "utf8")).some((m) => m.name === name) ? 0 : 1);
'

neonmeter_record() {
	local list
	list="$(claude plugin list --json </dev/null)" || fail "'claude plugin list --json' failed."
	printf '%s' "$list" | run_json "$plugin_py" "$plugin_js" "$PLUGIN"
}

marketplaces="$(claude plugin marketplace list --json </dev/null)" || fail "'claude plugin marketplace list --json' failed."
if printf '%s' "$marketplaces" | run_json "$has_marketplace_py" "$has_marketplace_js" neonmeter; then
	claude_run plugin marketplace update neonmeter
else
	claude_run plugin marketplace add IvanPavlak/NeonMeter
fi

record="$(neonmeter_record)"
install_path="${record%%$'\t'*}"
if [ -n "$record" ] && [ -f "$install_path/hooks/hooks.json" ]; then
	claude_run plugin update "$PLUGIN"
else
	if [ -n "$record" ]; then
		# Recorded as installed but its files are gone (an older claude installed it): reinstall.
		say "NeonMeter: the recorded install at $install_path is missing its files; reinstalling."
		claude_run plugin uninstall "$PLUGIN"
	fi
	claude_run plugin install "$PLUGIN"
fi

record="$(neonmeter_record)"
IFS=$'\t' read -r install_path enabled installed_version <<<"$record" || true
if [ -z "$record" ] || [ ! -f "$install_path/hooks/hooks.json" ]; then
	fail "the install finished but its files are not where claude recorded them (${install_path:-no record}); run 'claude plugin list --json' to see what is installed."
fi
say "NeonMeter: installed $installed_version at $install_path."
[ "$enabled" = "true" ] || say "NeonMeter: the plugin is disabled; turn it on with 'claude plugin enable $PLUGIN'."

# The desktop app's bundled Claude Code 2.1.286 turns hooks modules on only with this variable
# (2.1.287 and later have them on and ignore it). It is read from the env block of settings.json,
# so the desktop app gets it too. Only that one key is added; every other setting stays as it is,
# and the previous file is kept as settings.json.neonmeter.bak (never over a backup of yours).
merge_py='
import json, os, sys
path = sys.argv[1]
data = {}
text = ""
if os.path.exists(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    data = json.loads(text) if text.strip() else {}
if not isinstance(data, dict) or not isinstance(data.setdefault("env", {}), dict):
    print("failed")
    sys.exit(0)
env = data["env"]
if env.get("CLAUDE_CODE_ENABLE_FUNCTION_HOOKS") == "1":
    print("unchanged")
    sys.exit(0)
if text:
    with open(path + ".neonmeter.bak", "w", encoding="utf-8", newline="") as f:
        f.write(text)
env["CLAUDE_CODE_ENABLE_FUNCTION_HOOKS"] = "1"
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8", newline="\n") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("updated" if text else "created")
'
merge_js='
const fs = require("fs"), path = require("path");
const file = process.argv[1];
const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const data = text.trim() ? JSON.parse(text) : {};
const isObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
if (!isObject(data)) { console.log("failed"); process.exit(0); }
data.env = data.env ?? {};
if (!isObject(data.env)) { console.log("failed"); process.exit(0); }
if (data.env.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS === "1") { console.log("unchanged"); process.exit(0); }
if (text) fs.writeFileSync(file + ".neonmeter.bak", text);
data.env.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS = "1";
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
console.log(text ? "updated" : "created");
'

result="$(run_json "$merge_py" "$merge_js" "$SETTINGS")" || result="failed"

case "$result" in
	updated) say "NeonMeter: turned on hooks modules in $SETTINGS (the previous file is at $SETTINGS.neonmeter.bak)." ;;
	created) say "NeonMeter: turned on hooks modules in $SETTINGS." ;;
	unchanged) say "NeonMeter: hooks modules were already on in $SETTINGS." ;;
	*)
		say "NeonMeter: could not edit $SETTINGS; add this to it by hand:"
		say '  "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" }'
		exit 1
		;;
esac

say "NeonMeter: done. Start a new session in the terminal or the desktop app and the band appears above the prompt."
