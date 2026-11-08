# Play the single-player build on your phone (any network) through a free Cloudflare quick tunnel.
# - Builds the game, serves dist/ + /api (voices, agents, notebook) on http://localhost:8080
# - Opens an HTTPS tunnel (needed for the microphone on phones) and prints the public link.
# No Cloudflare account needed. The link changes every run. Close this window (or Ctrl+C) to stop.
#
# Usage (PowerShell):   powershell -ExecutionPolicy Bypass -File E:\RoyalConcerns\game\play-on-phone.ps1
# Skip the rebuild:      ... -File play-on-phone.ps1 -NoBuild

param([switch]$NoBuild, [int]$Port = 8080)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "Installing cloudflared (free, no account)..." -ForegroundColor Yellow
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}

if (-not $NoBuild) {
  Write-Host "Building the game..." -ForegroundColor Cyan
  pnpm build
  if ($LASTEXITCODE -ne 0) { throw "Build failed" }
}

Write-Host "Starting game server on http://localhost:$Port ..." -ForegroundColor Cyan
$env:PORT = "$Port"
$server = Start-Process -FilePath "node" -ArgumentList "server/serve.mjs" -PassThru -NoNewWindow
Start-Sleep -Seconds 2

try {
  Write-Host ""
  Write-Host "Opening the tunnel. Look for the line with  https://....trycloudflare.com  below," -ForegroundColor Green
  Write-Host "then open that link on your phone (turn the phone sideways). Allow the microphone when asked." -ForegroundColor Green
  Write-Host ""
  cloudflared tunnel --no-autoupdate --url "http://localhost:$Port"
} finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
}
