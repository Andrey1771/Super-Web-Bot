#!/usr/bin/env bash
set -euo pipefail

if command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is already installed: $(ffmpeg -version | head -n 1)"
  exit 0
fi

if [[ "${OSTYPE:-}" == "darwin"* ]]; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew is required on macOS. Install it from https://brew.sh/"
    exit 1
  fi
  brew update
  brew install ffmpeg
  exit 0
fi

if [[ -f /etc/debian_version ]]; then
  sudo apt-get update
  sudo apt-get install -y ffmpeg
  exit 0
fi

if [[ -f /etc/redhat-release ]]; then
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y ffmpeg
  else
    sudo yum install -y ffmpeg
  fi
  exit 0
fi

echo "Unsupported OS. Install ffmpeg manually: https://ffmpeg.org/download.html"
exit 1
