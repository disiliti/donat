#!/usr/bin/env bash
set -e
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$REPO_DIR/app"
PM2_NAME="donutbot"
NODE_BIN="$(command -v node || true)"
NPM_BIN="$(command -v npm || true)"
PM2_BIN="$(command -v pm2 || true)"
function need_root() {
  if [ "$EUID" -ne 0 ]; then
    echo "Please run as root: sudo $0"
    exit 1
  fi
}

need_root

# Stop and delete PM2 app
if [ -n "$PM2_BIN" ]; then
  "$PM2_BIN" delete "$PM2_NAME" || true
  "$PM2_BIN" save || true
fi

echo "Bot dihentikan. Repo tetap ada di: $REPO_DIR"
echo "Jika ingin hapus repo: rm -rf \"$REPO_DIR\""
echo "✅ Uninstall selesai."
