# Measures the desktop drawings of two versions in headless Microsoft Edge, the Chromium
# engine the desktop app draws with: CPU and GPU of each band page, and how far the
# working tree's frames are from the base's. Windows only (GPU counters, Edge).
#
#     pwsh scripts/benchmarking/headless.ps1 [-Base master] [-Rounds 3] [-Seconds 10] [-SkipFrames] [-SkipBands]
#
# -SkipFrames leaves out the pixel comparison, -SkipBands the CPU and GPU measurement.
#
# It builds the pages first (pages.mjs, Node 22.18 or later). Each page runs in its own
# Edge with a throwaway profile under out/, so only the benchmark's processes are counted
# and your own Edge is left alone. CPU is the sum over those processes as a percent of
# one core; GPU the average utilization of their GPU engines. Each figure is the median
# of the rounds; with the defaults a run takes about three and a half minutes. Light use
# of the machine is fine; games, video or builds skew it.
#
# The window is 1460 by 700: at 140 px tall, headless Edge stops animating the band page,
# and every mode then measures the same as a still band.

param(
	[string]$Base = 'master',
	[int]$Rounds = 3,
	[int]$Seconds = 10,
	[string]$Browser = '',
	[switch]$SkipFrames,
	[switch]$SkipBands
)

$ErrorActionPreference = 'Stop'
$Out = Join-Path $PSScriptRoot 'out'

if (-not $Browser) {
	$Browser = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
		Where-Object { Test-Path $_ } | Select-Object -First 1
	if (-not $Browser) { throw 'Microsoft Edge was not found; pass -Browser <path to msedge.exe or chrome.exe>.' }
}
$ProcessName = [IO.Path]::GetFileName($Browser)

node (Join-Path $PSScriptRoot 'pages.mjs') --base $Base
if ($LASTEXITCODE -ne 0) { throw 'pages.mjs failed.' }

function Get-PageUrl([string]$Page) { 'file:///' + ((Join-Path $Out $Page) -replace '\\', '/') }

# The processes of the Edge started with this profile.
function Get-ProfileProcess([string]$ProfileDir) {
	Get-CimInstance Win32_Process -Filter "Name='$ProcessName'" | Where-Object { $_.CommandLine -like "*$ProfileDir*" }
}

function Get-CpuTicks([int[]]$Ids) {
	$ticks = 0
	foreach ($p in (Get-Process -Id $Ids -ErrorAction SilentlyContinue)) { $ticks += $p.TotalProcessorTime.Ticks }
	$ticks
}

function Measure-Page([string]$Page) {
	$profileDir = Join-Path $Out ('profile-' + [guid]::NewGuid().ToString('N'))
	$arguments = @('--headless=new', '--enable-gpu-rasterization', '--force-device-scale-factor=1', '--window-size=1460,700', "--user-data-dir=$profileDir", '--no-first-run', (Get-PageUrl $Page))
	Start-Process -FilePath $Browser -ArgumentList $arguments | Out-Null
	try {
		Start-Sleep -Seconds 3
		$ids = @((Get-ProfileProcess $profileDir).ProcessId)
		$ticks0 = Get-CpuTicks $ids
		$start = Get-Date
		# One counter query for the whole window, a sample a second; an instance names its process (pid_<id>_...).
		$mine = '^pid_(' + ($ids -join '|') + ')_'
		$samples = Get-Counter '\GPU Engine(*)\Utilization Percentage' -SampleInterval 1 -MaxSamples $Seconds -ErrorAction SilentlyContinue
		$gpu = foreach ($set in $samples) { ($set.CounterSamples | Where-Object { $_.InstanceName -match $mine } | Measure-Object CookedValue -Sum).Sum }
		$elapsed = ((Get-Date) - $start).TotalSeconds
		$cpu = ((Get-CpuTicks $ids) - $ticks0) / 1e7 / $elapsed * 100
		[pscustomobject]@{ Page = $Page; Cpu = $cpu; Gpu = ($gpu | Measure-Object -Average).Average }
	} finally {
		Get-ProfileProcess $profileDir | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
		Start-Sleep -Seconds 1
		Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
	}
}

function Get-Median([double[]]$Values) {
	$sorted = $Values | Sort-Object
	$sorted[[math]::Floor($sorted.Count / 2)]
}

# The pixel comparison (compare.mjs): the largest channel difference of two screenshots,
# and how many pixels differ by at least 4, 9 and 17 of 255.
function Compare-Png([string]$A, [string]$B) {
	$json = node (Join-Path $PSScriptRoot 'compare.mjs') $A $B
	if ($LASTEXITCODE -ne 0) { throw "compare.mjs failed on $A and $B." }
	$json | ConvertFrom-Json
}

if (-not $SkipFrames) {
	foreach ($side in 'base', 'work') {
		foreach ($frame in 'rest', 'mid', 'peak') {
			$png = Join-Path $Out "frame-$side-$frame.png"
			Remove-Item $png -ErrorAction SilentlyContinue
			$profileDir = Join-Path $Out ('profile-' + [guid]::NewGuid().ToString('N'))
			& $Browser --headless=new --hide-scrollbars --force-device-scale-factor=2 --window-size=900,260 "--user-data-dir=$profileDir" --no-first-run "--screenshot=$png" (Get-PageUrl "frame-$side-$frame.html") 2>&1 | Out-Null
			Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
			if (-not (Test-Path $png)) { throw "No screenshot of frame-$side-$frame.html." }
		}
	}
	$pulse = Compare-Png (Join-Path $Out 'frame-base-rest.png') (Join-Path $Out 'frame-base-peak.png')
	'Frames, working tree against base (largest channel difference of 255; pixels differing by 4, 9, 17 or more):'
	foreach ($frame in 'rest', 'mid', 'peak') {
		$d = Compare-Png (Join-Path $Out "frame-base-$frame.png") (Join-Path $Out "frame-work-$frame.png")
		'  {0,-5} max {1,3}   >=4: {2,7}   >=9: {3,7}   >=17: {4,7}   of {5}' -f $frame, $d.max, $d.over4, $d.over9, $d.over17, $d.pixels
	}
	"  For scale, the base's own pulse moves pixels by up to $($pulse.max) between rest and peak."
	''
}

if ($SkipBands) { return }

# Both versions in both looks under `always`, and one still band: the floor, the page drawn once.
$pages = @('bars', 'dots' | ForEach-Object { "band-base-$_-always.html", "band-work-$_-always.html" }) + 'band-work-dots-still.html'
$results = foreach ($round in 1..$Rounds) {
	foreach ($page in $pages) {
		Write-Host "round $round of ${Rounds}: $page"
		Measure-Page $page
	}
}

"Bands, median of $Rounds rounds of $Seconds s (CPU as a percent of one core):"
$results | Group-Object Page | ForEach-Object {
	[pscustomobject]@{
		Page = $_.Name
		'CPU %' = [math]::Round((Get-Median $_.Group.Cpu), 1)
		'GPU %' = [math]::Round((Get-Median $_.Group.Gpu), 1)
		'CPU per round' = ($_.Group.Cpu | ForEach-Object { [math]::Round($_, 1) }) -join ' / '
	}
} | Format-Table -AutoSize
