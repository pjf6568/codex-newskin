#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
NODE="${NODE:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}"
[ -x "$NODE" ] || { printf 'Codex bundled Node.js was not found: %s\n' "$NODE" >&2; exit 1; }

while IFS= read -r file; do /bin/bash -n "$file"; done < <(
  /usr/bin/find "$ROOT" -type f \( -name '*.sh' -o -name '*.command' \) \
    ! -path '*/release/*' -print
)
while IFS= read -r file; do "$NODE" --check "$file" >/dev/null; done < <(
  /usr/bin/find "$ROOT/scripts" "$ROOT/assets" "$ROOT/presets" -type f \( -name '*.mjs' -o -name '*.js' \) -print
)

if /usr/bin/grep -R -n -E 'newskin-skin|NEWSKIN_SKIN|1\.0\.0-rc2' \
  "$ROOT/scripts" "$ROOT/assets" >/dev/null; then
  printf 'Legacy release-candidate identifiers remain in runtime files.\n' >&2
  exit 1
fi
if /usr/bin/grep -R -n -E '(writeFile|rename|copyFile|rm).*app\.asar' "$ROOT/scripts" >/dev/null; then
  printf 'A runtime script appears to mutate app.asar.\n' >&2
  exit 1
fi
if /usr/bin/grep -R -n --include='*.sh' -E '/usr/bin/python3|(^|[[:space:]])eval([[:space:]]|$)' \
  "$ROOT/scripts" "$ROOT/menubar" >/dev/null; then
  printf 'Runtime shell (scripts + menu bar) must parse JSON with bundled Node.js or plain shell, without python3 or eval.\n' >&2
  exit 1
fi
if /usr/bin/grep -R -n --include='*.sh' -E '/usr/bin/osascript[[:space:]]+-e[[:space:]]+"' \
  "$ROOT/scripts" "$ROOT/menubar" >/dev/null; then
  printf 'Dynamic AppleScript must be passed through argv, not interpolated into osascript -e.\n' >&2
  exit 1
fi
if ! /usr/bin/grep -F -q 'sfimage=paintpalette.fill' \
  "$ROOT/menubar/codex_newskin.10s.sh"; then
  printf 'SwiftBar menu title must retain the Newskin palette icon.\n' >&2
  exit 1
fi
if ! /usr/bin/grep -F -q 'flag: "wx"' "$ROOT/scripts/write-theme.mjs"; then
  printf 'Theme writes must create randomized temporary files exclusively.\n' >&2
  exit 1
fi
if /usr/bin/grep -E -q 'Input\.dispatch(KeyEvent|MouseEvent)' "$ROOT/scripts/injector.mjs"; then
  printf 'Screenshot capture must not dispatch renderer input events.\n' >&2
  exit 1
fi
if /usr/bin/grep -F -q '/usr/bin/open -na "$CODEX_BUNDLE" --args' \
  "$ROOT/scripts/start-newskin-macos.sh"; then
  printf 'Start must not launch a second competing Codex instance after launch_codex_with_cdp.\n' >&2
  exit 1
fi
if ! /usr/bin/grep -F -q 'acquire_start_lock' "$ROOT/scripts/start-newskin-macos.sh" ||
   ! /usr/bin/grep -F -q 'no second launch or restart was attempted' "$ROOT/scripts/start-newskin-macos.sh"; then
  printf 'Start must use the one-shot lock and no-op an already verified active session.\n' >&2
  exit 1
fi
if /usr/bin/grep -F -q 'banner_args[@]' "$ROOT/scripts/customize-theme-macos.sh"; then
  printf 'Customize must not expand an empty optional-banner array under macOS Bash 3.2 with nounset enabled.\n' >&2
  exit 1
fi
if ! /usr/bin/grep -F -q 'HAS_RECORDED_SKIN="true"' \
    "$ROOT/scripts/restore-newskin-macos.sh" ||
   ! /usr/bin/grep -F -q 'No selective pre-install theme backup is present' \
    "$ROOT/scripts/restore-newskin-macos.sh"; then
  printf 'Restore must distinguish a recorded skin session from a normal Codex session and skip a missing backup.\n' >&2
  exit 1
fi
if /usr/bin/grep -F -q 'CODEX_EXPECTED_TEAM_ID' "$ROOT/scripts/common-macos.sh" ||
    [ "$(/usr/bin/grep -F -c -- '--test-requirement' "$ROOT/scripts/common-macos.sh")" -lt 3 ]; then
  printf 'macOS runtime identity must use the fixed OpenAI signing requirement.\n' >&2
  exit 1
fi

"$NODE" "$ROOT/scripts/injector.mjs" --check-payload >/dev/null
"$NODE" "$ROOT/tests/image-metadata.test.mjs"
"$NODE" "$ROOT/tests/injector-bootstrap.test.mjs"
"$NODE" "$ROOT/tests/renderer-inject.test.mjs"
"$NODE" "$ROOT/tests/theme-stage.test.mjs"
"$NODE" "$ROOT/tests/theme-schema-v2.test.mjs"

# Every bundled preset must be a valid, injectable theme pack with a preset-* id.
for preset in "$ROOT"/presets/preset-*/; do
  [ -d "$preset" ] || continue
  PRESET_ID="$(/usr/bin/basename "$preset")"
  PRESET_CHECK="$("$NODE" "$ROOT/scripts/injector.mjs" --check-payload --theme-dir "$preset")"
  "$NODE" -e '
    const v = JSON.parse(process.argv[1]);
    if (!v.pass || v.themeId !== process.argv[2] || v.imageBytes < 1) process.exit(1);
  ' "$PRESET_CHECK" "$PRESET_ID"
  "$NODE" -e '
    const fs = require("fs");
    const theme = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (theme.schemaVersion !== 2 || theme.home?.enabled !== true ||
      !Array.isArray(theme.home.suggestions) || theme.home.suggestions.length !== 4) process.exit(1);
  ' "$preset/theme.json"
done

TMP="$(/usr/bin/mktemp -d /tmp/codex-newskin-tests.XXXXXX)"
TEST_INJECTOR_JOB_LABEL="com.openai.codex-newskin.tests.$$"
DUMMY_PID=""
STATUS_PID=""
WATCH_PID=""
cleanup_tests() {
  if [ -n "$DUMMY_PID" ]; then
    /bin/kill -TERM "$DUMMY_PID" 2>/dev/null || true
    wait "$DUMMY_PID" 2>/dev/null || true
  fi
  if [ -n "$STATUS_PID" ]; then
    /bin/kill -TERM "$STATUS_PID" 2>/dev/null || true
    wait "$STATUS_PID" 2>/dev/null || true
  fi
  if [ -n "$WATCH_PID" ]; then
    /bin/kill -TERM "$WATCH_PID" 2>/dev/null || true
    wait "$WATCH_PID" 2>/dev/null || true
  fi
  /bin/rm -rf "$TMP"
}
trap cleanup_tests EXIT

# SwiftBar attributes are line-based; unsafe engine paths must never be emitted
# into bash= or param*= fields.
UNSAFE_ENGINE="$TMP/unsafe\"engine"
/bin/mkdir -p "$UNSAFE_ENGINE/scripts"
/usr/bin/printf '#!/bin/bash\ntrue\n' > "$UNSAFE_ENGINE/scripts/start-newskin-macos.sh"
/bin/chmod +x "$UNSAFE_ENGINE/scripts/start-newskin-macos.sh"
UNSAFE_MENU_OUTPUT="$(
  /usr/bin/env CODEX_NEWSKIN_ENGINE="$UNSAFE_ENGINE" \
    "$ROOT/menubar/codex_newskin.10s.sh"
)"
/usr/bin/printf '%s\n' "$UNSAFE_MENU_OUTPUT" | /usr/bin/grep -F -q \
  'Engine path contains unsupported SwiftBar characters'
if /usr/bin/printf '%s\n' "$UNSAFE_MENU_OUTPUT" | /usr/bin/grep -F -q 'bash='; then
  printf 'SwiftBar emitted command attributes for an unsafe engine path.\n' >&2
  exit 1
fi

MENU_HOME="$TMP/menu-home"
MENU_IMAGES="$MENU_HOME/Library/Application Support/CodexNewskinStudio/images"
/bin/mkdir -p "$MENU_IMAGES"
: > "$MENU_IMAGES/safe-image.png"
: > "$MENU_IMAGES/"$'bad\timage.png'
: > "$MENU_IMAGES/"$'bad\033image.png'
MENU_IMAGE_OUTPUT="$(
  /usr/bin/env HOME="$MENU_HOME" CODEX_NEWSKIN_ENGINE="$ROOT" \
    "$ROOT/menubar/codex_newskin.10s.sh"
)"
/usr/bin/printf '%s\n' "$MENU_IMAGE_OUTPUT" | /usr/bin/grep -F -q 'safe-image.png'
if /usr/bin/printf '%s\n' "$MENU_IMAGE_OUTPUT" | /usr/bin/grep -F -q 'bad'; then
  printf 'SwiftBar emitted a control-character image filename.\n' >&2
  exit 1
fi

# seed_bundled_presets is idempotent and must never touch user custom-* packs.
/usr/bin/env HOME="$TMP/seed-home" /bin/bash -c '
  . "$1/scripts/common-macos.sh"
  ensure_state_root
  themes="$STATE_ROOT/themes"
  /bin/mkdir -p "$themes/custom-keepme"
  : > "$themes/custom-keepme/theme.json"
  retired="preset-midnight-aurora preset-sakura-dawn preset-amber-dusk preset-forest-mist preset-cyber-neon preset-romantic-rose"
  for id in $retired; do
    /bin/mkdir -p "$themes/$id"
    : > "$themes/$id/retired-marker"
  done
  seed_bundled_presets
  seed_bundled_presets
  [ -f "$themes/preset-gothic-void-crusade/theme.json" ] || exit 1
  [ -f "$themes/preset-gothic-void-crusade/background.jpg" ] || exit 1
  [ -f "$themes/preset-arina-hashimoto/theme.json" ] || exit 1
  [ -f "$themes/preset-arina-hashimoto/background.jpg" ] || exit 1
  [ -f "$themes/preset-yangyue/theme.json" ] || exit 1
  [ -f "$themes/preset-yangyue/background.mp4" ] || exit 1
  [ -f "$themes/custom-keepme/theme.json" ] || exit 1
  for id in $retired; do [ ! -e "$themes/$id" ] || exit 1; done
  seeded="$(/usr/bin/find "$themes" -maxdepth 1 -type d -name "preset-*" | /usr/bin/wc -l | /usr/bin/tr -d " ")"
  [ "$seeded" -eq 4 ] || exit 1
' _ "$ROOT"

SYNC_HOME="$TMP/sync-preset-home"
/usr/bin/env HOME="$SYNC_HOME" NODE="$NODE" \
  "$ROOT/scripts/sync-preset-macos.sh" --id preset-yangyue --no-apply >/dev/null
[ -f "$SYNC_HOME/Library/Application Support/CodexNewskinStudio/themes/preset-yangyue/theme.json" ]
[ -f "$SYNC_HOME/Library/Application Support/CodexNewskinStudio/themes/preset-yangyue/background.mp4" ]

# Theme switches stage files and publish theme.json last, preserving a complete
# active pack while the watcher is running.
SWITCH_HOME="$TMP/switch-home"
SWITCH_STATE="$SWITCH_HOME/Library/Application Support/CodexNewskinStudio"
/bin/mkdir -p "$SWITCH_STATE/themes/preset-switch-fixture" "$SWITCH_STATE/theme"
/bin/cp "$ROOT/assets/portal-hero.png" "$SWITCH_STATE/themes/preset-switch-fixture/background.png"
/usr/bin/printf '%s\n' \
  '{"schemaVersion":1,"id":"preset-switch-fixture","name":"切换测试","image":"background.png"}' \
  > "$SWITCH_STATE/themes/preset-switch-fixture/theme.json"
/usr/bin/printf '%s\n' '{"schemaVersion":1,"id":"old","name":"旧主题","image":"old.png"}' \
  > "$SWITCH_STATE/theme/theme.json"
/usr/bin/printf '%s\n' '{"session":"active","injectorMode":"full"}' \
  > "$SWITCH_STATE/state.json"
: > "$SWITCH_STATE/theme/old.png"
if /usr/bin/env HOME="$SWITCH_HOME" NODE="$NODE" \
  "$ROOT/scripts/switch-theme-macos.sh" --id '../escape' --no-apply >/dev/null 2>&1; then
  printf 'switch-theme unexpectedly accepted a path traversal theme id.\n' >&2
  exit 1
fi
/usr/bin/env HOME="$SWITCH_HOME" NODE="$NODE" \
  "$ROOT/scripts/switch-theme-macos.sh" --id preset-switch-fixture --no-apply >/dev/null
/usr/bin/cmp -s "$SWITCH_STATE/theme/background.png" \
  "$SWITCH_STATE/themes/preset-switch-fixture/background.png"
[ ! -e "$SWITCH_STATE/theme/old.png" ]
"$NODE" -e '
  const fs = require("fs");
  const [themePath, statePath] = process.argv.slice(1);
  const theme = JSON.parse(fs.readFileSync(themePath, "utf8"));
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  if (theme.id !== "preset-switch-fixture" || theme.name !== "切换测试") process.exit(1);
  if (state.appliedThemeId !== "preset-switch-fixture" || state.appliedThemeName !== "切换测试") process.exit(1);
' "$SWITCH_STATE/theme/theme.json" "$SWITCH_STATE/state.json"
[ -z "$(/usr/bin/find "$SWITCH_STATE" -maxdepth 1 -name '.theme-switch.*' -print -quit)" ]

RUNTIME_HOME="$TMP/runtime-home"
RUNTIME_STATE_ROOT="$RUNTIME_HOME/Library/Application Support/CodexNewskinStudio"
RUNTIME_STATE="$RUNTIME_STATE_ROOT/state.json"
STATE_EVAL_MARKER="$TMP/state-eval-marker"
UNTRUSTED_NODE_MARKER="$TMP/untrusted-node-executed"
UNTRUSTED_BUNDLE="$TMP/evil-root/Codex \"Skin\".app"
UNTRUSTED_EXE="$UNTRUSTED_BUNDLE/Contents/MacOS/ChatGPT"
UNTRUSTED_VERSION="1.1.2 \$(touch \"$STATE_EVAL_MARKER\") ; echo pwned"
UNTRUSTED_TEAM_ID="TEAM'ID"
/bin/mkdir -p "$RUNTIME_STATE_ROOT" "$UNTRUSTED_BUNDLE/Contents/MacOS"
/usr/bin/printf '#!/bin/bash\n/usr/bin/touch "${UNTRUSTED_NODE_MARKER:?}"\nexit 97\n' > "$UNTRUSTED_EXE"
/bin/chmod +x "$UNTRUSTED_EXE"
"$NODE" -e '
  const fs = require("node:fs");
  const [file, codexBundle, codexExe, codexVersion, codexTeamId] = process.argv.slice(1);
  fs.writeFileSync(file, `${JSON.stringify({ codexBundle, codexExe, codexVersion, codexTeamId })}\n`);
' "$RUNTIME_STATE" "$UNTRUSTED_BUNDLE" "$UNTRUSTED_EXE" "$UNTRUSTED_VERSION" "$UNTRUSTED_TEAM_ID"
/usr/bin/env HOME="$RUNTIME_HOME" NODE="$UNTRUSTED_EXE" NODE_VERSION="untrusted" \
  UNTRUSTED_NODE_MARKER="$UNTRUSTED_NODE_MARKER" /bin/bash -c '
  . "$1/scripts/common-macos.sh"
  TRUSTED_BUNDLE="$2"
  TRUSTED_EXE="$3"
  TRUSTED_NODE="$4"
  DISCOVER_CALLS=0
  SIGNED_NODE_CALLS=0
  discover_codex_app() {
    DISCOVER_CALLS=$((DISCOVER_CALLS + 1))
    CODEX_BUNDLE="$TRUSTED_BUNDLE"
    CODEX_EXE="$TRUSTED_EXE"
    CODEX_VERSION="trusted"
  }
  require_signed_node_runtime() {
    SIGNED_NODE_CALLS=$((SIGNED_NODE_CALLS + 1))
    NODE="$TRUSTED_NODE"
    NODE_VERSION="v22.0.0"
    CODEX_TEAM_ID="2DC432GLL2"
    remember_validated_runtime_identity
  }
  state_field codexVersion >/dev/null
  ensure_node_runtime
  ensure_node_runtime
  [ "$DISCOVER_CALLS" -eq 1 ]
  [ "$SIGNED_NODE_CALLS" -eq 1 ]
  [ "$NODE" = "$TRUSTED_NODE" ]
  [ "$CODEX_BUNDLE" = "$TRUSTED_BUNDLE" ]
  [ "$CODEX_EXE" = "$TRUSTED_EXE" ]
  [ "$CODEX_TEAM_ID" = "2DC432GLL2" ]
' _ "$ROOT" "/trusted/ChatGPT.app" "/trusted/ChatGPT.app/Contents/MacOS/ChatGPT" "$NODE"
[ ! -e "$UNTRUSTED_NODE_MARKER" ] || {
  printf 'state_field executed an inherited, unvalidated Node runtime.\n' >&2
  exit 1
}
[ ! -e "$STATE_EVAL_MARKER" ] || {
  printf 'Runtime state values were evaluated as shell code.\n' >&2
  exit 1
}

# A command-line prefix is insufficient: the process text executable must match.
/usr/bin/env HOME="$RUNTIME_HOME" /bin/bash -c '
  . "$1/scripts/common-macos.sh"
  CODEX_EXE="/bin/bash"
  pid_is_codex_executable "$$"
  pid_is_codex_descendant "$$"
  process_executable_path() { printf "/bin/zsh\n"; }
  if pid_is_codex_executable "$$" || pid_is_codex_descendant "$$"; then exit 1; fi
' _ "$ROOT"

# A reused live PID must never be killed or treated as a successfully stopped
# injector when its command identity does not match the recorded watcher.
STOP_HOME="$TMP/stop-home"
STOP_STATE_ROOT="$STOP_HOME/Library/Application Support/CodexNewskinStudio"
/bin/mkdir -p "$STOP_STATE_ROOT"
"$NODE" -e 'process.on("SIGTERM", () => process.exit(0)); setTimeout(() => {}, 30000);' &
DUMMY_PID="$!"
"$NODE" -e '
  const fs = require("node:fs");
  const [file, pid, node, injector] = process.argv.slice(1);
  fs.writeFileSync(file, `${JSON.stringify({
    port: 9341,
    injectorPid: Number(pid),
    injectorStartedAt: "not-the-real-start-time",
    nodePath: node,
    injectorPath: injector,
  })}\n`);
' "$STOP_STATE_ROOT/state.json" "$DUMMY_PID" "$NODE" "$ROOT/scripts/injector.mjs"
/usr/bin/env HOME="$STOP_HOME" NODE="$NODE" /bin/bash -c '
  . "$1/scripts/common-macos.sh"
  INJECTOR_JOB_LABEL="$3"
  if stop_recorded_injector 2>/dev/null; then exit 1; fi
  /bin/kill -0 "$2"
' _ "$ROOT" "$DUMMY_PID" "$TEST_INJECTOR_JOB_LABEL"

# An incomplete live identity (even with a valid PID and port) must also fail
# closed before any signal is sent.
"$NODE" -e '
  const fs = require("node:fs");
  const [file, pid] = process.argv.slice(1);
  fs.writeFileSync(file, `${JSON.stringify({ port: 9341, injectorPid: Number(pid) })}\n`);
' "$STOP_STATE_ROOT/state.json" "$DUMMY_PID"
/usr/bin/env HOME="$STOP_HOME" NODE="$NODE" /bin/bash -c '
  . "$1/scripts/common-macos.sh"
  INJECTOR_JOB_LABEL="$3"
  if stop_recorded_injector 2>/dev/null; then exit 1; fi
  /bin/kill -0 "$2"
' _ "$ROOT" "$DUMMY_PID" "$TEST_INJECTOR_JOB_LABEL"

# Restore a complete (but still intentionally mismatched) record before
# ending the fixture so the dead-PID cleanup path remains testable.
"$NODE" -e '
  const fs = require("node:fs");
  const [file, pid, node, injector] = process.argv.slice(1);
  fs.writeFileSync(file, `${JSON.stringify({
    port: 9341,
    injectorPid: Number(pid),
    injectorStartedAt: "not-the-real-start-time",
    nodePath: node,
    injectorPath: injector,
  })}\n`);
' "$STOP_STATE_ROOT/state.json" "$DUMMY_PID" "$NODE" "$ROOT/scripts/injector.mjs"
/bin/kill -TERM "$DUMMY_PID" 2>/dev/null || true
wait "$DUMMY_PID" 2>/dev/null || true
DUMMY_PID=""

# A genuinely dead recorded PID is safe to discard (and must not block a
# subsequent start/restore operation).
/usr/bin/env HOME="$STOP_HOME" NODE="$NODE" /bin/bash -c '
  . "$1/scripts/common-macos.sh"
  INJECTOR_JOB_LABEL="$2"
  stop_recorded_injector
' _ "$ROOT" "$TEST_INJECTOR_JOB_LABEL"

# SwiftBar status must not call a live, reused PID "active" merely because
# kill -0 succeeds.  A watcher state needs matching command/path/start data.
STATUS_HOME="$TMP/status-home"
STATUS_STATE_ROOT="$STATUS_HOME/Library/Application Support/CodexNewskinStudio"
/bin/mkdir -p "$STATUS_STATE_ROOT"
"$NODE" -e 'process.on("SIGTERM", () => process.exit(0)); setTimeout(() => {}, 30000);' &
STATUS_PID="$!"
"$NODE" -e '
  const fs = require("node:fs");
  const [file, pid] = process.argv.slice(1);
  fs.writeFileSync(file, `${JSON.stringify({
    schemaVersion: 4,
    session: "active",
    port: 9341,
    injectorPid: Number(pid),
    injectorStartedAt: "not-the-real-start-time",
    injectorPath: "/tmp/not-the-newskin-injector.mjs",
    nodePath: "/tmp/not-the-codex-node",
  })}\n`);
' "$STATUS_STATE_ROOT/state.json" "$STATUS_PID"
STATUS_JSON="$(/usr/bin/env HOME="$STATUS_HOME" "$ROOT/scripts/status-newskin-macos.sh" --json)"
"$NODE" -e '
  const value = JSON.parse(process.argv[1]);
  if (value.session !== "stale" || value.injectorAlive !== false) process.exit(1);
' "$STATUS_JSON"
/bin/kill -TERM "$STATUS_PID" 2>/dev/null || true
wait "$STATUS_PID" 2>/dev/null || true
STATUS_PID=""

# A near-prefix port (93410) must not satisfy the saved 9341 identity.  Use a
# real bundled Node process so command/path/start checks pass and only the
# token boundary distinguishes this case.
STATUS_FAKE_INJECTOR="$TMP/status-fake-injector.mjs"
/usr/bin/printf 'setTimeout(() => {}, 30000);\n' > "$STATUS_FAKE_INJECTOR"
"$NODE" "$STATUS_FAKE_INJECTOR" --watch --port 93410 --theme-dir "$TMP" &
STATUS_PID="$!"
/bin/sleep 0.08
STATUS_START="$(/bin/ps -p "$STATUS_PID" -o lstart= 2>/dev/null | /usr/bin/awk '{$1=$1; print}')"
"$NODE" -e '
  const fs = require("node:fs");
  const [file, pid, node, injector, startedAt] = process.argv.slice(1);
  fs.writeFileSync(file, `${JSON.stringify({
    schemaVersion: 4,
    session: "active",
    port: 9341,
    injectorPid: Number(pid),
    injectorStartedAt: startedAt,
    injectorPath: injector,
    nodePath: node,
  })}\n`);
' "$STATUS_STATE_ROOT/state.json" "$STATUS_PID" "$NODE" "$STATUS_FAKE_INJECTOR" "$STATUS_START"
STATUS_JSON="$(/usr/bin/env HOME="$STATUS_HOME" "$ROOT/scripts/status-newskin-macos.sh" --json)"
"$NODE" -e '
  const value = JSON.parse(process.argv[1]);
  if (value.session !== "stale" || value.injectorAlive !== false) process.exit(1);
' "$STATUS_JSON"
/bin/kill -TERM "$STATUS_PID" 2>/dev/null || true
wait "$STATUS_PID" 2>/dev/null || true
STATUS_PID=""

# The common stop path must reject a real watcher running on 19341 when the
# saved state claims 1934, even though nodePath/injectorPath/start-time all
# match. This exercises the signal gate directly (status has its own matcher).
"$NODE" "$ROOT/scripts/injector.mjs" --watch --port 19341 --theme-dir "$ROOT/presets/preset-gothic-void-crusade" \
  >"$TMP/near-prefix-injector.out" 2>&1 &
WATCH_PID="$!"
/bin/sleep 0.2
WATCH_START="$(/bin/ps -p "$WATCH_PID" -o lstart= 2>/dev/null | /usr/bin/awk '{$1=$1; print}')"
[ -n "$WATCH_START" ] || { printf 'Could not record near-prefix watcher start time.\n' >&2; exit 1; }
"$NODE" -e '
  const fs = require("node:fs");
  const [file, pid, node, injector, startedAt] = process.argv.slice(1);
  fs.writeFileSync(file, `${JSON.stringify({
    schemaVersion: 4,
    session: "active",
    port: 1934,
    injectorPid: Number(pid),
    injectorStartedAt: startedAt,
    injectorPath: injector,
    nodePath: node,
  })}\n`);
' "$STOP_STATE_ROOT/state.json" "$WATCH_PID" "$NODE" "$ROOT/scripts/injector.mjs" "$WATCH_START"
if /usr/bin/env HOME="$STOP_HOME" NODE="$NODE" /bin/bash -c '
  . "$1/scripts/common-macos.sh"
  INJECTOR_JOB_LABEL="$2"
  stop_recorded_injector 2>/dev/null
' _ "$ROOT" "$TEST_INJECTOR_JOB_LABEL"; then
  printf 'common stop unexpectedly accepted a near-prefix watcher port.\n' >&2
  exit 1
fi
/bin/kill -0 "$WATCH_PID"
/bin/kill -TERM "$WATCH_PID" 2>/dev/null || true
wait "$WATCH_PID" 2>/dev/null || true
WATCH_PID=""

# A failed start must prove the recorded watcher stopped before deleting its
# state; this static guard prevents the old launchctl-short-circuit cleanup.
/usr/bin/grep -F -q 'set -Eeuo pipefail' "$ROOT/scripts/start-newskin-macos.sh"
/usr/bin/grep -F -q 'if "$NODE" "$INJECTOR" --verify' \
  "$ROOT/scripts/start-newskin-macos.sh"
if /usr/bin/grep -F -q 'set +e' "$ROOT/scripts/start-newskin-macos.sh"; then
  printf 'start script still disables errexit around expected verify retries.\n' >&2
  exit 1
fi
/usr/bin/grep -F -q 'if ! stop_recorded_injector; then' \
  "$ROOT/scripts/start-newskin-macos.sh"
if /usr/bin/grep -F -q 'launchctl remove "$INJECTOR_JOB_LABEL" >/dev/null 2>&1 || /bin/kill -TERM "$INJECTOR_PID"' \
  "$ROOT/scripts/start-newskin-macos.sh"; then
  printf 'start script still deletes state without identity-bound injector cleanup.\n' >&2
  exit 1
fi
if /usr/bin/grep -F -q 'index($0, "--port " port)' "$ROOT/scripts/common-macos.sh"; then
  printf 'injector discovery still accepts a near-prefix port.\n' >&2
  exit 1
fi

# Corrupt or structurally incomplete state must be preserved and fail closed;
# otherwise pause/restore could overwrite evidence while a watcher survives.
for state_payload in '{' '{}'; do
  /usr/bin/printf '%s\n' "$state_payload" > "$STOP_STATE_ROOT/state.json"
  /bin/cp "$STOP_STATE_ROOT/state.json" "$STOP_STATE_ROOT/state.original"
  /usr/bin/env HOME="$STOP_HOME" NODE="$NODE" /bin/bash -c '
    . "$1/scripts/common-macos.sh"
    INJECTOR_JOB_LABEL="$2"
    if stop_recorded_injector 2>/dev/null; then exit 1; fi
  ' _ "$ROOT" "$TEST_INJECTOR_JOB_LABEL"
  /usr/bin/cmp -s "$STOP_STATE_ROOT/state.json" "$STOP_STATE_ROOT/state.original"
done

/bin/mkdir -p "$TMP/theme"
/bin/cp "$ROOT/assets/portal-hero.png" "$TMP/theme/background.png"
"$NODE" "$ROOT/scripts/write-theme.mjs" custom --output-dir "$TMP/theme" \
  --image background.png --name '测试主题' --tagline '测试口号' --quote 'TEST' \
  --accent '#11aa55' --secondary '#22bbcc' --highlight '#663399' >/dev/null
PAYLOAD_JSON="$("$NODE" "$ROOT/scripts/injector.mjs" --check-payload --theme-dir "$TMP/theme")"
"$NODE" -e '
  const theme = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (theme.appearance !== "auto") process.exit(1);
  if (theme.art?.safeArea !== "auto" || theme.art?.taskMode !== "auto") process.exit(1);
  if (Object.hasOwn(theme.art, "focusX") || Object.hasOwn(theme.art, "focusY")) process.exit(1);
' "$TMP/theme/theme.json"
"$NODE" -e '
  const value = JSON.parse(process.argv[1]);
  if (!value.pass || value.themeName !== "测试主题" || value.imageBytes < 1) process.exit(1);
  if (value.artMetadata?.width !== 2168 || value.artMetadata?.height !== 725) process.exit(1);
  if (!value.artMetadata.wide || value.artMetadata.aspect !== "ultrawide") process.exit(1);
  if (!Number.isFinite(value.timings?.buildMs) || value.timings.buildMs < 0) process.exit(1);
' "$PAYLOAD_JSON"

/bin/mkdir -p "$TMP/explicit-theme"
/bin/cp "$ROOT/assets/portal-hero.png" "$TMP/explicit-theme/background.png"
"$NODE" "$ROOT/scripts/write-theme.mjs" custom --output-dir "$TMP/explicit-theme" \
  --image background.png --name '显式自适应主题' --appearance dark \
  --focus-x 0.12 --focus-y 0.88 --safe-area none --task-mode off >/dev/null
EXPLICIT_PAYLOAD_JSON="$(
  "$NODE" "$ROOT/scripts/injector.mjs" --check-payload --theme-dir "$TMP/explicit-theme"
)"
"$NODE" -e '
  const fs = require("fs");
  const theme = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const payload = JSON.parse(process.argv[2]);
  if (theme.appearance !== "dark") process.exit(1);
  if (theme.art?.focusX !== 0.12 || theme.art?.focusY !== 0.88) process.exit(1);
  if (theme.art?.safeArea !== "none" || theme.art?.taskMode !== "off") process.exit(1);
  if (!payload.pass || payload.themeName !== "显式自适应主题") process.exit(1);
' "$TMP/explicit-theme/theme.json" "$EXPLICIT_PAYLOAD_JSON"

assert_write_theme_rejected() {
  local label="$1"
  shift
  if "$NODE" "$ROOT/scripts/write-theme.mjs" custom --output-dir "$TMP/explicit-theme" \
    --image background.png "$@" >/dev/null 2>&1; then
    printf 'write-theme unexpectedly accepted invalid %s.\n' "$label" >&2
    exit 1
  fi
}
assert_write_theme_rejected appearance --appearance sepia
assert_write_theme_rejected safe-area --safe-area edge
assert_write_theme_rejected task-mode --task-mode fullscreen
assert_write_theme_rejected focus-x --focus-x -0.01
assert_write_theme_rejected focus-y --focus-y 1.01
assert_write_theme_rejected name-control --name $'unsafe\nname'
assert_write_theme_rejected tagline-control --tagline $'unsafe\rtagline'
assert_write_theme_rejected quote-control --quote $'unsafe\033quote'
CONTROL_IMAGE=$'unsafe\nimage.jpg'
/bin/cp "$TMP/explicit-theme/background.png" "$TMP/explicit-theme/$CONTROL_IMAGE"
if "$NODE" "$ROOT/scripts/write-theme.mjs" custom --output-dir "$TMP/explicit-theme" \
  --image "$CONTROL_IMAGE" >/dev/null 2>&1; then
  printf 'write-theme unexpectedly accepted a control-character image filename.\n' >&2
  exit 1
fi
/bin/rm -f "$TMP/explicit-theme/$CONTROL_IMAGE"

"$NODE" -e '
  const fs = require("fs");
  const path = require("path");
  const [source, root] = process.argv.slice(1);
  const cases = {
    appearance: (theme) => { theme.appearance = "sepia"; },
    "safe-area": (theme) => { theme.art.safeArea = "edge"; },
    "task-mode": (theme) => { theme.art.taskMode = "fullscreen"; },
    "focus-x": (theme) => { theme.art.focusX = -0.01; },
    "focus-y": (theme) => { theme.art.focusY = 1.01; },
    "name-control": (theme) => { theme.name = "unsafe\nname"; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const target = path.join(root, name);
    fs.cpSync(source, target, { recursive: true });
    const configPath = path.join(target, "theme.json");
    const theme = JSON.parse(fs.readFileSync(configPath, "utf8"));
    mutate(theme);
    fs.writeFileSync(configPath, `${JSON.stringify(theme, null, 2)}\n`);
  }
' "$TMP/explicit-theme" "$TMP/invalid-payloads"
for invalid_case in appearance safe-area task-mode focus-x focus-y name-control; do
  if INVALID_OUTPUT="$(
    "$NODE" "$ROOT/scripts/injector.mjs" --check-payload \
      --theme-dir "$TMP/invalid-payloads/$invalid_case" 2>&1
  )"; then
    printf 'injector unexpectedly accepted invalid %s.\n' "$invalid_case" >&2
    exit 1
  fi
  case "$invalid_case" in
    appearance) EXPECTED_INVALID_FIELD='appearance' ;;
    safe-area) EXPECTED_INVALID_FIELD='art.safeArea' ;;
    task-mode) EXPECTED_INVALID_FIELD='art.taskMode' ;;
    focus-x) EXPECTED_INVALID_FIELD='art.focusX' ;;
    focus-y) EXPECTED_INVALID_FIELD='art.focusY' ;;
    name-control) EXPECTED_INVALID_FIELD='name' ;;
  esac
  /usr/bin/printf '%s\n' "$INVALID_OUTPUT" | /usr/bin/grep -F -q \
    "invalid $EXPECTED_INVALID_FIELD field"
done

/bin/mkdir -p "$TMP/missing-theme"
if MISSING_THEME_OUTPUT="$(
  "$NODE" "$ROOT/scripts/injector.mjs" --check-payload --theme-dir "$TMP/missing-theme" 2>&1
)"; then
  printf 'Explicit theme directory without theme.json unexpectedly passed.\n' >&2
  exit 1
fi
/usr/bin/printf '%s\n' "$MISSING_THEME_OUTPUT" | /usr/bin/grep -F -q \
  "Explicit theme directory is missing theme.json: $TMP/missing-theme/theme.json"

# A theme config or image symlink may resolve only inside its own theme root.
/bin/mkdir -p "$TMP/symlink-outside" "$TMP/symlink-image-theme" "$TMP/symlink-config-theme"
/bin/cp "$ROOT/assets/portal-hero.png" "$TMP/symlink-outside/background.png"
/usr/bin/printf '%s\n' \
  '{"schemaVersion":1,"id":"symlink-image","name":"Symlink image","image":"background.png"}' \
  > "$TMP/symlink-image-theme/theme.json"
/bin/ln -s "$TMP/symlink-outside/background.png" "$TMP/symlink-image-theme/background.png"
if SYMLINK_IMAGE_OUTPUT="$(
  "$NODE" "$ROOT/scripts/injector.mjs" --check-payload --theme-dir "$TMP/symlink-image-theme" 2>&1
)"; then
  printf 'Injector unexpectedly accepted a theme image symlink escaping its theme directory.\n' >&2
  exit 1
fi
/usr/bin/printf '%s\n' "$SYMLINK_IMAGE_OUTPUT" | /usr/bin/grep -F -q \
  'Theme image must stay inside its theme directory'
/usr/bin/printf '%s\n' \
  '{"schemaVersion":1,"id":"symlink-config","name":"Symlink config","image":"background.png"}' \
  > "$TMP/symlink-outside/theme.json"
/bin/ln -s "$TMP/symlink-outside/theme.json" "$TMP/symlink-config-theme/theme.json"
if SYMLINK_CONFIG_OUTPUT="$(
  "$NODE" "$ROOT/scripts/injector.mjs" --check-payload --theme-dir "$TMP/symlink-config-theme" 2>&1
)"; then
  printf 'Injector unexpectedly accepted a theme config symlink escaping its theme directory.\n' >&2
  exit 1
fi
/usr/bin/printf '%s\n' "$SYMLINK_CONFIG_OUTPUT" | /usr/bin/grep -F -q \
  'Theme config must stay inside its theme directory'

# Exercise the dimension limit through the complete payload loader, not only
# through the standalone metadata parser.
OVERSIZED_DIMENSION_THEME="$TMP/oversized-dimension-theme"
/bin/mkdir -p "$OVERSIZED_DIMENSION_THEME"
"$NODE" -e '
  const fs = require("node:fs");
  const file = process.argv[1];
  const value = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(value);
  value.writeUInt32BE(13, 8);
  value.write("IHDR", 12, "ascii");
  value.writeUInt32BE(16385, 16);
  value.writeUInt32BE(1, 20);
  fs.writeFileSync(file, value);
' "$OVERSIZED_DIMENSION_THEME/oversized.png"
/usr/bin/printf '%s\n' \
  '{"schemaVersion":1,"id":"oversized","name":"Oversized","image":"oversized.png"}' \
  > "$OVERSIZED_DIMENSION_THEME/theme.json"
if OVERSIZED_DIMENSION_OUTPUT="$(
  "$NODE" "$ROOT/scripts/injector.mjs" --check-payload \
    --theme-dir "$OVERSIZED_DIMENSION_THEME" 2>&1
)"; then
  printf 'Injector unexpectedly accepted an image over the dimension limit.\n' >&2
  exit 1
fi
/usr/bin/printf '%s\n' "$OVERSIZED_DIMENSION_OUTPUT" | /usr/bin/grep -F -q \
  'invalid or exceeds the 16384px / 50MP safety limit'

# reset-demo must reject realpath aliases back into its own project, including
# case aliases on the default case-insensitive macOS filesystem.
RESET_FIXTURE="$TMP/Reset-Project"
/bin/mkdir -p "$RESET_FIXTURE/scripts"
/bin/cp "$ROOT/scripts/write-theme.mjs" "$RESET_FIXTURE/scripts/write-theme.mjs"
: > "$RESET_FIXTURE/keep-me"
/bin/ln -s "$RESET_FIXTURE" "$TMP/reset-project-link"
if "$NODE" "$RESET_FIXTURE/scripts/write-theme.mjs" reset-demo \
  --output-dir "$TMP/reset-project-link" >/dev/null 2>&1; then
  printf 'reset-demo unexpectedly accepted a realpath alias to its project.\n' >&2
  exit 1
fi
[ -f "$RESET_FIXTURE/keep-me" ]
[ -L "$TMP/reset-project-link" ]
RESET_CASE_ALIAS="$TMP/reset-project"
if [ -f "$RESET_CASE_ALIAS/keep-me" ]; then
  if "$NODE" "$RESET_FIXTURE/scripts/write-theme.mjs" reset-demo \
    --output-dir "$RESET_CASE_ALIAS" >/dev/null 2>&1; then
    printf 'reset-demo unexpectedly accepted a case alias to its project.\n' >&2
    exit 1
  fi
  [ -f "$RESET_FIXTURE/keep-me" ]
fi
"$NODE" "$ROOT/scripts/write-theme.mjs" reset-demo --output-dir "$TMP/theme" >/dev/null
[ ! -e "$TMP/theme" ]

CONFIG="$TMP/config.toml"
BACKUP="$TMP/theme-backup.json"
/usr/bin/printf '%s\n' \
  'model = "gpt-5"' \
  'project = "中文项目"' \
  '' \
  '[desktop]' \
  'appearanceTheme = "system"' \
  'appearanceDarkCodeThemeId = "vscode-dark"' \
  'keepMe = true' > "$CONFIG"
/bin/cp "$CONFIG" "$TMP/original.toml"
"$NODE" "$ROOT/scripts/theme-config.mjs" install "$CONFIG" "$BACKUP" >/dev/null
/usr/bin/cmp -s "$CONFIG" "$TMP/original.toml"
"$NODE" -e '
  const backup = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (backup.values.appearanceTheme !== `appearanceTheme = "system"`) process.exit(1);
  if (backup.values.appearanceDarkCodeThemeId !== `appearanceDarkCodeThemeId = "vscode-dark"`) process.exit(1);
' "$BACKUP"
"$NODE" "$ROOT/scripts/theme-config.mjs" restore "$CONFIG" "$BACKUP" >/dev/null
/usr/bin/cmp -s "$CONFIG" "$TMP/original.toml"

assert_theme_config_restore_rejected() {
  local label="$1"
  local config="$2"
  local backup="$3"
  /bin/cp "$config" "$config.original"
  if "$NODE" "$ROOT/scripts/theme-config.mjs" restore "$config" "$backup" >/dev/null 2>&1; then
    printf 'theme-config unexpectedly accepted invalid %s backup.\n' "$label" >&2
    exit 1
  fi
  /usr/bin/cmp -s "$config" "$config.original"
  [ -e "$backup" ]
  [ ! -e "$config.newskin.lock" ]
}

MALICIOUS_BACKUP_CONFIG="$TMP/config-malicious-backup.toml"
/usr/bin/printf '%s\n' '[desktop]' 'keepMe = true' > "$MALICIOUS_BACKUP_CONFIG"
for backup_case in newline wrong-key unknown-key; do
  MALICIOUS_BACKUP="$TMP/theme-backup-$backup_case.json"
  "$NODE" -e '
    const fs = require("node:fs");
    const [file, configPath, kind] = process.argv.slice(1);
    const values = { appearanceTheme: null, appearanceDarkCodeThemeId: null };
    if (kind === "newline") values.appearanceTheme = `appearanceTheme = "dark"\nmodel = "unsafe"`;
    if (kind === "wrong-key") values.appearanceTheme = `model = "unsafe"`;
    if (kind === "unknown-key") values.unexpected = `unexpected = true`;
    fs.writeFileSync(file, `${JSON.stringify({
      schemaVersion: 1,
      platform: "darwin",
      configPath,
      values,
    }, null, 2)}\n`);
  ' "$MALICIOUS_BACKUP" "$MALICIOUS_BACKUP_CONFIG" "$backup_case"
  assert_theme_config_restore_rejected "$backup_case" \
    "$MALICIOUS_BACKUP_CONFIG" "$MALICIOUS_BACKUP"
  /bin/rm -f "$MALICIOUS_BACKUP"
done

NO_DESKTOP_CONFIG="$TMP/config-without-desktop.toml"
NO_DESKTOP_BACKUP="$TMP/theme-backup-without-desktop.json"
/usr/bin/printf '%s\n' 'model = "gpt-5"' 'keepMe = true' > "$NO_DESKTOP_CONFIG"
/bin/cp "$NO_DESKTOP_CONFIG" "$TMP/original-without-desktop.toml"
"$NODE" "$ROOT/scripts/theme-config.mjs" install "$NO_DESKTOP_CONFIG" "$NO_DESKTOP_BACKUP" >/dev/null
"$NODE" "$ROOT/scripts/theme-config.mjs" restore "$NO_DESKTOP_CONFIG" "$NO_DESKTOP_BACKUP" >/dev/null
/usr/bin/cmp -s "$NO_DESKTOP_CONFIG" "$TMP/original-without-desktop.toml"

INVALID_UTF_CONFIG="$TMP/config-invalid-utf8.toml"
INVALID_UTF_BACKUP="$TMP/config-invalid-utf8-backup.json"
/usr/bin/printf 'model = "gpt-5"\n# invalid: ' > "$INVALID_UTF_CONFIG"
/usr/bin/printf '\377\n' >> "$INVALID_UTF_CONFIG"
/bin/cp "$INVALID_UTF_CONFIG" "$TMP/original-invalid-utf8.toml"
if "$NODE" "$ROOT/scripts/theme-config.mjs" install \
  "$INVALID_UTF_CONFIG" "$INVALID_UTF_BACKUP" >/dev/null 2>&1; then
  printf 'theme-config unexpectedly accepted invalid UTF-8.\n' >&2
  exit 1
fi
/usr/bin/cmp -s "$INVALID_UTF_CONFIG" "$TMP/original-invalid-utf8.toml"
[ ! -e "$INVALID_UTF_BACKUP" ]
[ ! -e "$INVALID_UTF_CONFIG.newskin.lock" ]

assert_theme_config_install_rejected() {
  local label="$1"
  local config="$2"
  local backup="$3"
  /bin/cp "$config" "$config.original"
  if "$NODE" "$ROOT/scripts/theme-config.mjs" install "$config" "$backup" >/dev/null 2>&1; then
    printf 'theme-config unexpectedly accepted invalid %s config.\n' "$label" >&2
    exit 1
  fi
  /usr/bin/cmp -s "$config" "$config.original"
  [ ! -e "$backup" ]
  [ ! -e "$config.newskin.lock" ]
}

SYMLINK_CONFIG_TARGET="$TMP/config-symlink-target.toml"
SYMLINK_CONFIG_PATH="$TMP/config-symlink.toml"
/usr/bin/printf '%s\n' '[desktop]' 'appearanceTheme = "system"' > "$SYMLINK_CONFIG_TARGET"
/bin/cp "$SYMLINK_CONFIG_TARGET" "$SYMLINK_CONFIG_TARGET.original"
/bin/ln -s "$SYMLINK_CONFIG_TARGET" "$SYMLINK_CONFIG_PATH"
assert_theme_config_install_rejected config-symlink "$SYMLINK_CONFIG_PATH" \
  "$TMP/config-symlink-backup.json"
[ -L "$SYMLINK_CONFIG_PATH" ]
/usr/bin/cmp -s "$SYMLINK_CONFIG_TARGET" "$SYMLINK_CONFIG_TARGET.original"

NUL_CONFIG="$TMP/config-nul.toml"
/usr/bin/printf 'model = "gpt-5"\n\000' > "$NUL_CONFIG"
assert_theme_config_install_rejected nul "$NUL_CONFIG" "$TMP/config-nul-backup.json"

DUPLICATE_DESKTOP_CONFIG="$TMP/config-duplicate-desktop.toml"
/usr/bin/printf '%s\n' '[desktop]' 'keep = 1' '[desktop]' 'keep = 2' \
  > "$DUPLICATE_DESKTOP_CONFIG"
assert_theme_config_install_rejected duplicate-desktop "$DUPLICATE_DESKTOP_CONFIG" \
  "$TMP/config-duplicate-desktop-backup.json"

MULTILINE_CONFIG="$TMP/config-multiline.toml"
/usr/bin/printf '%s\n' 'note = """value' 'continued"""' '[desktop]' 'keep = true' \
  > "$MULTILINE_CONFIG"
assert_theme_config_install_rejected multiline "$MULTILINE_CONFIG" \
  "$TMP/config-multiline-backup.json"

MULTILINE_ARRAY_CONFIG="$TMP/config-multiline-array.toml"
/usr/bin/printf '%s\n' '[desktop]' 'rows = [' '  ["one", "two"],' ']' \
  'appearanceTheme = "system"' > "$MULTILINE_ARRAY_CONFIG"
assert_theme_config_install_rejected multiline-array "$MULTILINE_ARRAY_CONFIG" \
  "$TMP/config-multiline-array-backup.json"

CRLF_CONFIG="$TMP/config-crlf.toml"
CRLF_BACKUP="$TMP/config-crlf-backup.json"
/usr/bin/printf '\357\273\277model = "gpt-5"\r\nproject = "中文项目"\r\n\r\n[desktop]\r\nappearanceTheme = "system"\r\n' \
  > "$CRLF_CONFIG"
/bin/cp "$CRLF_CONFIG" "$TMP/original-crlf.toml"
"$NODE" "$ROOT/scripts/theme-config.mjs" install "$CRLF_CONFIG" "$CRLF_BACKUP" >/dev/null
"$NODE" "$ROOT/scripts/theme-config.mjs" restore "$CRLF_CONFIG" "$CRLF_BACKUP" >/dev/null
/usr/bin/cmp -s "$CRLF_CONFIG" "$TMP/original-crlf.toml"

/usr/bin/env -u HOME /bin/bash -c '. "$1/scripts/common-macos.sh"; [ -n "$HOME" ] && [ "$SKIN_VERSION" = "1.2.0" ]' _ "$ROOT"

# A Restore click after an already-completed restore used to stop and relaunch
# a normal Codex session, then fail because the one-time backup was gone. Run
# the recovery branch against a stubbed runtime: no state + no backup must be
# an idempotent no-op, even when --restart-codex is supplied.
RESTORE_FIXTURE="$TMP/restore-fixture"
RESTORE_HOME="$TMP/restore-home"
/bin/mkdir -p "$RESTORE_FIXTURE/scripts" "$RESTORE_HOME"
/bin/cp "$ROOT/scripts/restore-newskin-macos.sh" "$RESTORE_FIXTURE/scripts/"
/usr/bin/printf '%s\n' \
  '#!/bin/bash' \
  'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"' \
  'STATE_ROOT="$HOME/state"' \
  'STATE_PATH="$STATE_ROOT/state.json"' \
  'OPERATION_STATE_PATH="$STATE_ROOT/operation-state.plist"' \
  'OPERATION_ACK_PATH="$STATE_ROOT/operation-control-ack.json"' \
  'THEME_BACKUP_PATH="$STATE_ROOT/theme-backup.json"' \
  'THEME_DIR="$STATE_ROOT/theme"' \
  'CONFIG_PATH="$HOME/config.toml"' \
  'INJECTOR="$SCRIPT_DIR/injector.mjs"' \
  'fail(){ printf "%s\\n" "$*" >&2; exit 1; }' \
  'discover_codex_app(){ :; }' \
  'require_macos_runtime(){ :; }' \
  'ensure_state_root(){ /bin/mkdir -p "$STATE_ROOT"; }' \
  'state_field(){ printf "9341"; }' \
  'stop_recorded_injector(){ :; }' \
  'release_codex_launchd_job(){ :; }' \
  'codex_is_running(){ return 0; }' \
  'verified_cdp_endpoint(){ return 1; }' \
  'stop_codex(){ printf "stop\\n" >> "$RESTORE_MARKER"; }' \
  'launch_codex_normally(){ printf "launch\\n" >> "$RESTORE_MARKER"; }' \
  'clear_operation_state(){ :; }' \
  > "$RESTORE_FIXTURE/scripts/common-macos.sh"
/bin/chmod 700 "$RESTORE_FIXTURE/scripts/restore-newskin-macos.sh"
RESTORE_MARKER="$TMP/restore-unexpected-restart"
HOME="$RESTORE_HOME" NODE="$NODE" RESTORE_MARKER="$RESTORE_MARKER" \
  "$RESTORE_FIXTURE/scripts/restore-newskin-macos.sh" --restore-base-theme --restart-codex \
  > "$TMP/restore-noop.out"
/usr/bin/grep -F -q 'No selective pre-install theme backup is present' "$TMP/restore-noop.out"
[ ! -e "$RESTORE_MARKER" ]

# Conversely, an unverified *recorded* skin session needs one controlled
# stop/start to return to a normal launch. It must never create a restart loop.
/bin/mkdir -p "$RESTORE_HOME/state"
/usr/bin/printf '%s\n' '{"port":9341}' > "$RESTORE_HOME/state/state.json"
HOME="$RESTORE_HOME" NODE="$NODE" RESTORE_MARKER="$RESTORE_MARKER" \
  "$RESTORE_FIXTURE/scripts/restore-newskin-macos.sh" --restart-codex \
  > "$TMP/restore-recorded.out"
/usr/bin/printf 'stop\nlaunch\n' > "$TMP/restore-recorded.expected"
/usr/bin/cmp -s "$RESTORE_MARKER" "$TMP/restore-recorded.expected"
[ ! -e "$RESTORE_HOME/state/state.json" ]

# A repeated Start click must be a no-op once the recorded session and CDP
# endpoint are both verified. A concurrent click must fail before it can close
# or launch Codex; neither condition is allowed to turn into a retry loop.
START_FIXTURE="$TMP/start-fixture"
START_HOME="$TMP/start-home"
/bin/mkdir -p "$START_FIXTURE/scripts" "$START_HOME"
/bin/cp "$ROOT/scripts/start-newskin-macos.sh" "$START_FIXTURE/scripts/"
/usr/bin/printf '%s\n' \
  '#!/bin/bash' \
  'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"' \
  'STATE_ROOT="$HOME/state"' \
  'STATE_PATH="$STATE_ROOT/state.json"' \
  'OPERATION_STATE_PATH="$STATE_ROOT/operation-state.plist"' \
  'OPERATION_ACK_PATH="$STATE_ROOT/operation-ack.json"' \
  'START_ERROR_LOG="$STATE_ROOT/start-error.log"' \
  'APP_LOG="$STATE_ROOT/app.log"' \
  'APP_ERROR_LOG="$STATE_ROOT/app-error.log"' \
  'INJECTOR_ERROR_LOG="$STATE_ROOT/injector-error.log"' \
  'THEME_DIR="$STATE_ROOT/theme"' \
  'INJECTOR="$SCRIPT_DIR/injector.mjs"' \
  'fail(){ printf "%s\n" "$*" >&2; exit 1; }' \
  'ensure_state_root(){ /bin/mkdir -p "$STATE_ROOT"; }' \
  'discover_codex_app(){ :; }' \
  'require_signed_node_runtime(){ NODE="/usr/bin/true"; }' \
  'state_field(){ case "$1" in session) printf "active";; port) printf "9341";; injectorPid) printf "123";; injectorStartedAt) printf "fixture";; nodePath) printf "/usr/bin/true";; injectorPath) printf "%s" "$INJECTOR";; esac; }' \
  'verified_cdp_endpoint(){ return 0; }' \
  'recorded_injector_process_matches(){ return 0; }' \
  'write_operation_state(){ printf "operation\n" >> "$START_MARKER"; }' \
  'begin_client_operation(){ :; }' \
  'finish_client_operation(){ :; }' \
  'stop_codex(){ printf "stop\n" >> "$START_MARKER"; }' \
  'stop_recorded_injector(){ printf "injector-stop\n" >> "$START_MARKER"; }' \
  'launch_codex_with_cdp(){ printf "launch\n" >> "$START_MARKER"; }' \
  > "$START_FIXTURE/scripts/common-macos.sh"
/bin/chmod 700 "$START_FIXTURE/scripts/start-newskin-macos.sh"
/bin/mkdir -p "$START_HOME/state"
: > "$START_HOME/state/state.json"
START_MARKER="$TMP/start-marker"
HOME="$START_HOME" START_MARKER="$START_MARKER" \
  "$START_FIXTURE/scripts/start-newskin-macos.sh" --port 9341 > "$TMP/start-noop.out"
/usr/bin/grep -F -q 'no second launch or restart was attempted' "$TMP/start-noop.out"
[ ! -e "$START_MARKER" ]

/bin/mkdir -p "$START_HOME/state/.start-once.lock"
/bin/sh -c 'trap "exit 0" TERM; while :; do /bin/sleep 1; done' >/dev/null 2>&1 &
START_LOCK_OWNER="$!"
/usr/bin/printf '%s\n' "$START_LOCK_OWNER" > "$START_HOME/state/.start-once.lock/pid"
if HOME="$START_HOME" START_MARKER="$START_MARKER" \
  "$START_FIXTURE/scripts/start-newskin-macos.sh" --port 9341 > "$TMP/start-locked.out" 2>&1; then
  printf 'A concurrent Start unexpectedly acquired the one-shot lock.\n' >&2
  /bin/kill "$START_LOCK_OWNER" 2>/dev/null || true
  exit 1
fi
/usr/bin/grep -F -q 'refusing a second launch or restart' "$TMP/start-locked.out"
[ ! -e "$START_MARKER" ]
/bin/kill "$START_LOCK_OWNER" 2>/dev/null || true
wait "$START_LOCK_OWNER" 2>/dev/null || true
/bin/rm -f "$START_HOME/state/.start-once.lock/pid"
/bin/rmdir "$START_HOME/state/.start-once.lock"

DOCTOR_HOME="$TMP/doctor-home"
DOCTOR_THEME="$DOCTOR_HOME/Library/Application Support/CodexNewskinStudio/theme"
/bin/mkdir -p "$DOCTOR_HOME/.codex" "$DOCTOR_THEME"
/usr/bin/printf '%s\n' '[desktop]' 'appearanceTheme = "system"' > "$DOCTOR_HOME/.codex/config.toml"
/bin/cp "$ROOT/assets/theme.json" "$DOCTOR_THEME/theme.json"
/bin/cp "$ROOT/assets/portal-hero.png" "$DOCTOR_THEME/portal-hero.png"
/usr/bin/env HOME="$DOCTOR_HOME" "$ROOT/scripts/doctor-macos.sh" >/dev/null

printf 'PASS: syntax, payload, bundled presets, preset seeding, runtime-state safety, custom-theme, config round-trips, HOME recovery, signature, and doctor checks.\n'
