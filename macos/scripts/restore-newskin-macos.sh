#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

PORT=9341
PORT_EXPLICIT="false"
RESTORE_BASE_THEME="false"
RESTART_CODEX="false"
UNINSTALL="false"
HAS_RECORDED_SKIN="false"
NORMAL_RESTART_NEEDED="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; PORT_EXPLICIT="true"; shift 2 ;;
    --restore-base-theme) RESTORE_BASE_THEME="true"; shift ;;
    --restart-codex) RESTART_CODEX="true"; shift ;;
    --uninstall) UNINSTALL="true"; shift ;;
    *) fail "Unknown restore argument: $1" ;;
  esac
done

discover_codex_app
require_macos_runtime
ensure_state_root
if [ "$PORT_EXPLICIT" = "false" ] && [ -f "$STATE_PATH" ]; then
  PORT="$(state_field port)" || fail "Could not read the saved CDP port; state was preserved."
fi

if [ -f "$STATE_PATH" ]; then
  HAS_RECORDED_SKIN="true"
  stop_recorded_injector \
    || fail "Could not stop the recorded injector; restore state was preserved."
fi
# Always remove the themed ChatGPT launchd job so quitting ChatGPT stays quit.
release_codex_launchd_job || true
CODEX_RUNNING="false"
codex_is_running && CODEX_RUNNING="true"
DEBUG_READY="false"
verified_cdp_endpoint "$PORT" && DEBUG_READY="true"

# A bare CDP listener is not proof that Newskin owns this Codex instance.
# Only remove injected DOM when the state file identifies a skin session.
if [ "$HAS_RECORDED_SKIN" = "true" ] && [ "$DEBUG_READY" = "true" ]; then
  "$NODE" "$INJECTOR" --remove --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 8000 >/dev/null \
    || fail "The live skin could not be removed and verified; restore stopped safely."
elif [ "$HAS_RECORDED_SKIN" = "true" ] && [ "$CODEX_RUNNING" = "true" ]; then
  [ "$RESTART_CODEX" = "true" ] \
    || fail "ChatGPT is running but its recorded Newskin session cannot be verified. Pass --restart-codex for a full restore."
  NORMAL_RESTART_NEEDED="true"
fi

if [ "$RESTORE_BASE_THEME" = "true" ]; then
  # A fresh install can leave no backup (or a prior restore can already have
  # consumed it). Do not close a normal Codex session merely to discover that
  # there is nothing to restore.
  if [ ! -f "$THEME_BACKUP_PATH" ]; then
    printf 'No selective pre-install theme backup is present; current Codex appearance was left unchanged.\n'
  elif [ "$CODEX_RUNNING" = "true" ]; then
    [ "$RESTART_CODEX" = "true" ] \
      || fail "Close ChatGPT or pass --restart-codex before restoring config.toml."
    stop_codex true
    CODEX_RUNNING="false"
    NORMAL_RESTART_NEEDED="true"
    "$NODE" "$SCRIPT_DIR/theme-config.mjs" restore "$CONFIG_PATH" "$THEME_BACKUP_PATH"
  else
    "$NODE" "$SCRIPT_DIR/theme-config.mjs" restore "$CONFIG_PATH" "$THEME_BACKUP_PATH"
    # The caller explicitly asked to restart and restoring config while Codex
    # is closed is the one case where opening it normally is useful.
    [ "$RESTART_CODEX" = "true" ] && NORMAL_RESTART_NEEDED="true"
  fi
fi

if [ "$NORMAL_RESTART_NEEDED" = "true" ]; then
  [ "$CODEX_RUNNING" = "true" ] && stop_codex true
  launch_codex_normally
elif [ "$RESTART_CODEX" = "true" ]; then
  printf 'No active Newskin session or saved base-theme change required a Codex restart; left the current app session untouched.\n'
fi

/bin/rm -f "$STATE_PATH"
clear_operation_state
/bin/rm -f "$OPERATION_ACK_PATH"
if [ "$UNINSTALL" = "true" ]; then
  /bin/rm -f "$HOME/Desktop/Codex Newskin.command"
  /bin/rm -f "$HOME/Desktop/Codex Newskin - Customize.command"
  /bin/rm -f "$HOME/Desktop/Codex Newskin - Verify.command"
  /bin/rm -f "$HOME/Desktop/Codex Newskin - Restore.command"
fi

printf 'ChatGPT Newskin was removed and the requested macOS restore actions completed successfully.\n'
