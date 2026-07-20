#!/bin/bash

# Stable, one-action entry point for desktop launchers.  The individual
# scripts retain the safety checks; this file only makes apply/pause/restore
# unambiguous for one-click use.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"

case "${1:-}" in
  apply)
    shift
    exec "$SCRIPT_DIR/start-newskin-macos.sh" --prompt-restart "$@"
    ;;
  pause)
    shift
    exec "$SCRIPT_DIR/pause-newskin-macos.sh" "$@"
    ;;
  restore)
    shift
    exec "$SCRIPT_DIR/restore-newskin-macos.sh" --restore-base-theme --restart-codex "$@"
    ;;
  status)
    shift
    exec "$SCRIPT_DIR/status-newskin-macos.sh" "$@"
    ;;
  *)
    printf 'Usage: %s <apply|pause|restore|status> [options]\n' "$(basename "$0")" >&2
    exit 64
    ;;
esac
