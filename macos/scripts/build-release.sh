#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
VERSION="$(/usr/bin/tr -d '[:space:]' < "$ROOT/VERSION")"
RELEASE_DIR="$ROOT/release"
ARCHIVE="$RELEASE_DIR/codex-newskin-v$VERSION.zip"
TMP="$(/usr/bin/mktemp -d /tmp/codex-newskin-release.XXXXXX)"
trap '/bin/rm -rf "$TMP"' EXIT

if [ "${1:-}" != "--skip-tests" ]; then "$ROOT/tests/run-tests.sh"; fi

/bin/mkdir -p "$TMP/codex-newskin" "$RELEASE_DIR"
/usr/bin/rsync -a \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  --exclude 'release/' \
  "$ROOT/" "$TMP/codex-newskin/"

# The macOS tree is also published as a standalone ZIP. Rewrite repository-only
# Windows links for the archive root.
rewrite_standalone_links() {
  local file="$1"
  local temporary="${file}.standalone"
  /usr/bin/sed \
    -e 's#\.\./windows/#https://github.com/pjf6568/codex-newskin/tree/main/windows/#g' \
    "$file" > "$temporary"
  /bin/mv "$temporary" "$file"
}
rewrite_standalone_links "$TMP/codex-newskin/README.md"
/usr/bin/find "$TMP/codex-newskin" -type f \( -name '.DS_Store' -o -name '._*' \) -delete
/bin/chmod 755 "$TMP/codex-newskin"/*.command
/bin/chmod 755 "$TMP/codex-newskin"/scripts/*.sh "$TMP/codex-newskin"/tests/*.sh
/bin/rm -f "$ARCHIVE"
COPYFILE_DISABLE=1 /usr/bin/ditto -c -k --keepParent --norsrc --noextattr \
  "$TMP/codex-newskin" "$ARCHIVE"
SHA256="$(/usr/bin/shasum -a 256 "$ARCHIVE" | /usr/bin/awk '{print $1}')"
/usr/bin/printf '%s  %s\n' "$SHA256" "$(basename "$ARCHIVE")" > "$RELEASE_DIR/SHA256SUMS.txt"
/usr/bin/printf 'Created %s\nSHA-256 %s\n' "$ARCHIVE" "$SHA256"
