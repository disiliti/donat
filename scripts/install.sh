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

# 1) Install deps
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y curl git unzip

# 2) Node.js LTS
if [ -z "$NODE_BIN" ] || [ -z "$NPM_BIN" ]; then
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
fi

# 3) PM2
if [ -z "$PM2_BIN" ]; then
  npm install -g pm2
  PM2_BIN="$(command -v pm2)"
fi

# 4) Install app deps
cd "$APP_DIR"
npm install

# 5) Start with PM2
"$PM2_BIN" start index.js --name "$PM2_NAME"
"$PM2_BIN" save
"$PM2_BIN" startup -u "$SUDO_USER" --hp "/home/$SUDO_USER" >/dev/null || true

echo "✅ Install selesai. Jalankan 'donat' untuk membuka menu."
