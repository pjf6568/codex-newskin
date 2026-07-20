#!/bin/bash
set -euo pipefail
INSTALLED="$HOME/.codex/codex-newskin/scripts/manage-newskin-macos.sh"
if [ ! -x "$INSTALLED" ]; then
  /usr/bin/osascript -e 'display alert "没有找到已安装的 Codex Newskin。" as warning' >/dev/null
  exit 1
fi
exec "$INSTALLED" pause
