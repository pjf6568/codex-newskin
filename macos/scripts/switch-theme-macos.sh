#!/bin/bash

# Switch to a theme pack under themes/<id>/ — hot path when CDP is live.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

THEME_ID=""
APPLY_NOW="true"
OPERATION_TOKEN=""
stage=""
previous_theme_config=""

finish_switch() {
  local code="$1"
  [ -z "${stage:-}" ] || /bin/rm -rf "$stage"
  [ -z "${previous_theme_config:-}" ] || /bin/rm -f "$previous_theme_config"
  if [ "$code" -ne 0 ] && [ -n "${OPERATION_TOKEN:-}" ]; then
    write_operation_state failed "主题切换未完成，应用结果未确认" "$OPERATION_TOKEN" 2>/dev/null || true
    finish_client_operation "${PORT:-9341}" error "主题切换未完成，应用结果未确认" \
      "$OPERATION_TOKEN" 1500 >/dev/null 2>&1 || true
  fi
}
trap 'finish_switch "$?"' EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    --id) THEME_ID="${2:-}"; shift 2 ;;
    --no-apply) APPLY_NOW="false"; shift ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

[ -n "$THEME_ID" ] || fail "Usage: switch-theme-macos.sh --id <theme-id>"
case "$THEME_ID" in
  *[!A-Za-z0-9_-]*|'') fail "Theme id may contain only letters, numbers, underscores, and hyphens." ;;
esac
[ "${#THEME_ID}" -le 80 ] || fail "Theme id is too long."

ensure_state_root
THEMES_ROOT="$STATE_ROOT/themes"
SRC="$THEMES_ROOT/$THEME_ID"
[ -d "$SRC" ] || fail "Theme not found: $THEME_ID"
[ -f "$SRC/theme.json" ] || fail "theme.json missing in $THEME_ID"
if [ "$APPLY_NOW" = "true" ]; then
  OPERATION_TOKEN="$(new_operation_token)"
  write_operation_state applying "正在切换主题" "$OPERATION_TOKEN" \
    || fail "Could not publish the theme switch operation state."
fi
ensure_node_runtime
themes_root_real="$(cd "$THEMES_ROOT" && pwd -P)"
src_real="$(cd "$SRC" && pwd -P)"
case "$src_real/" in "$themes_root_real/"*) ;; *) fail "Theme directory escapes the saved theme library." ;; esac

PORT=9341
if [ -f "$STATE_PATH" ]; then
  saved="$(state_field port 2>/dev/null || true)"
  [ -n "${saved:-}" ] && PORT="$saved"
fi
if [ -n "$OPERATION_TOKEN" ] && verified_cdp_endpoint "$PORT" 2>/dev/null; then
  begin_client_operation "$PORT" switch 3000 "$OPERATION_TOKEN" >/dev/null 2>&1 || true
fi

progress() {
  printf '%s\n' "$*" >&2
  notify_user "$*"
}

progress "Switching..."

stage="$(/usr/bin/mktemp -d "$STATE_ROOT/.theme-switch.XXXXXX")"
/bin/mkdir -p "$THEME_DIR"
/bin/chmod 700 "$stage"
if [ -f "$THEME_DIR/theme.json" ]; then
  previous_theme_config="$STATE_ROOT/.theme-previous.$$.json"
  /bin/cp -f "$THEME_DIR/theme.json" "$previous_theme_config"
  /bin/chmod 600 "$previous_theme_config"
fi
# Snapshot theme.json and its referenced image from stable, no-follow file
# descriptors. This closes the validation/copy TOCTOU window: after this
# command returns, edits or symlink swaps in themes/<id> cannot mix the pair
# that will be published to the live theme directory.
THEME_IMAGE="$("$NODE" "$SCRIPT_DIR/stage-theme.mjs" "$SRC" "$stage")" \
  || fail "Theme pack changed or failed staging: $THEME_ID"
# Validate the exact staged pair, not the mutable library directory. The
# injector performs the full schema, path, dimensions, and image checks.
"$NODE" "$INJECTOR" --check-payload --theme-dir "$stage" >/dev/null \
  || fail "Theme pack failed validation: $THEME_ID"
THEME_BYTES="$(/usr/bin/stat -f '%z' "$stage/$THEME_IMAGE")"
THEME_MEDIA_TYPE="$("$NODE" -e 'const t=require(process.argv[1]); process.stdout.write(t.mediaType === "video" ? "video" : "image")' "$stage/theme.json")"
THEME_MAX_BYTES=16777216
[ "$THEME_MEDIA_TYPE" != "video" ] || THEME_MAX_BYTES=33554432
[ "$THEME_BYTES" -gt 0 ] && [ "$THEME_BYTES" -le "$THEME_MAX_BYTES" ] \
  || fail "Theme $THEME_MEDIA_TYPE must be non-empty and within its size limit."
/bin/chmod 600 "$stage/"*
for entry in "$stage/"*; do
  [ -f "$entry" ] || continue
  [ "$(/usr/bin/basename "$entry")" = "theme.json" ] && continue
  /bin/mv -f "$entry" "$THEME_DIR/"
done
# theme.json is the commit marker: the watcher never observes a config that
# references a partially copied image or optional banner. Old assets are left
# in place; only the manifest decides what the injector may read.
/bin/mv -f "$stage/theme.json" "$THEME_DIR/theme.json"
/bin/rm -rf "$stage"
stage=""
if [ -n "$previous_theme_config" ]; then
  "$NODE" -e '
    const fs = require("fs"); const path = require("path");
    const [oldPath, nextPath, directory] = process.argv.slice(1);
    const names = (config) => [config?.image, config?.home?.banner]
      .filter((name) => typeof name === "string" && name && path.basename(name) === name);
    const oldNames = new Set(names(JSON.parse(fs.readFileSync(oldPath, "utf8"))));
    const nextNames = new Set(names(JSON.parse(fs.readFileSync(nextPath, "utf8"))));
    for (const name of oldNames) {
      if (!nextNames.has(name)) fs.rmSync(path.join(directory, name), { force: true });
    }
  ' "$previous_theme_config" "$THEME_DIR/theme.json" "$THEME_DIR"
  /bin/rm -f "$previous_theme_config"
  previous_theme_config=""
fi

THEME_NAME="$("$NODE" -e 'try{const t=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(t.name||"")}catch{}' "$THEME_DIR/theme.json" 2>/dev/null || true)"
[ -n "$THEME_NAME" ] || THEME_NAME="$THEME_ID"

# Page-level switching uses --no-apply because the watcher hot-reloads the
# staged files itself. Keep state.json in lockstep when that watcher is active
# so Restore/status never reports the previously selected custom theme.
if [ -f "$STATE_PATH" ] && [ "$(state_field session 2>/dev/null || true)" = "active" ]; then
  mark_state_active || fail "Theme files changed but active state could not be synchronized."
fi

if [ "$APPLY_NOW" != "true" ]; then
  progress "Ready: ${THEME_NAME} (not applied)"
  exit 0
fi

# Hot path: CDP already open → seconds, not tens of seconds
if hot_reapply_theme "$PORT" 8000 "$OPERATION_TOKEN"; then
  "$SCRIPT_DIR/sync-terminal-theme-macos.sh" --theme-dir "$THEME_DIR" --quiet >/dev/null 2>&1 || true
  progress "Done: ${THEME_NAME}"
  exit 0
fi

# Cold path only when debug port is missing
progress "CDP not ready, full start..."
if "$SCRIPT_DIR/start-newskin-macos.sh" --port "$PORT" --restart-existing; then
  progress "Done: ${THEME_NAME}"
  exit 0
fi

alert_user "Theme switched but inject failed. Click Apply Skin."
exit 1
