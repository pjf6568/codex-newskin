# Codex Newskin

<p align="center">
  <a href="./README.md">中文</a> · <strong>English</strong>
</p>

A local theming tool for the official Codex Desktop app. Codex Newskin uses the
Chrome DevTools Protocol (CDP), bound only to `127.0.0.1`, to place an image or
video behind the Codex window while keeping the native sidebar, tasks, composer,
and controls usable.

It does not modify the official app, `app.asar`, WindowsApps, code signatures,
API keys, or model configuration.

> This is not an OpenAI product. Codex is a trademark of its respective owner.

## Supported platforms

| Platform | Entry point | Main requirements |
| --- | --- | --- |
| macOS | [`macos/README.md`](./macos/README.md) | The official Codex Desktop app has been installed and launched once |
| Windows | [`windows/README.en.md`](./windows/README.en.md) | Official Microsoft Store Codex, Node.js 22+, Windows PowerShell 5.1+ |

The install, runtime state, and restore flows are separate on each platform.
Run only the scripts for your operating system.

## Quick start

### macOS

From the `macos` directory, run:

```bash
./scripts/install-newskin-macos.sh --no-launch
```

After installation, use the Desktop `Codex Newskin.command` launcher to start
or reapply a theme. Use `Codex Newskin - Restore.command` to return to the
official appearance. See [`macos/README.md`](./macos/README.md) for complete
instructions, media import, the menu-bar utility, and video backgrounds.

### Windows

From the repository root in PowerShell, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\install-newskin.ps1
```

Then launch through the `Codex Newskin` shortcut created by the installer. See
[`windows/README.en.md`](./windows/README.en.md) for verification, the theme
tray, and restore/uninstall instructions.

## Themes and security boundary

- Import local PNG, JPEG, WebP, and other image formats. macOS and Windows also support muted, looping MP4, WebM, and MOV video backgrounds.
- Use clean background art—not screenshots containing a window, sidebar, composer, buttons, or readable text.
- CDP is a loopback-only debugging interface. Do not run untrusted local software while it is active; use the platform Restore command when you are finished theming.
- The theme is independent of API relays, model providers, Base URLs, and credentials. Configure those separately and never commit credentials.

## Repository layout

```text
themes/     the only editable theme packs, media, and cross-platform registry
macos/      macOS installation, theme management, menu-bar utility, presets, and tests
windows/    Windows installation, theme tray, theme management, and tests
.github/    Issue, pull-request, and continuous-integration configuration
```

Every verified theme keeps its configuration and background media only in
[`themes/`](./themes/README.md). The macOS and Windows preset folders are
generated delivery copies.

## Verification

macOS:

```bash
(cd macos && npm test)
```

Theme catalog synchronization:

```bash
node tools/sync-theme-catalog.mjs
```

Windows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\tests\run-tests.ps1
```

For install, launch, injection, or restore changes, also run the affected
platform's `verify-newskin` script and manually check readability and
interaction on both the home and a regular task page.

## License

The software is released under the [MIT License](./macos/LICENSE). See
[`macos/NOTICE.md`](./macos/NOTICE.md) for third-party asset, trademark, and
runtime notices.
