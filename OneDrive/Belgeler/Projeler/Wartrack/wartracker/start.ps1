$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendPath = Join-Path $root "frontend"
$backendPath = Join-Path $root "backend"
$logsPath = Join-Path $root ".logs"

New-Item -ItemType Directory -Force -Path $logsPath | Out-Null

$frontendOut = Join-Path $logsPath "frontend.out.log"
$frontendErr = Join-Path $logsPath "frontend.err.log"
$backendOut = Join-Path $logsPath "backend.out.log"
$backendErr = Join-Path $logsPath "backend.err.log"

function Test-PortListening {
  param(
    [int]$Port
  )

  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return $null -ne $listener
}

if (Test-PortListening -Port 5173) {
  Write-Host "WARTRACKER frontend already running on :5173"
} else {
  Write-Host "Starting WARTRACKER frontend on :5173"
  Start-Process -FilePath "pnpm.cmd" -ArgumentList "dev" -WorkingDirectory $frontendPath -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr | Out-Null
}

if (Test-PortListening -Port 3001) {
  Write-Host "WARTRACKER backend already running on :3001"
} else {
  Write-Host "Starting WARTRACKER backend on :3001"
  Start-Process -FilePath "pnpm.cmd" -ArgumentList "dev" -WorkingDirectory $backendPath -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr | Out-Null
}

Write-Host "WARTRACKER services started."
Write-Host "Frontend logs: $frontendOut"
Write-Host "Backend logs: $backendOut"
