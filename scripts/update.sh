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

cd "$REPO_DIR"
if [ -d ".git" ]; then
  sudo -u "$SUDO_USER" git pull --rebase || true
else
  echo "Repo tidak mengandung .git (mungkin hasil upload ZIP). Lewati git pull."
fi

cd "$APP_DIR"
npm install
[ -n "$PM2_BIN" ] && "$PM2_BIN" restart "$PM2_NAME" || node index.js &

echo "✅ Update selesai."
