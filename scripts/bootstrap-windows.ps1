# Installs everything a Windows machine needs to BUILD this app from source.
#
# You only need this if you are building locally. To just *run* the app, grab
# the installer from the repo's Actions tab -> "Windows installer" -> the
# `broadcast-graphics-engine-windows` artifact. That path needs none of this.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap-windows.ps1
#
# Everything here is idempotent: already-installed components are skipped, so
# re-running after a partial failure is safe.

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "`n=== $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  ok   $msg" -ForegroundColor Green }
function Write-Skip($msg) { Write-Host "  --   $msg" -ForegroundColor DarkGray }

function Test-Command($name) {
  $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

# winget ships with Windows 11 and current Windows 10. Without it there is no
# unattended install path, and pointing at the download pages beats failing
# with a confusing "command not found" ten lines later.
if (-not (Test-Command winget)) {
  Write-Host @"
winget was not found, so this script cannot install anything automatically.

Either install App Installer from the Microsoft Store (which provides winget)
and re-run this, or install these three by hand:

  Rust               https://rustup.rs
  VS Build Tools     https://visualstudio.microsoft.com/visual-cpp-build-tools/
                     (select the 'Desktop development with C++' workload)
  Bun                https://bun.sh  (or Node 20+ from https://nodejs.org)
"@ -ForegroundColor Yellow
  exit 1
}

function Install-Package($id, $label, $probe, $extraArgs = @()) {
  Write-Step $label
  if ($probe -and (Test-Command $probe)) {
    Write-Skip "$label already present ($((Get-Command $probe).Source))"
    return
  }
  $args = @(
    "install", "--id", $id, "--exact",
    "--accept-package-agreements", "--accept-source-agreements",
    "--disable-interactivity"
  ) + $extraArgs
  & winget @args
  # 0 = installed, 0x8A150061 (-1978335135) = already installed. Both fine.
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335135) {
    throw "winget failed to install $id (exit $LASTEXITCODE)"
  }
  Write-Ok $label
}

Install-Package "Rustlang.Rustup" "Rust toolchain (rustup)" "cargo"

# Tauri links with MSVC. The C++ workload is the part that matters; without it
# the build dies at the very end with "linker `link.exe` not found" — after a
# ten-minute compile. --override passes the workload selection to the VS
# installer, which winget cannot express on its own.
Write-Step "Visual Studio Build Tools (Desktop development with C++)"
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$haveCpp = $false
if (Test-Path $vswhere) {
  $found = & $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if ($found) { $haveCpp = $true }
}
if ($haveCpp) {
  Write-Skip "MSVC C++ tools already installed"
} else {
  winget install --id Microsoft.VisualStudio.2022.BuildTools --exact `
    --accept-package-agreements --accept-source-agreements --disable-interactivity `
    --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335135) {
    throw "Build Tools install failed (exit $LASTEXITCODE). Install by hand from https://visualstudio.microsoft.com/visual-cpp-build-tools/"
  }
  Write-Ok "Visual Studio Build Tools"
}

# Windows 11 and patched Windows 10 already have the Evergreen runtime; this is
# only for older or stripped installs.
Write-Step "WebView2 runtime"
$wv2 = (Test-Path "${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application") -or
       (Test-Path "$env:ProgramFiles\Microsoft\EdgeWebView\Application")
if ($wv2) {
  Write-Skip "WebView2 already installed"
} else {
  winget install --id Microsoft.EdgeWebView2Runtime --exact `
    --accept-package-agreements --accept-source-agreements --disable-interactivity
  Write-Ok "WebView2 runtime"
}

Install-Package "Oven-sh.Bun" "Bun" "bun"

Write-Host @"

Prerequisites installed.

Open a NEW terminal — PATH changes from these installers do not reach this
one — then from the project directory:

  bun install
  bun run doctor        # confirms all of the above actually resolved
  bun run tauri dev     # first build compiles Rust: 5-15 minutes

To produce an installer instead of a dev build:

  bun run tauri build   # writes .msi and .exe under src-tauri/target/release/bundle
"@ -ForegroundColor Green
