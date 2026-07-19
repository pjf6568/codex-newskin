#!/bin/bash

# Apply the active Newskin palette to existing macOS Terminal tabs.
# Terminal is a native application, so this deliberately uses its documented
# AppleScript tab properties instead of the Codex renderer/CDP injector.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

THEME_SOURCE="$THEME_DIR"
QUIET="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --theme-dir) THEME_SOURCE="${2:-}"; shift 2 ;;
    --quiet) QUIET="true"; shift ;;
    *) fail "Unknown Terminal theme argument: $1" ;;
  esac
done

THEME_FILE="$THEME_SOURCE/theme.json"
[ -f "$THEME_FILE" ] || fail "Active theme.json was not found for Terminal synchronization."
TERMINAL_PROFILE="$(/usr/bin/plutil -extract 'Default Window Settings' raw "$HOME/Library/Preferences/com.apple.Terminal.plist" 2>/dev/null || true)"
case "$TERMINAL_PROFILE" in
  ''|*$'\n'*|*$'\r'*|????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????*)
    TERMINAL_PROFILE="Clear Dark"
    ;;
esac

read_color() {
  local key="$1"
  local fallback="$2"
  local value=""
  value="$(/usr/bin/plutil -extract "colors.$key" raw "$THEME_FILE" 2>/dev/null || true)"
  case "$value" in
    \#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]) printf '%s\n' "$value" ;;
    *) printf '%s\n' "$fallback" ;;
  esac
}

hex_to_terminal_color() {
  local hex="${1#\#}"
  local red green blue
  red=$((16#${hex:0:2} * 257))
  green=$((16#${hex:2:2} * 257))
  blue=$((16#${hex:4:2} * 257))
  printf '%s %s %s\n' "$red" "$green" "$blue"
}

BACKGROUND="$(read_color panel '#171513')"
TEXT="$(read_color text '#f3ead7')"
BOLD="$(read_color accentAlt '#e3c27a')"
CURSOR="$(read_color accent '#c8a55a')"

set -- $(hex_to_terminal_color "$BACKGROUND")
BACKGROUND_R="$1"; BACKGROUND_G="$2"; BACKGROUND_B="$3"
set -- $(hex_to_terminal_color "$TEXT")
TEXT_R="$1"; TEXT_G="$2"; TEXT_B="$3"
set -- $(hex_to_terminal_color "$BOLD")
BOLD_R="$1"; BOLD_G="$2"; BOLD_B="$3"
set -- $(hex_to_terminal_color "$CURSOR")
CURSOR_R="$1"; CURSOR_G="$2"; CURSOR_B="$3"

# Color values in Terminal's AppleScript dictionary are 16-bit RGB channels.
# This only changes live tabs, never the user's default Terminal profile, so
# closing a tab or using a different profile remains a safe, natural restore.
/usr/bin/osascript - \
  "$TERMINAL_PROFILE" \
  "$BACKGROUND_R" "$BACKGROUND_G" "$BACKGROUND_B" \
  "$TEXT_R" "$TEXT_G" "$TEXT_B" \
  "$BOLD_R" "$BOLD_G" "$BOLD_B" \
  "$CURSOR_R" "$CURSOR_G" "$CURSOR_B" <<'APPLESCRIPT' >/dev/null
on run argv
  set profileName to item 1 of argv
  set backgroundColor to {(item 2 of argv) as integer, (item 3 of argv) as integer, (item 4 of argv) as integer}
  set textColor to {(item 5 of argv) as integer, (item 6 of argv) as integer, (item 7 of argv) as integer}
  set boldColor to {(item 8 of argv) as integer, (item 9 of argv) as integer, (item 10 of argv) as integer}
  set cursorColor to {(item 11 of argv) as integer, (item 12 of argv) as integer, (item 13 of argv) as integer}
  tell application id "com.apple.Terminal"
    if exists settings set profileName then
      set targetProfile to settings set profileName
      set background color of targetProfile to backgroundColor
      set normal text color of targetProfile to textColor
      set bold text color of targetProfile to boldColor
      set cursor color of targetProfile to cursorColor
    end if
    repeat with terminalWindow in windows
      repeat with terminalTab in tabs of terminalWindow
        set background color of terminalTab to backgroundColor
        set normal text color of terminalTab to textColor
        set bold text color of terminalTab to boldColor
        set cursor color of terminalTab to cursorColor
      end repeat
    end repeat
  end tell
end run
APPLESCRIPT

if [ "$QUIET" != "true" ]; then
  printf 'Terminal tabs and default profile now follow the active Newskin palette (%s background, %s text).\n' "$BACKGROUND" "$TEXT"
fi
