#!/usr/bin/env bash
set -e
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sudo ln -sf "$REPO_DIR/scripts/donat" /usr/local/bin/donat
echo "✅ CLI 'donat' terpasang. Jalankan: donat"
