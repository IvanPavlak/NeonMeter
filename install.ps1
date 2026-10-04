# Installs NeonMeter from its marketplace and turns on the hooks modules it needs.
# Safe to run again: it updates the plugin and leaves settings that are already right alone.
$ErrorActionPreference = 'Stop'

$MinVersion = [version]'2.1.286'
$ConfigDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$Settings = Join-Path $ConfigDir 'settings.json'

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
	Write-Host 'NeonMeter: the claude command is not on PATH; install Claude Code first.'
	exit 1
}

$version = [version](((claude --version) -split ' ')[0])
if ($version -lt $MinVersion) {
	Write-Host "NeonMeter: Claude Code $version is older than $MinVersion, the version NeonMeter is tested on; if the band does not appear, run 'claude update'."
}

if ((claude plugin marketplace list) -match 'neonmeter') {
	claude plugin marketplace update neonmeter
} else {
	claude plugin marketplace add IvanPavlak/NeonMeter
}
if ((claude plugin list) -match 'neonmeter@neonmeter') {
	claude plugin update neonmeter@neonmeter
} else {
	claude plugin install neonmeter@neonmeter
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Installed plugins' hooks modules are still rolling out; this variable turns them on
# until the rollout reaches the account. It is read from the env block of settings.json,
# so the desktop app gets it too.
try {
	$text = if (Test-Path $Settings) { [IO.File]::ReadAllText($Settings) } else { '' }
	$data = if ($text.Trim()) { $text | ConvertFrom-Json } else { [pscustomobject]@{} }
	if (-not $data.PSObject.Properties['env']) {
		$data | Add-Member -NotePropertyName env -NotePropertyValue ([pscustomobject]@{})
	}
	if ($data.env.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS -eq '1') {
		Write-Host "NeonMeter: hooks modules were already on in $Settings."
	} else {
		if ($text) { [IO.File]::WriteAllText("$Settings.bak", $text) }
		$data.env | Add-Member -NotePropertyName CLAUDE_CODE_ENABLE_FUNCTION_HOOKS -NotePropertyValue '1' -Force
		New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
		[IO.File]::WriteAllText($Settings, ($data | ConvertTo-Json -Depth 32) + "`n", (New-Object Text.UTF8Encoding $false))
		Write-Host "NeonMeter: turned on hooks modules in $Settings (the previous file is at $Settings.bak)."
	}
} catch {
	Write-Host "NeonMeter: could not edit ${Settings}; add this to it by hand:"
	Write-Host '  "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" }'
	exit 1
}

Write-Host 'NeonMeter: installed. Start a new session (restart the desktop app) and the band appears above the prompt.'
