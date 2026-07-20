# Canonical bundled themes

`themes/` is the sole editable source for every bundled Codex Newskin theme.
Each `preset-<slug>/` directory contains the complete runtime pair:

```text
preset-<slug>/
├── theme.json
└── background.jpg   # or background.mp4 for video themes
```

`registry.json` is the authoritative list and platform availability.
Do not hand-edit `macos/presets/` or `windows/assets/presets/`: they are
generated delivery copies used by platform-specific installers.

The non-carousel Newskin base template is in `templates/base-newskin/`; its
config and portal image generate `macos/assets/theme.json` and `portal-hero.png`.
Archived original artwork, when retained, lives under `source-art/`
for provenance only and is never loaded by the application.

After adding, changing, renaming, or retiring a theme, run:

```bash
node tools/sync-theme-catalog.mjs --write
node tools/sync-theme-catalog.mjs
```

The second command is the CI-safe verification mode. It rejects a missing,
stale, or unregistered generated pack, so a retired theme cannot survive in a
platform carousel after it has been removed from `registry.json`.
