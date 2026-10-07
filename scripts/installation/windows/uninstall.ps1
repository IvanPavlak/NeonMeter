# Removes NeonMeter completely: the plugin, its marketplace, the files Claude Code keeps for them,
# and the settings the installer added. Safe to run again: what is already gone is skipped.
# It touches nothing else: other plugins, other marketplaces and every other setting stay as they are.
# Run as a file (.\uninstall.ps1) or piped (irm <url> | iex): it never closes the calling shell.

function Uninstall-NeonMeter {
	$ErrorActionPreference = 'Stop'

	$MinVersion = [version]'2.1.286'
	$Plugin = 'neonmeter@neonmeter'
	$Marketplace = 'neonmeter'
	$Repo = 'IvanPavlak/NeonMeter'
	$HooksVariable = 'CLAUDE_CODE_ENABLE_FUNCTION_HOOKS'
	$ConfigDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
	$PluginsDir = Join-Path $ConfigDir 'plugins'
	$Settings = Join-Path $ConfigDir 'settings.json'
	$Backup = "$Settings.neonmeter.bak"

	# Runs one claude command, shows its output, and stops when it fails.
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

	function Get-Plugin { Get-ClaudeList plugin list --json | Where-Object { $_.id -eq $Plugin } | Select-Object -First 1 }
	function Get-Marketplace { Get-ClaudeList plugin marketplace list --json | Where-Object { $_.name -eq $Marketplace } | Select-Object -First 1 }

	# Reads a JSON file, keeping every string as written (PowerShell 7 can otherwise turn date strings into dates).
	function Read-Json($path) {
		$text = [IO.File]::ReadAllText($path)
		if (-not $text.Trim()) { return $null }
		if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('DateKind')) { $text | ConvertFrom-Json -DateKind String } else { $text | ConvertFrom-Json }
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

	function Write-Json($path, $data) {
		[IO.File]::WriteAllText($path, (ConvertTo-ClaudeJson $data), (New-Object Text.UTF8Encoding $false))
	}

	function Test-Object($value) { $value -is [System.Management.Automation.PSCustomObject] }

	# Removes $name from $object when it is there; returns whether it was.
	function Remove-Key($object, $name) {
		if ((Test-Object $object) -and $object.PSObject.Properties[$name]) { $object.PSObject.Properties.Remove($name); return $true }
		return $false
	}

	# Whether anything other than NeonMeter may rely on hooks modules being turned on: another installed plugin
	# that ships a hooks module, a skills-dir plugin with one, or plugin folders named by CLAUDE_CODE_PLUGIN_DIRS.
	function Test-OtherHooksModules($settingsData) {
		if ($env:CLAUDE_CODE_PLUGIN_DIRS) { return $true }
		if ((Test-Object $settingsData) -and (Test-Object $settingsData.env) -and $settingsData.env.PSObject.Properties['CLAUDE_CODE_PLUGIN_DIRS']) { return $true }
		$hooksFiles = @(Get-ClaudeList plugin list --json | Where-Object { $_.id -ne $Plugin -and $_.installPath } |
			ForEach-Object { Join-Path $_.installPath 'hooks\hooks.json' })
		$skills = Join-Path $ConfigDir 'skills'
		if (Test-Path -LiteralPath $skills) {
			$hooksFiles += @(Get-ChildItem -LiteralPath $skills -Directory | ForEach-Object { Join-Path $_.FullName 'hooks\hooks.json' })
		}
		foreach ($file in $hooksFiles) {
			if (-not (Test-Path -LiteralPath $file)) { continue }
			try { if ((Read-Json $file).modules) { return $true } } catch { return $true }
		}
		return $false
	}

	$command = Get-Command claude -ErrorAction SilentlyContinue
	if (-not $command) {
		Write-Host 'NeonMeter: the claude command is not on PATH; it is needed to remove the plugin and its marketplace.'
		return $false
	}

	# An older claude keeps plugins in another layout, so nothing is removed until it is new enough.
	$version = $null
	[void][version]::TryParse((((& claude --version) -join ' ') -split ' ')[0], [ref]$version)
	if (-not $version -or $version -lt $MinVersion) {
		$npmPrefix = if (Get-Command npm -ErrorAction SilentlyContinue) { (& npm prefix -g) -join '' } else { '' }
		$viaNpm = ($npmPrefix -and $command.Source.StartsWith($npmPrefix, [StringComparison]::OrdinalIgnoreCase)) -or $command.Source -match 'node_modules'
		$update = if ($viaNpm) { 'npm install -g @anthropic-ai/claude-code@latest' } else { 'claude update' }
		Write-Host "NeonMeter: Claude Code $version at $($command.Source) is older than $MinVersion. Update it, then run this uninstaller again:"
		Write-Host "  $update"
		return $false
	}

	$record = Get-Plugin
	$market = Get-Marketplace
	# A marketplace named neonmeter that is not this repository (a local clone added by path, or someone else's)
	# is not removed and its folders are not touched; only the plugin is uninstalled from it.
	$ownMarketplace = -not $market -or $market.repo -eq $Repo

	if ($market -and $ownMarketplace) {
		# Uninstalls the plugin and deletes the marketplace's clone; only NeonMeter comes from this marketplace.
		Invoke-Claude plugin marketplace remove $Marketplace
	}
	if (Get-Plugin) {
		Invoke-Claude plugin uninstall $Plugin
	}
	if (-not $record -and -not $market) {
		Write-Host 'NeonMeter: claude lists neither the plugin nor its marketplace.'
	}
	if ($market -and -not $ownMarketplace) {
		Write-Host "NeonMeter: kept the marketplace '$Marketplace' ($($market.source) $($market.repo)$($market.path)) because it is not $Repo; remove it with 'claude plugin marketplace remove $Marketplace' if you no longer want it."
	}

	# Folders claude can leave behind (an older claude, or a version still marked in use): only these exact
	# paths inside the plugins folder are ever removed. The plugin's own cached copies always go; the
	# marketplace's cache and clone only when the marketplace is this repository's.
	$cache = Join-Path (Join-Path $PluginsDir 'cache') $Marketplace
	$folders = @(Join-Path $cache 'neonmeter')
	if ($ownMarketplace) {
		$folders += $cache
		$folders += Join-Path (Join-Path $PluginsDir 'marketplaces') $Marketplace
	}
	foreach ($folder in $folders) {
		if (Test-Path -LiteralPath $folder) {
			Remove-Item -LiteralPath $folder -Recurse -Force
			Write-Host "NeonMeter: removed $folder"
		}
	}

	# Records claude normally drops itself; only NeonMeter's own entry is removed from each.
	$installed = Join-Path $PluginsDir 'installed_plugins.json'
	if (Test-Path -LiteralPath $installed) {
		$data = Read-Json $installed
		if ((Test-Object $data) -and (Remove-Key $data.plugins $Plugin)) {
			Write-Json $installed $data
			Write-Host "NeonMeter: removed $Plugin from $installed"
		}
	}
	$known = Join-Path $PluginsDir 'known_marketplaces.json'
	if ($ownMarketplace -and (Test-Path -LiteralPath $known)) {
		$data = Read-Json $known
		if ((Test-Object $data) -and (Remove-Key $data $Marketplace)) {
			Write-Json $known $data
			Write-Host "NeonMeter: removed $Marketplace from $known"
		}
	}

	# NeonMeter's own settings. A block this removal leaves empty goes too; every other key stays as it is.
	# The previous file is kept as settings.json.neonmeter.bak.
	try {
		if (Test-Path -LiteralPath $Settings) {
			$text = [IO.File]::ReadAllText($Settings)
			$data = Read-Json $Settings
			$removed = @()
			if (Test-Object $data) {
				$entries = @(
					@{ Parent = 'enabledPlugins'; Key = $Plugin },
					@{ Parent = 'pluginConfigs'; Key = 'neonmeter' },
					@{ Parent = 'pluginConfigs'; Key = $Plugin }
				)
				if ($ownMarketplace) { $entries += @{ Parent = 'extraKnownMarketplaces'; Key = $Marketplace } }
				# The hooks-modules switch is shared: it stays when anything else may need it.
				$hasSwitch = (Test-Object $data.env) -and $data.env.PSObject.Properties[$HooksVariable]
				if ($hasSwitch -and (Test-OtherHooksModules $data)) {
					Write-Host "NeonMeter: kept env.$HooksVariable in $Settings because another plugin may use hooks modules."
				} elseif ($hasSwitch) {
					$entries += @{ Parent = 'env'; Key = $HooksVariable }
				}
				foreach ($entry in $entries) {
					$block = $data.PSObject.Properties[$entry.Parent]
					if ($block -and (Remove-Key $block.Value $entry.Key)) {
						$removed += "$($entry.Parent).$($entry.Key)"
						if (-not @($block.Value.PSObject.Properties).Count) { [void](Remove-Key $data $entry.Parent) }
					}
				}
			}
			if ($removed) {
				[IO.File]::WriteAllText($Backup, $text, (New-Object Text.UTF8Encoding $false))
				Write-Json $Settings $data
				Write-Host "NeonMeter: removed $($removed -join ', ') from $Settings (the previous file is at $Backup)."
			}
		}
	} catch {
		Write-Host "NeonMeter: could not edit ${Settings}: $($_.Exception.Message)"
		return $false
	}

	# Nothing of NeonMeter may remain.
	$left = @()
	if (Get-Plugin) { $left += "plugin $Plugin" }
	if ($ownMarketplace -and (Get-Marketplace)) { $left += "marketplace $Marketplace" }
	foreach ($folder in $folders) { if (Test-Path -LiteralPath $folder) { $left += $folder } }
	if ($left) {
		Write-Host "NeonMeter: still present after removal: $($left -join '; ')"
		return $false
	}

	Write-Host 'NeonMeter: removed. Sessions already open keep the band until they end; new sessions start without it.'
	return $true
}

try {
	$removed = Uninstall-NeonMeter
} catch {
	Write-Host "NeonMeter: $($_.Exception.Message)"
	$removed = $false
}
# A non-zero exit code only when run as a file; piped into iex, exit would close the caller's shell.
if (-not $removed -and $PSCommandPath) { exit 1 }
