param(
    [switch]$SkipUpdate
)

$ErrorActionPreference = "Stop"

if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
    $version = & ffmpeg -version | Select-Object -First 1
    Write-Host "ffmpeg is already installed: $version"
    exit 0
}

if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "Chocolatey is required. Install it from https://chocolatey.org/install"
    exit 1
}

if (-not $SkipUpdate) {
    choco upgrade chocolatey -y
}

choco install ffmpeg -y
