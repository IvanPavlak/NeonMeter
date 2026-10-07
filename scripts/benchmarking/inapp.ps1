# Measures NeonMeter inside the Claude desktop app: several versions of hooks/ (sides),
# every claude.exe process summed. Windows only.
#
#     pwsh scripts/benchmarking/inapp.ps1 [-Sides master,work] [-Looks dots,bars] [-Settle 5] [-Seconds 20] [-Set @{ glow = 'false' }]
#
# A side is `work` (hooks/ in the working tree), a folder holding a copy of hooks/, or a
# git ref. -Repeat measures every side that many times, taking turns (A B A B), and
# reports the median of each: one pass is not enough, since the app's own cost drifts by
# more than most changes save. -Set adds options to every measurement, such as glow off to see what the halo
# costs.
#
# It copies each side's hooks/ into the installed plugin (installed_plugins.json names
# where) and switches options with `claude plugin configure`, which hot-reloads the
# plugin in every open session. For each side and look it measures `pulseMode: always`,
# then the last side with `pulse: false` once, the floor the app costs on its own; with
# the defaults a run takes about two and a half minutes, a minute more per extra side. At the
# end, even after an error, it puts back the installed hooks/ and the options it changed
# (an option you had not set comes back set to its default); -KeepWork leaves the working
# tree's hooks/ installed instead.
#
# Keep the desktop app's window visible, with a chat showing the band: a hidden or
# minimized window draws nothing. Start it from a terminal, or in the background from a
# session, so no session is busy while it measures. Light use of other apps is fine.

param(
	[string[]]$Sides = @('master', 'work'),
	[ValidateSet('dots', 'bars')][string[]]$Looks = @('dots', 'bars'),
	[int]$Settle = 5,
	[int]$Seconds = 20,
	[hashtable]$Set = @{},
	[int]$Repeat = 1,
	[switch]$KeepWork
)

$ErrorActionPreference = 'Stop'
$Plugin = 'neonmeter@neonmeter'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Out = Join-Path $PSScriptRoot 'out'
$ConfigDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$Utf8 = New-Object Text.UTF8Encoding $false

$installed = (Get-Content (Join-Path $ConfigDir 'plugins\installed_plugins.json') -Raw | ConvertFrom-Json).plugins.$Plugin
if (-not $installed) { throw "$Plugin is not installed." }
$Hooks = Join-Path $installed[0].installPath 'hooks'

# The options this run changes, as you have them; one you have not set comes back as its
# default from the plugin's manifest.
$manifest = Get-Content (Join-Path $Repo '.claude-plugin\plugin.json') -Raw -Encoding utf8 | ConvertFrom-Json
$current = (Get-Content (Join-Path $ConfigDir 'settings.json') -Raw -Encoding utf8 | ConvertFrom-Json).pluginConfigs.$Plugin.options
$restore = [ordered]@{}
foreach ($key in @('pulse', 'pulseMode', 'desktopBars') + @($Set.Keys)) {
	$value = $current.$key
	if ($null -eq $value) { $value = $manifest.userConfig.$key.default }
	if ($value -is [array]) { $value = $value -join ',' }
	$restore[$key] = if ($value -is [bool]) { "$value".ToLower() } else { "$value" }
}

# Every measurement's options: these, then -Set over them.
function Get-RunOptions([hashtable]$Values) {
	$all = @{}
	foreach ($k in $Values.Keys) { $all[$k] = $Values[$k] }
	foreach ($k in $Set.Keys) { $all[$k] = "$($Set[$k])" }
	$all
}

function Set-Options([System.Collections.IDictionary]$Values) {
	$OutputEncoding = $Utf8
	$Values | ConvertTo-Json -Compress | claude plugin configure $Plugin --values-stdin | Out-Null
	if ($LASTEXITCODE -ne 0) { throw "claude plugin configure failed for $($Values | ConvertTo-Json -Compress)." }
}

# Fills the installed hooks/ with a side's files: the working tree, a folder, or a git ref.
function Install-Hooks([string]$Side) {
	if ($Side -eq 'work') { $Side = Join-Path $Repo 'hooks' }
	if (Test-Path $Side -PathType Container) {
		Copy-Item (Join-Path $Side '*') $Hooks -Force
		return
	}
	foreach ($file in (git -C $Repo ls-tree --name-only "${Side}:hooks")) {
		$text = (git -C $Repo show "${Side}:hooks/$file") -join "`n"
		[IO.File]::WriteAllText((Join-Path $Hooks $file), "$text`n", $Utf8)
	}
}

# A side as the results name it: a folder by its own name, a ref with its commit.
function Get-SideName([string]$Side) {
	if ($Side -eq 'work' -or (Test-Path $Side -PathType Container)) { return Split-Path $Side -Leaf }
	"$Side ($(git -C $Repo rev-parse --short $Side))"
}

function Measure-App([string]$Name) {
	Write-Host "measuring: $Name"
	Start-Sleep -Seconds $Settle
	$ids = @((Get-Process -Name claude).Id)
	$ticks = { $t = 0; foreach ($p in (Get-Process -Id $ids -ErrorAction SilentlyContinue)) { $t += $p.TotalProcessorTime.Ticks }; $t }
	$ticks0 = & $ticks
	$start = Get-Date
	# One counter query for the whole window, a sample a second; an instance names its process (pid_<id>_...).
	$mine = '^pid_(' + ($ids -join '|') + ')_'
	$samples = Get-Counter '\GPU Engine(*)\Utilization Percentage' -SampleInterval 1 -MaxSamples $Seconds -ErrorAction SilentlyContinue
	$gpu = foreach ($set in $samples) { ($set.CounterSamples | Where-Object { $_.InstanceName -match $mine } | Measure-Object CookedValue -Sum).Sum }
	$elapsed = ((Get-Date) - $start).TotalSeconds
	$result = [pscustomobject]@{
		Run = $Name
		'CPU %' = [math]::Round(((& $ticks) - $ticks0) / 1e7 / $elapsed * 100, 1)
		'GPU %' = [math]::Round(($gpu | Measure-Object -Average).Average, 1)
		Processes = $ids.Count
	}
	# Saved as it is measured, so a run cut short keeps what it has.
	$result | Export-Csv $Csv -Append -NoTypeInformation
	Write-Host ("  CPU {0}%  GPU {1}%" -f $result.'CPU %', $result.'GPU %')
	$result
}

# A run cut short leaves the marker and its backup: put that back first, or the backup
# taken now would hold a side's files instead of what you had installed.
$backup = Join-Path $Out 'installed-hooks'
$marker = Join-Path $Out 'inapp-running'
if (Test-Path $marker) {
	throw "An earlier run did not finish. Copy $backup\* into $Hooks (or run 'claude plugin update $Plugin'), set your options back, delete $marker and run again."
}
New-Item -ItemType Directory -Force $backup | Out-Null
Copy-Item (Join-Path $Hooks '*') $backup -Force
Set-Content $marker $Hooks
$Csv = Join-Path $Out ('inapp-{0:yyyyMMdd-HHmmss}.csv' -f (Get-Date))
"Sides: $(($Sides | ForEach-Object { Get-SideName $_ }) -join ', '); installed at $Hooks; results also go to $Csv"

$results = @()
try {
	foreach ($round in 1..$Repeat) {
		foreach ($side in $Sides) {
			Install-Hooks $side
			# A change of value is what reloads the plugin, so the side's files are picked up.
			Set-Options @{ pulse = 'false' }
			foreach ($look in $Looks) {
				Set-Options (Get-RunOptions @{ pulse = 'true'; pulseMode = 'always'; desktopBars = $look })
				$results += Measure-App "$(Get-SideName $side) $look, always"
			}
		}
	}
	Set-Options (Get-RunOptions @{ pulse = 'false' })
	$results += Measure-App "$(Get-SideName $Sides[-1]) $($Looks[-1]), pulse off (floor)"
} finally {
	if (-not $KeepWork) { Copy-Item (Join-Path $backup '*') $Hooks -Force }
	Set-Options @{ pulse = 'false' }
	Set-Options $restore
	Remove-Item $marker
	"Put back: $(if ($KeepWork) { 'the options (the working tree stays installed)' } else { 'the installed hooks/ and the options' })."
}

"In the app, $Seconds s each after $Settle s to settle (CPU as a percent of one core, every claude.exe summed):"
$results | Format-Table -AutoSize
if ($Repeat -gt 1) {
	"Median of $Repeat rounds:"
	$median = { param($v) $sorted = @($v | Sort-Object); $sorted[[math]::Floor($sorted.Count / 2)] }
	$results | Group-Object Run | ForEach-Object {
		[pscustomobject]@{
			Run = $_.Name
			'CPU %' = & $median $_.Group.'CPU %'
			'GPU %' = & $median $_.Group.'GPU %'
			'CPU per round' = ($_.Group.'CPU %') -join ' / '
		}
	} | Format-Table -AutoSize
}
