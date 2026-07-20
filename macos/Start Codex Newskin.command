#!/bin/bash
set -euo pipefail
INSTALLED="$HOME/.codex/codex-newskin/scripts/manage-newskin-macos.sh"
if [ ! -x "$INSTALLED" ]; then
  /usr/bin/osascript -e 'display alert "请先双击 Install Codex Newskin.command 完成安装。" as warning' >/dev/null
  exit 1
fi
exec "$INSTALLED" apply
