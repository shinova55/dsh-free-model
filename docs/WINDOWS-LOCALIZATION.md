# Our Free Model standalone: English / Chinese standalone UI

This branch targets the v2.5.4 main branch of `https://github.com/shinova55/dsh-free-model`. It ports the standalone localization originally developed for v2.5.3 while retaining v2.5.4 version metadata and sponsor functionality.

## Using the language selector

Open **服务设置 / Service settings → Language / 语言** and select **English** or **中文（简体）**. The console reloads to apply the selection. If the settings form has unsaved edits, a confirmation lets you cancel the switch and keep those edits.

The choice is saved in the webview's local storage under `ofm-language`, separately from API keys, account credentials, and service settings. It survives normal application restarts. Chinese remains the default when no preference exists. The preference belongs to the console origin and browser profile; a different service port or a different browser profile has its own preference. If storage is blocked, the UI reports the failure instead of pretending the choice was saved.

The sidebar, overview, models, usage, account channels, EAC, API connection, settings, login screen, accessibility labels, and known management errors use the selected language. Provider names and descriptions are localized without changing provider identifiers. Existing shared English channel translations are reused. User-provided account names, model identifiers, model responses, and arbitrary upstream error text remain verbatim. The desktop window-control tooltips are localized by the interface. Native startup dialogs and the system-tray menu are part of the existing executable and are outside this interface patch. The v2.5.4 sponsor article and daily notice retain their original Chinese content; the sponsor navigation label is localized.

## Building the interface on Windows

Prerequisite: Node.js 22.19+ on the 22.x line, or Node.js 24+, with npm. Run these commands in the repository root:

```powershell
npm ci
npm ci --prefix packages/standalone
npm run typecheck:standalone
npm run build:standalone-ui
npm run test:contributor
node scripts/standalone-i18n-test.mjs
```

The generated interface is `packages/standalone/web`. The installed executable loads this interface from `service/packages/standalone/web`; rebuilding Rust is not required for these page changes. The service, authentication implementation, credential storage, API payloads, and executable are unchanged.

For browser regression tests, install Playwright separately from the application dependencies:

```powershell
npm install --prefix .browser-tests playwright
node .browser-tests/node_modules/playwright/cli.js install chromium --only-shell
$env:OFM_PLAYWRIGHT_MODULE = (Resolve-Path .browser-tests/node_modules/playwright).Path
node scripts/standalone-react-ui-test.mjs
node scripts/standalone-i18n-browser-test.mjs
```

Browser tests use isolated mock services and test keys. They do not use your saved accounts or spend upstream quota. The contributor suite is the appropriate offline check for this source modification. Signed release verification is a separate publisher workflow; this patch does not regenerate signed catalogs or claim to be an official signed release.

## Building a Windows executable and installer

Install the Rust MSVC toolchain and Visual Studio Build Tools with **Desktop development with C++**, including a Windows SDK. WebView2 Runtime is required to run the desktop app. Use an x64 Node runtime for the x64 build. In the repository root, after building the interface above:

```powershell
npm ci --prefix packages/desktop
# Optional: point to the full LICENSE distributed with this exact Node version.
# Otherwise the preparation script retrieves that version's license.
# $env:OFM_DESKTOP_NODE_LICENSE = 'C:\path\to\node\LICENSE'
npm --prefix packages/desktop run build -- --bundles nsis
```

Tauri's `beforeBuildCommand` runs `scripts/prepare-desktop.mjs`. It stages the service, rebuilt interface, and the Node executable running the build. It does not copy user settings or credentials. Output is normally:

- `packages/desktop/src-tauri/target/release/ofm-desktop.exe`
- `packages/desktop/src-tauri/target/release/bundle/nsis/` (installer)

Keep the staged `service` and `runtime` resources alongside a manually distributed executable. The executable alone is not a complete portable installation. This task verified the frontend build, type checking, and automated tests; a fresh Rust/NSIS binary build was not performed because the Rust toolchain is not installed on this machine.

## Updating an installation of the matching version safely

Use assets built from the same version as the installation. Do not copy this v2.5.4 build over a v2.5.3 installation. Back up only `service/packages/standalone/web`, then copy the rebuilt web files into that directory. Keep older hashed JavaScript files during the update so an already-open page can still load its original chunks. The new `assets.json` registers the current build. Reopen the application when convenient.

Do not replace, clear, migrate, or delete `.our-free-model`, its settings, credentials, service lock, or WebView2 profile. This update does not require any of those operations. Do not rotate API keys as part of localization.

To undo the interface update, restore the backed-up web files and their `assets.json`, then reopen the app. Extra unregistered hashed files can be left in place. An upstream application update may replace this custom interface; keep the source archive and patch for rebuilding against the new version.
