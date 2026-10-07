#!/usr/bin/env bash
# Removes NeonMeter completely: the plugin, its marketplace, the files Claude Code keeps for them,
# and the settings the installer added. Safe to run again: what is already gone is skipped.
# It touches nothing else: other plugins, other marketplaces and every other setting stay as they are.
set -euo pipefail

MIN_VERSION="2.1.286"
PLUGIN="neonmeter@neonmeter"
MARKETPLACE="neonmeter"
REPO="IvanPavlak/NeonMeter"
CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
PLUGINS_DIR="$CONFIG_DIR/plugins"
SETTINGS="$CONFIG_DIR/settings.json"

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

command -v claude >/dev/null 2>&1 || fail "the claude command is not on PATH; it is needed to remove the plugin and its marketplace."
[ -n "$json_runtime" ] || fail "python3 or node is needed to read claude's JSON output and edit $SETTINGS."

# An older claude keeps plugins in another layout, so nothing is removed until it is new enough.
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
	say "NeonMeter: Claude Code ${version:-of unknown version} at $claude_path is older than $MIN_VERSION. Update it, then run this uninstaller again:"
	say "  $update"
	exit 1
fi

# Prints field $3 of the entry whose field $1 is $2 in a JSON array on stdin; exit 1 when there is none.
field_py='
import json, sys
for x in json.load(sys.stdin):
    if x.get(sys.argv[1]) == sys.argv[2]:
        print(x.get(sys.argv[3]) or "")
        sys.exit(0)
sys.exit(1)
'
field_js='
const [key, value, field] = process.argv.slice(1);
const x = JSON.parse(require("fs").readFileSync(0, "utf8")).find((e) => e[key] === value);
if (!x) process.exit(1);
console.log(x[field] || "");
'
plugin_listed() { claude plugin list --json </dev/null | run_json "$field_py" "$field_js" id "$PLUGIN" id >/dev/null; }
marketplace_repo() { claude plugin marketplace list --json </dev/null | run_json "$field_py" "$field_js" name "$MARKETPLACE" repo; }

has_plugin=false
plugin_listed && has_plugin=true
has_marketplace=false
own_marketplace=true
if repo="$(marketplace_repo)"; then
	has_marketplace=true
	# A marketplace named neonmeter that is not this repository (a local clone added by path, or someone
	# else's) is not removed and its folders are not touched; only the plugin is uninstalled from it.
	if [ "$repo" != "$REPO" ]; then own_marketplace=false; fi
fi

if $has_marketplace && $own_marketplace; then
	# Uninstalls the plugin and deletes the marketplace's clone; only NeonMeter comes from this marketplace.
	claude_run plugin marketplace remove "$MARKETPLACE"
fi
if plugin_listed; then
	claude_run plugin uninstall "$PLUGIN"
fi
if ! $has_plugin && ! $has_marketplace; then say "NeonMeter: claude lists neither the plugin nor its marketplace."; fi
if $has_marketplace && ! $own_marketplace; then
	say "NeonMeter: kept the marketplace '$MARKETPLACE' because it is not $REPO; remove it with 'claude plugin marketplace remove $MARKETPLACE' if you no longer want it."
fi

# Folders claude can leave behind (an older claude, or a version still marked in use): only these exact
# paths inside the plugins folder are ever removed. The plugin's own cached copies always go; the
# marketplace's cache and clone only when the marketplace is this repository's.
folders=("$PLUGINS_DIR/cache/$MARKETPLACE/neonmeter")
if $own_marketplace; then folders+=("$PLUGINS_DIR/cache/$MARKETPLACE" "$PLUGINS_DIR/marketplaces/$MARKETPLACE"); fi
for folder in "${folders[@]}"; do
	if [ -e "$folder" ]; then
		rm -rf -- "$folder"
		say "NeonMeter: removed $folder"
	fi
done

# Records claude normally drops itself, and NeonMeter's own settings: only those keys are removed, a block
# this removal leaves empty goes too, and every other key stays as it is. Each file is rewritten only when
# it held one of them; settings.json is kept as settings.json.neonmeter.bak first. The hooks-modules switch
# is shared: it stays when another installed or skills-dir plugin ships a hooks module, or when
# CLAUDE_CODE_PLUGIN_DIRS names plugin folders. (No apostrophes in these snippets: they sit in single quotes.)
cleanup_py='
import json, os, sys
config, installed, known, settings, plugin, market, own = sys.argv[1:8]
own = own == "true"
switch = "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS"
def load(path):
    if not os.path.exists(path):
        return None, None
    with open(path, encoding="utf-8") as f:
        text = f.read()
    return text, (json.loads(text) if text.strip() else None)
def save(path, data):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
def has_modules(path):
    if not os.path.isfile(path):
        return False
    try:
        with open(path, encoding="utf-8") as f:
            return bool(json.load(f).get("modules"))
    except Exception:
        return True
def other_hooks_modules(settings_data):
    if os.environ.get("CLAUDE_CODE_PLUGIN_DIRS"):
        return True
    if "CLAUDE_CODE_PLUGIN_DIRS" in ((settings_data or {}).get("env") or {}):
        return True
    paths = []
    _, records = load(installed)
    for key, entries in ((records or {}).get("plugins") or {}).items():
        if key != plugin:
            paths += [os.path.join(e.get("installPath", ""), "hooks", "hooks.json") for e in entries if e.get("installPath")]
    skills = os.path.join(config, "skills")
    if os.path.isdir(skills):
        paths += [os.path.join(skills, name, "hooks", "hooks.json") for name in os.listdir(skills)]
    return any(has_modules(p) for p in paths)
text, data = load(installed)
if isinstance(data, dict) and plugin in (data.get("plugins") or {}):
    del data["plugins"][plugin]
    save(installed, data)
    print("removed %s from %s" % (plugin, installed))
if own:
    text, data = load(known)
    if isinstance(data, dict) and market in data:
        del data[market]
        save(known, data)
        print("removed %s from %s" % (market, known))
text, data = load(settings)
removed = []
if isinstance(data, dict):
    entries = [("enabledPlugins", plugin), ("pluginConfigs", "neonmeter"), ("pluginConfigs", plugin)]
    if own:
        entries.append(("extraKnownMarketplaces", market))
    if switch in (data.get("env") or {}):
        if other_hooks_modules(data):
            print("kept env.%s in %s because another plugin may use hooks modules" % (switch, settings))
        else:
            entries.append(("env", switch))
    for parent, key in entries:
        block = data.get(parent)
        if isinstance(block, dict) and key in block:
            del block[key]
            removed.append(parent + "." + key)
            if not block:
                del data[parent]
if removed:
    with open(settings + ".neonmeter.bak", "w", encoding="utf-8", newline="") as f:
        f.write(text)
    save(settings, data)
    print("removed %s from %s (the previous file is at %s.neonmeter.bak)" % (", ".join(removed), settings, settings))
'
cleanup_js='
const fs = require("fs"), path = require("path");
const [config, installed, known, settings, plugin, market, ownArg] = process.argv.slice(1, 8);
const own = ownArg === "true";
const sw = "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS";
const isObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const load = (p) => {
	if (!fs.existsSync(p)) return [null, null];
	const text = fs.readFileSync(p, "utf8");
	return [text, text.trim() ? JSON.parse(text) : null];
};
const save = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
const hasModules = (p) => {
	if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return false;
	try { return Boolean(JSON.parse(fs.readFileSync(p, "utf8")).modules?.length); } catch { return true; }
};
const otherHooksModules = (settingsData) => {
	if (process.env.CLAUDE_CODE_PLUGIN_DIRS) return true;
	if (isObject(settingsData?.env) && "CLAUDE_CODE_PLUGIN_DIRS" in settingsData.env) return true;
	const paths = [];
	const [, records] = load(installed);
	for (const [key, entries] of Object.entries(records?.plugins ?? {})) {
		if (key === plugin) continue;
		for (const e of entries) if (e.installPath) paths.push(path.join(e.installPath, "hooks", "hooks.json"));
	}
	const skills = path.join(config, "skills");
	if (fs.existsSync(skills)) for (const name of fs.readdirSync(skills)) paths.push(path.join(skills, name, "hooks", "hooks.json"));
	return paths.some(hasModules);
};
let [text, data] = load(installed);
if (isObject(data) && isObject(data.plugins) && plugin in data.plugins) {
	delete data.plugins[plugin];
	save(installed, data);
	console.log(`removed ${plugin} from ${installed}`);
}
if (own) {
	[text, data] = load(known);
	if (isObject(data) && market in data) {
		delete data[market];
		save(known, data);
		console.log(`removed ${market} from ${known}`);
	}
}
[text, data] = load(settings);
const removed = [];
if (isObject(data)) {
	const entries = [["enabledPlugins", plugin], ["pluginConfigs", "neonmeter"], ["pluginConfigs", plugin]];
	if (own) entries.push(["extraKnownMarketplaces", market]);
	if (isObject(data.env) && sw in data.env) {
		if (otherHooksModules(data)) console.log(`kept env.${sw} in ${settings} because another plugin may use hooks modules`);
		else entries.push(["env", sw]);
	}
	for (const [parent, key] of entries) {
		const block = data[parent];
		if (isObject(block) && key in block) {
			delete block[key];
			removed.push(`${parent}.${key}`);
			if (Object.keys(block).length === 0) delete data[parent];
		}
	}
}
if (removed.length) {
	fs.writeFileSync(settings + ".neonmeter.bak", text);
	save(settings, data);
	console.log(`removed ${removed.join(", ")} from ${settings} (the previous file is at ${settings}.neonmeter.bak)`);
}
'
output="$(run_json "$cleanup_py" "$cleanup_js" "$CONFIG_DIR" "$PLUGINS_DIR/installed_plugins.json" "$PLUGINS_DIR/known_marketplaces.json" "$SETTINGS" "$PLUGIN" "$MARKETPLACE" "$own_marketplace")" \
	|| fail "could not edit the plugin records or $SETTINGS."
if [ -n "$output" ]; then printf '%s\n' "$output" | sed 's/^/NeonMeter: /'; fi

# Nothing of NeonMeter may remain.
left=()
if plugin_listed; then left+=("plugin $PLUGIN"); fi
if $own_marketplace && marketplace_repo >/dev/null; then left+=("marketplace $MARKETPLACE"); fi
for folder in "${folders[@]}"; do
	if [ -e "$folder" ]; then left+=("$folder"); fi
done
if [ "${#left[@]}" -gt 0 ]; then
	fail "still present after removal: $(printf '%s; ' "${left[@]}")"
fi

say "NeonMeter: removed. Sessions already open keep the band until they end; new sessions start without it."
