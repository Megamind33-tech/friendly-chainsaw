# Windows-safe cleanup for a genuinely fresh Tauri/WebView2 dev launch.
#
# WebView2 renderers are not reliable children of broadcast-engine.exe on
# Windows. They can outlive the Tauri host and keep the fixed CDP port (9222)
# bound, so a "fresh" verification run can accidentally attach to stale page
# state unless we clean up both the host and app-scoped msedgewebview2.exe
# processes.
[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

$appProcessNames = @("broadcast-engine")
$appCommandLineMarkers = @(
  "com.broadcastengine.app",
  "broadcast-engine",
  "Broadcast Graphics Engine"
)

$devPorts = @(1420, 1421, 1422, 1423, 4977, 9222)
$requiredFreshPorts = @(1423, 4977, 9222)
$expectedPortProcessNames = @("broadcast-engine", "node", "bun", "msedgewebview2")

function Test-AppCommandLine {
  param([string]$CommandLine)

  if ([string]::IsNullOrWhiteSpace($CommandLine)) {
    return $false
  }

  foreach ($marker in $appCommandLineMarkers) {
    if ($CommandLine.IndexOf($marker, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
      return $true
    }
  }

  return $false
}

function Get-CimProcessById {
  param([int]$ProcessId)

  try {
    return Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
  } catch {
    return $null
  }
}

function Get-AppWebViewProcesses {
  Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe' AND (CommandLine LIKE '%com.broadcastengine.app%' OR CommandLine LIKE '%broadcast-engine%' OR CommandLine LIKE '%Broadcast Graphics Engine%')" -ErrorAction SilentlyContinue
}

function Stop-DevProcess {
  param(
    [int]$ProcessId,
    [string]$Reason
  )

  if ($ProcessId -eq $PID) {
    return
  }

  try {
    $process = Get-Process -Id $ProcessId -ErrorAction Stop
    Write-Host "Stopping $($process.ProcessName) PID $ProcessId ($Reason)"
    Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    Wait-Process -Id $ProcessId -Timeout 5 -ErrorAction SilentlyContinue

    if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
      Write-Host "PID $ProcessId is still exiting; forcing process tree..."
      & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
      Wait-Process -Id $ProcessId -Timeout 5 -ErrorAction SilentlyContinue
    }
  } catch {
    if ($_.Exception.Message -notmatch "Cannot find a process") {
      Write-Host "Could not stop PID $ProcessId ($Reason): $($_.Exception.Message)" -ForegroundColor Yellow
    }
  }
}

function Get-DevPortListeners {
  param([int[]]$Ports)

  try {
    Get-NetTCPConnection -LocalPort $Ports -State Listen -ErrorAction Stop |
      Select-Object LocalPort, OwningProcess -Unique
  } catch {
    @()
  }
}

Write-Host "Cleaning Broadcast Graphics Engine dev processes..."

foreach ($name in $appProcessNames) {
  Get-Process -Name $name -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-DevProcess -ProcessId $_.Id -Reason "Tauri host" }
}

for ($attempt = 1; $attempt -le 5; $attempt++) {
  $webViewProcesses = @(Get-AppWebViewProcesses)
  if ($webViewProcesses.Count -eq 0) {
    break
  }

  foreach ($process in $webViewProcesses) {
    Stop-DevProcess -ProcessId $process.ProcessId -Reason "app-scoped WebView2 orphan"
  }

  Start-Sleep -Seconds 1
}

$listeners = @(Get-DevPortListeners -Ports $devPorts)
foreach ($listener in $listeners) {
    $process = Get-CimProcessById $listener.OwningProcess
    if ($null -eq $process) {
      continue
    }

    $name = [System.IO.Path]::GetFileNameWithoutExtension($process.Name).ToLowerInvariant()
    $isExpectedDevProcess = $expectedPortProcessNames -contains $name
    $isAppProcess = Test-AppCommandLine $process.CommandLine

    if ($isExpectedDevProcess -or $isAppProcess) {
      Stop-DevProcess -ProcessId $listener.OwningProcess -Reason "listener on port $($listener.LocalPort)"
    } else {
      Write-Host "Port $($listener.LocalPort) is held by $($process.Name) PID $($listener.OwningProcess); leaving unknown process running." -ForegroundColor Yellow
    }
}

Start-Sleep -Seconds 2

$blocked = @()
$remainingListeners = @(Get-DevPortListeners -Ports $requiredFreshPorts)
foreach ($listener in $remainingListeners) {
  $process = Get-CimProcessById $listener.OwningProcess
  if ($null -eq $process) {
    $blocked += "port $($listener.LocalPort) (PID $($listener.OwningProcess))"
  } else {
    $blocked += "port $($listener.LocalPort) ($($process.Name) PID $($listener.OwningProcess))"
  }
}

$remainingWebViews = @(Get-AppWebViewProcesses)

if ($remainingWebViews.Count -gt 0) {
  foreach ($process in $remainingWebViews) {
    $blocked += "WebView2 PID $($process.ProcessId)"
  }
}

if ($blocked.Count -gt 0) {
  Write-Host ""
  Write-Host "WARNING: fresh dev cleanup is still blocked:" -ForegroundColor Yellow
  foreach ($item in $blocked) {
    Write-Host "  - $item"
  }
  Write-Host ""
  Write-Host "End the listed processes manually, then rerun npm.cmd run dev:fresh or bun.exe run dev:fresh."
  exit 1
}

Write-Host "Fresh dev cleanup complete. Ports 1423, 4977, and CDP 9222 are free."
