# Fresh dev restart: clean orphaned Tauri/WebView2 processes, then launch Tauri + Vite.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$bun = Get-Command bun.exe -ErrorAction SilentlyContinue
if ($null -eq $bun) {
  $bun = Get-Command bun -ErrorAction Stop
}

& "$PSScriptRoot/kill-dev.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Starting fresh Tauri dev..."
& $bun.Source run tauri dev
