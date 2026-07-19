#!/bin/bash

# Sync one project preset into the current user's Newskin library, then apply it.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

THEME_ID=""
APPLY_NOW="true"
stage=""
previous=""

cleanup() {
  local code="$1"
  [ -z "$stage" ] || /bin/rm -rf "$stage"
  if [ "$code" -ne 0 ] && [ -n "$previous" ] && [ ! -e "$THEMES_ROOT/$THEME_ID" ]; then
    /bin/mv "$previous" "$THEMES_ROOT/$THEME_ID" 2>/dev/null || true
  fi
}
trap 'cleanup "$?"' EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    --id)
      [ "$#" -ge 2 ] || fail "Missing value for --id"
      THEME_ID="$2"
      shift 2
      ;;
    --no-apply)
      APPLY_NOW="false"
      shift
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

[ -n "$THEME_ID" ] || fail "Usage: sync-preset-macos.sh --id preset-<slug> [--no-apply]"
case "$THEME_ID" in
  preset-[A-Za-z0-9_-]*) ;;
  *) fail "Theme id must use the preset-<slug> form." ;;
esac
[ "$(printf '%s' "$THEME_ID" | /usr/bin/wc -c | /usr/bin/tr -d ' ')" -le 80 ]   || fail "Theme id is too long."

PRESETS_ROOT="$PROJECT_ROOT/presets"
SOURCE="$PRESETS_ROOT/$THEME_ID"
[ -d "$SOURCE" ] || fail "Project preset not found: $THEME_ID"
[ -f "$SOURCE/theme.json" ] || fail "theme.json missing in project preset: $THEME_ID"

ensure_state_root
ensure_node_runtime
THEMES_ROOT="$STATE_ROOT/themes"
/bin/mkdir -p "$THEMES_ROOT"
/bin/chmod 700 "$THEMES_ROOT"

presets_root_real="$(cd "$PRESETS_ROOT" && pwd -P)"
source_real="$(cd "$SOURCE" && pwd -P)"
case "$source_real/" in
  "$presets_root_real/"*) ;;
  *) fail "Project preset escapes the presets directory." ;;
esac

stage="$(/usr/bin/mktemp -d "$STATE_ROOT/.preset-sync.XXXXXX")"
/bin/chmod 700 "$stage"
"$NODE" "$SCRIPT_DIR/stage-theme.mjs" "$SOURCE" "$stage" >/dev/null
"$NODE" "$INJECTOR" --check-payload --theme-dir "$stage" >/dev/null
/bin/chmod 600 "$stage"/*

DESTINATION="$THEMES_ROOT/$THEME_ID"
if [ -L "$DESTINATION" ]; then
  fail "Refusing to replace a symlinked theme destination: $THEME_ID"
fi
if [ -e "$DESTINATION" ]; then
  previous="$THEMES_ROOT/.$THEME_ID.previous.$$"
  /bin/mv "$DESTINATION" "$previous"
fi
if ! /bin/mv "$stage" "$DESTINATION"; then
  [ -z "$previous" ] || /bin/mv "$previous" "$DESTINATION" 2>/dev/null || true
  previous=""
  fail "Could not publish preset to the local theme library: $THEME_ID"
fi
stage=""
[ -z "$previous" ] || /bin/rm -rf "$previous"
previous=""

printf 'Synced preset: %s\n' "$THEME_ID"

# The local project is the source of truth for this workflow. Applying through
# its switcher reloads any matching renderer/CSS change with the preset, rather
# than leaving a previously installed engine copy in control.
switch_script="$SCRIPT_DIR/switch-theme-macos.sh"
if [ "$APPLY_NOW" = "true" ]; then
  exec "$switch_script" --id "$THEME_ID"
fi
exec "$switch_script" --id "$THEME_ID" --no-apply
