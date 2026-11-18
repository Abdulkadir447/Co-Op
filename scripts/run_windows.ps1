param(
    [ValidateSet("doctor", "backend", "frontend", "desktop", "android-test", "android-build")]
    [string]$Target = "doctor"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

switch ($Target) {
    "doctor" {
        python tools/coop_cli.py doctor
    }
    "backend" {
        Write-Host "Starting Co-op FastAPI backend on http://0.0.0.0:8000 (Android Emulator connects via http://10.0.2.2:8000)..."
        python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
    }
    "frontend" {
        pnpm --filter ./frontend dev
    }
    "desktop" {
        npm --prefix electron run build:renderer
        npm --prefix electron run start
    }
    "android-test" {
        Set-Location "$RepoRoot\android"
        gradle testDebugUnitTest
    }
    "android-build" {
        Set-Location "$RepoRoot\android"
        gradle assembleDebug
    }
}
