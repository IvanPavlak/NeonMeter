# Installs NeonMeter from its marketplace and turns on the hooks modules it needs.
# Safe to run again: it updates the plugin, repairs an install whose files are missing,
# and leaves settings that are already right alone.
# Run as a file (.\install.ps1) or piped (irm <url> | iex): it never closes the calling shell.

function Install-NeonMeter {
	$ErrorActionPreference = 'Stop'

	$MinVersion = [version]'2.1.286'
	$Plugin = 'neonmeter@neonmeter'
	$ConfigDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
	$Settings = Join-Path $ConfigDir 'settings.json'

	# Runs one claude command, shows its output, and stops the install when it fails.
	function Invoke-Claude {
		& claude @args | Out-Host
		if ($LASTEXITCODE -ne 0) { throw "'claude $($args -join ' ')' failed with exit code $LASTEXITCODE." }
	}

	# Parses a claude --json listing into one object per entry (Windows PowerShell 5.1 emits a JSON array as one object).
	function Get-ClaudeList {
		$text = (& claude @args) -join "`n"
		if ($LASTEXITCODE -ne 0) { throw "'claude $($args -join ' ')' failed with exit code $LASTEXITCODE." }
		$text | ConvertFrom-Json | ForEach-Object { $_ }
	}

	# The installed plugin's record, or $null when it is not installed.
	function Get-NeonMeter {
		Get-ClaudeList plugin list --json | Where-Object { $_.id -eq $Plugin } | Select-Object -First 1
	}

	# Serializes like Claude Code writes its own JSON (two-space indents, "key": value, empty {} and [] on one line),
	# on every PowerShell: Windows PowerShell 5.1's ConvertTo-Json would otherwise re-indent the whole file its own way.
	function ConvertTo-ClaudeJson($data) {
		$json = $data | ConvertTo-Json -Depth 64 -Compress
		$out = New-Object Text.StringBuilder
		$depth = 0
		$inString = $false
		for ($i = 0; $i -lt $json.Length; $i++) {
			$c = $json[$i]
			if ($inString) {
				if ($c -eq [char]'\') {
					# An escape is copied as is, except the four that Windows PowerShell 5.1 adds (\u003c \u003e \u0026 \u0027).
					$code = if ($i + 5 -lt $json.Length) { $json.Substring($i + 1, 5) } else { '' }
					$plain = @{ 'u003c' = '<'; 'u003e' = '>'; 'u0026' = '&'; 'u0027' = "'" }[$code]
					if ($plain) { [void]$out.Append($plain); $i += 5 } else { [void]$out.Append($c).Append($json[$i + 1]); $i++ }
					continue
				}
				[void]$out.Append($c)
				if ($c -eq [char]'"') { $inString = $false }
				continue
			}
			if ($c -eq [char]'"') {
				$inString = $true
				[void]$out.Append($c)
			} elseif ($c -eq [char]'{' -or $c -eq [char]'[') {
				$close = if ($c -eq [char]'{') { [char]'}' } else { [char]']' }
				if ($i + 1 -lt $json.Length -and $json[$i + 1] -eq $close) {
					[void]$out.Append($c).Append($close)
					$i++
				} else {
					$depth++
					[void]$out.Append($c).Append("`n").Append('  ' * $depth)
				}
			} elseif ($c -eq [char]'}' -or $c -eq [char]']') {
				$depth--
				[void]$out.Append("`n").Append('  ' * $depth).Append($c)
			} elseif ($c -eq [char]',') {
				[void]$out.Append(',').Append("`n").Append('  ' * $depth)
			} elseif ($c -eq [char]':') {
				[void]$out.Append(': ')
			} else {
				[void]$out.Append($c)
			}
		}
		$out.ToString() + "`n"
	}

	function Test-Installed($record) {
		$record -and $record.installPath -and (Test-Path (Join-Path $record.installPath 'hooks\hooks.json'))
	}

	$command = Get-Command claude -ErrorAction SilentlyContinue
	if (-not $command) {
		Write-Host 'NeonMeter: the claude command is not on PATH; install Claude Code first.'
		return $false
	}

	# An older claude cannot load hooks modules and leaves an install the desktop app cannot load either,
	# so nothing is written until it is new enough.
	$version = $null
	[void][version]::TryParse((((& claude --version) -join ' ') -split ' ')[0], [ref]$version)
	if (-not $version -or $version -lt $MinVersion) {
		$npmPrefix = if (Get-Command npm -ErrorAction SilentlyContinue) { (& npm prefix -g) -join '' } else { '' }
		$viaNpm = ($npmPrefix -and $command.Source.StartsWith($npmPrefix, [StringComparison]::OrdinalIgnoreCase)) -or $command.Source -match 'node_modules'
		$update = if ($viaNpm) { 'npm install -g @anthropic-ai/claude-code@latest' } else { 'claude update' }
		Write-Host "NeonMeter: Claude Code $version at $($command.Source) is older than $MinVersion, which NeonMeter needs. Update it, then run this installer again:"
		Write-Host "  $update"
		return $false
	}

	if (Get-ClaudeList plugin marketplace list --json | Where-Object { $_.name -eq 'neonmeter' }) {
		Invoke-Claude plugin marketplace update neonmeter
	} else {
		Invoke-Claude plugin marketplace add IvanPavlak/NeonMeter
	}

	$record = Get-NeonMeter
	if (Test-Installed $record) {
		Invoke-Claude plugin update $Plugin
	} else {
		if ($record) {
			# Recorded as installed but its files are gone (an older claude installed it): reinstall.
			Write-Host "NeonMeter: the recorded install at $($record.installPath) is missing its files; reinstalling."
			Invoke-Claude plugin uninstall $Plugin
		}
		Invoke-Claude plugin install $Plugin
	}

	$record = Get-NeonMeter
	if (-not (Test-Installed $record)) {
		Write-Host "NeonMeter: the install finished but its files are not where claude recorded them ($($record.installPath)); run 'claude plugin list --json' to see what is installed."
		return $false
	}
	Write-Host "NeonMeter: installed $($record.version) at $($record.installPath)."
	if (-not $record.enabled) {
		Write-Host "NeonMeter: the plugin is disabled; turn it on with 'claude plugin enable $Plugin'."
	}

	# The desktop app's bundled Claude Code 2.1.286 turns hooks modules on only with this variable
	# (2.1.287 and later have them on and ignore it). It is read from the env block of settings.json,
	# so the desktop app gets it too. Only that one key is added; every other setting stays as it is,
	# and the previous file is kept as settings.json.neonmeter.bak (never over a backup of yours).
	$Backup = "$Settings.neonmeter.bak"
	try {
		$text = if (Test-Path -LiteralPath $Settings) { [IO.File]::ReadAllText($Settings) } else { '' }
		$data = if (-not $text.Trim()) { [pscustomobject]@{} }
			elseif ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('DateKind')) { $text | ConvertFrom-Json -DateKind String }
			else { $text | ConvertFrom-Json }
		if ($data -isnot [System.Management.Automation.PSCustomObject]) { throw 'it does not hold a JSON object' }
		if (-not $data.PSObject.Properties['env']) {
			$data | Add-Member -NotePropertyName env -NotePropertyValue ([pscustomobject]@{})
		}
		if ($data.env -isnot [System.Management.Automation.PSCustomObject]) { throw 'its env is not a JSON object' }
		if ($data.env.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS -eq '1') {
			Write-Host "NeonMeter: hooks modules were already on in $Settings."
		} else {
			if ($text) { [IO.File]::WriteAllText($Backup, $text, (New-Object Text.UTF8Encoding $false)) }
			$data.env | Add-Member -NotePropertyName CLAUDE_CODE_ENABLE_FUNCTION_HOOKS -NotePropertyValue '1' -Force
			New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
			[IO.File]::WriteAllText($Settings, (ConvertTo-ClaudeJson $data), (New-Object Text.UTF8Encoding $false))
			if ($text) {
				Write-Host "NeonMeter: turned on hooks modules in $Settings (the previous file is at $Backup)."
			} else {
				Write-Host "NeonMeter: turned on hooks modules in $Settings."
			}
		}
	} catch {
		Write-Host "NeonMeter: could not edit ${Settings} ($($_.Exception.Message)); add this to it by hand:"
		Write-Host '  "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" }'
		return $false
	}

	Write-Host 'NeonMeter: done. Start a new session in the terminal or the desktop app and the band appears above the prompt.'
	return $true
}

try {
	$installed = Install-NeonMeter
} catch {
	Write-Host "NeonMeter: $($_.Exception.Message)"
	$installed = $false
}
# A non-zero exit code only when run as a file; piped into iex, exit would close the caller's shell.
if (-not $installed -and $PSCommandPath) { exit 1 }
