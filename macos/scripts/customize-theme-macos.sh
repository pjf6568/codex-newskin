#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

IMAGE=""
VIDEO=""
BANNER=""
THEME_NAME=""
TAGLINE=""
QUOTE=""
ACCENT="#7cff46"
SECONDARY="#36d7e8"
HIGHLIGHT="#642a8c"
SAFE_AREA="auto"
TASK_MODE="off"
FOCUS_X=""
FOCUS_Y=""
APPLY_NOW="true"
RESET_DEMO="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --image) IMAGE="${2:-}"; shift 2 ;;
    --video) VIDEO="${2:-}"; shift 2 ;;
    --banner) BANNER="${2:-}"; shift 2 ;;
    --name) THEME_NAME="${2:-}"; shift 2 ;;
    --tagline) TAGLINE="${2:-}"; shift 2 ;;
    --quote) QUOTE="${2:-}"; shift 2 ;;
    --accent) ACCENT="${2:-}"; shift 2 ;;
    --secondary) SECONDARY="${2:-}"; shift 2 ;;
    --highlight) HIGHLIGHT="${2:-}"; shift 2 ;;
    --safe-area) SAFE_AREA="${2:-}"; shift 2 ;;
    --task-mode) TASK_MODE="${2:-}"; shift 2 ;;
    --focus-x) FOCUS_X="${2:-}"; shift 2 ;;
    --focus-y) FOCUS_Y="${2:-}"; shift 2 ;;
    --no-apply) APPLY_NOW="false"; shift ;;
    --reset-demo) RESET_DEMO="true"; shift ;;
    *) fail "Unknown customize argument: $1" ;;
  esac
done

discover_codex_app
require_macos_runtime
ensure_state_root

if [ "$RESET_DEMO" = "true" ]; then
  "$NODE" "$SCRIPT_DIR/write-theme.mjs" reset-demo --output-dir "$THEME_DIR"
else
  [ -z "$IMAGE" ] || [ -z "$VIDEO" ] || fail "Pass either --image or --video, not both."
  [ -z "$VIDEO" ] || [ -z "$BANNER" ] || fail "Video themes cannot use --banner."
  # Ask for confirmation before touching the managed theme directory. The old
  # order selected/conformed an image first and then asked for a name, leaving
  # an orphan image when the second dialog was cancelled.
  if [ -z "$THEME_NAME" ]; then
    THEME_NAME="$(/usr/bin/osascript -e 'text returned of (display dialog "给这套主题起个名字。确认后才会选择图片。" default answer "我的 Codex Newskin" buttons {"取消", "继续"} default button "继续")')" \
      || fail "Theme setup was cancelled before any image was imported."
  fi
  if [ -z "$IMAGE" ] && [ -z "$VIDEO" ]; then
    IMAGE="$(/usr/bin/osascript -e 'POSIX path of (choose file with prompt "选择一张主题图片（建议横向、宽度 2000px 以上）" of type {"public.image"})')" \
      || fail "Image selection was cancelled."
  fi
  MEDIA_TYPE="image"
  MEDIA_SOURCE="$IMAGE"
  if [ -n "$VIDEO" ]; then
    MEDIA_TYPE="video"
    MEDIA_SOURCE="$VIDEO"
  fi
  [ -f "$MEDIA_SOURCE" ] || fail "Selected $MEDIA_TYPE does not exist: $MEDIA_SOURCE"
  SOURCE_BYTES="$(/usr/bin/stat -f '%z' "$MEDIA_SOURCE")"
  if [ "$MEDIA_TYPE" = "video" ]; then
    [ "$SOURCE_BYTES" -le 33554432 ] || fail "Selected video is larger than 32 MB. Choose a smaller file."
  else
    [ "$SOURCE_BYTES" -le 52428800 ] || fail "Selected image is larger than 50 MB. Choose a smaller file."
  fi

  if [ -z "$TAGLINE" ]; then TAGLINE="把喜欢的画面变成可交互的 Codex 工作台。"; fi
  if [ -z "$QUOTE" ]; then QUOTE="MAKE SOMETHING WONDERFUL"; fi

  /bin/mkdir -p "$THEME_DIR"
  /bin/chmod 700 "$THEME_DIR"
  if [ "$MEDIA_TYPE" = "video" ]; then
    video_extension="${VIDEO##*.}"
    video_extension="$(printf '%s' "$video_extension" | /usr/bin/tr '[:upper:]' '[:lower:]')"
    case "$video_extension" in mp4|webm|mov) ;; *) fail "Video must be MP4, WebM, or MOV." ;; esac
    image_name="background-$(/bin/date '+%Y%m%d-%H%M%S')-$$.$video_extension"
  else
    image_name="background-$(/bin/date '+%Y%m%d-%H%M%S')-$$.jpg"
  fi
  temporary="$THEME_DIR/.${image_name}.tmp"
  prepared="$THEME_DIR/$image_name"
  banner_temporary=""
  banner_prepared=""
  library_stage=""
  THEME_COMMITTED="false"
  cleanup_temporary() {
    /bin/rm -f "$temporary" "${banner_temporary:-}"
    [ -z "${library_stage:-}" ] || /bin/rm -rf "$library_stage"
    if [ "$THEME_COMMITTED" != "true" ]; then
      /bin/rm -f "$prepared" "${banner_prepared:-}"
    fi
  }
  trap cleanup_temporary EXIT
  if [ "$MEDIA_TYPE" = "video" ]; then
    /bin/cp "$MEDIA_SOURCE" "$temporary"
  else
    /usr/bin/sips -s format jpeg -s formatOptions 84 -Z 3200 "$MEDIA_SOURCE" --out "$temporary" >/dev/null \
      || fail "macOS could not convert the selected image. Use PNG, JPEG, HEIC, TIFF, or WebP."
  fi
  [ -s "$temporary" ] || fail "The converted image is empty."
  PREPARED_BYTES="$(/usr/bin/stat -f '%z' "$temporary")"
  if [ "$MEDIA_TYPE" = "video" ]; then
    [ "$PREPARED_BYTES" -le 33554432 ] || fail "The prepared video is larger than 32 MB."
  else
    [ "$PREPARED_BYTES" -le 16777216 ] || fail "The prepared image is larger than 16 MB. Choose a simpler or smaller image."
  fi
  /bin/mv -f "$temporary" "$prepared"
  /bin/chmod 600 "$prepared"

  if [ -n "$BANNER" ]; then
    [ -f "$BANNER" ] || fail "Selected banner does not exist: $BANNER"
    BANNER_BYTES="$(/usr/bin/stat -f '%z' "$BANNER")"
    [ "$BANNER_BYTES" -le 52428800 ] || fail "Selected banner is larger than 50 MB. Choose a smaller file."
    banner_name="banner-$(/bin/date '+%Y%m%d-%H%M%S')-$$.jpg"
    banner_temporary="$THEME_DIR/.${banner_name}.tmp.jpg"
    banner_prepared="$THEME_DIR/$banner_name"
    /usr/bin/sips -s format jpeg -s formatOptions 84 -Z 3200 "$BANNER" --out "$banner_temporary" >/dev/null \
      || fail "macOS could not convert the selected banner. Use PNG, JPEG, HEIC, TIFF, or WebP."
    [ -s "$banner_temporary" ] || fail "The converted banner is empty."
    [ "$(/usr/bin/stat -f '%z' "$banner_temporary")" -le 16777216 ] \
      || fail "The prepared banner is larger than 16 MB. Choose a simpler or smaller image."
    /bin/mv -f "$banner_temporary" "$banner_prepared"
    /bin/chmod 600 "$banner_prepared"
    banner_temporary=""
  fi

  # macOS ships Bash 3.2: do not expand optional arrays under `set -u`.
  # Build the Node argument vector with positional parameters instead.
  set -- custom --output-dir "$THEME_DIR" \
    --name "$THEME_NAME" --tagline "$TAGLINE" --quote "$QUOTE" \
    --accent "$ACCENT" --secondary "$SECONDARY" --highlight "$HIGHLIGHT" \
    --safe-area "$SAFE_AREA" --task-mode "$TASK_MODE"
  if [ "$MEDIA_TYPE" = "video" ]; then set -- "$@" --video "$image_name"; else set -- "$@" --image "$image_name"; fi
  [ -z "$FOCUS_X" ] || set -- "$@" --focus-x "$FOCUS_X"
  [ -z "$FOCUS_Y" ] || set -- "$@" --focus-y "$FOCUS_Y"
  [ -z "$BANNER" ] || set -- "$@" --banner "$banner_name"
  "$NODE" "$SCRIPT_DIR/write-theme.mjs" "$@"
  THEME_COMMITTED="true"

  # An imported image is a real saved theme, not a disposable active-file
  # replacement. Stage a snapshot first so later preset switches cannot erase
  # this custom pack or mix its config with another image.
  THEME_ID="$("$NODE" -e 'const t=require(process.argv[1]); process.stdout.write(String(t.id || ""))' "$THEME_DIR/theme.json")"
  case "$THEME_ID" in custom-[0-9]*) ;; *) fail "Custom theme did not receive a safe custom-* id." ;; esac
  THEMES_ROOT="$STATE_ROOT/themes"
  LIBRARY_DIR="$THEMES_ROOT/$THEME_ID"
  /bin/mkdir -p "$THEMES_ROOT"
  /bin/chmod 700 "$THEMES_ROOT"
  [ ! -e "$LIBRARY_DIR" ] || fail "A saved theme already uses id $THEME_ID; active theme was left intact."
  library_stage="$(/usr/bin/mktemp -d "$STATE_ROOT/.theme-library.XXXXXX")"
  /bin/chmod 700 "$library_stage"
  "$NODE" "$SCRIPT_DIR/stage-theme.mjs" "$THEME_DIR" "$library_stage" >/dev/null
  "$NODE" "$INJECTOR" --check-payload --theme-dir "$library_stage" >/dev/null
  /bin/mv "$library_stage" "$LIBRARY_DIR"
  library_stage=""
  /usr/bin/find "$THEME_DIR" -maxdepth 1 -type f -name 'background-*' ! -name "$image_name" -delete
  trap - EXIT
fi

if [ "$APPLY_NOW" = "true" ]; then
  alert_user "主题已保存。接下来只会执行一次受控 Codex 启动；如已打开 Codex，请在下一步确认重启。"
  if ! "$SCRIPT_DIR/start-newskin-macos.sh" --port 9341 --prompt-restart --refresh-running; then
    alert_user "主题已保存，但未能应用。Codex 没有被循环重启；请查看启动窗口中的错误后重试。"
    exit 1
  fi
fi

printf 'Codex Newskin theme is ready.\n'
